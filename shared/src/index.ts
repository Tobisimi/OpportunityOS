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
  stage: z.enum(opportunityStages).default('saved'),
  discoveredAt: z.iso.datetime(),
  notifiedAt: z.iso.datetime().nullable().default(null),
})

export const engagementStatSchema = z.object({
  viewed: z.number().int().nonnegative().default(0),
  interestedOrFurther: z.number().int().nonnegative().default(0),
})

export const engagementStatsSchema = z.object({
  byCategory: z.record(z.string(), engagementStatSchema).default({}),
  bySource: z.record(z.string(), engagementStatSchema).default({}),
})

export type AnalysisResult = z.infer<typeof analysisResultSchema>
export type Opportunity = z.infer<typeof opportunitySchema>
export type OpportunityCategory = (typeof opportunityCategories)[number]
export type OpportunityStage = (typeof opportunityStages)[number]
export type EngagementStats = z.infer<typeof engagementStatsSchema>
