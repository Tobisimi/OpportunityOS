import { fetchAuthSession } from 'aws-amplify/auth'
import {
  opportunitySchema,
  userProfileSchema,
  type Opportunity,
  type OpportunityCategory,
  type OpportunityStage,
  type PrimaryGoal,
  type UserProfile,
} from '@opportunity-scout/shared'

const endpoint = (name: keyof ImportMetaEnv): string => {
  const value = import.meta.env[name]
  if (!value) throw new Error(`Missing API configuration: ${name}`)
  return value
}

const endpoints = {
  getOpportunities: () => endpoint('VITE_GET_OPPORTUNITIES_URL'),
  upsertProfile: () => endpoint('VITE_UPSERT_PROFILE_URL'),
  updateStage: () => endpoint('VITE_UPDATE_STAGE_URL'),
  refineQuery: () => endpoint('VITE_REFINE_QUERY_URL'),
  extractContent: () => endpoint('VITE_EXTRACT_PASTED_CONTENT_URL'),
}

const request = async <T>(
  url: string,
  init: RequestInit = {},
): Promise<T> => {
  const session = await fetchAuthSession()
  const accessToken = session.tokens?.accessToken?.toString()
  if (!accessToken) throw new Error('Your session has expired. Sign in again.')
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) {
    const error =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : `Request failed with status ${response.status}.`
    throw new Error(error)
  }
  return payload as T
}

export interface ProfileInput {
  role: string
  interests: string[]
  location: string
  remotePreference: UserProfile['remotePreference']
  experienceLevel: UserProfile['experienceLevel']
  preferredCategories: OpportunityCategory[]
  primaryGoal: PrimaryGoal
  scheduleEnabled: boolean
}

export const getDashboard = async (): Promise<{
  profile: UserProfile | null
  opportunities: Opportunity[]
}> => {
  const payload = await request<{ profile: unknown; opportunities: unknown[] }>(
    endpoints.getOpportunities(),
  )
  return {
    profile: payload.profile ? userProfileSchema.parse(payload.profile) : null,
    opportunities: payload.opportunities.map((item) => opportunitySchema.parse(item)),
  }
}

export const saveProfile = async (profile: ProfileInput): Promise<UserProfile> => {
  const payload = await request<{ profile: unknown }>(endpoints.upsertProfile(), {
    method: 'POST',
    body: JSON.stringify(profile),
  })
  return userProfileSchema.parse(payload.profile)
}

export const changeStage = async (
  opportunityId: string,
  stage: OpportunityStage,
): Promise<Opportunity> => {
  const payload = await request<{ opportunity: unknown }>(endpoints.updateStage(), {
    method: 'POST',
    body: JSON.stringify({ opportunityId, stage }),
  })
  return opportunitySchema.parse(payload.opportunity)
}

export const askScout = async (
  question: string,
): Promise<{ answer: string; opportunityIds: string[] }> =>
  request(endpoints.refineQuery(), {
    method: 'POST',
    body: JSON.stringify({ question }),
  })

export const analyzePastedContent = async (input: {
  title?: string
  sourceUrl?: string
  content: string
}): Promise<Opportunity> => {
  const payload = await request<{ opportunity: unknown }>(endpoints.extractContent(), {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return opportunitySchema.parse(payload.opportunity)
}
