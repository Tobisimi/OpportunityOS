import type { EventBridgeEvent } from 'aws-lambda'
import { createAnalyzer } from '../analysis.js'
import { DynamoScoutRepository, SesDigestNotifier } from '../aws.js'
import { createDefaultConnectors } from '../connectors.js'
import { executeScout } from '../scout.js'

export const handler = async (
  event: EventBridgeEvent<'OpportunityScoutScheduledRun', Record<string, never>>,
): Promise<void> => {
  if (event['detail-type'] !== 'OpportunityScoutScheduledRun') {
    throw new Error(`Unsupported event detail type: ${event['detail-type']}`)
  }

  const summary = await executeScout({
    connectors: createDefaultConnectors(),
    analyzer: createAnalyzer(),
    repository: new DynamoScoutRepository(),
    notifier: new SesDigestNotifier(),
  })
  console.info(
    JSON.stringify({
      event: 'scout_run_completed',
      usersProcessed: summary.usersProcessed,
      runs: summary.runs.map((run) => ({
        runId: run.runId,
        status: run.status,
        discoveredCount: run.discoveredCount,
        persistedCount: run.persistedCount,
        errorCount: run.errors.length,
      })),
    }),
  )
}
