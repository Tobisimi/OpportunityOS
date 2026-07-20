const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const runtimeConfig = {
  analysisMode: process.env.ANALYSIS_MODE === 'bedrock' ? 'bedrock' : 'mock',
  bedrockModelId: process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-lite-v1:0',
  usersTableName: () => required('USERS_TABLE_NAME'),
  opportunitiesTableName: () => required('OPPORTUNITIES_TABLE_NAME'),
  agentRunsTableName: () => required('AGENT_RUNS_TABLE_NAME'),
  senderEmail: () => required('SENDER_EMAIL'),
  userPoolId: () => required('USER_POOL_ID'),
  userPoolClientId: () => required('USER_POOL_CLIENT_ID'),
  githubToken: process.env.GITHUB_TOKEN?.trim(),
} as const

export type AnalysisMode = (typeof runtimeConfig)['analysisMode']
