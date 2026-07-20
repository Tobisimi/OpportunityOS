import type { LambdaFunctionURLHandler } from 'aws-lambda'
import { z } from 'zod'
import { opportunityStages } from '@opportunity-scout/shared'
import { DynamoScoutRepository } from '../aws.js'
import {
  handleHttpError,
  jsonResponse,
  parseJsonBody,
  requireUserId,
} from '../http.js'

const requestSchema = z.object({
  opportunityId: z.string().regex(/^[a-f0-9]{64}$/),
  stage: z.enum(opportunityStages),
})

export const handler: LambdaFunctionURLHandler = async (event) => {
  try {
    const userId = await requireUserId(event)
    const { opportunityId, stage } = parseJsonBody(event, requestSchema)
    const opportunity = await new DynamoScoutRepository().updateOpportunityStage(
      userId,
      opportunityId,
      stage,
      new Date().toISOString(),
    )
    return jsonResponse(200, { opportunity })
  } catch (error) {
    return handleHttpError(error)
  }
}
