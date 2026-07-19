# Opportunity Scout Agent — Full-Scope Build Spec (Every Original Feature)

> **UI/UX:** see the companion file `opportunity-os-ui-spec.md` for the full design system (colors, type, motion, screen-by-screen layout) — a mission-control/signal-scanning aesthetic. Feed both files to Cursor together; the UI spec's build-sequencing note aligns with this file's phase plan.

## Reality check, stated once, up front
Full scope realistically needs **~40-44 hours**. You have **~46 hours** until the July 20, 9:00 PM WAT deadline. That's workable but tight — there's little room for extended debugging detours. The phase plan below is ordered so that if time runs short near the end, you cut from the LAST phases first (multi-axis scoring polish, chat refinement), never from the autonomous core (Phases 1-4), since that's what makes this a valid submission at all.

## Challenge fit (unchanged)
Targets AWS's "Build an Always-On Agent" challenge. The core discovery→scoring→nudge→digest loop must run on a schedule with zero clicks. Everything else in this spec is either autonomous-compatible or clearly labeled as a user-driven supporting tool — see the autonomy table below, now expanded.

---

## Full feature list (everything from the original vision)

| # | Feature | Autonomous or user-driven | Included how |
|---|---|---|---|
| 1 | Discovery from structured sources | Autonomous | Devpost + GitHub + IEEE + Google for Developers connectors, all in the scheduled run |
| 2 | Discovery fallback | Autonomous | Web search API as catch-all |
| 3 | Social/manual content extraction | User-provided input, AI-processed autonomously once submitted | Paste-in tool: caption/text → same analysis pipeline as any other source |
| 4 | Profile-based matching | Autonomous | Bedrock call per opportunity |
| 5 | Plain-language summary | Autonomous | Same Bedrock call |
| 6 | Fit score + reasoning | Autonomous | Same Bedrock call |
| 7 | **Multi-axis scoring** (category fit, innovation, career value, difficulty, time required, travel required, funding available) | Autonomous | Expanded Bedrock output schema, see below |
| 8 | Task/checklist planning | Autonomous | Same Bedrock call |
| 9 | Deadline tracking | Autonomous | Stored + scanned every run |
| 10 | Reminders | Autonomous | Daily digest email |
| 11 | Dashboard | User views (agent populates it) | React view over agent-generated data |
| 12 | **Detail page** (per-opportunity full view) | User views | React view, same data, more fields |
| 13 | Application tracker / CRM stages | User-driven (real-world actions) | Stage dropdown/board, explicitly not autonomous — see reasoning below |
| 14 | AI coach nudges | Autonomous | Computed every scheduled run, included in digest + shown in dashboard |
| 15 | **Comparison engine** | User views, autonomous underneath | Sortable/ratable table over already-scored data, no new AI calls needed |
| 16 | **Recommendation ("prioritize X this week")** | Autonomous | Derived each run from multi-axis scores + deadlines, included in digest |
| 17 | **Chat-style refinement** ("narrow to remote-only") | User-driven, on-demand | Small chat box that re-queries stored opportunities with an added filter/instruction |
| 18 | Application assistant (checklist, draft/resume review, missing-doc ID) | User-driven, on-demand | Paste-in tool, Bedrock review call |
| 19 | **Lightweight behavior learning** | Autonomous, cumulative | See below — a real but honest version of "AI learns what you take seriously" |
| 20 | Auto-submission | Not built | You deferred this yourself originally — still correctly out of scope |
| 21 | Live social account monitoring + OCR | Not built | ToS risk + fragility, see compromise above (#3 replaces it) |

---

## Expanded Bedrock output schema (covers #6, #7, #8)

```json
{
  "category": "hackathon | competition | scholarship | grant | fellowship | conference | other",
  "summary": "2-3 plain sentences",
  "fitScore": "integer 0-100, overall",
  "fitReasoning": "1-2 sentences citing specific profile details",
  "scores": {
    "domainFit": "0-100 (software/hardware/AI alignment with user interests)",
    "innovationLevel": "0-100",
    "careerValue": "0-100",
    "difficulty": "0-100 (higher = harder)",
    "timeRequiredHours": "estimated integer hours",
    "travelRequired": "boolean",
    "fundingAvailable": "boolean, plus fundingNotes string if true"
  },
  "deadline": "ISO date or null",
  "checklist": [ { "task": "string", "dueDate": "ISO date" } ]
}
```

This one schema now carries everything needed for scoring, comparison, and recommendation — no separate AI calls needed for those features, they're all derived views over this data.

---

## Lightweight behavior learning (honest version of feature #19)

Rather than claiming real ML personalization (which needs weeks of data to mean anything — that critique still holds), do something real and honest:
- Track, per user, which categories/sources they move to `interested` or further vs. which they leave at `saved` or ignore.
- Each scheduled run, before scoring new opportunities, compute a simple weighting: categories/sources with a higher historical interested-or-further rate get a small boost to `domainFit` in that run's prompt context (pass the user's engagement pattern as extra context into the Bedrock call).
- This is genuinely adaptive and genuinely truthful to describe as "learns from what you engage with" — just be accurate in the article that it's a lightweight heuristic, not a trained model. That's a more credible story than overclaiming, and judges/readers respect precision here.

---

## Recommendation engine (feature #16)

Computed each scheduled run, after all opportunities are scored: rank unactioned opportunities (`saved`/`interested`) by a combination of `fitScore`, proximity of `deadline`, and `timeRequiredHours` (favor high-fit, soon-due, lower-time-cost items). Surface the top 1-2 as "Prioritize this week" in the digest and on the dashboard. No new AI call needed — this is sort/filter logic over stored scores.

---

## Comparison engine (feature #15)

A table view, sortable by any score axis, over opportunities the user selects (e.g. checkboxes on the dashboard → "Compare"). Purely a frontend view over existing DynamoDB data — zero new backend logic beyond a query that returns multiple opportunities at once (which `getUserOpportunities` likely already supports).

---

## Chat-style refinement (feature #17)

A single input box: "ask something about your opportunities" (e.g. "which of these are remote-only" or "what should I focus on if I only have 5 hours this week"). Backend: one Lambda (`refineQuery`) that takes the question + the user's stored opportunities (already-scored, no new discovery/analysis) + sends to Bedrock for a natural-language answer or filtered list. This is intentionally NOT part of the autonomous core — it's a clearly-labeled interactive tool, same bucket as draft review.

---

## Why tracker stage updates stay user-driven (unchanged reasoning, restated)

An agent cannot know you submitted an application, got accepted, or decided to withdraw unless you tell it — inventing that would be fabrication, not intelligence. This is a deliberate, defensible design choice, worth stating plainly in the article rather than treating as a limitation.

---

## Architecture additions vs. the previous spec

- **Third and fourth discovery connectors:** IEEE and Google for Developers, alongside Devpost and GitHub. Each still normalizes to `{title, sourceUrl, rawText, sourceName}` before reaching Bedrock — the pipeline doesn't change shape, just gets two more sources feeding it.
- **New Lambda: `refineQuery`** — user-triggered, Function URL, powers the chat refinement box.
- **New Lambda: `extractFromPastedContent`** — user-triggered, takes pasted social caption/text, runs it through the same normalization + analysis pipeline as any other source. This replaces live social monitoring.
- **Behavior tracking:** a lightweight `engagementStats` attribute on the Users table (category/source → interested-or-further count), updated whenever `updateOpportunityStage` moves something past `saved`. Read by `scoutAgentRun` each scheduled run.

Everything else (EventBridge trigger, `scoutAgentRun` orchestrator, dedup via `notifiedAt`, SES digest, AgentRuns logging, the autonomy-protection rule that `scoutAgentRun` has no Function URL) is unchanged from the previous spec — still the non-negotiable core.

---

## Revised phase plan (~42 hours, ordered so cuts happen at the end, not the core)

### Phase 1 — Foundation (0h–4h)
- [ ] Amplify + git deploy pipeline
- [ ] Cognito auth
- [ ] DynamoDB: Users (with `engagementStats`), Opportunities (with `scores` sub-object, `notifiedAt`), AgentRuns
- [ ] SES sender verified immediately
- [ ] Bedrock access enabled

### Phase 2 — Discovery connectors, all four (4h–12h)
- [ ] Devpost
- [ ] GitHub
- [ ] IEEE
- [ ] Google for Developers
- [ ] Dedup logic across all sources

### Phase 3 — The autonomous core, `scoutAgentRun` (12h–22h)
- [ ] Full orchestrator: load profile + engagementStats → discover (all 4 connectors) → dedup → analyze (expanded schema) → persist → compute nudges → compute recommendation → compose digest → send via SES → log to AgentRuns
- [ ] Iterate Bedrock prompt against the expanded schema until scores/reasoning/checklist are all genuinely good and differentiated
- [ ] Manual invoke test first, then wire EventBridge, then **verify a real unattended scheduled fire** — same non-negotiable milestone as before

### Phase 4 — Coach nudges + recommendation validation (22h–25h)
- [ ] Confirm nudge rules fire correctly in test scenarios
- [ ] Confirm "prioritize this week" recommendation logic produces sensible output across a few test profiles

### Phase 5 — Supporting app core: dashboard, detail page, tracker (25h–31h)
- [ ] Dashboard (agent-populated, read-only view + stage dropdown)
- [ ] Detail page (full opportunity view, all score axes visible)
- [ ] Tracker board (stage changes update `engagementStats`)

### Phase 6 — Comparison + application assistant (31h–35h)
- [ ] Comparison table (multi-select + sortable columns)
- [ ] Draft/requirements review tool

### Phase 7 — Paste-in extraction + chat refinement (35h–39h)
- [ ] `extractFromPastedContent` — paste text → same analysis pipeline
- [ ] `refineQuery` chat box

### Phase 8 — Evidence, polish, article (39h–42h, buffer remaining)
- [ ] Let the schedule fire for real at least twice before writing the article if possible
- [ ] Screenshots: EventBridge config, AgentRuns entries, a real digest email, dashboard, comparison view, chat refinement in action
- [ ] Error handling pass across every Lambda
- [ ] Article: all required sections, correct title format, #agents tag, honest autonomy-vs-user-action explanation
- [ ] Submit with real buffer before 9:00 PM WAT July 20

---

## If time runs short — cut in this order (protects the submission's validity)
1. Chat refinement (Phase 7) — cut first, smallest loss to the core story
2. Paste-in extraction (Phase 7)
3. Comparison engine polish (Phase 6) — keep basic sort, drop extra styling
4. Detail page (Phase 5) — dashboard cards can carry more info if needed
5. Second/third/fourth discovery connectors (Phase 2) — Devpost alone still proves the concept
Never cut: Phases 1, 3, 4, and the real scheduled-fire verification. That's the entire premise of the challenge.

## Definition of done
Same as before, plus: all four connectors live, expanded score schema populated, comparison and detail views working, chat refinement functional, paste-in extraction functional, engagement-based weighting demonstrably shifting scores across at least one before/after test.
