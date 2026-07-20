import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import {
  describeEffort,
  describeUrgency,
  nextAction,
  opportunitySchema,
  successProbability,
  userProfileSchema,
  type AgentRun,
  type Opportunity,
  type OpportunityStage,
  type UserProfile,
} from '@opportunity-scout/shared'
import { runtimeConfig } from './config.js'
import type {
  DigestContent,
  DigestNotifier,
  ScoutRepository,
} from './scout.js'

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

export class DynamoScoutRepository implements ScoutRepository {
  constructor(
    private readonly usersTableName = runtimeConfig.usersTableName(),
    private readonly opportunitiesTableName = runtimeConfig.opportunitiesTableName(),
    private readonly agentRunsTableName = runtimeConfig.agentRunsTableName(),
  ) {}

  async getUser(userId: string): Promise<UserProfile | null> {
    const response = await documentClient.send(
      new GetCommand({
        TableName: this.usersTableName,
        Key: { userId },
        ConsistentRead: true,
      }),
    )
    return response.Item ? userProfileSchema.parse(response.Item) : null
  }

  async listEnabledUsers(): Promise<UserProfile[]> {
    const users: UserProfile[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined
    do {
      const response = await documentClient.send(
        new ScanCommand({
          TableName: this.usersTableName,
          FilterExpression: '#scheduleEnabled = :enabled',
          ExpressionAttributeNames: { '#scheduleEnabled': 'scheduleEnabled' },
          ExpressionAttributeValues: { ':enabled': true },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      )
      users.push(...(response.Items ?? []).map((item) => userProfileSchema.parse(item)))
      exclusiveStartKey = response.LastEvaluatedKey
    } while (exclusiveStartKey)
    return users
  }

  async upsertUserProfile(profile: UserProfile): Promise<UserProfile> {
    const response = await documentClient.send(
      new UpdateCommand({
        TableName: this.usersTableName,
        Key: { userId: profile.userId },
        UpdateExpression:
          'SET #email = :email, #role = :role, #interests = :interests, #location = :location, #remotePreference = :remotePreference, #experienceLevel = :experienceLevel, #preferredCategories = :preferredCategories, #primaryGoal = :primaryGoal, #scheduleEnabled = :scheduleEnabled, #engagementStats = if_not_exists(#engagementStats, :engagementStats), #createdAt = if_not_exists(#createdAt, :createdAt), #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#email': 'email',
          '#role': 'role',
          '#interests': 'interests',
          '#location': 'location',
          '#remotePreference': 'remotePreference',
          '#experienceLevel': 'experienceLevel',
          '#preferredCategories': 'preferredCategories',
          '#primaryGoal': 'primaryGoal',
          '#scheduleEnabled': 'scheduleEnabled',
          '#engagementStats': 'engagementStats',
          '#createdAt': 'createdAt',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':email': profile.email,
          ':role': profile.role,
          ':interests': profile.interests,
          ':location': profile.location,
          ':remotePreference': profile.remotePreference,
          ':experienceLevel': profile.experienceLevel,
          ':preferredCategories': profile.preferredCategories,
          ':primaryGoal': profile.primaryGoal,
          ':scheduleEnabled': profile.scheduleEnabled,
          ':engagementStats': profile.engagementStats,
          ':createdAt': profile.createdAt,
          ':updatedAt': profile.updatedAt,
        },
        ReturnValues: 'ALL_NEW',
      }),
    )
    return userProfileSchema.parse(response.Attributes)
  }

  async listOpportunities(userId: string): Promise<Opportunity[]> {
    const opportunities: Opportunity[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined
    do {
      const response = await documentClient.send(
        new QueryCommand({
          TableName: this.opportunitiesTableName,
          KeyConditionExpression: '#userId = :userId',
          ExpressionAttributeNames: { '#userId': 'userId' },
          ExpressionAttributeValues: { ':userId': userId },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      )
      opportunities.push(
        ...(response.Items ?? []).map((item) => opportunitySchema.parse(item)),
      )
      exclusiveStartKey = response.LastEvaluatedKey
    } while (exclusiveStartKey)
    return opportunities
  }

  async putOpportunity(opportunity: Opportunity): Promise<void> {
    await documentClient.send(
      new PutCommand({
        TableName: this.opportunitiesTableName,
        Item: opportunity,
        ConditionExpression:
          'attribute_not_exists(#userId) AND attribute_not_exists(#opportunityId)',
        ExpressionAttributeNames: {
          '#userId': 'userId',
          '#opportunityId': 'opportunityId',
        },
      }),
    )
  }

  async updateOpportunityStage(
    userId: string,
    opportunityId: string,
    stage: OpportunityStage,
    now: string,
  ): Promise<Opportunity> {
    const opportunityResponse = await documentClient.send(
      new GetCommand({
        TableName: this.opportunitiesTableName,
        Key: { userId, opportunityId },
        ConsistentRead: true,
      }),
    )
    if (!opportunityResponse.Item) throw new Error('Opportunity not found.')
    const opportunity = opportunitySchema.parse(opportunityResponse.Item)
    const shouldCount = stage !== 'saved' && opportunity.engagementCountedAt === null

    if (shouldCount) {
      const user = await this.getUser(userId)
      if (!user) throw new Error('User profile not found.')
      const nextStats = structuredClone(user.engagementStats)
      const category = (nextStats.byCategory[opportunity.category] ??= {
        viewed: 0,
        interestedOrFurther: 0,
      })
      category.interestedOrFurther += 1
      const source = (nextStats.bySource[opportunity.sourceName] ??= {
        viewed: 0,
        interestedOrFurther: 0,
      })
      source.interestedOrFurther += 1

      await documentClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.opportunitiesTableName,
                Key: { userId, opportunityId },
                UpdateExpression:
                  'SET #stage = :stage, #engagementCountedAt = :engagementCountedAt',
                ConditionExpression:
                  'attribute_not_exists(#engagementCountedAt) OR #engagementCountedAt = :empty',
                ExpressionAttributeNames: {
                  '#stage': 'stage',
                  '#engagementCountedAt': 'engagementCountedAt',
                },
                ExpressionAttributeValues: {
                  ':stage': stage,
                  ':engagementCountedAt': now,
                  ':empty': null,
                },
              },
            },
            {
              Update: {
                TableName: this.usersTableName,
                Key: { userId },
                UpdateExpression: 'SET #engagementStats = :engagementStats, #updatedAt = :now',
                ConditionExpression: '#updatedAt = :previousUpdatedAt',
                ExpressionAttributeNames: {
                  '#engagementStats': 'engagementStats',
                  '#updatedAt': 'updatedAt',
                },
                ExpressionAttributeValues: {
                  ':engagementStats': nextStats,
                  ':now': now,
                  ':previousUpdatedAt': user.updatedAt,
                },
              },
            },
          ],
        }),
      )
      return opportunitySchema.parse({
        ...opportunity,
        stage,
        engagementCountedAt: now,
      })
    }

    const response = await documentClient.send(
      new UpdateCommand({
        TableName: this.opportunitiesTableName,
        Key: { userId, opportunityId },
        UpdateExpression: 'SET #stage = :stage',
        ConditionExpression: 'attribute_exists(#userId)',
        ExpressionAttributeNames: { '#userId': 'userId', '#stage': 'stage' },
        ExpressionAttributeValues: { ':stage': stage },
        ReturnValues: 'ALL_NEW',
      }),
    )
    return opportunitySchema.parse(response.Attributes)
  }

  async putAgentRun(run: AgentRun): Promise<void> {
    await documentClient.send(
      new PutCommand({
        TableName: this.agentRunsTableName,
        Item: run,
      }),
    )
  }

  async markNotified(
    userId: string,
    opportunityIds: string[],
    notifiedAt: string,
  ): Promise<void> {
    for (const opportunityId of opportunityIds) {
      await documentClient.send(
        new UpdateCommand({
          TableName: this.opportunitiesTableName,
          Key: { userId, opportunityId },
          UpdateExpression: 'SET #notifiedAt = :notifiedAt',
          ConditionExpression: 'attribute_exists(#userId) AND #userId = :userId',
          ExpressionAttributeNames: {
            '#userId': 'userId',
            '#notifiedAt': 'notifiedAt',
          },
          ExpressionAttributeValues: {
            ':userId': userId,
            ':notifiedAt': notifiedAt,
          },
        }),
      )
    }
  }
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  )

const renderPriorityBlock = (opportunity: Opportunity, now: Date): string => {
  const urgency = describeUrgency(opportunity.deadline, now)
  const effort = describeEffort(opportunity.scores.timeRequiredHours)
  const odds = successProbability(opportunity)
  return [
    '<div style="border:1px solid #FF4FA3;border-radius:6px;padding:16px;margin:16px 0;">',
    '<p style="margin:0 0 6px;color:#FF4FA3;font-size:12px;letter-spacing:0.08em;">&rarr; PRIORITISE THIS</p>',
    `<h2 style="margin:0 0 8px;">${escapeHtml(opportunity.title)}</h2>`,
    `<p style="margin:0 0 8px;color:#8B98A8;">${escapeHtml(opportunity.fitReasoning)}</p>`,
    `<p style="margin:0 0 8px;font-size:13px;">Fit ${opportunity.fitScore}/100 &middot; ${escapeHtml(urgency.label)} &middot; ${escapeHtml(effort.label)} (${escapeHtml(effort.detail)}) &middot; ${odds}% odds</p>`,
    `<p style="margin:0;"><strong>Next step:</strong> ${escapeHtml(nextAction(opportunity))}</p>`,
    '</div>',
  ].join('')
}

const renderDigest = (content: DigestContent): string => {
  const now = new Date()
  const recommendation = content.recommendation
    ? renderPriorityBlock(content.recommendation, now)
    : ''
  const nudges =
    content.nudges.length > 0
      ? `<h2>Needs attention</h2><ul>${content.nudges
          .map((nudge) => `<li>${escapeHtml(nudge)}</li>`)
          .join('')}</ul>`
      : ''
  const rest = content.newOpportunities.filter(
    (opportunity) => opportunity.opportunityId !== content.recommendation?.opportunityId,
  )
  const restList =
    rest.length > 0
      ? `<h2>Also detected this run</h2><ul>${rest
          .map(
            (opportunity) =>
              `<li><strong>${escapeHtml(opportunity.title)}</strong> — fit ${opportunity.fitScore}/100<br>${escapeHtml(opportunity.summary)}</li>`,
          )
          .join('')}</ul>`
      : ''

  return [
    `<h1>Scan complete. ${content.newOpportunities.length} new signal${
      content.newOpportunities.length === 1 ? '' : 's'
    } detected.</h1>`,
    '<p style="color:#8B98A8;">Your scout already did the thinking. Here is what deserves your attention.</p>',
    recommendation,
    nudges,
    restList,
  ].join('')
}

export class SesDigestNotifier implements DigestNotifier {
  constructor(
    private readonly client = new SESv2Client({}),
    private readonly senderEmail = runtimeConfig.senderEmail(),
  ) {}

  async sendDigest(content: DigestContent): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.senderEmail,
        Destination: { ToAddresses: [content.user.email] },
        Content: {
          Simple: {
            Subject: { Data: `Opportunity Scout: ${content.newOpportunities.length} new signals` },
            Body: { Html: { Data: renderDigest(content) } },
          },
        },
      }),
    )
  }
}
