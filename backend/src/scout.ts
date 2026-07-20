import { createHash, randomUUID } from 'node:crypto'
import {
  agentRunSchema,
  opportunitySchema,
  type AgentRun,
  type NormalizedCandidate,
  type Opportunity,
  type UserProfile,
} from '@opportunity-scout/shared'
import type { OpportunityAnalyzer } from './analysis.js'
import type { DiscoveryConnector } from './connectors.js'

export interface ScoutRepository {
  getUser(userId: string): Promise<UserProfile | null>
  listEnabledUsers(): Promise<UserProfile[]>
  listOpportunities(userId: string): Promise<Opportunity[]>
  putOpportunity(opportunity: Opportunity): Promise<void>
  putAgentRun(run: AgentRun): Promise<void>
  markNotified(userId: string, opportunityIds: string[], notifiedAt: string): Promise<void>
}

export interface DigestContent {
  user: UserProfile
  newOpportunities: Opportunity[]
  recommendation: Opportunity | null
  nudges: string[]
}

export interface DigestNotifier {
  sendDigest(content: DigestContent): Promise<void>
}

export interface ScoutDependencies {
  connectors: DiscoveryConnector[]
  analyzer: OpportunityAnalyzer
  repository: ScoutRepository
  notifier: DigestNotifier
  now?: () => Date
}

export interface ScoutExecutionSummary {
  usersProcessed: number
  runs: AgentRun[]
}

const canonicalizeUrl = (value: string): string => {
  const url = new URL(value)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || ['ref', 'source'].includes(key)) {
      url.searchParams.delete(key)
    }
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString()
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

const deduplicateCandidates = (candidates: NormalizedCandidate[]): NormalizedCandidate[] => {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = canonicalizeUrl(candidate.sourceUrl)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const deadlineUrgency = (deadline: string | null, now: Date): number => {
  if (!deadline) return 0
  const days = Math.ceil(
    (new Date(`${deadline}T23:59:59.999Z`).valueOf() - now.valueOf()) / 86_400_000,
  )
  if (days < 0) return -100
  if (days <= 3) return 30
  if (days <= 7) return 20
  if (days <= 14) return 10
  return 0
}

export const chooseRecommendation = (
  opportunities: Opportunity[],
  now: Date,
): Opportunity | null =>
  opportunities
    .filter((opportunity) => ['saved', 'interested'].includes(opportunity.stage))
    .map((opportunity) => ({
      opportunity,
      rank:
        opportunity.fitScore +
        deadlineUrgency(opportunity.deadline, now) -
        Math.min(20, opportunity.scores.timeRequiredHours / 4),
    }))
    .sort((left, right) => right.rank - left.rank)[0]?.opportunity ?? null

const buildNudges = (opportunities: Opportunity[], now: Date): string[] => {
  const today = now.toISOString().slice(0, 10)
  const horizon = new Date(now.valueOf() + 7 * 86_400_000).toISOString().slice(0, 10)

  return opportunities.flatMap((opportunity) =>
    opportunity.checklist
      .filter(
        (item) => !item.completed && item.dueDate >= today && item.dueDate <= horizon,
      )
      .map(
        (item) =>
          `Checklist item '${item.task}' for ${opportunity.title} is due ${item.dueDate}.`,
      ),
  )
}

const runForUser = async (
  profile: UserProfile,
  candidates: NormalizedCandidate[],
  connectorErrors: string[],
  dependencies: ScoutDependencies,
  trigger: AgentRun['trigger'],
  now: Date,
): Promise<AgentRun> => {
  const runId = `${now.toISOString()}#${randomUUID()}`
  const run: AgentRun = agentRunSchema.parse({
    userId: profile.userId,
    runId,
    status: 'running',
    trigger,
    startedAt: now.toISOString(),
    errors: connectorErrors,
  })
  await dependencies.repository.putAgentRun(run)

  try {
    const existing = await dependencies.repository.listOpportunities(profile.userId)
    const existingUrls = new Set(existing.map((item) => canonicalizeUrl(item.sourceUrl)))
    const unseen = candidates.filter(
      (candidate) => !existingUrls.has(canonicalizeUrl(candidate.sourceUrl)),
    )
    const created: Opportunity[] = []

    for (const candidate of unseen) {
      try {
        const analysis = await dependencies.analyzer.analyze(candidate, profile)
        const canonicalUrl = canonicalizeUrl(candidate.sourceUrl)
        const opportunity = opportunitySchema.parse({
          ...analysis,
          userId: profile.userId,
          opportunityId: sha256(canonicalUrl),
          title: candidate.title,
          sourceUrl: canonicalUrl,
          sourceName: candidate.sourceName,
          contentHash: sha256(candidate.rawText),
          stage: 'saved',
          discoveredAt: now.toISOString(),
          notifiedAt: null,
        })
        await dependencies.repository.putOpportunity(opportunity)
        created.push(opportunity)
      } catch (error) {
        run.errors.push(
          `Analysis failed for ${candidate.sourceName}/${candidate.title}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    const allOpportunities = [...existing, ...created]
    let notifiedCount = 0
    if (created.length > 0) {
      try {
        await dependencies.notifier.sendDigest({
          user: profile,
          newOpportunities: created,
          recommendation: chooseRecommendation(allOpportunities, now),
          nudges: buildNudges(allOpportunities, now),
        })
        const notifiedAt = (dependencies.now?.() ?? new Date()).toISOString()
        await dependencies.repository.markNotified(
          profile.userId,
          created.map((item) => item.opportunityId),
          notifiedAt,
        )
        notifiedCount = created.length
      } catch (error) {
        run.errors.push(
          `Digest delivery failed after persistence: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    return agentRunSchema.parse({
      ...run,
      status: run.errors.length > 0 ? 'partially_succeeded' : 'succeeded',
      completedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      discoveredCount: candidates.length,
      deduplicatedCount: unseen.length,
      analyzedCount: created.length,
      persistedCount: created.length,
      notifiedCount,
    })
  } catch (error) {
    run.errors.push(error instanceof Error ? error.message : String(error))
    return agentRunSchema.parse({
      ...run,
      status: 'failed',
      completedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      discoveredCount: candidates.length,
    })
  }
}

export const executeScout = async (
  dependencies: ScoutDependencies,
  trigger: AgentRun['trigger'] = 'schedule',
): Promise<ScoutExecutionSummary> => {
  const now = dependencies.now?.() ?? new Date()
  const connectorResults = await Promise.allSettled(
    dependencies.connectors.map(async (connector) => ({
      name: connector.name,
      candidates: await connector.discover(),
    })),
  )
  const connectorErrors: string[] = []
  const discovered: NormalizedCandidate[] = []

  connectorResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      discovered.push(...result.value.candidates)
    } else {
      connectorErrors.push(
        `${dependencies.connectors[index]?.name ?? 'Unknown connector'} failed: ${
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        }`,
      )
    }
  })

  const candidates = deduplicateCandidates(discovered)
  const users = await dependencies.repository.listEnabledUsers()
  const runs: AgentRun[] = []
  for (const user of users) {
    const run = await runForUser(user, candidates, connectorErrors, dependencies, trigger, now)
    await dependencies.repository.putAgentRun(run)
    runs.push(run)
  }

  return { usersProcessed: users.length, runs }
}
