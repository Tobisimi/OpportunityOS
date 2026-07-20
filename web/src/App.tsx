import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Authenticator, ThemeProvider, createTheme } from '@aws-amplify/ui-react'
import {
  opportunityStages,
  type Opportunity,
  type OpportunityStage,
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

const fitBand = (score: number) =>
  score >= 70
    ? { className: 'fit-strong', label: 'Strong fit' }
    : score >= 40
      ? { className: 'fit-moderate', label: 'Moderate' }
      : { className: 'fit-low', label: 'Low fit' }

function ProfileSetup({ onSaved }: { onSaved: (profile: UserProfile) => void }) {
  const [form, setForm] = useState({
    role: '',
    interests: '',
    location: '',
    remotePreference: 'remote-preferred' as ProfileInput['remotePreference'],
    experienceLevel: 'student' as ProfileInput['experienceLevel'],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const interests = form.interests
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      const profile = await saveProfile({ ...form, interests, scheduleEnabled: true })
      onSaved(profile)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Profile calibration failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="calibration-shell">
      <form className="calibration-panel" onSubmit={submit}>
        <p className="eyebrow">SCOUT CALIBRATION / FIRST RUN</p>
        <h1>Calibrate your scout</h1>
        <p className="section-copy">
          Set the profile signals used to evaluate every opportunity.
        </p>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <label>
          Role
          <input
            required
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            placeholder="Software engineering student"
          />
        </label>
        <label>
          Interests
          <input
            required
            value={form.interests}
            onChange={(event) => setForm({ ...form, interests: event.target.value })}
            placeholder="AI, cloud, hardware"
          />
          <span className="field-hint">Separate interests with commas.</span>
        </label>
        <label>
          Location
          <input
            required
            value={form.location}
            onChange={(event) => setForm({ ...form, location: event.target.value })}
            placeholder="Lagos, Nigeria"
          />
        </label>
        <div className="form-grid">
          <label>
            Remote preference
            <select
              value={form.remotePreference}
              onChange={(event) =>
                setForm({
                  ...form,
                  remotePreference: event.target.value as ProfileInput['remotePreference'],
                })
              }
            >
              <option value="remote-only">Remote only</option>
              <option value="remote-preferred">Remote preferred</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </label>
          <label>
            Experience level
            <select
              value={form.experienceLevel}
              onChange={(event) =>
                setForm({
                  ...form,
                  experienceLevel: event.target.value as ProfileInput['experienceLevel'],
                })
              }
            >
              <option value="student">Student</option>
              <option value="entry">Entry</option>
              <option value="mid">Mid-level</option>
              <option value="senior">Senior</option>
              <option value="expert">Expert</option>
            </select>
          </label>
        </div>
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? 'Calibrating…' : 'Start scanning'}
        </button>
      </form>
    </main>
  )
}

function Scan({
  opportunities,
  onOpen,
}: {
  opportunities: Opportunity[]
  onOpen: (opportunity: Opportunity) => void
}) {
  const categories = [
    'hackathon',
    'scholarship',
    'grant',
    'fellowship',
    'competition',
    'conference',
    'other',
  ]
  return (
    <div className="scan-instrument">
      <svg viewBox="0 0 200 200" role="img" aria-label="Opportunity fit radar">
        <circle className="scan-ring" cx="100" cy="100" r="70" />
        <circle className="scan-ring" cx="100" cy="100" r="46" />
        <circle className="scan-ring" cx="100" cy="100" r="22" />
        <line className="scan-axis" x1="100" y1="25" x2="100" y2="175" />
        <line className="scan-axis" x1="25" y1="100" x2="175" y2="100" />
        <g className="scan-sweep" aria-hidden="true">
          <line x1="100" y1="100" x2="100" y2="25" />
        </g>
        {opportunities.slice(0, 40).map((opportunity) => {
          const segment = Math.max(0, categories.indexOf(opportunity.category))
          const angle = segment * (Math.PI / 4) - Math.PI / 2
          const radius = 14 + (100 - opportunity.fitScore) * 0.55
          const x = 100 + Math.cos(angle) * radius
          const y = 100 + Math.sin(angle) * radius
          return (
            <circle
              key={opportunity.opportunityId}
              className={`scan-signal ${fitBand(opportunity.fitScore).className}`}
              cx={x}
              cy={y}
              r={opportunity.notifiedAt ? 3 : 4}
              role="button"
              tabIndex={0}
              aria-label={`${opportunity.title}, fit score ${opportunity.fitScore}`}
              onClick={() => onOpen(opportunity)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onOpen(opportunity)
              }}
            >
              <title>{opportunity.title} · {opportunity.fitScore}</title>
            </circle>
          )
        })}
      </svg>
      <span className="scan-label">THE SCAN</span>
    </div>
  )
}

function SignalCard({
  opportunity,
  selected,
  onSelect,
  onOpen,
  onStage,
}: {
  opportunity: Opportunity
  selected: boolean
  onSelect: (selected: boolean) => void
  onOpen: () => void
  onStage: (stage: OpportunityStage) => void
}) {
  const band = fitBand(opportunity.fitScore)
  const nextTask = opportunity.checklist.find((item) => !item.completed)
  return (
    <article className="signal-card">
      <div className="signal-card-topline">
        <label className="select-signal">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
          />
          <span>Compare</span>
        </label>
        <span className="source-tag">{opportunity.sourceName}</span>
      </div>
      <button type="button" className="card-title" onClick={onOpen}>
        {opportunity.title}
      </button>
      <div className={`fit-score ${band.className}`}>
        <span>{opportunity.fitScore}</span>
        <small>{band.label}</small>
      </div>
      <span className="category-tag">{opportunity.category}</span>
      <p className="card-summary">{opportunity.summary}</p>
      <div className="next-task">
        <span>{nextTask?.task ?? 'Checklist ready'}</span>
        <time>{nextTask?.dueDate ?? opportunity.deadline ?? 'No deadline'}</time>
      </div>
      <label className="stage-control">
        <span>Stage</span>
        <select
          value={opportunity.stage}
          onChange={(event) => onStage(event.target.value as OpportunityStage)}
        >
          {opportunityStages.map((stage) => (
            <option key={stage} value={stage}>{stage}</option>
          ))}
        </select>
      </label>
    </article>
  )
}

function Detail({
  opportunity,
  onClose,
}: {
  opportunity: Opportunity
  onClose: () => void
}) {
  const scoreRows = [
    ['Domain fit', opportunity.scores.domainFit],
    ['Innovation', opportunity.scores.innovationLevel],
    ['Career value', opportunity.scores.careerValue],
    ['Difficulty', opportunity.scores.difficulty],
  ] as const
  return (
    <section className="detail-panel">
      <button type="button" className="text-button" onClick={onClose}>← Back to signals</button>
      <div className="detail-heading">
        <div>
          <span className="category-tag">{opportunity.category}</span>
          <h1>{opportunity.title}</h1>
        </div>
        <div className={`detail-score ${fitBand(opportunity.fitScore).className}`}>
          {opportunity.fitScore}<small>/100</small>
        </div>
      </div>
      <section>
        <h2>Summary</h2>
        <p>{opportunity.summary}</p>
      </section>
      <section>
        <h2>Fit reasoning</h2>
        <p>{opportunity.fitReasoning}</p>
        <div className="score-bars">
          {scoreRows.map(([label, value]) => (
            <div className="score-row" key={label}>
              <span>{label}</span>
              <div><i style={{ width: `${value}%` }} /></div>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <div className="fact-grid">
          <span>Time required <b>~{opportunity.scores.timeRequiredHours} hrs</b></span>
          <span>Travel <b>{opportunity.scores.travelRequired ? 'Yes' : 'No'}</b></span>
          <span>Funding <b>{opportunity.scores.fundingAvailable ? 'Available' : 'Not listed'}</b></span>
        </div>
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
        <div><span>Deadline</span><strong>{opportunity.deadline ?? 'Not specified'}</strong></div>
        <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer">Open official source ↗</a>
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
      {error && <div className="error-banner tools-error" role="alert">{error}</div>}
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
            placeholder="Which signals are remote-only?"
          />
        </label>
        <button className="primary-button" disabled={busy}>Ask your scout</button>
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
        <button className="primary-button" disabled={busy}>Analyze this</button>
      </form>
    </div>
  )
}

function ScoutApplication({ signOut }: { signOut: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'signals' | 'tracker' | 'compare' | 'tools'>('signals')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<Opportunity | null>(null)

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
  const updateStage = async (opportunity: Opportunity, stage: OpportunityStage) => {
    setError('')
    try {
      const updated = await changeStage(opportunity.opportunityId, stage)
      setOpportunities((items) =>
        items.map((item) => item.opportunityId === updated.opportunityId ? updated : item),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stage update failed.')
    }
  }

  if (loading) {
    return <main className="loading-screen"><div className="mini-scan" /><p>Synchronizing scout log…</p></main>
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
    return <main className="app-shell"><Detail opportunity={detail} onClose={() => setDetail(null)} /></main>
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="wordmark"><span className="auth-mark" /> OPPORTUNITY SCOUT</div>
        <nav aria-label="Primary">
          {(['signals', 'tracker', 'compare', 'tools'] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={view === item ? 'active' : ''}
              onClick={() => setView(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <button type="button" className="text-button" onClick={signOut}>Sign out</button>
      </header>
      {error && <div className="error-banner" role="alert">{error}</div>}

      {view === 'signals' && (
        <>
          <section className="scan-hero">
            <Scan opportunities={opportunities} onOpen={setDetail} />
            <div className="scan-summary">
              <p className="eyebrow">AUTONOMOUS SCOUT / MOCK ANALYSIS ACTIVE</p>
              <h1>Signal log</h1>
              <p>Scan complete. {opportunities.length} signals are stored for this profile.</p>
              <dl>
                <div><dt>Profile</dt><dd>{profile.role}</dd></div>
                <div><dt>Schedule</dt><dd>Daily · 06:00 WAT</dd></div>
                <div><dt>Analysis</dt><dd>Schema-valid mock</dd></div>
              </dl>
            </div>
          </section>
          <section id="signals" className="signals-section">
            <div className="section-heading">
              <div><p className="eyebrow">DETECTED / SCORED / LOGGED</p><h2>Signals</h2></div>
              <button
                type="button"
                className="secondary-button"
                disabled={selected.length < 2}
                onClick={() => setView('compare')}
              >
                Compare selected ({selected.length})
              </button>
            </div>
            {opportunities.length === 0 ? (
              <div className="empty-state">No signals yet — your scout’s next scan runs at 06:00 WAT.</div>
            ) : (
              <div className="signal-grid">
                {opportunities.map((opportunity) => (
                  <SignalCard
                    key={opportunity.opportunityId}
                    opportunity={opportunity}
                    selected={selectedIds.has(opportunity.opportunityId)}
                    onSelect={(checked) =>
                      setSelectedIds((current) => {
                        const next = new Set(current)
                        if (checked) next.add(opportunity.opportunityId)
                        else next.delete(opportunity.opportunityId)
                        return next
                      })
                    }
                    onOpen={() => setDetail(opportunity)}
                    onStage={(stage) => void updateStage(opportunity, stage)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {view === 'tracker' && (
        <section className="workspace-section">
          <div className="section-heading"><div><p className="eyebrow">APPLICATION CRM</p><h1>Tracker</h1></div></div>
          <div className="tracker-board">
            {opportunityStages.map((stage) => {
              const items = opportunities.filter((item) => item.stage === stage)
              return (
                <section className="tracker-column" key={stage}>
                  <h2>{stage}<span>{items.length}</span></h2>
                  {items.map((item) => (
                    <button key={item.opportunityId} className="tracker-card" onClick={() => setDetail(item)}>
                      <strong>{item.title}</strong><span>{item.fitScore} · {item.category}</span>
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
          <div className="section-heading"><div><p className="eyebrow">MULTI-AXIS REVIEW</p><h1>Compare signals</h1></div></div>
          {selected.length < 2 ? (
            <div className="empty-state">Select at least two signals from the dashboard to compare them.</div>
          ) : (
            <div className="comparison-scroll">
              <table>
                <thead><tr><th>Title</th><th>Fit</th><th>Domain</th><th>Innovation</th><th>Career</th><th>Difficulty</th><th>Hours</th><th>Deadline</th></tr></thead>
                <tbody>
                  {[...selected].sort((a, b) => b.fitScore - a.fitScore).map((item) => (
                    <tr key={item.opportunityId}>
                      <th>{item.title}</th><td>{item.fitScore}</td><td>{item.scores.domainFit}</td><td>{item.scores.innovationLevel}</td><td>{item.scores.careerValue}</td><td>{item.scores.difficulty}</td><td>{item.scores.timeRequiredHours}</td><td>{item.deadline ?? '—'}</td>
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
          <div className="section-heading"><div><p className="eyebrow">USER-TRIGGERED SUPPORT</p><h1>Scout tools</h1></div></div>
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
