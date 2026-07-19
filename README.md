# Opportunity Scout

An always-on AWS agent that discovers, scores, tracks, and reports opportunities matched to a user's profile.

## Repository layout

- `web` — React mission-control interface and Cognito authentication
- `infra` — AWS CDK infrastructure
- `shared` — the single runtime-validated opportunity contract consumed by backend and frontend
- `BUILD_LOG.md` — phase budget and elapsed-time tracking

## Prerequisites

- Node.js 22 or newer
- AWS CLI v2 authenticated to the deployment account
- AWS CDK bootstrap completed in the target account and region
- Amazon Bedrock model access enabled in the deployment region
- An email address that can complete the Amazon SES verification message

## Install and verify

```shell
npm install
npm run check
```

## Configure infrastructure

Copy `infra/cdk.context.example.json` to `infra/cdk.context.json` and set:

- `senderEmail` — the SES digest sender; deployment initiates verification
- `repositoryUrl` and `githubTokenSecretName` — optional as a pair; when present, CDK creates the Amplify `main` branch with automatic builds

The GitHub token itself must be stored in AWS Secrets Manager. Never place it in source control or CDK context.

```shell
aws configure sso
npx cdk bootstrap
npm run deploy
```

After deployment, copy the `AwsRegion`, `UserPoolId`, and `UserPoolClientId` stack outputs into `web/.env.local` for local development. Amplify Hosting receives these values directly from the stack.

## Security defaults

- Cognito uses SRP authentication, verified email sign-in, optional TOTP MFA, token revocation, and user-enumeration protection.
- DynamoDB tables use encryption at rest, point-in-time recovery, deletion protection, on-demand capacity, and retained deletion policy.
- No credentials are stored in the repository.
