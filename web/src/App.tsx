import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Authenticator, ThemeProvider, createTheme } from '@aws-amplify/ui-react'
import {
  buildNudges,
  chooseRecommendation,
  describeEffort,
  describeUrgency,
  fitBand,
  nextAction,
  opportunityCategories,
  opportunityStages,
  primaryGoalLabels,
  primaryGoals,
  rankOpportunities,
  successBand,
  successProbability,
  summariseBriefing,
  type ConfidenceBand,
  type Opportunity,
  type OpportunityCategory,
  type OpportunityStage,
  type PrimaryGoal,
  type UrgencyLevel,
  type UserProfile,
} from '@opportunity-scout/shared'
import {
  analyzePastedContent,
  askScout,
  changeStage,
  getDashboard,
  saveProfile,
  type ProfileInput,
} from './api'
import './App.css'

const theme = createTheme({
  name: 'opportunity-scout',
  tokens: {
    colors: {
      background: {
        primary: { value: '#0B0F14' },
        secondary: { value: '#141B24' },
      },
      border: {
        primary: { value: '#2A3542' },
      },
      font: {
        primary: { value: '#E8EDF2' },
        secondary: { value: '#8B98A8' },
      },
      brand: {
        primary: {
          10: { value: '#00383d' },
          80: { value: '#00b9c6' },
          90: { value: '#00D9E8' },
          100: { value: '#58f2fc' },
        },
      },
    },
    components: {
      button: {
        borderRadius: { value: '6px' },
        primary: {
          backgroundColor: { value: '#00D9E8' },
          color: { value: '#0B0F14' },
        },
      },
      fieldcontrol: {
        borderRadius: { value: '6px' },
        borderColor: { value: '#2A3542' },
      },
    },
  },
})

const bandClass = (level: ConfidenceBand) => `fit-${level}`

const urgencyTone: Record<UrgencyLevel, string> = {
  passed: 'chip-critical',
  critical: 'chip-critical',
  high: 'chip-warn',
  medium: 'chip-warn',
  low: 'chip-muted',
  none: 'chip-muted',
}

function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>
}

function StageSelect({
  value,
  onChange,
}: {
  value: OpportunityStage
  onChange: (stage: OpportunityStage) => void
}) {
  return (
    <label className="stage-control">
      <span>Stage</span>
      <select value={value} onChange={(event) => onChange(event.target.value as OpportunityStage)}>
        {opportunityStages.map((stage) => (
          <option key={stage} value={stage}>
            {stage}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The chips shared by the hero, briefing cards and detail: urgency / effort / odds. */
function IntelligenceChips({ opportunity, now }: { opportunity: Opportunity; now: Date }) {
  const urgency = describeUrgency(opportunity.deadline, now)
  const effort = describeEffort(opportunity.scores.timeRequiredHours)
  const odds = successProbability(opportunity)
  const oddsBand = successBand(odds)
  return (
    <div className="intel-chips">
      <Chip tone={urgencyTone[urgency.level]}>{urgency.label}</Chip>
      <Chip tone="chip-muted">
        {effort.label} · {effort.detail}
      </Chip>
      <Chip tone={`chip-${oddsBand.level}`}>
        {oddsBand.label} · {odds}%
      </Chip>
    </div>
  )
}

const suggestedInterests = [
  'AI',
  'Machine learning',
  'Cloud',
  'Web development',
  'Mobile',
  'Cybersecurity',
  'Data science',
  'Hardware',
  'Robotics',
  'Blockchain',
  'Design',
  'Open source',
  'Fintech',
  'Healthtech',
  'Climate tech',
]

const categoryLabels: Record<OpportunityCategory, string> = {
  hackathon: 'Hackathons',
  competition: 'Competitions',
  scholarship: 'Scholarships',
  grant: 'Grants',
  fellowship: 'Fellowships',
  conference: 'Conferences',
  other: 'Anything else',
}

const onboardingSteps = ['About you', 'Your taste', 'Goal & logistics'] as const

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

function ProfileSetup({ onSaved }: { onSaved: (profile: UserProfile) => void }) {
  const [step, setStep] = useState(0)
  const [role, setRole] = useState('')
  const [experienceLevel, setExperienceLevel] =
    useState<ProfileInput['experienceLevel']>('student')
  const [interests, setInterests] = useState<string[]>([])
  const [customInterest, setCustomInterest] = useState('')
  const [preferredCategories, setPreferredCategories] = useState<OpportunityCategory[]>([])
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>('explore')
  const [location, setLocation] = useState('')
  const [remotePreference, setRemotePreference] =
    useState<ProfileInput['remotePreference']>('remote-preferred')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addCustomInterest = () => {
    const value = customInterest.trim()
    if (value && !interests.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setInterests((current) => [...current, value])
    }
    setCustomInterest('')
  }

  const stepValid =
    step === 0 ? role.trim().length > 0 : step === 1 ? interests.length > 0 : location.trim().length > 0

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const profile = await saveProfile({
        role: role.trim(),
        interests,
        location: location.trim(),
        remotePreference,
        experienceLevel,
        preferredCategories,
        primaryGoal,
        scheduleEnabled: true,
      })
      onSaved(profile)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Profile calibration failed.')
      setSaving(false)
    }
  }

  const next = (event: FormEvent) => {
    event.preventDefault()
    if (!stepValid) return
    if (step < onboardingSteps.length - 1) setStep((current) => current + 1)
    else void submit()
  }

  return (
    <main className="calibration-shell">
      <form className="onboarding-panel" onSubmit={next}>
        <p className="eyebrow">SCOUT CALIBRATION / FIRST RUN</p>
        <h1>Let’s calibrate your scout</h1>
        <p className="section-copy">
          Your scout uses this to decide what deserves your attention — so you never have to sift
          through the noise yourself. Takes under a minute.
        </p>

        <ol className="onboarding-steps" aria-label="Onboarding progress">
          {onboardingSteps.map((label, index) => (
            <li
              key={label}
              className={index === step ? 'current' : index < step ? 'done' : ''}
              aria-current={index === step ? 'step' : undefined}
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        {step === 0 && (
          <div className="onboarding-body">
            <label>
              What best describes you?
              <input
                autoFocus
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Software engineering student"
              />
            </label>
            <fieldset className="chip-fieldset">
              <legend>Experience level</legend>
              <div className="chip-grid">
                {(['student', 'entry', 'mid', 'senior', 'expert'] as const).map((level) => (
                  <button
                    type="button"
                    key={level}
                    className={`chip-toggle${experienceLevel === level ? ' active' : ''}`}
                    onClick={() => setExperienceLevel(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-body">
            <fieldset className="chip-fieldset">
              <legend>What are you into? Pick anything that fits.</legend>
              <div className="chip-grid">
                {suggestedInterests.map((interest) => (
                  <button
                    type="button"
                    key={interest}
                    className={`chip-toggle${interests.includes(interest) ? ' active' : ''}`}
                    onClick={() => setInterests((current) => toggle(current, interest))}
                  >
                    {interest}
                  </button>
                ))}
                {interests
                  .filter((interest) => !suggestedInterests.includes(interest))
                  .map((interest) => (
                    <button
                      type="button"
                      key={interest}
                      className="chip-toggle active"
                      onClick={() => setInterests((current) => toggle(current, interest))}
                    >
                      {interest} ✕
                    </button>
                  ))}
              </div>
              <div className="chip-add">
                <input
                  value={customInterest}
                  onChange={(event) => setCustomInterest(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addCustomInterest()
                    }
                  }}
                  placeholder="Add your own…"
                />
                <button type="button" className="secondary-button slim" onClick={addCustomInterest}>
                  Add
                </button>
              </div>
            </fieldset>
            <fieldset className="chip-fieldset">
              <legend>Which types of opportunities should your scout prioritise?</legend>
              <div className="chip-grid">
                {opportunityCategories.map((category) => (
                  <button
                    type="button"
                    key={category}
                    className={`chip-toggle${
                      preferredCategories.includes(category) ? ' active' : ''
                    }`}
                    onClick={() =>
                      setPreferredCategories((current) => toggle(current, category))
                    }
                  >
                    {categoryLabels[category]}
                  </button>
                ))}
              </div>
              <span className="field-hint">
                Leave blank and your scout will weigh every type equally.
              </span>
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-body">
            <fieldset className="chip-fieldset">
              <legend>What matters most to you right now?</legend>
              <div className="goal-grid">
                {primaryGoals.map((goal) => (
                  <button
                    type="button"
                    key={goal}
                    className={`goal-card${primaryGoal === goal ? ' active' : ''}`}
                    onClick={() => setPrimaryGoal(goal)}
                  >
                    {primaryGoalLabels[goal]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Where are you based?
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Lagos, Nigeria"
              />
            </label>
            <fieldset className="chip-fieldset">
              <legend>Remote preference</legend>
              <div className="chip-grid">
                {(
                  [
                    ['remote-only', 'Remote only'],
                    ['remote-preferred', 'Remote preferred'],
                    ['hybrid', 'Hybrid'],
                    ['onsite', 'On-site'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={`chip-toggle${remotePreference === value ? ' active' : ''}`}
                    onClick={() => setRemotePreference(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <div className="wizard-actions">
          {step > 0 && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setStep((current) => current - 1)}
            >
              Back
            </button>
          )}
          <button className="primary-button" disabled={!stepValid || saving} type="submit">
            {step < onboardingSteps.length - 1
              ? 'Continue'
              : saving
                ? 'Calibrating…'
                : 'Start scanning'}
          </button>
        </div>
      </form>
    </main>
  )
}

function MiniScan({ score }: { score: number }) {
  const band = fitBand(score)
  return (
    <div className="mini-radar" aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <circle className="scan-ring" cx="60" cy="60" r="52" />
        <circle className="scan-ring" cx="60" cy="60" r="34" />
        <circle className="scan-ring" cx="60" cy="60" r="16" />
        <g className="scan-sweep">
          <line x1="60" y1="60" x2="60" y2="8" />
        </g>
        <circle className={`scan-signal ${bandClass(band.level)}`} cx="60" cy={60 - score * 0.42} r="4" />
      </svg>
    </div>
  )
}

/** The single "prioritise this" recommendation — the run's one magenta signal. */
function PriorityHero({
  opportunity,
  now,
  onOpen,
  onStage,
}: {
  opportunity: Opportunity
  now: Date
  onOpen: () => void
  onStage: (stage: OpportunityStage) => void
}) {
  const band = fitBand(opportunity.fitScore)
  return (
    <section className="priority-hero">
      <div className="priority-hero-body">
        <p className="eyebrow hero-eyebrow">→ PRIORITISE THIS</p>
        <span className="category-tag">{opportunity.category}</span>
        <h2>{opportunity.title}</h2>
        <p className="hero-reason">{opportunity.fitReasoning}</p>
        <IntelligenceChips opportunity={opportunity} now={now} />
        <div className="next-action">
          <span className="next-action-label">RECOMMENDED NEXT STEP</span>
          <strong>{nextAction(opportunity)}</strong>
        </div>
        <div className="hero-actions">
          <button type="button" className="primary-button" onClick={onOpen}>
            Open briefing
          </button>
          <StageSelect value={opportunity.stage} onChange={onStage} />
        </div>
      </div>
      <div className={`priority-hero-score ${bandClass(band.level)}`}>
        <MiniScan score={opportunity.fitScore} />
        <div>
          <b>{opportunity.fitScore}</b>
          <small>{band.label}</small>
        </div>
      </div>
    </section>
  )
}

/** A ranked priority in the briefing — reads like advice, not a directory row. */
function BriefingCard({
  opportunity,
  rank,
  now,
  onOpen,
  onStage,
}: {
  opportunity: Opportunity
  rank: number
  now: Date
  onOpen: () => void
  onStage: (stage: OpportunityStage) => void
}) {
  const band = fitBand(opportunity.fitScore)
  return (
    <article className="briefing-card">
      <div className="briefing-card-head">
        <span className="rank-badge">{rank}</span>
        <div className="briefing-card-titles">
          <button type="button" className="card-title" onClick={onOpen}>
            {opportunity.title}
          </button>
          <div className="briefing-card-meta">
            <span className="source-tag">{opportunity.sourceName}</span>
            <span className="category-tag">{opportunity.category}</span>
          </div>
        </div>
        <div className={`fit-score compact ${bandClass(band.level)}`}>
          <span>{opportunity.fitScore}</span>
          <small>{band.label}</small>
        </div>
      </div>
      <p className="briefing-card-reason">{opportunity.fitReasoning}</p>
      <IntelligenceChips opportunity={opportunity} now={now} />
      <div className="next-action inline">
        <span className="next-action-label">NEXT STEP</span>
        <strong>{nextAction(opportunity)}</strong>
      </div>
      <div className="briefing-card-foot">
        <button type="button" className="secondary-button slim" onClick={onOpen}>
          Open briefing
        </button>
        <StageSelect value={opportunity.stage} onChange={onStage} />
      </div>
    </article>
  )
}

function Briefing({
  profile,
  opportunities,
  now,
  onOpen,
  onStage,
  onViewArchive,
}: {
  profile: UserProfile
  opportunities: Opportunity[]
  now: Date
  onOpen: (opportunity: Opportunity) => void
  onStage: (opportunity: Opportunity, stage: OpportunityStage) => void
  onViewArchive: () => void
}) {
  const summary = useMemo(() => summariseBriefing(opportunities, now), [opportunities, now])
  const recommendation = useMemo(
    () => chooseRecommendation(opportunities, now),
    [opportunities, now],
  )
  const ranked = useMemo(() => rankOpportunities(opportunities, now), [opportunities, now])
  const board = ranked
    .filter((item) => item.opportunityId !== recommendation?.opportunityId)
    .slice(0, 4)
  const nudges = useMemo(() => buildNudges(opportunities, now), [opportunities, now])

  if (opportunities.length === 0) {
    return (
      <section className="briefing">
        <div className="empty-state hero-empty">
          No signals yet — your scout’s first scan runs at 06:00 WAT. You’ll get a briefing here the
          moment it finds something worth your time.
        </div>
      </section>
    )
  }

  return (
    <section className="briefing">
      <header className="briefing-intro">
        <p className="eyebrow">SCAN COMPLETE · MOCK ANALYSIS ACTIVE</p>
        <h1>Here’s what needs you today.</h1>
        <p className="briefing-subtitle">
          Your scout reviewed {summary.total} signals for the {profile.role} profile and did the
          thinking for you. These are the few that actually deserve your attention right now.
        </p>
        {(() => {
          const goal = profile.primaryGoal ?? 'explore'
          const preferred = profile.preferredCategories ?? []
          if (goal === 'explore' && preferred.length === 0) return null
          return (
            <p className="briefing-focus">
              Tuned for <strong>{(primaryGoalLabels[goal] ?? 'exploring').toLowerCase()}</strong>
              {preferred.length > 0 && (
                <>
                  {' '}
                  · prioritising {preferred.map((category) => categoryLabels[category]).join(', ')}
                </>
              )}
            </p>
          )
        })()}
        <dl className="briefing-stats">
          <div>
            <dt>New signals</dt>
            <dd>{summary.newSignals}</dd>
          </div>
          <div>
            <dt>Deadlines ≤ 7d</dt>
            <dd className={summary.deadlinesApproaching > 0 ? 'stat-warn' : ''}>
              {summary.deadlinesApproaching}
            </dd>
          </div>
          <div>
            <dt>Awaiting your action</dt>
            <dd>{summary.awaitingAction}</dd>
          </div>
          <div>
            <dt>Top match</dt>
            <dd className="stat-strong">{summary.topMatchScore}</dd>
          </div>
        </dl>
      </header>

      {nudges.length > 0 && (
        <section className="attention" aria-label="Needs attention">
          <p className="eyebrow attention-eyebrow">⚠ NEEDS ATTENTION</p>
          <ul>
            {nudges.slice(0, 4).map((nudge) => (
              <li key={nudge}>{nudge}</li>
            ))}
          </ul>
        </section>
      )}

      {recommendation ? (
        <PriorityHero
          opportunity={recommendation}
          now={now}
          onOpen={() => onOpen(recommendation)}
          onStage={(stage) => onStage(recommendation, stage)}
        />
      ) : (
        <div className="empty-state">
          Nothing needs a decision right now. Everything you’re pursuing is already in motion — your
          scout will surface the next priority as soon as it lands.
        </div>
      )}

      {board.length > 0 && (
        <section className="priority-board">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RANKED FOR YOU</p>
              <h2>Also worth your attention</h2>
            </div>
          </div>
          <div className="briefing-grid">
            {board.map((opportunity, index) => (
              <BriefingCard
                key={opportunity.opportunityId}
                opportunity={opportunity}
                rank={index + 2}
                now={now}
                onOpen={() => onOpen(opportunity)}
                onStage={(stage) => onStage(opportunity, stage)}
              />
            ))}
          </div>
        </section>
      )}

      <button type="button" className="archive-link" onClick={onViewArchive}>
        Your scout has logged {summary.total} signals in total — open the full archive to browse
        everything it has sourced ↗
      </button>
    </section>
  )
}

function ArchiveCard({
  opportunity,
  selected,
  onSelect,
  onOpen,
  onStage,
  now,
}: {
  opportunity: Opportunity
  selected: boolean
  onSelect: (selected: boolean) => void
  onOpen: () => void
  onStage: (stage: OpportunityStage) => void
  now: Date
}) {
  const band = fitBand(opportunity.fitScore)
  const urgency = describeUrgency(opportunity.deadline, now)
  return (
    <article className={`signal-card${opportunity.notifiedAt ? '' : ' is-new'}`}>
      <div className="signal-card-topline">
        <label className="select-signal">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
          />
          <span>Compare</span>
        </label>
        {opportunity.notifiedAt ? (
          <span className="source-tag">{opportunity.sourceName}</span>
        ) : (
          <span className="new-tag">NEW</span>
        )}
      </div>
      <button type="button" className="card-title" onClick={onOpen}>
        {opportunity.title}
      </button>
      <div className={`fit-score ${bandClass(band.level)}`}>
        <span>{opportunity.fitScore}</span>
        <small>{band.label}</small>
      </div>
      <span className="category-tag">{opportunity.category}</span>
      <p className="card-summary">{opportunity.summary}</p>
      <div className="next-task">
        <span>{urgency.label}</span>
        <time>{opportunity.deadline ?? '—'}</time>
      </div>
      <StageSelect value={opportunity.stage} onChange={onStage} />
    </article>
  )
}

function Detail({
  opportunity,
  now,
  onClose,
  onStage,
}: {
  opportunity: Opportunity
  now: Date
  onClose: () => void
  onStage: (stage: OpportunityStage) => void
}) {
  const band = fitBand(opportunity.fitScore)
  const scoreRows = [
    ['Domain fit', opportunity.scores.domainFit],
    ['Innovation', opportunity.scores.innovationLevel],
    ['Career value', opportunity.scores.careerValue],
    ['Difficulty', opportunity.scores.difficulty],
  ] as const
  return (
    <section className="detail-panel">
      <button type="button" className="text-button" onClick={onClose}>
        ← Back to briefing
      </button>
      <div className="detail-heading">
        <div>
          <span className="category-tag">{opportunity.category}</span>
          <h1>{opportunity.title}</h1>
        </div>
        <div className={`detail-score ${bandClass(band.level)}`}>
          {opportunity.fitScore}
          <small>/100 · {band.label}</small>
        </div>
      </div>

      <section className="detail-intel">
        <div className="detail-intel-lead">
          <h2>Why your scout flagged this</h2>
          <p>{opportunity.fitReasoning}</p>
          <IntelligenceChips opportunity={opportunity} now={now} />
        </div>
        <div className="detail-next-action">
          <span className="next-action-label">RECOMMENDED NEXT STEP</span>
          <strong>{nextAction(opportunity)}</strong>
          <StageSelect value={opportunity.stage} onChange={onStage} />
        </div>
      </section>

      <section>
        <h2>Summary</h2>
        <p>{opportunity.summary}</p>
      </section>
      <section>
        <h2>How it scores</h2>
        <div className="score-bars">
          {scoreRows.map(([label, value]) => (
            <div className="score-row" key={label}>
              <span>{label}</span>
              <div>
                <i style={{ width: `${value}%` }} />
              </div>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <div className="fact-grid">
          <span>
            Time required <b>~{opportunity.scores.timeRequiredHours} hrs</b>
          </span>
          <span>
            Travel <b>{opportunity.scores.travelRequired ? 'Yes' : 'No'}</b>
          </span>
          <span>
            Funding <b>{opportunity.scores.fundingAvailable ? 'Available' : 'Not listed'}</b>
          </span>
        </div>
        {opportunity.scores.fundingNotes && (
          <p className="funding-note">{opportunity.scores.fundingNotes}</p>
        )}
      </section>
      <section>
        <h2>Checklist</h2>
        <ul className="checklist">
          {opportunity.checklist.map((item) => (
            <li key={`${item.task}-${item.dueDate}`}>
              <input type="checkbox" checked={item.completed} readOnly />
              <span>{item.task}</span>
              <time>{item.dueDate}</time>
            </li>
          ))}
        </ul>
      </section>
      <section className="detail-footer">
        <div>
          <span>Deadline</span>
          <strong>{opportunity.deadline ?? 'Not specified'}</strong>
        </div>
        <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer">
          Open official source ↗
        </a>
      </section>
    </section>
  )
}

function ScoutTools({ onAdded }: { onAdded: (opportunity: Opportunity) => void }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ask = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      setAnswer((await askScout(question)).answer)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The scout could not answer.')
    } finally {
      setBusy(false)
    }
  }
  const analyze = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const opportunity = await analyzePastedContent({ content })
      onAdded(opportunity)
      setContent('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Analysis failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tools-grid">
      {error && (
        <div className="error-banner tools-error" role="alert">
          {error}
        </div>
      )}
      <form className="tool-panel" onSubmit={ask}>
        <p className="eyebrow">QUERY / STORED SIGNALS ONLY</p>
        <h2>Ask your scout</h2>
        {answer && <div className="terminal-answer">{answer}</div>}
        <label className="terminal-input">
          <span aria-hidden="true">&gt;</span>
          <input
            required
            minLength={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What should I focus on if I only have 5 hours this week?"
          />
        </label>
        <button className="primary-button" disabled={busy}>
          Ask your scout
        </button>
      </form>
      <form className="tool-panel" onSubmit={analyze}>
        <p className="eyebrow">MANUAL SIGNAL / MOCK ANALYSIS</p>
        <h2>Analyze pasted content</h2>
        <textarea
          required
          minLength={20}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Paste opportunity text, a caption, or a description"
        />
        <button className="primary-button" disabled={busy}>
          Analyze this
        </button>
      </form>
    </div>
  )
}

type View = 'briefing' | 'archive' | 'tracker' | 'compare' | 'tools'

const navItems: Array<[View, string]> = [
  ['briefing', 'Briefing'],
  ['archive', 'Archive'],
  ['tracker', 'Tracker'],
  ['compare', 'Compare'],
  ['tools', 'Tools'],
]

function ScoutApplication({ signOut }: { signOut: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('briefing')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<Opportunity | null>(null)
  const [query, setQuery] = useState('')
  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    let active = true
    void getDashboard()
      .then((dashboard) => {
        if (!active) return
        setProfile(dashboard.profile)
        setOpportunities(dashboard.opportunities)
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Scout sync failed.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selected = useMemo(
    () => opportunities.filter((item) => selectedIds.has(item.opportunityId)),
    [opportunities, selectedIds],
  )
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const sorted = [...opportunities].sort((a, b) => b.fitScore - a.fitScore)
    if (!needle) return sorted
    return sorted.filter((item) =>
      `${item.title} ${item.category} ${item.sourceName} ${item.summary}`
        .toLowerCase()
        .includes(needle),
    )
  }, [opportunities, query])

  const updateStage = async (opportunity: Opportunity, stage: OpportunityStage) => {
    setError('')
    const previous = opportunities
    setOpportunities((items) =>
      items.map((item) =>
        item.opportunityId === opportunity.opportunityId ? { ...item, stage } : item,
      ),
    )
    setDetail((current) =>
      current && current.opportunityId === opportunity.opportunityId
        ? { ...current, stage }
        : current,
    )
    try {
      const updated = await changeStage(opportunity.opportunityId, stage)
      setOpportunities((items) =>
        items.map((item) => (item.opportunityId === updated.opportunityId ? updated : item)),
      )
      setDetail((current) =>
        current && current.opportunityId === updated.opportunityId ? updated : current,
      )
    } catch (caught) {
      setOpportunities(previous)
      setError(caught instanceof Error ? caught.message : 'Stage update failed.')
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="mini-scan" />
        <p>Synchronizing scout log…</p>
      </main>
    )
  }
  if (!profile) {
    return (
      <ProfileSetup
        onSaved={(savedProfile) => {
          setProfile(savedProfile)
          setError('')
        }}
      />
    )
  }

  if (detail) {
    return (
      <main className="app-shell">
        <Detail
          opportunity={detail}
          now={now}
          onClose={() => setDetail(null)}
          onStage={(stage) => void updateStage(detail, stage)}
        />
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="wordmark">
          <span className="auth-mark" /> OPPORTUNITY SCOUT
        </div>
        <nav aria-label="Primary">
          {navItems.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={view === key ? 'active' : ''}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button type="button" className="text-button" onClick={signOut}>
          Sign out
        </button>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {view === 'briefing' && (
        <Briefing
          profile={profile}
          opportunities={opportunities}
          now={now}
          onOpen={setDetail}
          onStage={(opportunity, stage) => void updateStage(opportunity, stage)}
          onViewArchive={() => setView('archive')}
        />
      )}

      {view === 'archive' && (
        <section className="workspace-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FULL SIGNAL ARCHIVE</p>
              <h1>Everything your scout has sourced</h1>
              <p className="section-copy">
                The briefing shows only what matters now. This is the complete log — browse, search,
                and select signals to compare.
              </p>
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={selected.length < 2}
              onClick={() => setView('compare')}
            >
              Compare selected ({selected.length})
            </button>
          </div>
          <input
            className="archive-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the archive by title, category, or source"
          />
          {filtered.length === 0 ? (
            <div className="empty-state">No signals match “{query}”.</div>
          ) : (
            <div className="signal-grid">
              {filtered.map((opportunity) => (
                <ArchiveCard
                  key={opportunity.opportunityId}
                  opportunity={opportunity}
                  now={now}
                  selected={selectedIds.has(opportunity.opportunityId)}
                  onSelect={(checked) =>
                    setSelectedIds((current) => {
                      const nextSet = new Set(current)
                      if (checked) nextSet.add(opportunity.opportunityId)
                      else nextSet.delete(opportunity.opportunityId)
                      return nextSet
                    })
                  }
                  onOpen={() => setDetail(opportunity)}
                  onStage={(stage) => void updateStage(opportunity, stage)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {view === 'tracker' && (
        <section className="workspace-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">APPLICATION CRM</p>
              <h1>Tracker</h1>
            </div>
          </div>
          <div className="tracker-board">
            {opportunityStages.map((stage) => {
              const items = opportunities.filter((item) => item.stage === stage)
              return (
                <section className="tracker-column" key={stage}>
                  <h2>
                    {stage}
                    <span>{items.length}</span>
                  </h2>
                  {items.map((item) => (
                    <button
                      key={item.opportunityId}
                      className="tracker-card"
                      onClick={() => setDetail(item)}
                    >
                      <strong>{item.title}</strong>
                      <span>
                        {item.fitScore} · {item.category}
                      </span>
                    </button>
                  ))}
                </section>
              )
            })}
          </div>
        </section>
      )}

      {view === 'compare' && (
        <section className="workspace-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MULTI-AXIS REVIEW</p>
              <h1>Compare signals</h1>
            </div>
          </div>
          {selected.length < 2 ? (
            <div className="empty-state">
              Select at least two signals from the archive to compare them side by side.
            </div>
          ) : (
            <div className="comparison-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Fit</th>
                    <th>Odds</th>
                    <th>Domain</th>
                    <th>Innovation</th>
                    <th>Career</th>
                    <th>Difficulty</th>
                    <th>Hours</th>
                    <th>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {[...selected]
                    .sort((a, b) => b.fitScore - a.fitScore)
                    .map((item) => (
                      <tr key={item.opportunityId}>
                        <th>{item.title}</th>
                        <td>{item.fitScore}</td>
                        <td>{successProbability(item)}%</td>
                        <td>{item.scores.domainFit}</td>
                        <td>{item.scores.innovationLevel}</td>
                        <td>{item.scores.careerValue}</td>
                        <td>{item.scores.difficulty}</td>
                        <td>{item.scores.timeRequiredHours}</td>
                        <td>{item.deadline ?? '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {view === 'tools' && (
        <section className="workspace-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">USER-TRIGGERED SUPPORT</p>
              <h1>Scout tools</h1>
            </div>
          </div>
          <ScoutTools onAdded={(item) => setOpportunities((current) => [item, ...current])} />
        </section>
      )}
    </main>
  )
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <main className="auth-shell">
        <Authenticator
          components={{
            Header() {
              return (
                <header className="auth-brand">
                  <span className="auth-mark" aria-hidden="true" />
                  <span>OPPORTUNITY SCOUT</span>
                </header>
              )
            },
            SignIn: {
              Header() {
                return <h1 className="auth-title">Sign in to your scout</h1>
              },
            },
            SignUp: {
              Header() {
                return <h1 className="auth-title">Create your scout</h1>
              },
            },
          }}
          formFields={{
            signIn: {
              username: {
                label: 'Email',
                placeholder: 'you@example.com',
              },
            },
            signUp: {
              email: {
                label: 'Email',
                order: 1,
                placeholder: 'you@example.com',
              },
              password: {
                order: 2,
              },
              confirm_password: {
                order: 3,
              },
            },
          }}
        >
          {({ signOut }) => <ScoutApplication signOut={() => signOut?.()} />}
        </Authenticator>
      </main>
    </ThemeProvider>
  )
}

export default App
