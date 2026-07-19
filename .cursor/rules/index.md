# Cursor Working Agreement — Opportunity Scout Agent (Full Scope)

Everything from the previous rules file still applies (schedule-only trigger, verify real unattended fire, dedup required, evidence-gathering is a build task, error handling stricter for unattended runs, phase discipline, 25-30 min stuck rule). This file adds rules specific to the expanded scope.

## 1. Time is genuinely tight now — track it explicitly
- ~42 hours of work against ~46 hours available. Note actual time spent per phase somewhere visible. If Phase 3 (the autonomous core) is running more than ~15% over budget, that's your signal to start planning cuts from the list at the bottom of the spec — don't wait until Phase 7 to realize you're out of runway.

## 2. Cut order is defined — follow it, don't improvise under pressure
- The spec has an explicit "if time runs short, cut in this order" list. If you're behind schedule, consult that list rather than deciding in the moment what feels droppable. Deciding under pressure tends to protect the most-recently-worked-on feature, not the most important one.

## 3. One schema, now bigger — still one schema
- The expanded Bedrock output (with the `scores` sub-object) is still the single contract every Lambda and every view reads from. Comparison, recommendation, and dashboard all derive from this one shape — don't create parallel scoring logic in the frontend that could drift from what the backend computed.

## 4. New Lambdas still follow "one job" rule
- `refineQuery` only answers questions over existing stored data — it must never trigger new discovery or analysis. `extractFromPastedContent` only processes what's pasted — it must never reach out to external sources on its own. Keep these boundaries exact; blurring them makes the autonomy story in the article inaccurate.

## 5. Engagement tracking must be verified before trusting it
- Test that `engagementStats` actually updates when stage changes happen, and that `scoutAgentRun` actually reads and uses it, before writing anything about "learns from your behavior" in the article. An unused or broken tracking field would make that claim false.

## 6. Four connectors is the target, not a floor to protect at all costs
- Devpost and GitHub are the priority (most structured, most reliable). IEEE and Google for Developers are valuable but are explicitly first on the cut list if Phase 2 runs long — don't let connector count creep past its time box at the expense of Phase 3.

## 7. Comparison and detail views: no new backend calls
- Both must be built as pure frontend views over data already fetched via `getUserOpportunities`. If you find yourself writing new Lambda logic for either, stop — that's a sign of scope creep beyond what the spec intended.

## 8. Chat refinement: keep the prompt narrow
- `refineQuery`'s Bedrock prompt should explicitly instruct the model to only use the provided stored opportunities as context — no open-ended web knowledge, no fabricated opportunities. This keeps it a genuinely useful filtering tool rather than a source of confidently wrong answers.

## 9. Article honesty is part of "done"
- With this many features, the temptation is to describe everything as "AI-powered" uniformly. Keep the autonomy table's distinctions intact in the writeup: what runs on a schedule, what's user-triggered, what's a lightweight heuristic vs. real learning. Precision here is a strength of the submission, not a weakness to smooth over.
