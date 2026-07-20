const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const resolveAnalysisMode = (): 'gemini' | 'bedrock' | 'mock' => {
  const mode = process.env.ANALYSIS_MODE?.trim().toLowerCase()
  if (mode === 'gemini') return 'gemini'
  if (mode === 'bedrock') return 'bedrock'
  return 'mock'
}

const resolvePositiveInt = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const runtimeConfig = {
  analysisMode: resolveAnalysisMode(),
  bedrockModelId: process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-lite-v1:0',
  geminiModelId: process.env.GEMINI_MODEL_ID?.trim() || 'gemini-2.5-flash-lite',
  geminiApiKey: () => required('GEMINI_API_KEY'),
  // The scout only spends its analysis budget on the highest-signal unseen
  // candidates per run. Keeps free-tier providers within daily request caps and
  // matches the product goal of surfacing what matters instead of dumping.
  maxAnalysesPerRun: resolvePositiveInt('MAX_ANALYSES_PER_RUN', 12),
  usersTableName: () => required('USERS_TABLE_NAME'),
  opportunitiesTableName: () => required('OPPORTUNITIES_TABLE_NAME'),
  agentRunsTableName: () => required('AGENT_RUNS_TABLE_NAME'),
  senderEmail: () => required('SENDER_EMAIL'),
  userPoolId: () => required('USER_POOL_ID'),
  userPoolClientId: () => required('USER_POOL_CLIENT_ID'),
  githubToken: process.env.GITHUB_TOKEN?.trim(),
} as const

export type AnalysisMode = (typeof runtimeConfig)['analysisMode']
