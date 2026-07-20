import {
  normalizedCandidateSchema,
  type NormalizedCandidate,
} from '@opportunity-scout/shared'
import { runtimeConfig } from './config.js'

export interface DiscoveryConnector {
  readonly name: string
  discover(): Promise<NormalizedCandidate[]>
}

const fetchText = async (
  url: URL,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<string> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, application/ld+json, text/html;q=0.9',
        'User-Agent': 'OpportunityScout/0.1 (+https://github.com/Tobisimi/OpportunityOS)',
        ...init.headers,
      },
    })
    if (!response.ok) {
      throw new Error(`${url.hostname} returned HTTP ${response.status}.`)
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > 2_000_000) {
      throw new Error(`${url.hostname} response exceeded the 2 MB limit.`)
    }
    const text = await response.text()
    if (text.length > 2_000_000) {
      throw new Error(`${url.hostname} response exceeded the 2 MB limit.`)
    }
    return text
  } finally {
    clearTimeout(timeout)
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const parseCandidate = (candidate: unknown): NormalizedCandidate | null => {
  const result = normalizedCandidateSchema.safeParse(candidate)
  return result.success ? result.data : null
}

export class DevpostConnector implements DiscoveryConnector {
  readonly name = 'Devpost'

  async discover(): Promise<NormalizedCandidate[]> {
    const url = new URL('https://devpost.com/api/hackathons')
    url.searchParams.set('page', '1')
    url.searchParams.append('status[]', 'open')
    const payload = asRecord(JSON.parse(await fetchText(url)))
    const hackathons = Array.isArray(payload?.hackathons) ? payload.hackathons : []

    return hackathons.flatMap((entry) => {
      const record = asRecord(entry)
      const title = asText(record?.title)
      const sourceUrl = asText(record?.url)
      const description =
        asText(record?.description) ?? asText(record?.tagline) ?? asText(record?.themes)
      const candidate = parseCandidate({
        title,
        sourceUrl,
        rawText: [title, description, asText(record?.submission_period_dates)]
          .filter(Boolean)
          .join('\n'),
        sourceName: this.name,
      })
      return candidate ? [candidate] : []
    })
  }
}

export class GitHubConnector implements DiscoveryConnector {
  readonly name = 'GitHub'

  async discover(): Promise<NormalizedCandidate[]> {
    const url = new URL('https://api.github.com/search/repositories')
    url.searchParams.set('q', 'topic:hackathon archived:false')
    url.searchParams.set('sort', 'updated')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('per_page', '30')
    const headers: HeadersInit = { Accept: 'application/vnd.github+json' }
    if (runtimeConfig.githubToken) {
      headers.Authorization = `Bearer ${runtimeConfig.githubToken}`
    }
    const payload = asRecord(JSON.parse(await fetchText(url, { headers })))
    const items = Array.isArray(payload?.items) ? payload.items : []

    return items.flatMap((entry) => {
      const record = asRecord(entry)
      const title = asText(record?.name)
      const sourceUrl = asText(record?.html_url)
      const candidate = parseCandidate({
        title,
        sourceUrl,
        rawText: [
          title,
          asText(record?.description),
          Array.isArray(record?.topics) ? record.topics.join(', ') : null,
        ]
          .filter(Boolean)
          .join('\n'),
        sourceName: this.name,
      })
      return candidate ? [candidate] : []
    })
  }
}

const collectJsonLdEvents = (value: unknown, output: Record<string, unknown>[]): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdEvents(item, output))
    return
  }
  const record = asRecord(value)
  if (!record) return
  if (record['@type'] === 'Event') output.push(record)
  if (record['@graph']) collectJsonLdEvents(record['@graph'], output)
}

export class GoogleDevelopersConnector implements DiscoveryConnector {
  readonly name = 'Google for Developers'

  async discover(): Promise<NormalizedCandidate[]> {
    const html = await fetchText(new URL('https://developers.google.com/events'))
    const blocks = [
      ...html.matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ]
    const events: Record<string, unknown>[] = []
    for (const block of blocks) {
      try {
        collectJsonLdEvents(JSON.parse(block[1] ?? ''), events)
      } catch {
        // Ignore malformed third-party JSON-LD blocks and continue with valid blocks.
      }
    }

    return events.flatMap((event) => {
      const title = asText(event.name)
      const sourceUrl = asText(event.url)
      const candidate = parseCandidate({
        title,
        sourceUrl,
        rawText: [title, asText(event.description), asText(event.startDate), asText(event.endDate)]
          .filter(Boolean)
          .join('\n'),
        sourceName: this.name,
      })
      return candidate ? [candidate] : []
    })
  }
}

export class IeeeConnector implements DiscoveryConnector {
  readonly name = 'IEEE'

  async discover(): Promise<NormalizedCandidate[]> {
    const configuredUrl = process.env.IEEE_OPPORTUNITIES_FEED_URL?.trim()
    if (!configuredUrl) return []

    const url = new URL(configuredUrl)
    if (!['events.vtools.ieee.org', 'ieee.org', 'www.ieee.org'].includes(url.hostname)) {
      throw new Error('IEEE_OPPORTUNITIES_FEED_URL must use an approved IEEE hostname.')
    }
    const payload = JSON.parse(await fetchText(url))
    const records = Array.isArray(payload)
      ? payload
      : Array.isArray(asRecord(payload)?.items)
        ? (asRecord(payload)?.items as unknown[])
        : []

    return records.flatMap((entry) => {
      const record = asRecord(entry)
      const title = asText(record?.title) ?? asText(record?.name)
      const sourceUrl = asText(record?.url) ?? asText(record?.link)
      const candidate = parseCandidate({
        title,
        sourceUrl,
        rawText: [
          title,
          asText(record?.description),
          asText(record?.deadline),
          asText(record?.startDate),
        ]
          .filter(Boolean)
          .join('\n'),
        sourceName: this.name,
      })
      return candidate ? [candidate] : []
    })
  }
}

export const createDefaultConnectors = (): DiscoveryConnector[] => [
  new DevpostConnector(),
  new GitHubConnector(),
  new IeeeConnector(),
  new GoogleDevelopersConnector(),
]
