import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analysisResultSchema,
  userProfileSchema,
  type AgentRun,
  type Opportunity,
  type UserProfile,
} from '@opportunity-scout/shared'
import { MockOpportunityAnalyzer } from '../src/analysis.js'
import type { DiscoveryConnector } from '../src/connectors.js'
import {
  executeScout,
  type DigestContent,
  type DigestNotifier,
  type ScoutRepository,
} from '../src/scout.js'

class MemoryRepository implements ScoutRepository {
  readonly opportunities: Opportunity[] = []
  readonly runs: AgentRun[] = []

  constructor(private readonly users: UserProfile[]) {}

  async getUser(userId: string): Promise<UserProfile | null> {
    return this.users.find((user) => user.userId === userId) ?? null
  }

  async listEnabledUsers(): Promise<UserProfile[]> {
    return this.users.filter((user) => user.scheduleEnabled)
  }

  async listOpportunities(userId: string): Promise<Opportunity[]> {
    return this.opportunities.filter((item) => item.userId === userId)
  }

  async putOpportunity(opportunity: Opportunity): Promise<void> {
    if (
      this.opportunities.some(
        (item) =>
          item.userId === opportunity.userId &&
          item.opportunityId === opportunity.opportunityId,
      )
    ) {
      throw new Error('Duplicate opportunity.')
    }
    this.opportunities.push(opportunity)
  }

  async putAgentRun(run: AgentRun): Promise<void> {
    const index = this.runs.findIndex(
      (item) => item.userId === run.userId && item.runId === run.runId,
    )
    if (index >= 0) this.runs[index] = run
    else this.runs.push(run)
  }

  async markNotified(
    userId: string,
    opportunityIds: string[],
    notifiedAt: string,
  ): Promise<void> {
    this.opportunities.forEach((item) => {
      if (item.userId === userId && opportunityIds.includes(item.opportunityId)) {
        item.notifiedAt = notifiedAt
      }
    })
  }
}

class MemoryNotifier implements DigestNotifier {
  readonly digests: DigestContent[] = []

  async sendDigest(content: DigestContent): Promise<void> {
    this.digests.push(content)
  }
}

const profile = userProfileSchema.parse({
  userId: 'user-1',
  email: 'builder@example.com',
  role: 'Software engineering student',
  interests: ['AI', 'cloud'],
  location: 'Lagos, Nigeria',
  remotePreference: 'remote-preferred',
  experienceLevel: 'student',
  scheduleEnabled: true,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
})

const connector: DiscoveryConnector = {
  name: 'Fixture connector',
  async discover() {
    return [
      {
        title: 'Cloud AI Hackathon',
        sourceUrl: 'https://example.com/hackathon?utm_source=test',
        rawText: 'AI cloud hackathon. Prize funding. Deadline 2026-08-01.',
        sourceName: 'Fixture',
      },
      {
        title: 'Duplicate Cloud AI Hackathon',
        sourceUrl: 'https://example.com/hackathon',
        rawText: 'Duplicate record.',
        sourceName: 'Fixture',
      },
    ]
  },
}

test('mock analyzer returns the single validated analysis schema', async () => {
  const result = await new MockOpportunityAnalyzer().analyze(
    (await connector.discover())[0]!,
    profile,
  )
  assert.equal(analysisResultSchema.safeParse(result).success, true)
  assert.equal(result.category, 'hackathon')
  assert.equal(result.scores.fundingAvailable, true)
})

test('scheduled scout completes end to end with discovery, dedup, persistence and digest', async () => {
  const repository = new MemoryRepository([profile])
  const notifier = new MemoryNotifier()
  const failingConnector: DiscoveryConnector = {
    name: 'Expected failure',
    async discover() {
      throw new Error('Fixture connector unavailable.')
    },
  }
  const dependencies = {
    connectors: [connector, failingConnector],
    analyzer: new MockOpportunityAnalyzer(),
    repository,
    notifier,
    now: () => new Date('2026-07-19T12:00:00.000Z'),
  }

  const first = await executeScout(dependencies)
  assert.equal(first.usersProcessed, 1)
  assert.equal(first.runs[0]?.status, 'partially_succeeded')
  assert.equal(first.runs[0]?.persistedCount, 1)
  assert.equal(repository.opportunities.length, 1)
  assert.equal(notifier.digests.length, 1)
  assert.ok(repository.opportunities[0]?.notifiedAt)

  const second = await executeScout(dependencies)
  assert.equal(second.runs[0]?.persistedCount, 0)
  assert.equal(repository.opportunities.length, 1)
  assert.equal(notifier.digests.length, 1)
})

test('digest failure preserves persisted work and reports a partial run', async () => {
  const repository = new MemoryRepository([profile])
  const notifier: DigestNotifier = {
    async sendDigest() {
      throw new Error('Recipient is not verified.')
    },
  }
  const result = await executeScout({
    connectors: [connector],
    analyzer: new MockOpportunityAnalyzer(),
    repository,
    notifier,
    now: () => new Date('2026-07-19T12:00:00.000Z'),
  })

  assert.equal(result.runs[0]?.status, 'partially_succeeded')
  assert.equal(result.runs[0]?.persistedCount, 1)
  assert.equal(result.runs[0]?.notifiedCount, 0)
  assert.match(result.runs[0]?.errors[0] ?? '', /Digest delivery failed/)
  assert.equal(repository.opportunities.length, 1)
})
