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
export type EngagementStats = z.infer<typeof engagementStatsSchema>
export type UserProfile = z.infer<typeof userProfileSchema>
export type AgentRun = z.infer<typeof agentRunSchema>
