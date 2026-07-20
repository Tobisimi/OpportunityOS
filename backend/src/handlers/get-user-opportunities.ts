import type { LambdaFunctionURLHandler } from 'aws-lambda'
import { DynamoScoutRepository } from '../aws.js'
import { handleHttpError, jsonResponse, requireUserId } from '../http.js'

export const handler: LambdaFunctionURLHandler = async (event) => {
  try {
    const userId = await requireUserId(event)
    const repository = new DynamoScoutRepository()
    const [profile, opportunities] = await Promise.all([
      repository.getUser(userId),
      repository.listOpportunities(userId),
    ])
    return jsonResponse(200, {
      profile,
      opportunities: opportunities.sort((left, right) =>
        right.discoveredAt.localeCompare(left.discoveredAt),
      ),
    })
  } catch (error) {
    return handleHttpError(error)
  }
}
