import { createHash } from 'node:crypto'
import type { LambdaFunctionURLHandler } from 'aws-lambda'
import { z } from 'zod'
import { normalizedCandidateSchema, opportunitySchema } from '@opportunity-scout/shared'
import { createAnalyzer } from '../analysis.js'
import { DynamoScoutRepository } from '../aws.js'
import {
  handleHttpError,
  HttpError,
  jsonResponse,
  parseJsonBody,
  requireUserId,
} from '../http.js'

const requestSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  sourceUrl: z.url().optional(),
  content: z.string().trim().min(20).max(50_000),
})

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

export const handler: LambdaFunctionURLHandler = async (event) => {
  try {
    const userId = await requireUserId(event)
    const input = parseJsonBody(event, requestSchema)
    const repository = new DynamoScoutRepository()
    const profile = await repository.getUser(userId)
    if (!profile) throw new HttpError(404, 'Complete scout calibration before analyzing content.')

    const contentHash = sha256(input.content)
    const candidate = normalizedCandidateSchema.parse({
      title: input.title ?? input.content.split(/\r?\n/, 1)[0]?.slice(0, 500) ?? 'Pasted signal',
      sourceUrl:
        input.sourceUrl ?? `https://manual.opportunity-scout.invalid/${contentHash.slice(0, 32)}`,
      rawText: input.content,
      sourceName: 'Pasted content',
    })
    const analysis = await createAnalyzer().analyze(candidate, profile)
    const now = new Date().toISOString()
    const opportunity = opportunitySchema.parse({
      ...analysis,
      userId,
      opportunityId: sha256(candidate.sourceUrl),
      title: candidate.title,
      sourceUrl: candidate.sourceUrl,
      sourceName: candidate.sourceName,
      contentHash,
      stage: 'saved',
      discoveredAt: now,
      notifiedAt: null,
    })
    await repository.putOpportunity(opportunity)

    return jsonResponse(201, { mode: 'mock', opportunity })
  } catch (error) {
    return handleHttpError(error)
  }
}
