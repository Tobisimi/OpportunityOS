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
import * as ses from 'aws-cdk-lib/aws-ses'
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
      environmentVariables: [
        { name: 'VITE_AWS_REGION', value: this.region },
        { name: 'VITE_USER_POOL_ID', value: userPool.userPoolId },
        { name: 'VITE_USER_POOL_CLIENT_ID', value: userPoolClient.userPoolClientId },
      ],
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

    new CfnOutput(this, 'AwsRegion', { value: this.region })
    new CfnOutput(this, 'BedrockModelId', { value: bedrockModelId })
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId })
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId })
    new CfnOutput(this, 'UsersTableName', { value: usersTable.tableName })
    new CfnOutput(this, 'OpportunitiesTableName', {
      value: opportunitiesTable.tableName,
    })
    new CfnOutput(this, 'AgentRunsTableName', { value: agentRunsTable.tableName })
    new CfnOutput(this, 'AmplifyAppId', { value: amplifyApp.attrAppId })
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
