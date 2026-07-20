import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import type { LambdaFunctionURLHandler } from 'aws-lambda'
import { z } from 'zod'
import {
  opportunityCategories,
  primaryGoals,
  userProfileSchema,
} from '@opportunity-scout/shared'
import { DynamoScoutRepository } from '../aws.js'
import {
  getBearerToken,
  handleHttpError,
  HttpError,
  jsonResponse,
  parseJsonBody,
  requireUserId,
} from '../http.js'

const requestSchema = z.object({
  role: z.string().trim().min(1).max(200),
  interests: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
  location: z.string().trim().min(1).max(200),
  remotePreference: z.enum(['remote-only', 'remote-preferred', 'hybrid', 'onsite']),
  experienceLevel: z.enum(['student', 'entry', 'mid', 'senior', 'expert']),
  preferredCategories: z
    .array(z.enum(opportunityCategories))
    .max(opportunityCategories.length)
    .default([]),
  primaryGoal: z.enum(primaryGoals).default('explore'),
  scheduleEnabled: z.boolean().default(true),
})

const cognito = new CognitoIdentityProviderClient({})

export const handler: LambdaFunctionURLHandler = async (event) => {
  try {
    const userId = await requireUserId(event)
    const input = parseJsonBody(event, requestSchema)
    const cognitoUser = await cognito.send(
      new GetUserCommand({ AccessToken: getBearerToken(event) }),
    )
    const attributes = Object.fromEntries(
      (cognitoUser.UserAttributes ?? []).flatMap((attribute) =>
        attribute.Name && attribute.Value ? [[attribute.Name, attribute.Value]] : [],
      ),
    )
    if (!attributes.email || attributes.email_verified !== 'true') {
      throw new HttpError(403, 'A verified Cognito email is required.')
    }

    const repository = new DynamoScoutRepository()
    const existing = await repository.getUser(userId)
    const now = new Date().toISOString()
    const profile = userProfileSchema.parse({
      ...input,
      userId,
      email: attributes.email,
      engagementStats: existing?.engagementStats,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    const stored = await repository.upsertUserProfile(profile)
    return jsonResponse(existing ? 200 : 201, { profile: stored })
  } catch (error) {
    return handleHttpError(error)
  }
}
