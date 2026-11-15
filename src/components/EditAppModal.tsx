import { useState } from 'react'
import { Modal, Field, SelectField, ProgressStep } from './ui'
import { useStore } from '../lib/store'
import { callClaude } from '../lib/claude'
import { toast } from './Toast'
import type { AppData } from '../types'
import { normalizeInstagramHandle } from '../lib/instagram'
import FounderBriefFields, { draftFromBrief, type FounderBriefDraft } from './FounderBriefFields'
import { normalizeFounderBrief, competitorListsChanged, stampFounderBrief, hasFounderBrief } from '../lib/founder'

const PLATFORMS  = ['Web', 'Mobile', 'Both'] as const
const STAGES     = ['Idea', 'Early', 'Launch', 'Growth'] as const
const CATEGORIES = ['Productivity','Finance','Dev Tools','Marketing','Health & Wellness','Food & Nutrition','Education','E-commerce','Travel','Social','Other']
const MARKETS = ['Auto-detect','India','United States','United Kingdom','Europe','Southeast Asia','Middle East','Australia','Global']

type Step = 'pending' | 'active' | 'done' | 'skip'

// Inner component receives the resolved app — no undefined risk
function EditAppForm({ app, onClose }: { app: AppData; onClose: () => void }) {
  const { updateApp, removeApp, canUseProductTest } = useStore()

  const [name,      setName]      = useState(app.name)
  const [url,       setUrl]       = useState(app.url ?? '')
  const [instagramHandle, setInstagramHandle] = useState(app.instagram_handle ?? '')
  const [showReanalyzePrompt, setShowReanalyzePrompt] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [platform,  setPlatform]  = useState<typeof PLATFORMS[number]>(app.platform as typeof PLATFORMS[number])
  const [stage,     setStage]     = useState<typeof STAGES[number]>(app.stage as typeof STAGES[number])
  const [category,  setCategory]  = useState(app.category)
  const [primaryMarket, setPrimaryMarket] = useState(app.primary_market ?? 'Auto-detect')
  const [desc,      setDesc]      = useState(app.desc ?? '')
  const [recentCtx, setRecentCtx] = useState(app.recent_context ?? '')
  const [credsOpen, setCredsOpen] = useState(!!(app.testCreds?.user))
  const [testUser,  setTestUser]  = useState(app.testCreds?.user ?? '')
  const [testPass,  setTestPass]  = useState('')
  const [loginUrl,  setLoginUrl]  = useState(app.testCreds?.loginUrl ?? '')
  const [testFlows, setTestFlows] = useState(app.testCreds?.flows ?? '')
  const [running,   setRunning]   = useState(false)
  const [steps,     setSteps]     = useState<Step[]>(['pending','pending','pending','pending'])

  const setStep = (i: number, s: Step) =>
    setSteps(prev => prev.map((v, idx) => idx === i ? s : v))

  const hasCreds = !!(testUser && (testPass || app.testCreds?.password))

  const [briefDraft, setBriefDraft] = useState<FounderBriefDraft>(draftFromBrief(app.founder_brief))

  // Normalized brief + reset competitive's 7-day gate when focus/excluded lists change
  function briefUpdates(): Partial<AppData> {
    // updated_at moves only when the brief's content changed — drives "outdated" analyses
    const founder_brief = stampFounderBrief(app.founder_brief, normalizeFounderBrief(briefDraft))
    return {
      founder_brief,
      ...(competitorListsChanged(app.founder_brief, founder_brief) && { competitive_analyzed_at: null }),
    }
  }

  // ── Delete (danger zone) ───────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting,    setDeleting]    = useState(false)
  const canDelete = confirmText === app.name   // exact, case-sensitive, no trimming

  async function deleteApp() {
    if (!canDelete) return
    setDeleting(true)
    const ok = await removeApp(app.id)   // store toasts on failure
    if (ok) { toast(`"${app.name}" deleted`); onClose() }
    else setDeleting(false)
  }

  function saveOnly() {
    const normalizedHandle = normalizeInstagramHandle(instagramHandle) || null
    updateApp(app.id, {
      name, url,
      platform: platform as AppData['platform'],
      stage: stage as AppData['stage'],
      category, desc,
      recent_context: recentCtx || null,
      primary_market: primaryMarket,
      instagram_handle: normalizedHandle,
      ...briefUpdates(),
      testCreds: testUser ? {
        user: testUser,
        password: testPass || app.testCreds?.password || '',
        loginUrl: loginUrl || url,
        flows: testFlows
      } : app.testCreds
    })
    toast(`✅ ${name} saved!`)

    // Handle changed on an app that's already been analyzed — offer to fold
    // Instagram data into the existing analysis instead of forcing a re-run.
    const handleChanged = normalizedHandle !== (app.instagram_handle ?? null)
    if (handleChanged && normalizedHandle && app.url_analysis) {
      setShowReanalyzePrompt(true)
    } else {
      onClose()
    }
  }

  async function reanalyzeUrl() {
    setReanalyzing(true)
    try {
      const normalizedHandle = normalizeInstagramHandle(instagramHandle)
      const r = await fetch('/api/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-call': 'markr_internal' },
        body: JSON.stringify({ url, instagram_handle: normalizedHandle || undefined })
      })
      if (r.ok) {
        const result = await r.json()
        if (!result.error) {
          await updateApp(app.id, { url_analysis: { ...result, analyzed_at: new Date().toISOString() } } as any)
          toast('Re-analyzed with Instagram data ✓')
        } else {
          toast('Re-analysis failed: ' + result.error)
        }
      } else {
        toast('Re-analysis failed — please try again')
      }
    } catch (e) {
      toast('Re-analysis failed: ' + (e as Error).message)
    }
    setReanalyzing(false)
    setShowReanalyzePrompt(false)
    onClose()
  }

  async function saveAndReanalyze() {
    setRunning(true)
    try {
      setStep(0, 'active')
      await new Promise(r => setTimeout(r, 300))
      setStep(0, 'done')

      setStep(1, 'active')
      const raw = await callClaude(
        `Analyze this app for Instagram content strategy.
App: "${name}" | Platform: ${platform} | Category: ${category} | Stage: ${stage}
${url  ? 'URL: ' + url  : ''}
${desc ? 'Context: ' + desc : ''}
Output exactly:
DESCRIPTION: [2 sentences]
AUDIENCE: [10 words]
TONE: [1 sentence]
PROBLEM: [1 sentence]
DIFFERENTIATOR: [1 sentence]
FEATURES: [8 features, comma-separated]
PILLARS: [6 Instagram pillars, comma-separated, 2-5 words]
BRAND_VOICE: [3-4 sentences on voice]`,
        'You are a product analyst. Be specific.'
      )
      const gf = (k: string) =>
        (raw.match(new RegExp(k + ':\\s*([^\\n]+)')) ?? [])[1]?.trim() ?? ''
      const newDesc  = gf('DESCRIPTION') || desc
      const audience = gf('AUDIENCE')
      const tone     = gf('TONE')
      const problem  = gf('PROBLEM')
      const diff     = gf('DIFFERENTIATOR')
      const features = gf('FEATURES').split(',').map(s => s.trim()).filter(Boolean).slice(0, 8)
      const pillars  = gf('PILLARS').split(',').map(s => s.trim()).filter(Boolean).slice(0, 6)
      const bvRaw    = (raw.match(/BRAND_VOICE:\s*([\s\S]+)/) ?? [])[1]?.trim() ?? ''
      setStep(1, 'done')

      // The old simulated "AI Readiness Assessment" (runProductTest) is removed — it never opened
      // the app, so its findings were invented. The saved productTest is left as it is; real checks
      // run from Insights → Product Test. The rebuilt brand voice no longer embeds test findings.
      const effectivePass = testPass || app.testCreds?.password || ''

      setStep(3, 'active')
      const brand =
        `You are the Instagram content strategist for ${name}, a ${category.toLowerCase()} ${platform.toLowerCase()} app.\n\n`
        + `TARGET AUDIENCE: ${audience}\nCORE PROBLEM: ${problem}\nDIFFERENTIATOR: ${diff}\nBRAND TONE: ${tone}\n`
        + (bvRaw ? `\nBRAND VOICE:\n${bvRaw}\n` : '')
        + `\nRULES:\n• Write from the user's perspective\n• Never salesy\n• End with a question\n• NEVER: game-changer, hustle, crush it`
      setStep(3, 'done')

      updateApp(app.id, {
        name, url,
        platform: platform as AppData['platform'],
        stage: stage as AppData['stage'],
        category,
        desc: newDesc,
        brand, pillars, features, audience, problem, diff,
        recent_context: recentCtx || null,
        primary_market: primaryMarket,
        instagram_handle: normalizeInstagramHandle(instagramHandle) || null,
        ...briefUpdates(),
        testCreds: {
          user: testUser,
          password: effectivePass,
          loginUrl: loginUrl || url,
          flows: testFlows
        },
      })
      onClose()
      toast(`✅ ${name} updated!`, 4000)
    } catch (e) {
      toast('Failed: ' + (e as Error).message)
    }
    setRunning(false)
  }

  return (
    <Modal title="Edit App" subtitle="Update details, your founder brief, or test credentials." onClose={onClose}>
      <Field label="App Name">
        <input value={name} onChange={e => setName(e.target.value)} />
      </Field>
      <Field label="App URL">
        <input value={url} onChange={e => setUrl(e.target.value)} />
      </Field>
      <Field label="Instagram handle (optional)" hint="Pulls follower count into Trust scoring and strategy — bio/captions are never read.">
        <input value={instagramHandle} onChange={e => setInstagramHandle(e.target.value)} placeholder="@yourbrand or full URL" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Platform">
          <select value={platform} onChange={e => setPlatform(e.target.value as typeof PLATFORMS[number])}>
            {PLATFORMS.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Stage">
          <select value={stage} onChange={e => setStage(e.target.value as typeof STAGES[number])}>
            {STAGES.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Category">
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(o => <option key={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Primary market">
        <select value={primaryMarket} onChange={e => setPrimaryMarket(e.target.value)}>
          {MARKETS.map(o => <option key={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Description">
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} />
      </Field>

      <FounderBriefFields value={briefDraft} onChange={setBriefDraft} defaultOpen={hasFounderBrief(app.founder_brief)} />

      {/* Recent Context */}
      <div style={{ background:'rgba(124,111,247,.05)', border:'1px solid rgba(124,111,247,.2)', borderRadius:'var(--r)', padding:'12px 14px', marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--accent2)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em' }}>
          📊 Recent Context <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400, textTransform:'none', letterSpacing:0 }}>— makes analysis smarter over time</span>
        </div>
        <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8, lineHeight:1.6 }}>
          Paste any recent data: user reviews, metrics, feedback, revenue numbers, Instagram performance, feature usage. Markr injects this into every analysis so results reflect your current reality.
        </div>
        <textarea
          value={recentCtx}
          onChange={e => setRecentCtx(e.target.value)}
          rows={5}
          placeholder={`Examples:\n• "47 reviews this month — 30% complain about slow onboarding, users love the streak feature"\n• "DAU: 340, D7 retention: 42%, top feature: journal (68% usage)"\n• "MRR grew from ₹0 to ₹15k, churn 8%"\n• "Instagram post about habit streaks got 4x normal reach (2,400 views)"\n• "Users keep asking for dark mode and reminder notifications"`}
        />
        {recentCtx && (
          <div style={{ fontSize:11, color:'var(--green)', marginTop:6 }}>
            ✓ Context saved — will be used in all future analyses
          </div>
        )}
      </div>

      {/* Credentials accordion */}
      <div style={{ border: '1px solid rgba(124,111,247,.3)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 4 }}>
        <div
          onClick={() => setCredsOpen(!credsOpen)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', background: 'rgba(124,111,247,.06)', userSelect: 'none' }}
        >
          <span style={{ fontSize: 15 }}>🔐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)' }}>Test credentials <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text3)', marginLeft: 6 }}>for the upcoming real-browser test · not used yet</span></div>
            <div style={{ fontSize: 11, color: testUser ? 'var(--green)' : 'var(--text3)', marginTop: 2 }}>
              {testUser ? `Saved: ${testUser} · click to update` : 'No credentials saved — add them here'}
            </div>
          </div>
          <span style={{ color: 'var(--text3)', fontSize: 11, transition: 'transform .2s', transform: credsOpen ? 'rotate(180deg)' : '' }}>▼</span>
        </div>
        {credsOpen && (
          <div style={{ padding: 14, borderTop: '1px solid rgba(124,111,247,.2)' }}>
            <div style={{ background: 'rgba(245,166,35,.07)', border: '1px solid rgba(245,166,35,.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: 'var(--amber)', lineHeight: 1.55 }}>
              ⚠️ Leave password blank to keep the existing one.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field label="Test Email / Username">
                <input value={testUser} onChange={e => setTestUser(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Password (blank = keep existing)">
                <input type="password" value={testPass} onChange={e => setTestPass(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </Field>
            </div>
            <Field label="Login URL">
              <input value={loginUrl} onChange={e => setLoginUrl(e.target.value)} />
            </Field>
            <Field label="Features & flows to test">
              <textarea value={testFlows} onChange={e => setTestFlows(e.target.value)} rows={3}
                placeholder="List every tab and screen to test exhaustively…" />
            </Field>
          </div>
        )}
      </div>

      {running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, margin: '12px 0 4px' }}>
          <ProgressStep label="Saving app details"                     state={steps[0]} />
          <ProgressStep label="Re-analyzing features & audience"       state={steps[1]} />
          <ProgressStep label="Rebuilding content engine"              state={steps[3]} />
        </div>
      )}

      {showReanalyzePrompt && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, background: 'rgba(124,111,247,.08)', border: '1px solid rgba(124,111,247,.25)', borderRadius: 'var(--r)', padding: '10px 14px', marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text)' }}>Re-analyze now to include Instagram data?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="vbtn" onClick={onClose} disabled={reanalyzing}>Not now</button>
            <button className="gen-btn" onClick={reanalyzeUrl} disabled={reanalyzing} style={{ fontSize: 11, padding: '6px 14px' }}>
              {reanalyzing
                ? <><span className="spinner" style={{ color: '#fff' }} /> Re-analyzing…</>
                : 'Re-analyze now'
              }
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="vbtn" onClick={onClose} disabled={running || deleting}>Cancel</button>
        <button className="vbtn" onClick={saveOnly} disabled={running || deleting} style={{ color: 'var(--text)' }}>Save Only</button>
        <button className="gen-btn" onClick={saveAndReanalyze} disabled={running || deleting} style={{ fontSize: 12, padding: '7px 16px' }}>
          {running
            ? <><span className="spinner" style={{ color: '#fff' }} /> Running…</>
            : <><i className="ti ti-refresh" style={{ fontSize: 13 }} /> Save &amp; Re-run Analysis</>
          }
        </button>
      </div>

      {/* Danger zone */}
      <div style={{ marginTop:22, border:'1px solid rgba(229,85,85,.35)', borderRadius:'var(--r)', padding:'12px 14px', background:'rgba(229,85,85,.04)' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--red, #e55)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Danger zone</div>
        {!confirmOpen ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' as const }}>
            <div style={{ fontSize:12, color:'var(--text2)' }}>Permanently delete this app and everything Markr generated for it.</div>
            <button className="vbtn" onClick={() => setConfirmOpen(true)} disabled={running}
              style={{ color:'var(--red, #e55)', borderColor:'rgba(229,85,85,.4)' }}>Delete app</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.6, marginBottom:10 }}>
              This <strong>permanently deletes "{app.name}"</strong> and all its analyses, screenshots and content.
              Its score history is removed, and if email delivery uses this app, delivery will be turned off. This can't be undone.
            </div>
            <Field label={`Type "${app.name}" to confirm`}>
              <input value={confirmText} onChange={e => setConfirmText(e.target.value)} disabled={deleting}
                autoComplete="off" spellCheck={false} placeholder={app.name} />
            </Field>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button className="vbtn" disabled={deleting} onClick={() => { setConfirmOpen(false); setConfirmText('') }}>Cancel</button>
              <button onClick={deleteApp} disabled={!canDelete || deleting}
                style={{ padding:'7px 16px', borderRadius:8, border:'none', fontSize:12, fontWeight:700, color:'#fff',
                         background:'var(--red, #e55)', cursor:(!canDelete || deleting) ? 'default' : 'pointer',
                         opacity:(!canDelete || deleting) ? .5 : 1, fontFamily:'DM Sans, sans-serif' }}>
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// Outer wrapper handles the undefined guard cleanly
export default function EditAppModal({ appId, onClose }: { appId: number; onClose: () => void }) {
  const { apps } = useStore()
  const app = apps.find(a => a.id === appId)
  if (!app) return null
  return <EditAppForm app={app} onClose={onClose} />
}
