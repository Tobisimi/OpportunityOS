import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps,
  Tags,
} from 'aws-cdk-lib'
import * as amplify from 'aws-cdk-lib/aws-amplify'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as events from 'aws-cdk-lib/aws-events'
import * as eventTargets from 'aws-cdk-lib/aws-events-targets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as ses from 'aws-cdk-lib/aws-ses'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Construct } from 'constructs'

export class OpportunityScoutStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const senderEmail = this.node.tryGetContext('senderEmail') as string | undefined
    if (!senderEmail) {
      throw new Error(
        'Missing required CDK context "senderEmail". Copy cdk.context.example.json to cdk.context.json and set a real sender address.',
      )
    }
    const createSesIdentity =
      (this.node.tryGetContext('createSesIdentity') as string | undefined) !== 'false'
    const bedrockModelId = 'amazon.nova-lite-v1:0'

    Tags.of(this).add('Application', 'OpportunityScout')
    Tags.of(this).add('ManagedBy', 'AWS-CDK')

    const userPool = new cognito.UserPool(this, 'Users', {
      userPoolName: 'opportunity-scout-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
        tempPasswordValidity: Duration.days(3),
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: 'opportunity-scout-web',
      authFlows: {
        userSrp: true,
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
    })

    const usersTable = this.createTable('UsersTable', 'userId')
    const opportunitiesTable = this.createTable(
      'OpportunitiesTable',
      'userId',
      'opportunityId',
    )
    const agentRunsTable = this.createTable('AgentRunsTable', 'userId', 'runId')

    if (createSesIdentity) {
      new ses.EmailIdentity(this, 'DigestSender', {
        identity: ses.Identity.email(senderEmail),
      })
    }

    const amplifyEnvironmentVariables: amplify.CfnApp.EnvironmentVariableProperty[] = [
      { name: 'VITE_AWS_REGION', value: this.region },
      { name: 'VITE_USER_POOL_ID', value: userPool.userPoolId },
      { name: 'VITE_USER_POOL_CLIENT_ID', value: userPoolClient.userPoolClientId },
    ]
    const amplifyApp = new amplify.CfnApp(this, 'WebHosting', {
      name: 'opportunity-scout',
      description: 'Opportunity Scout mission-control web application',
      buildSpec: this.amplifyBuildSpec(),
      enableBranchAutoDeletion: true,
      platform: 'WEB',
      customRules: [
        {
          source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|svg|txt|webp|woff|woff2)$)([^.]+$)/>',
          target: '/index.html',
          status: '200',
        },
      ],
      environmentVariables: amplifyEnvironmentVariables,
    })

    const repositoryUrl = this.node.tryGetContext('repositoryUrl') as string | undefined
    const githubTokenSecretName = this.node.tryGetContext('githubTokenSecretName') as
      | string
      | undefined

    if (repositoryUrl || githubTokenSecretName) {
      if (!repositoryUrl || !githubTokenSecretName) {
        throw new Error(
          'Configure both "repositoryUrl" and "githubTokenSecretName", or neither.',
        )
      }

      amplifyApp.repository = repositoryUrl
      amplifyApp.accessToken = SecretValue.secretsManager(githubTokenSecretName).toString()

      new amplify.CfnBranch(this, 'MainBranch', {
        appId: amplifyApp.attrAppId,
        branchName: 'main',
        enableAutoBuild: true,
        stage: 'PRODUCTION',
      })
    }

    const commonEnvironment = {
      ANALYSIS_MODE: 'mock',
      BEDROCK_MODEL_ID: bedrockModelId,
      USERS_TABLE_NAME: usersTable.tableName,
      OPPORTUNITIES_TABLE_NAME: opportunitiesTable.tableName,
      AGENT_RUNS_TABLE_NAME: agentRunsTable.tableName,
      SENDER_EMAIL: senderEmail,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
    }
    const scoutAgentRun = this.createBackendFunction(
      'ScoutAgentRun',
      'scout-agent-run.ts',
      commonEnvironment,
      Duration.minutes(10),
      512,
    )
    const refineQuery = this.createBackendFunction(
      'RefineQuery',
      'refine-query.ts',
      commonEnvironment,
    )
    const extractFromPastedContent = this.createBackendFunction(
      'ExtractFromPastedContent',
      'extract-from-pasted-content.ts',
      commonEnvironment,
    )
    const upsertProfile = this.createBackendFunction(
      'UpsertProfile',
      'upsert-profile.ts',
      commonEnvironment,
    )
    const getUserOpportunities = this.createBackendFunction(
      'GetUserOpportunities',
      'get-user-opportunities.ts',
      commonEnvironment,
    )
    const updateOpportunityStage = this.createBackendFunction(
      'UpdateOpportunityStage',
      'update-opportunity-stage.ts',
      commonEnvironment,
    )

    const grantTableActions = (
      fn: lambda.Function,
      table: dynamodb.Table,
      actions: string[],
    ) =>
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions,
          resources: [table.tableArn],
        }),
      )
    grantTableActions(scoutAgentRun, usersTable, [
      'dynamodb:GetItem',
      'dynamodb:Scan',
    ])
    grantTableActions(scoutAgentRun, opportunitiesTable, [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ])
    grantTableActions(scoutAgentRun, agentRunsTable, ['dynamodb:PutItem'])
    scoutAgentRun.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'ses:FromAddress': senderEmail,
          },
        },
      }),
    )

    grantTableActions(refineQuery, opportunitiesTable, ['dynamodb:Query'])
    grantTableActions(extractFromPastedContent, usersTable, ['dynamodb:GetItem'])
    grantTableActions(extractFromPastedContent, opportunitiesTable, ['dynamodb:PutItem'])
    grantTableActions(upsertProfile, usersTable, [
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
    ])
    grantTableActions(getUserOpportunities, usersTable, ['dynamodb:GetItem'])
    grantTableActions(getUserOpportunities, opportunitiesTable, ['dynamodb:Query'])
    grantTableActions(updateOpportunityStage, usersTable, [
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
    ])
    grantTableActions(updateOpportunityStage, opportunitiesTable, [
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
    ])

    const failedRunsQueue = new sqs.Queue(this, 'FailedScheduledRuns', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    })
    const schedule = new events.Rule(this, 'DailyScoutSchedule', {
      description: 'Runs the autonomous Opportunity Scout daily at 06:00 WAT.',
      schedule: events.Schedule.cron({ minute: '0', hour: '5' }),
      enabled: true,
    })
    schedule.addTarget(
      new eventTargets.LambdaFunction(scoutAgentRun, {
        deadLetterQueue: failedRunsQueue,
        retryAttempts: 2,
        maxEventAge: Duration.hours(2),
        event: events.RuleTargetInput.fromObject({
          version: '0',
          id: 'scheduled',
          'detail-type': 'OpportunityScoutScheduledRun',
          source: 'opportunity-scout.schedule',
          account: this.account,
          time: events.EventField.time,
          region: this.region,
          resources: [],
          detail: {},
        }),
      }),
    )

    const configuredWebOrigin = this.node.tryGetContext('webOrigin') as string | undefined
    // Literal origin avoids a CloudFormation cycle with Amplify <-> Function URL CORS.
    const amplifyWebOrigin = 'https://main.d33uqtxaf6rj14.amplifyapp.com'
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      amplifyWebOrigin,
      ...(configuredWebOrigin ? [configuredWebOrigin] : []),
    ]
    const authenticatedUrl = (fn: lambda.Function) =>
      fn.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.NONE,
        cors: {
          allowedOrigins,
          allowedHeaders: ['authorization', 'content-type'],
          allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
          maxAge: Duration.hours(1),
        },
      })
    const refineQueryUrl = authenticatedUrl(refineQuery)
    const extractFromPastedContentUrl = authenticatedUrl(extractFromPastedContent)
    const upsertProfileUrl = authenticatedUrl(upsertProfile)
    const getUserOpportunitiesUrl = authenticatedUrl(getUserOpportunities)
    const updateOpportunityStageUrl = authenticatedUrl(updateOpportunityStage)

    // Safe after Function URLs exist: Amplify env is a shared array mutated before synth.
    amplifyEnvironmentVariables.push(
      { name: 'VITE_REFINE_QUERY_URL', value: refineQueryUrl.url },
      { name: 'VITE_EXTRACT_PASTED_CONTENT_URL', value: extractFromPastedContentUrl.url },
      { name: 'VITE_UPSERT_PROFILE_URL', value: upsertProfileUrl.url },
      { name: 'VITE_GET_OPPORTUNITIES_URL', value: getUserOpportunitiesUrl.url },
      { name: 'VITE_UPDATE_STAGE_URL', value: updateOpportunityStageUrl.url },
    )

    new CfnOutput(this, 'AwsRegion', { value: this.region })
    new CfnOutput(this, 'AmplifyWebUrl', { value: amplifyWebOrigin })
    new CfnOutput(this, 'BedrockModelId', { value: bedrockModelId })
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId })
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId })
    new CfnOutput(this, 'UsersTableName', { value: usersTable.tableName })
    new CfnOutput(this, 'OpportunitiesTableName', {
      value: opportunitiesTable.tableName,
    })
    new CfnOutput(this, 'AgentRunsTableName', { value: agentRunsTable.tableName })
    new CfnOutput(this, 'AmplifyAppId', { value: amplifyApp.attrAppId })
    new CfnOutput(this, 'RefineQueryUrl', { value: refineQueryUrl.url })
    new CfnOutput(this, 'ExtractFromPastedContentUrl', {
      value: extractFromPastedContentUrl.url,
    })
    new CfnOutput(this, 'UpsertProfileUrl', { value: upsertProfileUrl.url })
    new CfnOutput(this, 'GetUserOpportunitiesUrl', {
      value: getUserOpportunitiesUrl.url,
    })
    new CfnOutput(this, 'UpdateOpportunityStageUrl', {
      value: updateOpportunityStageUrl.url,
    })
  }

  private createBackendFunction(
    id: string,
    entryFile: string,
    environment: Record<string, string>,
    timeout = Duration.seconds(30),
    memorySize = 256,
  ) {
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
    const functionName = `opportunity-scout-${id
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()}`
    const logGroup = new logs.LogGroup(this, `${id}Logs`, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    })
    return new nodejs.NodejsFunction(this, id, {
      functionName,
      entry: path.resolve(
        currentDirectory,
        '../../backend/src/handlers',
        entryFile,
      ),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize,
      timeout,
      environment,
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        sourceMap: true,
        minify: true,
      },
    })
  }

  private createTable(id: string, partitionKey: string, sortKey?: string) {
    return new dynamodb.Table(this, id, {
      partitionKey: { name: partitionKey, type: dynamodb.AttributeType.STRING },
      ...(sortKey
        ? {
            sortKey: {
              name: sortKey,
              type: dynamodb.AttributeType.STRING,
            },
          }
        : {}),
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })
  }

  private amplifyBuildSpec() {
    return `version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build -w shared
        - npm run build -w web
  artifacts:
    baseDirectory: web/dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
`
  }
}
