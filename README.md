# OpportunityOS

OpportunityOS is an AI-powered opportunity intelligence platform for ambitious people who do not want to sift through endless listings manually.

Instead of dumping dozens of raw opportunities on a dashboard, OpportunityOS behaves like an executive briefing system: it collects signals, ranks what matters, explains why each item is relevant, highlights urgency, and recommends the next action.

## What It Does

- Discovers opportunities from connected sources and normalizes them into a shared contract
- Stores user profiles, opportunities, and agent run history in DynamoDB
- Prioritizes opportunities based on fit, urgency, effort, success odds, and user preferences
- Presents a briefing-first dashboard with a top recommendation, action nudges, and a ranked queue
- Supports a tailored onboarding flow to capture goals, interests, preferred categories, and logistics
- Sends digest emails through Amazon SES
- Can run with a deterministic mock analyzer or a Gemini-backed analyzer, depending on deployment configuration

## Product Experience

OpportunityOS is designed around a simple promise:

> We already did the thinking for you.

The application centers on:

- a multi-step onboarding flow that captures the user's taste and goals
- a daily briefing rather than a database-like list
- AI-style reasoning for why an opportunity was selected
- explicit urgency, effort, and next-step guidance
- an archive view for deeper browsing only when needed

## Tech Stack

- `React 19` + `Vite` for the web app
- `AWS Amplify` UI + `Amazon Cognito` for authentication
- `AWS Lambda` function URLs for backend APIs
- `AWS CDK` for infrastructure as code
- `Amazon DynamoDB` for persistence
- `Amazon EventBridge` for scheduled scout runs
- `Amazon SES` for digest delivery
- `TypeScript` across the monorepo
- `Zod` for shared runtime-validated schemas

## Repository Layout

- `web` - React frontend, onboarding flow, executive briefing UI, and Cognito client config
- `backend` - Lambda handlers, connectors, analyzers, scoring logic, and digest rendering
- `shared` - shared Zod schemas and cross-app opportunity intelligence helpers
- `infra` - AWS CDK stack for Cognito, DynamoDB, SES, EventBridge, Lambdas, and Amplify hosting
- `BUILD_LOG.md` - delivery log and implementation notes
- `OpportunityOS Spec.md` - product specification
- `OpportunityOS UI Spec.md` - interface and design specification

## Architecture Overview

1. A user signs up with Cognito and completes onboarding.
2. The backend stores the profile and preferences in DynamoDB.
3. A scheduled Lambda run fetches candidate opportunities from source connectors.
4. The analyzer scores and summarizes the highest-signal unseen candidates.
5. Ranked opportunities and run logs are persisted.
6. The frontend renders an executive-style briefing and detailed opportunity views.
7. SES can send a digest summarizing the top recommendation and attention items.

## Prerequisites

- Node.js `22+`
- npm `10+`
- AWS CLI v2 authenticated to the target AWS account
- AWS CDK bootstrap completed for the target account/region
- A verified SES sender email address

Optional, depending on analyzer mode:

- Gemini API key if you want live Gemini analysis
- Bedrock model access if you choose to add Bedrock-backed analysis later

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Verify the workspace

```bash
npm run check
```

### 3. Configure CDK context

Copy `infra/cdk.context.example.json` to `infra/cdk.context.json`.

Example:

```json
{
  "senderEmail": "verified-sender@example.com",
  "repositoryUrl": "https://github.com/OWNER/opportunity-scout",
  "githubTokenSecretName": "opportunity-scout/github-token"
}
```

Required:

- `senderEmail`: SES sender for digest delivery

Optional:

- `repositoryUrl`: GitHub repository URL for Amplify auto-build integration
- `githubTokenSecretName`: Secrets Manager secret name containing the GitHub token
- `geminiApiKey`: enables Gemini analyzer mode in deployed Lambdas
- `geminiModelId`: overrides the default Gemini model
- `maxAnalysesPerRun`: caps AI analyses per scheduled run, defaults to `12`

Important:

- Store GitHub credentials in AWS Secrets Manager, not in source control
- Do not commit `infra/cdk.context.json`
- If no Gemini key is supplied, the stack deploys in stable `mock` mode

## Local Development

After deployment, copy the stack outputs into `web/.env.local`.

At minimum, the frontend expects:

```bash
VITE_AWS_REGION=us-east-1
VITE_USER_POOL_ID=your_user_pool_id
VITE_USER_POOL_CLIENT_ID=your_user_pool_client_id
VITE_GET_OPPORTUNITIES_URL=your_get_opportunities_lambda_url
VITE_UPSERT_PROFILE_URL=your_upsert_profile_lambda_url
VITE_UPDATE_STAGE_URL=your_update_stage_lambda_url
VITE_REFINE_QUERY_URL=your_refine_query_lambda_url
VITE_EXTRACT_PASTED_CONTENT_URL=your_extract_content_lambda_url
```

Start the app:

```bash
npm run dev
```

## Build, Check, and Test

Run the full monorepo build:

```bash
npm run build
```

Run typechecks, backend tests, frontend linting, and frontend build validation:

```bash
npm run check
```

Useful workspace-specific commands:

```bash
npm run build -w shared
npm run check -w backend
npm run test -w backend
npm run build -w web
npm run lint -w web
npm run synth -w infra
```

## Deployment

Bootstrap CDK if needed:

```bash
npx cdk bootstrap
```

Deploy the stack:

```bash
npm run deploy
```

The CDK stack provisions:

- Cognito user pool and client
- DynamoDB tables for users, opportunities, and agent runs
- Lambda functions for profile updates, dashboard data, stage updates, query refinement, pasted-content extraction, and scheduled scout runs
- EventBridge schedule for the automated scout
- SES sender identity
- Amplify hosting with monorepo build settings

If `repositoryUrl` and `githubTokenSecretName` are configured together, the stack also creates an Amplify `main` branch with automatic builds.

## Analyzer Modes

OpportunityOS supports multiple analyzer modes behind the same interface:

- `mock` - deterministic, reliable, demo-friendly, and the default fallback
- `gemini` - enabled when `geminiApiKey` is provided through CDK context

The current backend also includes safeguards for AI provider limits:

- request throttling between Gemini calls
- model fallback handling
- a per-run analysis budget so the system prioritizes only the highest-signal candidates

For demos, judging, and time-sensitive deployments, `mock` mode is the safest option because it guarantees stable output without quota risk.

## Security Defaults

- Cognito uses verified email sign-in, SRP auth, token revocation, user-enumeration protection, and optional TOTP MFA
- DynamoDB tables use encryption at rest, point-in-time recovery, on-demand billing, deletion protection, and retained deletion policies
- Lambda permissions are scoped to the tables and services they need
- No secrets should be committed to the repository

## Current Status

The product currently demonstrates:

- end-to-end signup and onboarding
- profile-aware ranking and briefing generation
- persisted opportunities and stage tracking
- scheduled autonomous runs
- SES digest delivery
- production deployment through AWS CDK and Amplify

## License

This repository is currently marked `ISC` in `package.json`.
