import { createHash, randomUUID } from 'node:crypto'
import {
  agentRunSchema,
  buildNudges,
  chooseRecommendation,
  opportunitySchema,
  type AgentRun,
  type NormalizedCandidate,
  type Opportunity,
  type UserProfile,
} from '@opportunity-scout/shared'
import type { OpportunityAnalyzer } from './analysis.js'
import { runtimeConfig } from './config.js'
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

const FUNDING_SIGNAL = /\b(fund|grant|prize|hackathon|fellowship|scholar|award|bounty|stipend)/i

/**
 * Cheap, deterministic pre-ranking so the limited analysis budget is spent on
 * the candidates most likely to matter to this user (final scoring is still the
 * analyzer's job). Rewards profile-interest keyword hits and funding signals.
 */
const prioritizeForAnalysis = (
  candidates: NormalizedCandidate[],
  profile: UserProfile,
): NormalizedCandidate[] => {
  const interests = profile.interests.map((interest) => interest.trim().toLowerCase()).filter(Boolean)
  const relevance = (candidate: NormalizedCandidate): number => {
    const haystack = `${candidate.title} ${candidate.rawText}`.toLowerCase()
    let score = 0
    for (const interest of interests) {
      if (haystack.includes(interest)) score += 2
    }
    if (FUNDING_SIGNAL.test(haystack)) score += 1
    return score
  }
  return [...candidates].sort((a, b) => relevance(b) - relevance(a))
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
    const budget = runtimeConfig.maxAnalysesPerRun
    const toAnalyze = prioritizeForAnalysis(unseen, profile).slice(0, budget)
    const created: Opportunity[] = []

    for (const candidate of toAnalyze) {
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
