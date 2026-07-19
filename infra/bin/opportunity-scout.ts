#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { OpportunityScoutStack } from '../lib/opportunity-scout-stack.js'

const app = new App()

new OpportunityScoutStack(app, 'OpportunityScoutStack', {
  description: 'Opportunity Scout autonomous opportunity discovery platform',
  env: {
    ...(process.env.CDK_DEFAULT_ACCOUNT
      ? { account: process.env.CDK_DEFAULT_ACCOUNT }
      : {}),
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
})
