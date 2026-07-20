# Opportunity Scout build log

All times are WAT (UTC+1). Budgets follow the governing project specification.

| Phase | Budget | Started | Completed | Actual | Status |
|---|---:|---|---|---:|---|
| 1 — Foundation | 4h | 2026-07-19 00:19 | 2026-07-19 14:41 | ~6h25 active/blocked | AWS foundation deployed; auth smoke-tested |
| 2 — Discovery connectors | 8h | 2026-07-19 18:29 | 2026-07-19 18:47 | ~18m | Devpost, GitHub, IEEE feed, and Google structured-event connectors implemented |
| 3 — Autonomous core | 10h | 2026-07-19 18:47 | 2026-07-19 19:10 | ~23m | Mock-isolated analysis, Lambdas, schedule, persistence, digest, retries, and DLQ deployed |
| 4 — Nudge/recommendation validation | 3h | 2026-07-19 19:10 | 2026-07-19 19:12 | ~2m | Deterministic recommendation/nudges and failure-isolation tests passed |
| 5 — Dashboard/detail/tracker | 6h | 2026-07-19 19:12 | 2026-07-19 19:24 | ~12m | Authenticated calibration, radar, signal cards, detail, and tracker wired |
| 6 — Comparison/application assistant | 4h | 2026-07-19 19:24 | 2026-07-19 19:25 | ~1m | Comparison and atomic stage/engagement tracking verified |
| 7 — Paste extraction/refinement | 4h | 2026-07-19 19:12 | 2026-07-19 19:26 | ~14m | Mock refinement and pasted-content extraction verified through the UI |
| 8 — Evidence/polish/article | 3h | — | — | — | Not started |

## Current blockers

- Live Bedrock inference is intentionally disabled. The account-level daily token quota is applied at `0` and marked not adjustable; deployed Lambdas run with `ANALYSIS_MODE=mock` and have no `bedrock:InvokeModel` permission.
- SES remains in sandbox. Digests can only reach verified recipients until SES production access or recipient verification is completed.
- The GitHub repository is configured as `origin`, but GitHub authentication, initial commit/push, and the Amplify `main` branch connection are still pending.

## Verified milestones

- 2026-07-19 14:35 — `OpportunityScoutStack` deployed successfully in `us-east-1`.
- 2026-07-19 14:35 — Cognito, three DynamoDB tables, and Amplify app created; table point-in-time recovery verified enabled.
- 2026-07-19 14:35 — Existing SES identity `oluwatobisimiilori06@gmail.com` verified for sending.
- 2026-07-19 14:39 — Local Cognito sign-in/sign-up UI rendered and inspected against the UI specification.
- 2026-07-19 14:41 — Full local `npm run check` passed.
- 2026-07-19 14:53 — Amazon Nova Lite (`amazon.nova-lite-v1:0`) confirmed active; live request reached Bedrock but was rejected by the account's daily token quota.
- 2026-07-19 19:01 — Six least-privilege Lambda functions, authenticated Function URLs, EventBridge daily schedule, CloudWatch logs, retries, and encrypted SQS dead-letter queue deployed.
- 2026-07-19 19:09 — Deployed mock scout completed end to end: 39 signals discovered, persisted, notified, and recorded with zero run errors.
- 2026-07-19 19:10 — IAM simulation confirmed `scoutAgentRun` is denied `bedrock:InvokeModel`; unauthenticated Function URL request returned `401`.
- 2026-07-19 19:24 — Authenticated profile calibration, 39-card mission-control dashboard, detail/tracker views, comparison, refinement, pasted extraction, and atomic engagement tracking verified in-browser.
- 2026-07-19 21:20 — Digest failure isolation and `ses:FromAddress` IAM condition confirmed live; scout remains `ANALYSIS_MODE=mock` with no Bedrock invoke permission.
- 2026-07-19 21:20 — Digest failure isolation and `ses:FromAddress` IAM condition confirmed live; scout remains `ANALYSIS_MODE=mock` with no Bedrock invoke permission.
