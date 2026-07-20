import { createHash } from 'node:crypto'
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from '@aws-sdk/client-bedrock-runtime'
import {
  analysisResultSchema,
  type AnalysisResult,
  type NormalizedCandidate,
  type OpportunityCategory,
  type UserProfile,
} from '@opportunity-scout/shared'
import { runtimeConfig, type AnalysisMode } from './config.js'

export interface OpportunityAnalyzer {
  analyze(candidate: NormalizedCandidate, profile: UserProfile): Promise<AnalysisResult>
}

const inferCategory = (text: string): OpportunityCategory => {
  const normalized = text.toLowerCase()
  const categories: Array<[OpportunityCategory, string[]]> = [
    ['hackathon', ['hackathon', 'hack day']],
    ['scholarship', ['scholarship', 'tuition']],
    ['grant', ['grant', 'funding call']],
    ['fellowship', ['fellowship', 'fellow']],
    ['competition', ['competition', 'challenge', 'prize']],
    ['conference', ['conference', 'summit', 'call for papers']],
  ]

  return categories.find(([, terms]) => terms.some((term) => normalized.includes(term)))?.[0] ?? 'other'
}

const extractDeadline = (text: string): string | null => {
  const match = /\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/.exec(text)
  if (!match) return null

  const candidate = match[0]
  const parsed = new Date(`${candidate}T00:00:00.000Z`)
  return Number.isNaN(parsed.valueOf()) ? null : candidate
}

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))

export class MockOpportunityAnalyzer implements OpportunityAnalyzer {
  async analyze(
    candidate: NormalizedCandidate,
    profile: UserProfile,
  ): Promise<AnalysisResult> {
    const digest = createHash('sha256')
      .update(`${candidate.sourceUrl}\n${profile.interests.join('|')}`)
      .digest()
    const text = `${candidate.title}\n${candidate.rawText}`
    const category = inferCategory(text)
    const matchingInterests = profile.interests.filter((interest) =>
      text.toLowerCase().includes(interest.toLowerCase()),
    )
    const interestBoost = Math.min(24, matchingInterests.length * 8)
    const domainFit = clampScore(55 + (digest[0] ?? 0) % 22 + interestBoost)
    const innovationLevel = clampScore(50 + (digest[1] ?? 0) % 45)
    const careerValue = clampScore(55 + (digest[2] ?? 0) % 40)
    const difficulty = clampScore(35 + (digest[3] ?? 0) % 55)
    const timeRequiredHours = 4 + ((digest[4] ?? 0) % 37)
    const travelRequired =
      profile.remotePreference !== 'remote-only' && /\b(in-person|onsite|travel)\b/i.test(text)
    const fundingAvailable = /\b(funding|funded|grant|prize|stipend|scholarship)\b/i.test(text)
    const fitScore = clampScore(
      domainFit * 0.5 + careerValue * 0.3 + innovationLevel * 0.2 - difficulty * 0.08,
    )
    const deadline = extractDeadline(text)
    const dueDate =
      deadline ??
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10)

    return analysisResultSchema.parse({
      category,
      summary: `${candidate.title} is a ${category} signal from ${candidate.sourceName}. Review the official source before committing time or submitting materials.`,
      fitScore,
      fitReasoning:
        matchingInterests.length > 0
          ? `The opportunity overlaps with the profile interests: ${matchingInterests.join(', ')}.`
          : `The opportunity has moderate general alignment with the ${profile.role} profile, but no explicit interest keyword matched.`,
      scores: {
        domainFit,
        innovationLevel,
        careerValue,
        difficulty,
        timeRequiredHours,
        travelRequired,
        fundingAvailable,
        ...(fundingAvailable
          ? { fundingNotes: 'Funding language was detected; verify the amount and eligibility.' }
          : {}),
      },
      deadline,
      checklist: [
        { task: 'Verify eligibility and official requirements', dueDate, completed: false },
        { task: 'Prepare required application materials', dueDate, completed: false },
      ],
    })
  }
}

export class BedrockOpportunityAnalyzer implements OpportunityAnalyzer {
  constructor(
    private readonly client = new BedrockRuntimeClient({}),
    private readonly modelId = runtimeConfig.bedrockModelId,
  ) {}

  async analyze(
    candidate: NormalizedCandidate,
    profile: UserProfile,
  ): Promise<AnalysisResult> {
    const prompt = [
      'Return only valid JSON matching the supplied schema. Do not use markdown.',
      'Use only the opportunity and user profile below. Never invent missing requirements.',
      'Schema: {"category":"hackathon|competition|scholarship|grant|fellowship|conference|other","summary":"string","fitScore":0,"fitReasoning":"string","scores":{"domainFit":0,"innovationLevel":0,"careerValue":0,"difficulty":0,"timeRequiredHours":0,"travelRequired":false,"fundingAvailable":false,"fundingNotes":"optional string"},"deadline":"YYYY-MM-DD or null","checklist":[{"task":"string","dueDate":"YYYY-MM-DD","completed":false}]}',
      `User profile: ${JSON.stringify(profile)}`,
      `Opportunity: ${JSON.stringify({ ...candidate, rawText: candidate.rawText.slice(0, 12_000) })}`,
    ].join('\n\n')
    const messages: Message[] = [{ role: 'user', content: [{ text: prompt }] }]
    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages,
        inferenceConfig: { maxTokens: 1_500, temperature: 0 },
      }),
    )
    const text = response.output?.message?.content?.find((block) => block.text)?.text
    if (!text) {
      throw new Error('Bedrock returned no text content.')
    }

    return analysisResultSchema.parse(JSON.parse(text))
  }
}

export const createAnalyzer = (
  mode: AnalysisMode = runtimeConfig.analysisMode,
): OpportunityAnalyzer =>
  mode === 'bedrock' ? new BedrockOpportunityAnalyzer() : new MockOpportunityAnalyzer()
