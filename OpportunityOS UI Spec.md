# Opportunity Scout Agent — UI/UX Specification

## Design concept
**"Mission control for a scout that never sleeps."** The agent runs autonomously and reports back — the UI should feel like you're checking in on a live system that's been working while you were away, not opening a to-do list app. Visual language borrows from radar/signal-detection interfaces: opportunities are "signals" the scout has detected, scored, and logged. This is deliberately NOT a soft SaaS-dashboard look — it should feel technical, precise, alive.

This direction is chosen specifically because the product's core identity IS an autonomous detection loop (EventBridge → discover → score → report) — the radar metaphor isn't decoration, it's a literal representation of what the backend does every run.

---

## Design tokens

### Color
| Token | Hex | Role |
|---|---|---|
| `bg-void` | `#0B0F14` | Base background — near-black, slightly blue-cast, not pure black |
| `bg-panel` | `#141B24` | Card/panel surfaces, one step up from void |
| `bg-panel-raised` | `#1C2530` | Hover/active panel states, modals |
| `line-hairline` | `#2A3542` | Borders, dividers, grid lines |
| `text-primary` | `#E8EDF2` | Primary text, near-white with slight cool tint |
| `text-muted` | `#8B98A8` | Secondary text, labels, timestamps |
| `signal-cyan` | `#00D9E8` | Primary accent — active states, links, the radar sweep itself, primary buttons |
| `signal-amber` | `#FFA23C` | Warning/urgent — deadline nudges, "needs attention" |
| `signal-green` | `#3DDC84` | Confirm/success — high fit scores, completed checklist items, "agent ran successfully" |
| `signal-magenta` | `#FF4FA3` | Rare accent — reserved ONLY for the single highest-priority recommendation of the run ("prioritize this") so it stays meaningful, never used decoratively elsewhere |

Do not introduce additional accent colors beyond these five. Fit-score color coding uses cyan (70+), amber (40-69), muted gray-blue `#5A6B7D` (below 40) — not red, red is reserved for true error states only (failed agent runs, broken connections), keeping it distinct from "low fit" which isn't a failure.

### Typography
| Role | Typeface | Notes |
|---|---|---|
| Display (headings, agent name, section titles) | **Space Grotesk** | Geometric, technical character without being cold; used at restrained sizes, never oversized/decorative |
| Body (paragraphs, descriptions, summaries) | **Inter** | Neutral, highly legible at small sizes for dense data screens |
| Data/utility (scores, dates, IDs, logs, checklist items, timestamps) | **JetBrains Mono** | Monospace — this is what sells the "instrument panel" feeling; used for anything numeric or system-generated, never for prose |

Type scale: display uses 3 sizes only (32px page titles, 20px section headers, 15px card titles) — restraint matters more than a large scale here. Body: 15px default, 13px for secondary/dense contexts. Mono: 13px standard, 11px for dense log/timestamp contexts, letter-spacing +0.02em for readability at small sizes.

### Spacing & shape
- 8px base unit, scale: 4/8/12/16/24/32/48/64
- Border radius: 6px on cards and buttons (sharp enough to feel technical, not fully square, not soft/rounded like consumer apps), 2px on small tags/badges, 0px on the radar visualization container itself (it should feel like an instrument, not a card)
- No drop shadows for elevation — use a 1px `line-hairline` border plus a very subtle inner glow (`box-shadow: inset 0 0 20px rgba(0,217,232,0.03)`) on active/focused panels instead. Shadows read as "soft UI," which fights the concept.

### Motion
- **Radar sweep** (signature element, see below): continuous, slow (8s rotation), subtle — ambient, not attention-grabbing
- **New signal detected:** when a newly-discovered opportunity appears (on page load after a new agent run, or live if polling), its card fades in with a brief cyan border-glow pulse (600ms, once, then settles) — signals "the agent found this while you were away"
- **Score reveal:** fit score counts up from 0 to its value over 400ms when a card first renders — reinforces "the agent computed this," not just static data
- **Hover:** panels lift via border color shift (hairline → signal-cyan at 40% opacity) and a 150ms background lightening — no scale/transform, keep it precise not bouncy
- **Respect `prefers-reduced-motion`:** radar sweep becomes a static ring, count-up becomes instant, fade-ins become simple opacity swaps with no glow pulse

---

## Signature element: The Scan (dashboard hero)

A circular radar-style visualization, the first thing you see on the dashboard. Concentric rings represent fit-score bands (outer ring = low fit, center = high fit). Opportunities are plotted as glowing dots: **distance from center = fit score** (closer to center = better fit), **angle = category** (each category owns a fixed 45° segment, labeled faintly at the ring's edge — hackathon, scholarship, grant, fellowship, competition, conference, other). A slow sweep line rotates continuously (the "always scanning" ambient motion). Newly-detected opportunities (this run) render brighter/larger than previously-seen ones. Hovering a dot shows a tooltip with title + score; clicking navigates to the detail page.

Below/beside The Scan: the digest summary in plain text — "Last scan: 3 hours ago · 2 new signals · 1 needs attention this week" — written in the agent's own voice (see copy guidelines), monospace timestamp, everything else in body type.

This is the ONE deliberately elaborate element on the page. Everything else on the dashboard is quiet and disciplined by comparison — list/grid views, plain cards, no competing visual flourishes.

---

## Screen-by-screen specification

### 1. Login / Sign-up (Cognito-backed)
- Centered panel on `bg-void`, minimal — this screen doesn't need the full aesthetic treatment, just brand consistency (Space Grotesk wordmark "OPPORTUNITY SCOUT", signal-cyan accent on the primary button)
- Copy: "Sign in to your scout" / "Create your scout" — not generic "Login"/"Sign up"

### 2. Profile setup (first-run only, or editable via settings)
- Framed as "calibrating your scout," not a generic form — but don't overdo the metaphor in field labels themselves (fields still say plainly "Role," "Interests," "Location," "Remote preference," "Experience level" — clarity over cleverness in form labels specifically)
- Single-column, one field visible at a time OR all fields on one scrollable panel — prefer all-on-one-panel for speed of build; this is not the screen to spend UI polish time on
- Primary button: "Start scanning" (not "Submit") — this is the moment the agent's first run gets scheduled

### 3. Dashboard (primary screen)
```
┌─────────────────────────────────────────────────────┐
│  OPPORTUNITY SCOUT          [profile] [settings]     │
├─────────────────────────────────────────────────────┤
│                                                       │
│         ┌───────────────┐   Last scan: 3h ago        │
│         │   THE SCAN     │   2 new signals            │
│         │  (radar viz)   │   1 needs attention         │
│         └───────────────┘   → Prioritize: [top rec]  │
│                                                       │
├─────────────────────────────────────────────────────┤
│  NEEDS ATTENTION (if any)                            │
│  ⚠ [amber banner] Checklist item due in 2 days       │
├─────────────────────────────────────────────────────┤
│  SIGNALS                          [Compare selected] │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │ card   │ │ card   │ │ card   │ │ card   │  ...   │
│  └────────┘ └────────┘ └────────┘ └────────┘        │
└─────────────────────────────────────────────────────┘
```
- Card contents: title (Space Grotesk 15px), source + category tag (small, muted), fit score (large, mono, color-coded per the score bands above, count-up animation), one-line summary (body, truncated to 2 lines), next checklist item + due date (mono, small), stage indicator (small colored dot + label), checkbox for comparison selection
- Nudge banners sit above the grid, amber-bordered panels, dismissible, written in agent-log voice: "Checklist item 'Draft proposal' for AWS Innovation Challenge is due in 2 days." — specific, not vague

### 4. Detail page
- Full-width panel, header repeats title/category/score prominently
- Sections in this order: Summary, Fit reasoning (with the multi-axis scores rendered as small horizontal bars, mono labels), Checklist (interactive checkboxes), Deadline (mono date + countdown), Official link (external, clearly marked), Stage selector (dropdown, styled as a horizontal stepper: saved → interested → preparing → applied → waiting → accepted/rejected)
- Multi-axis scores rendered as a small labeled bar-chart cluster, not a wall of numbers — domainFit, innovationLevel, careerValue, difficulty, timeRequiredHours (formatted as "~14 hrs"), travelRequired (icon + yes/no), fundingAvailable (icon + yes/no + note)

### 5. Comparison view
- Triggered from dashboard via multi-select
- Table layout (breaks from card grid deliberately — comparison is a data task, table is the right tool): columns = title, category, overall fit score, each score axis, deadline, stage. Sortable by clicking column headers (sort arrow in mono font style, matches the instrument-panel feel)
- Row hover highlights in signal-cyan at low opacity

### 6. Tracker board
- Kanban columns matching the stage enum, column headers in Space Grotesk with mono item-count badges
- Cards are a condensed version of the dashboard card (title, score, category tag only — no full summary, this view is about position not detail)
- Drag-and-drop OR simple dropdown-per-card if drag-and-drop costs too much build time — dropdown is an acceptable simplification, don't burn hours on drag physics

### 7. Chat refinement box
- Docked panel, not a full-screen chat app — a slide-out or fixed-bottom input styled like a terminal input line (mono font, blinking cursor cue, `>` prompt prefix) that expands to show the response above it
- Responses render as either a filtered list of existing cards (re-rendering the dashboard grid with a filter applied) or plain text if the question isn't list-shaped — decide per-response based on what Bedrock returns
- Label clearly: "Ask your scout" — reinforces this is querying already-gathered data, not triggering new discovery

### 8. Paste-in extraction tool
- Simple panel: large textarea ("Paste opportunity text, a caption, or a description"), one button "Analyze this," result renders as a standard opportunity card once processed
- Loading state during Bedrock call: the radar-sweep motion in miniature as the loading indicator (reuses the signature motion, ties this manual tool visually back to the autonomous core's process)

### 9. Draft/requirements review tool
- Two-panel layout: left = pasted draft/resume text, right = requirements checklist with AI feedback per item (met / missing / unclear, color-coded per the standard score-band colors)

---

## Copy & voice guidelines
- The agent "speaks" in first-person-plural-adjacent system voice for autonomous outputs: "Scan complete. 2 new signals detected." Not "Claude found 2 opportunities" (no model-naming), not "We found..." (too casual/consumer), not passive ("2 opportunities were found").
- User-facing action labels are always active voice, plain verbs: "Start scanning," "Mark as applied," "Compare selected," "Ask your scout" — never "Submit," "Proceed," "Confirm" alone without an object.
- Empty states are invitations, not apologies: dashboard with zero opportunities yet reads "No signals yet — your scout's first scan runs at [time]," not "No data available."
- Failure states are specific and in the system's voice: "Last scan failed — Bedrock request timed out. Next scan: [time]." Never generic "Something went wrong."
- Nudges cite specifics always: opportunity name, exact task, exact due date — never "you have pending items."

---

## Accessibility & quality floor (non-negotiable regardless of aesthetic)
- Full keyboard navigation, visible focus rings using `signal-cyan` at full opacity with a 2px offset outline (default browser outline suppressed only if this replacement is implemented everywhere)
- Color is never the only signal: fit-score bands also carry a text label ("Strong fit," "Moderate," "Low"), stage indicators carry text labels alongside color dots, nudge severity carries an icon alongside amber color
- Contrast: `text-primary` on `bg-void`/`bg-panel` meets AA at minimum for body text; `text-muted` checked against AA for its actual use sizes (13px+)
- `prefers-reduced-motion` fully respected per the motion section above
- Responsive down to mobile: The Scan visualization shrinks but stays circular (min 200px), card grid collapses to single column, comparison table becomes horizontally scrollable rather than cramming columns

---

## Build sequencing note for Cursor
Build screens in this order to match the phase plan in the main spec: Dashboard (basic cards, no radar viz yet) → Detail page → Tracker → Comparison → then, ONLY once the functional core is solid, invest build time in The Scan radar visualization itself, since it's the highest-effort/highest-polish single component and shouldn't block functional progress. If time is short near the end, The Scan can ship as a simpler static ring-chart rather than the full animated sweep — the underlying data/positioning logic matters more than the animation polish for meeting the challenge's actual requirements.
