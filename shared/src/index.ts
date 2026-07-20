import { z } from 'zod'

export const opportunityCategories = [
  'hackathon',
  'competition',
  'scholarship',
  'grant',
  'fellowship',
  'conference',
  'other',
] as const

export const opportunityStages = [
  'saved',
  'interested',
  'preparing',
  'applied',
  'waiting',
  'accepted',
  'rejected',
] as const

export const primaryGoals = [
  'funding',
  'career',
  'learning',
  'portfolio',
  'network',
  'explore',
] as const

export const primaryGoalLabels: Record<(typeof primaryGoals)[number], string> = {
  funding: 'Win funding & prizes',
  career: 'Advance my career',
  learning: 'Learn new skills',
  portfolio: 'Build my portfolio',
  network: 'Grow my network',
  explore: 'Just exploring',
}

const isoDate = z.iso.date()
const isoDateTime = z.iso.datetime()

export const normalizedCandidateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  sourceUrl: z.url(),
  rawText: z.string().trim().min(1).max(50_000),
  sourceName: z.string().trim().min(1).max(100),
})

export const checklistItemSchema = z.object({
  task: z.string().trim().min(1).max(500),
  dueDate: isoDate,
  completed: z.boolean().default(false),
})

export const opportunityScoresSchema = z
  .object({
    domainFit: z.number().int().min(0).max(100),
    innovationLevel: z.number().int().min(0).max(100),
    careerValue: z.number().int().min(0).max(100),
    difficulty: z.number().int().min(0).max(100),
    timeRequiredHours: z.number().int().nonnegative().max(10_000),
    travelRequired: z.boolean(),
    fundingAvailable: z.boolean(),
    fundingNotes: z.string().trim().max(1_000).optional(),
  })
  .superRefine((scores, context) => {
    if (scores.fundingAvailable && !scores.fundingNotes) {
      context.addIssue({
        code: 'custom',
        path: ['fundingNotes'],
        message: 'Funding notes are required when funding is available.',
      })
    }
  })

export const analysisResultSchema = z.object({
  category: z.enum(opportunityCategories),
  summary: z.string().trim().min(1).max(2_000),
  fitScore: z.number().int().min(0).max(100),
  fitReasoning: z.string().trim().min(1).max(2_000),
  scores: opportunityScoresSchema,
  deadline: isoDate.nullable(),
  checklist: z.array(checklistItemSchema).max(30),
})

export const opportunitySchema = analysisResultSchema.extend({
  userId: z.string().min(1),
  opportunityId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  sourceUrl: z.url(),
  sourceName: z.string().trim().min(1).max(100),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  stage: z.enum(opportunityStages).default('saved'),
  discoveredAt: isoDateTime,
  notifiedAt: isoDateTime.nullable().default(null),
  engagementCountedAt: isoDateTime.nullable().default(null),
})

export const engagementStatSchema = z.object({
  viewed: z.number().int().nonnegative().default(0),
  interestedOrFurther: z.number().int().nonnegative().default(0),
})

export const engagementStatsSchema = z.object({
  byCategory: z.record(z.string(), engagementStatSchema).default({}),
  bySource: z.record(z.string(), engagementStatSchema).default({}),
})

export const userProfileSchema = z.object({
  userId: z.string().trim().min(1).max(256),
  email: z.email(),
  role: z.string().trim().min(1).max(200),
  interests: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
  location: z.string().trim().min(1).max(200),
  remotePreference: z.enum(['remote-only', 'remote-preferred', 'hybrid', 'onsite']),
  experienceLevel: z.enum(['student', 'entry', 'mid', 'senior', 'expert']),
  preferredCategories: z.array(z.enum(opportunityCategories)).max(opportunityCategories.length).default([]),
  primaryGoal: z.enum(primaryGoals).default('explore'),
  engagementStats: engagementStatsSchema.default({
    byCategory: {},
    bySource: {},
  }),
  scheduleEnabled: z.boolean().default(true),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

export const agentRunStatus = ['running', 'succeeded', 'partially_succeeded', 'failed'] as const

export const agentRunSchema = z.object({
  userId: z.string().trim().min(1).max(256),
  runId: z.string().trim().min(1).max(256),
  status: z.enum(agentRunStatus),
  trigger: z.enum(['schedule', 'manual-test']),
  startedAt: isoDateTime,
  completedAt: isoDateTime.nullable().default(null),
  discoveredCount: z.number().int().nonnegative().default(0),
  deduplicatedCount: z.number().int().nonnegative().default(0),
  analyzedCount: z.number().int().nonnegative().default(0),
  persistedCount: z.number().int().nonnegative().default(0),
  notifiedCount: z.number().int().nonnegative().default(0),
  errors: z.array(z.string().trim().min(1).max(2_000)).max(50).default([]),
})

export type AnalysisResult = z.infer<typeof analysisResultSchema>
export type NormalizedCandidate = z.infer<typeof normalizedCandidateSchema>
export type Opportunity = z.infer<typeof opportunitySchema>
export type OpportunityCategory = (typeof opportunityCategories)[number]
export type OpportunityStage = (typeof opportunityStages)[number]
export type PrimaryGoal = (typeof primaryGoals)[number]
export type EngagementStats = z.infer<typeof engagementStatsSchema>
export type UserProfile = z.infer<typeof userProfileSchema>
export type AgentRun = z.infer<typeof agentRunSchema>

/**
 * Derived intelligence — the single source of truth for prioritisation.
 *
 * The scheduled scout uses these to compose the digest; the web app uses the
 * exact same functions to compose the on-screen briefing. Keeping them here
 * guarantees the two never drift (working agreement rule 3): every ranked,
 * recommended or "needs attention" surface is derived from the one stored
 * `scores` contract, never re-scored in parallel on the client.
 */

const MS_PER_DAY = 86_400_000

const actionableStages: readonly OpportunityStage[] = ['saved', 'interested', 'preparing']
const awaitingStages: readonly OpportunityStage[] = ['applied', 'waiting']
const closedStages: readonly OpportunityStage[] = ['accepted', 'rejected']

export const isActionable = (opportunity: Opportunity): boolean =>
  actionableStages.includes(opportunity.stage)

export const isAwaiting = (opportunity: Opportunity): boolean =>
  awaitingStages.includes(opportunity.stage)

export const isClosed = (opportunity: Opportunity): boolean =>
  closedStages.includes(opportunity.stage)

export const daysUntilDeadline = (deadline: string | null, now: Date): number | null => {
  if (!deadline) return null
  const end = new Date(`${deadline}T23:59:59.999Z`).valueOf()
  if (Number.isNaN(end)) return null
  return Math.ceil((end - now.valueOf()) / MS_PER_DAY)
}

export type UrgencyLevel = 'passed' | 'critical' | 'high' | 'medium' | 'low' | 'none'

export interface Urgency {
  level: UrgencyLevel
  label: string
  days: number | null
}

/** Deadline contribution to the priority rank (matches the digest ranking). */
export const deadlineUrgencyScore = (deadline: string | null, now: Date): number => {
  const days = daysUntilDeadline(deadline, now)
  if (days === null) return 0
  if (days < 0) return -100
  if (days <= 3) return 30
  if (days <= 7) return 20
  if (days <= 14) return 10
  return 0
}

export const describeUrgency = (deadline: string | null, now: Date): Urgency => {
  const days = daysUntilDeadline(deadline, now)
  if (days === null) return { level: 'none', label: 'No fixed deadline', days: null }
  if (days < 0) return { level: 'passed', label: 'Deadline passed', days }
  if (days === 0) return { level: 'critical', label: 'Due today', days }
  if (days <= 3) return { level: 'critical', label: `Due in ${days} day${days === 1 ? '' : 's'}`, days }
  if (days <= 7) return { level: 'high', label: `Due in ${days} days`, days }
  if (days <= 14) return { level: 'medium', label: `Due in ${days} days`, days }
  if (days <= 31) return { level: 'low', label: `Due in ${days} days`, days }
  return { level: 'low', label: `Due in ${Math.round(days / 7)} weeks`, days }
}

export type ConfidenceBand = 'strong' | 'moderate' | 'low'

export const fitBand = (score: number): { level: ConfidenceBand; label: string } =>
  score >= 70
    ? { level: 'strong', label: 'Strong fit' }
    : score >= 40
      ? { level: 'moderate', label: 'Moderate fit' }
      : { level: 'low', label: 'Low fit' }

/**
 * Honest heuristic (not ML): favourable when fit and domain alignment are high
 * and difficulty is low. Presented to the user as an estimate, never a promise.
 */
export const successProbability = (opportunity: Opportunity): number => {
  const { fitScore } = opportunity
  const { difficulty, domainFit } = opportunity.scores
  const raw = fitScore * 0.55 + (100 - difficulty) * 0.3 + domainFit * 0.15
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export const successBand = (probability: number): { level: ConfidenceBand; label: string } =>
  probability >= 66
    ? { level: 'strong', label: 'Strong odds' }
    : probability >= 40
      ? { level: 'moderate', label: 'Even odds' }
      : { level: 'low', label: 'Long shot' }

export const describeEffort = (hours: number): { label: string; detail: string } => {
  const detail = hours >= 40 ? `~${Math.round(hours / 8)} days` : `~${hours} hrs`
  if (hours <= 8) return { label: 'Light lift', detail }
  if (hours <= 25) return { label: 'Moderate effort', detail }
  if (hours <= 60) return { label: 'Heavy effort', detail }
  return { label: 'Major commitment', detail }
}

const stageAction: Record<OpportunityStage, string> = {
  saved: 'Review the details and decide whether it is worth pursuing',
  interested: 'Start preparing your application materials',
  preparing: 'Finish your materials and submit before the deadline',
  applied: 'Await a response; follow up if it goes quiet',
  waiting: 'Await the decision',
  accepted: 'Confirm participation and plan your next steps',
  rejected: 'Archive this and redirect your energy',
}

/** The one thing the user should do next on this opportunity, in plain language. */
export const nextAction = (opportunity: Opportunity): string => {
  const pending = [...opportunity.checklist]
    .filter((item) => !item.completed)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0]
  if (pending && actionableStages.includes(opportunity.stage)) return pending.task
  return stageAction[opportunity.stage]
}

/** Higher = more deserving of the user's attention this week. */
export const priorityRank = (opportunity: Opportunity, now: Date): number =>
  opportunity.fitScore +
  deadlineUrgencyScore(opportunity.deadline, now) -
  Math.min(20, opportunity.scores.timeRequiredHours / 4)

/** Actionable opportunities, most-deserving-of-attention first. */
export const rankOpportunities = (opportunities: Opportunity[], now: Date): Opportunity[] =>
  [...opportunities]
    .filter((opportunity) => actionableStages.includes(opportunity.stage))
    .sort((left, right) => priorityRank(right, now) - priorityRank(left, now))

/** The single highest-priority opportunity to surface as "prioritise this". */
export const chooseRecommendation = (
  opportunities: Opportunity[],
  now: Date,
): Opportunity | null =>
  [...opportunities]
    .filter((opportunity) => ['saved', 'interested'].includes(opportunity.stage))
    .sort((left, right) => priorityRank(right, now) - priorityRank(left, now))[0] ?? null

/** Specific, deadline-citing reminders for checklist items due within 7 days. */
export const buildNudges = (opportunities: Opportunity[], now: Date): string[] => {
  const today = now.toISOString().slice(0, 10)
  const horizon = new Date(now.valueOf() + 7 * MS_PER_DAY).toISOString().slice(0, 10)
  return opportunities.flatMap((opportunity) =>
    opportunity.checklist
      .filter((item) => !item.completed && item.dueDate >= today && item.dueDate <= horizon)
      .map(
        (item) =>
          `Checklist item '${item.task}' for ${opportunity.title} is due ${item.dueDate}.`,
      ),
  )
}

export interface BriefingSummary {
  total: number
  newSignals: number
  deadlinesApproaching: number
  awaitingAction: number
  topMatchScore: number
}

/** One-glance counts for the top of the briefing. */
export const summariseBriefing = (
  opportunities: Opportunity[],
  now: Date,
): BriefingSummary => {
  const approaching = opportunities.filter((opportunity) => {
    if (isClosed(opportunity)) return false
    const days = daysUntilDeadline(opportunity.deadline, now)
    return days !== null && days >= 0 && days <= 7
  }).length
  return {
    total: opportunities.length,
    newSignals: opportunities.filter((opportunity) => opportunity.notifiedAt === null).length,
    deadlinesApproaching: approaching,
    awaitingAction: opportunities.filter(isActionable).length,
    topMatchScore: opportunities.reduce((max, item) => Math.max(max, item.fitScore), 0),
  }
}
