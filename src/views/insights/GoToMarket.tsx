import { useState } from 'react'
import { CopyButton } from '../../components/ui'
import type { AppData } from '../../types'

// ─── Budget planner ──────────────────────────────────────────────────────────

const BUDGET_OPTIONS = [
  { label: '₹0 — Free only',  value: '0'     },
  { label: '₹5,000 / mo',     value: '5000'  },
  { label: '₹10,000 / mo',    value: '10000' },
  { label: '₹25,000 / mo',    value: '25000' },
  { label: '₹50,000+ / mo',   value: '50000' },
]

interface BudgetLine { channel: string; pct: number; reason: string }

function getBudgetPlan(budget: string): BudgetLine[] {
  const b = parseInt(budget)
  if (b === 0) return [
    { channel: 'Organic social (Instagram / LinkedIn)', pct: 50, reason: 'Highest time-ROI at zero cost — consistency beats budget at this stage' },
    { channel: 'Community building (Reddit / Discord)', pct: 30, reason: 'Find early adopters in niche communities — free and highly targeted' },
    { channel: 'Direct outreach (DMs / cold email)',    pct: 20, reason: 'Direct line to ideal users — time is your only cost' },
  ]
  if (b <= 5000) return [
    { channel: 'Content creation tools (Canva Pro / CapCut)', pct: 35, reason: 'Raise creative quality before spending on distribution — better content = lower CPM' },
    { channel: 'Nano-influencer sponsorship (1–2 posts)',      pct: 40, reason: 'Nano-influencers (1K–10K followers) deliver 3× higher trust per rupee than ads' },
    { channel: 'Boosted Instagram posts (A/B test)',           pct: 25, reason: 'Small test budget to find which creative performs before scaling' },
  ]
  if (b <= 10000) return [
    { channel: 'Meta ads (Instagram + Facebook)',         pct: 45, reason: 'Best ROI for most app categories — precise interest targeting at scale' },
    { channel: 'Content creation & tools',               pct: 25, reason: 'Creative is your biggest performance lever in paid social' },
    { channel: 'SEO tools (Ahrefs / Ubersuggest)',        pct: 20, reason: 'Compound returns — organic traffic pays back over months' },
    { channel: 'Reddit promoted / community sponsorship', pct: 10, reason: 'High-intent niche audiences — test small before scaling' },
  ]
  if (b <= 25000) return [
    { channel: 'Meta ads (Instagram + Facebook)',     pct: 40, reason: 'Primary acquisition — scale winning creatives with lookalike audiences' },
    { channel: 'Content creation & influencer',       pct: 25, reason: 'Social proof + creative assets that fuel paid campaign performance' },
    { channel: 'Google Search ads',                   pct: 20, reason: 'Capture intent-driven searches at the moment of problem awareness' },
    { channel: 'SEO + content marketing',             pct: 15, reason: 'Build organic moat alongside paid — reduces CPL over time' },
  ]
  return [
    { channel: 'Meta ads (Instagram + Facebook)',           pct: 35, reason: 'Proven primary channel — scale with retargeting and lookalike audiences' },
    { channel: 'Google Search + Display',                   pct: 25, reason: 'Full-funnel: Search captures intent, Display builds brand recall' },
    { channel: 'Influencer partnerships (mid-tier 50K–500K)', pct: 20, reason: 'Credibility at scale without mega-influencer rates' },
    { channel: 'SEO & content marketing',                   pct: 15, reason: 'Long-term organic compound growth — reduces paid dependency over 6+ months' },
    { channel: 'Testing new channels (YouTube / Podcast)',   pct: 5,  reason: 'Small test to validate new audiences before committing budget' },
  ]
}

// ─── Launch readiness ────────────────────────────────────────────────────────

interface Criterion { label: string; pass: boolean; detail: string }

function getLaunchCriteria(app: AppData): Criterion[] {
  const ua   = (app as any).url_analysis
  const dims = ua?.dimensions ?? []
  const dim  = (label: string) => dims.find((d: any) => d.label === label)?.score ?? 0
  return [
    { label: 'Landing page has been analyzed',  pass: !!ua,                               detail: ua ? `Analyzed — ${ua.overall}/10 overall` : 'Run URL analysis first' },
    { label: 'Overall page score ≥ 7/10',       pass: (ua?.overall ?? 0) >= 7,            detail: ua ? `${ua.overall}/10` : 'Not yet analyzed' },
    { label: 'Clarity score ≥ 6',               pass: dim('Clarity') >= 6,                detail: `${dim('Clarity') || '—'}/10 — visitors understand what you do immediately` },
    { label: 'Trust signals ≥ 6',               pass: dim('Trust') >= 6,                  detail: `${dim('Trust') || '—'}/10 — testimonials, social proof, credibility` },
    { label: 'Conversion readiness ≥ 5',        pass: dim('Conversion Readiness') >= 5,   detail: `${dim('Conversion Readiness') || '—'}/10 — CTA and sign-up flow` },
    { label: 'Emotional pull ≥ 5',              pass: dim('Emotional Pull') >= 5,          detail: `${dim('Emotional Pull') || '—'}/10 — resonates with target user` },
    { label: 'App has a live URL',              pass: !!app.url,                           detail: app.url ? app.url.replace(/^https?:\/\//, '') : 'No URL added in settings' },
    { label: 'App description filled in',       pass: (app.desc?.length ?? 0) > 20,        detail: app.desc ? `${app.desc.length} characters` : 'Add description in app settings' },
    { label: 'Content pillars defined (3+)',    pass: (app.pillars?.length ?? 0) >= 3,     detail: `${app.pillars?.length ?? 0} of 3 required pillars set` },
    { label: 'Brand voice defined',             pass: (app.brand?.length ?? 0) > 10,       detail: app.brand ? 'Brand voice set' : 'Add brand voice in app settings' },
  ]
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, subtitle, action, children }: {
  title:    string
  subtitle?: string
  action?:  React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 13, fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  data?:                string
  loading?:             boolean
  loadingPlaybook?:     boolean
  onGenerate:           () => void
  onGeneratePlaybook:   () => void
  app:                  AppData
  canUseAnalysis:       boolean
}

const BAR_COLORS = ['#7c6ff7', '#34c98a', '#4f9cf7', '#f5a623', '#e26faf']

const EFFORT_COLOR: Record<string, string> = { Low: 'var(--green)', Medium: 'var(--amber)', High: 'var(--red)' }
const EFFORT_BG:    Record<string, string> = { Low: 'rgba(52,201,138,.12)', Medium: 'rgba(245,166,35,.12)', High: 'rgba(229,85,85,.12)' }

export default function GoToMarketTab({ data, loading, loadingPlaybook, onGenerate, onGeneratePlaybook, app, canUseAnalysis }: Props) {
  const [budget, setBudget] = useState('0')

  if (!canUseAnalysis) return (
    <div style={{ textAlign: 'center', padding: '40px 24px', background: 'var(--surface)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Analysis Pack required</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
        Go-to-Market planning is available on Analysis Pack and Pro. Upgrade to unlock channel recommendations, budget planner, launch readiness, and outreach templates.
      </div>
    </div>
  )

  const ua           = (app as any).url_analysis
  const criteria     = getLaunchCriteria(app)
  const passCount    = criteria.filter(c => c.pass).length
  const readinessPct = Math.round((passCount / criteria.length) * 100)
  const adReady      = (ua?.overall ?? 0) >= 7
  const budgetNum    = parseInt(budget)
  const budgetPlan   = getBudgetPlan(budget)

  let channels:  any[] = []
  let templates: any   = null
  let playbook:  any   = null
  if (data) {
    try {
      const parsed = JSON.parse(data)
      channels  = parsed.channels  ?? []
      templates = parsed.templates ?? null
      playbook  = parsed.playbook  ?? null
    } catch {}
  }

  const GenButton = ({ small }: { small?: boolean }) => (
    loading
      ? <span style={{ fontSize: 12, color: 'var(--text3)' }}>Generating…</span>
      : <button className="gen-btn" style={small ? { fontSize: 11, padding: '5px 11px' } : undefined} onClick={onGenerate}>
          {data ? '🔄 Refresh' : '✨ Generate'}
        </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── 1. Channel Recommendations ── */}
      <Section
        title="📡 Channel Recommendations"
        subtitle={`Best 3 marketing channels for ${app.name}`}
        action={<GenButton small />}
      >
        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>Analyzing best channels…</div>
        )}
        {!loading && !data && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>
            Click Generate to get channel recommendations tailored to {app.name}.
          </div>
        )}
        {!loading && channels.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {channels.map((ch: any, i: number) => (
              <div key={i} style={{ borderLeft: `3px solid ${BAR_COLORS[i % BAR_COLORS.length]}`, paddingLeft: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: BAR_COLORS[i % BAR_COLORS.length], color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{ch.name}</span>
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: EFFORT_BG[ch.effort] ?? 'var(--surface2)', color: EFFORT_COLOR[ch.effort] ?? 'var(--text2)' }}>{ch.effort} effort</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 6 }}>{ch.why}</div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text3)' }}>⏱ {ch.timeline}</span>
                  <span style={{ color: 'var(--green)' }}>💰 {ch.cost}</span>
                </div>
                <div style={{ padding: '7px 10px', background: 'rgba(124,111,247,.07)', borderRadius: 6, borderLeft: '2px solid var(--accent)', fontSize: 11, color: 'var(--text)', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>First action: </span>{ch.firstAction}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── 2. Budget Planner ── */}
      <Section title="💰 Budget Planner" subtitle="How to allocate your monthly marketing budget">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, whiteSpace: 'nowrap' }}>Monthly budget:</label>
          <select
            value={budget}
            onChange={e => setBudget(e.target.value)}
            style={{ flex: 1, padding: '7px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, outline: 'none' }}
          >
            {BUDGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {budgetPlan.map((line, i) => {
            const amount   = budgetNum > 0 ? Math.round(line.pct / 100 * budgetNum) : null
            const barColor = BAR_COLORS[i % BAR_COLORS.length]
            return (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{line.channel}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>
                    {amount != null ? `₹${amount.toLocaleString('en-IN')} · ` : ''}{line.pct}%
                  </span>
                </div>
                <div style={{ height: 5, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden', marginBottom: 5 }}>
                  <div style={{ height: '100%', width: `${line.pct}%`, background: barColor, borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>{line.reason}</div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── 3. Launch Readiness ── */}
      <Section
        title="🚦 Launch Readiness"
        subtitle="10 criteria to check before spending on ads"
        action={
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: readinessPct >= 80 ? 'var(--green)' : readinessPct >= 50 ? 'var(--amber)' : 'var(--red)' }}>{readinessPct}%</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{passCount}/{criteria.length} passed</div>
          </div>
        }
      >
        {!adReady && (
          <div style={{ padding: '10px 12px', background: 'rgba(229,85,85,.08)', border: '1px solid rgba(229,85,85,.2)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--red)', lineHeight: 1.5, marginBottom: 14, fontWeight: 600 }}>
            🚫 Not ready to spend on ads — your landing page score is {ua?.overall ?? 'unknown'}/10. Ads sent to a weak page waste budget. Fix the failing criteria below first.
          </div>
        )}
        {adReady && (
          <div style={{ padding: '10px 12px', background: 'rgba(52,201,138,.07)', border: '1px solid rgba(52,201,138,.2)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--green)', lineHeight: 1.5, marginBottom: 14, fontWeight: 600 }}>
            ✅ Landing page is ad-ready ({ua.overall}/10). You can start spending on paid channels.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {criteria.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 6, background: c.pass ? 'rgba(52,201,138,.04)' : 'rgba(229,85,85,.04)', border: `1px solid ${c.pass ? 'rgba(52,201,138,.14)' : 'rgba(229,85,85,.1)'}` }}>
              <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{c.pass ? '✅' : '❌'}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 4. Outreach Templates ── */}
      <Section
        title="✉️ Outreach Templates"
        subtitle={`Ready-to-use templates for ${app.name}`}
        action={!data && !loading ? <GenButton small /> : undefined}
      >
        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>Writing templates…</div>
        )}
        {!loading && !templates && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>
            Generate channel recommendations to also get outreach templates.
          </div>
        )}
        {!loading && templates && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Cold DM */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>💬 Cold DM (Twitter / LinkedIn)</span>
                <CopyButton text={templates.coldDM ?? ''} />
              </div>
              <pre style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, background: 'var(--surface2)', padding: '10px 12px', borderRadius: 'var(--r)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                {templates.coldDM}
              </pre>
            </div>

            {/* Reddit post */}
            {templates.redditPost && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>🤖 Reddit Post</span>
                    {templates.redditPost.subreddit && (
                      <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 8 }}>{templates.redditPost.subreddit}</span>
                    )}
                  </div>
                  <CopyButton text={`${templates.redditPost.title ?? ''}\n\n${templates.redditPost.body ?? ''}`} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 3, marginTop: 7 }}>Title</div>
                <div style={{ fontSize: 12, background: 'var(--surface2)', padding: '8px 10px', borderRadius: 6, marginBottom: 8 }}>{templates.redditPost.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Body</div>
                <pre style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, background: 'var(--surface2)', padding: '10px 12px', borderRadius: 6, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                  {templates.redditPost.body}
                </pre>
              </div>
            )}

            {/* ProductHunt */}
            {templates.productHunt && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>🚀 ProductHunt Launch</span>
                  <CopyButton text={`${templates.productHunt.tagline ?? ''}\n\n${templates.productHunt.description ?? ''}`} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Tagline</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', background: 'var(--surface2)', padding: '8px 10px', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{templates.productHunt.tagline}</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, flexShrink: 0, marginLeft: 8 }}>{(templates.productHunt.tagline ?? '').length}/60</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>Description</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, background: 'var(--surface2)', padding: '10px 12px', borderRadius: 6 }}>
                  {templates.productHunt.description}
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 5 }}>{(templates.productHunt.description ?? '').length}/260 chars</div>
                </div>
              </div>
            )}

          </div>
        )}
      </Section>

      {/* ── 5. What Worked for Others ── */}
      <Section
        title="🏆 What Worked for Others"
        subtitle={`Category playbook, failure patterns, and proven formulas for ${app.category} apps`}
        action={
          loadingPlaybook
            ? <span style={{ fontSize: 12, color: 'var(--text3)' }}>Generating…</span>
            : <button className="gen-btn" style={{ fontSize: 11, padding: '5px 11px' }} onClick={onGeneratePlaybook}>
                {playbook ? '🔄 Refresh' : '✨ Generate'}
              </button>
        }
      >
        {!playbook && !loadingPlaybook && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>
            See what worked (and failed) for real companies in the {app.category} space, then get a step-by-step formula tailored to your market.
          </div>
        )}
        {loadingPlaybook && (
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>Researching playbooks and patterns…</div>
        )}

        {playbook && !loadingPlaybook && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Part 1: Category Playbook ── */}
            {playbook.categoryPlaybook?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.06em', color: 'var(--green)', marginBottom: 10 }}>
                  ✅ Category Playbook — What successful players did
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {playbook.categoryPlaybook.map((item: any, i: number) => (
                    <div key={i} style={{ padding: '10px 12px', background: 'rgba(52,201,138,.04)', border: '1px solid rgba(52,201,138,.15)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{item.company}</span>
                        {item.when && (
                          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: 'rgba(52,201,138,.12)', color: 'var(--green)', fontWeight: 600 }}>{item.when}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 5 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>What: </span>{item.what}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--green)', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700 }}>Results: </span>{item.results}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Part 2: What NOT to do ── */}
            {playbook.whatNotToDo?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.06em', color: 'var(--red)', marginBottom: 10 }}>
                  ❌ What NOT to Do — Channels and approaches that failed
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {playbook.whatNotToDo.map((item: any, i: number) => (
                    <div key={i} style={{ padding: '10px 12px', background: 'rgba(229,85,85,.04)', border: '1px solid rgba(229,85,85,.12)', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{item.example}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 5 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Tried: </span>{item.approach}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700 }}>Failed because: </span>{item.why}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Part 3: Marketing Formula ── */}
            {playbook.marketingFormula?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.06em', color: 'var(--accent)', marginBottom: 10 }}>
                  📋 Proven Marketing Formula — Step by step
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {playbook.marketingFormula.map((item: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        {item.step}
                      </div>
                      <div style={{ flex: 1, paddingBottom: i < playbook.marketingFormula.length - 1 ? 7 : 0, borderBottom: i < playbook.marketingFormula.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>{item.action}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>{item.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Part 4: Eternal Principles ── */}
            {playbook.eternalPrinciples?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.06em', color: '#f5a623', marginBottom: 10 }}>
                  💡 Eternal Principles Applied to {app.name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {playbook.eternalPrinciples.map((item: any, i: number) => (
                    <div key={i} style={{ padding: '10px 12px', background: 'rgba(245,166,35,.04)', border: '1px solid rgba(245,166,35,.15)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: '#f5a623', fontWeight: 700, fontStyle: 'italic' as const, marginBottom: 5, opacity: 0.85 }}>
                        "{item.principle}"
                      </div>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                        <span style={{ color: '#f5a623', fontWeight: 700, flexShrink: 0, fontSize: 12 }}>→</span>
                        <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{item.action}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </Section>

    </div>
  )
}
