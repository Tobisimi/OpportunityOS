import type { LambdaFunctionURLHandler } from 'aws-lambda'
import { z } from 'zod'
import type { Opportunity } from '@opportunity-scout/shared'
import { DynamoScoutRepository } from '../aws.js'
import {
  handleHttpError,
  jsonResponse,
  parseJsonBody,
  requireUserId,
} from '../http.js'

const requestSchema = z.object({
  question: z.string().trim().min(3).max(1_000),
})

const refineStoredOpportunities = (
  question: string,
  opportunities: Opportunity[],
): Opportunity[] => {
  const normalized = question.toLowerCase()
  let matches = [...opportunities]

  if (normalized.includes('remote')) {
    matches = matches.filter((item) => !item.scores.travelRequired)
  }
  if (normalized.includes('fund')) {
    matches = matches.filter((item) => item.scores.fundingAvailable)
  }
  const hours = /\b(\d{1,3})\s*hours?\b/.exec(normalized)?.[1]
  if (hours) {
    matches = matches.filter((item) => item.scores.timeRequiredHours <= Number(hours))
  }
  const categories = [
    'hackathon',
    'competition',
    'scholarship',
    'grant',
    'fellowship',
    'conference',
  ] as const
  const category = categories.find((item) => normalized.includes(item))
  if (category) {
    matches = matches.filter((item) => item.category === category)
  }

  return matches.sort((left, right) => right.fitScore - left.fitScore)
}

export const handler: LambdaFunctionURLHandler = async (event) => {
  try {
    const userId = await requireUserId(event)
    const { question } = parseJsonBody(event, requestSchema)
    const repository = new DynamoScoutRepository()
    const opportunities = await repository.listOpportunities(userId)
    const matches = refineStoredOpportunities(question, opportunities)

    return jsonResponse(200, {
      mode: 'mock',
      answer:
        matches.length > 0
          ? `${matches.length} stored signal${matches.length === 1 ? '' : 's'} match your request.`
          : 'No stored signals match that request.',
      opportunityIds: matches.map((item) => item.opportunityId),
    })
  } catch (error) {
    return handleHttpError(error)
  }
}
