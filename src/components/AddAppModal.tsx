import { useState } from 'react'
import { Modal, Field, SelectField, ProgressStep } from './ui'
import { useStore } from '../lib/store'
import { callClaude, runProductTest } from '../lib/claude'
import { toast } from './Toast'
import type { AppData } from '../types'
import { COLORS } from '../lib/data'

type Step = 'pending' | 'active' | 'done' | 'skip'

const PLATFORMS = ['Web', 'Mobile', 'Both'] as const
const STAGES    = ['Idea', 'Early', 'Launch', 'Growth'] as const
const CATEGORIES = [
  'Productivity','Finance','Dev Tools','Marketing','Health & Wellness',
  'Food & Nutrition','Education','E-commerce','Travel','Social','Other'
]

export default function AddAppModal({ onClose, prefilledUrl = '' }: { onClose: () => void; prefilledUrl?: string }) {
  const { apps, addApp, setCurrentApp, canUseProductTest } = useStore()

  const [name,     setName]     = useState('')
  const [url,      setUrl]      = useState(prefilledUrl)  // pre-fill from landing page
  const [platform, setPlatform] = useState<string>('Web')
  const [stage,    setStage]    = useState<string>('Launch')
  const [category, setCategory] = useState<string>('Productivity')
  const [extra,    setExtra]    = useState('')
  const [credsOpen, setCredsOpen] = useState(false)
  const [testUser,  setTestUser]  = useState('')
  const [testPass,  setTestPass]  = useState('')
  const [loginUrl,  setLoginUrl]  = useState('')
  const [testFlows, setTestFlows] = useState('')

  const [running,   setRunning]  = useState(false)
  const [steps,     setSteps]    = useState<Step[]>(['pending','pending','pending','pending'])

  const setStep = (i: number, s: Step) =>
    setSteps(prev => prev.map((v, idx) => idx === i ? s : v))

  const hasCreds = !!(testUser && testPass)

  async function handleSubmit() {
    if (!name.trim()) { toast('Please enter an app name'); return }
    setRunning(true)

    try {
      // Step 0
      setStep(0, 'active')
      await new Promise(r => setTimeout(r, 300))
      setStep(0, 'done')

      // Step 1 — analyse
      setStep(1, 'active')
      const analysisRaw = await callClaude(
        `Analyze this app for Instagram content strategy.
App: "${name}" | Platform: ${platform} | Category: ${category} | Stage: ${stage}
${url   ? 'URL: ' + url   : ''}
${extra ? 'Context: ' + extra : ''}
Output exactly:
DESCRIPTION: [2 sentences — what it does and who it's for]
AUDIENCE: [primary audience in 10 words]
TONE: [brand voice in 1 sentence]
PROBLEM: [core problem in 1 sentence]
DIFFERENTIATOR: [unique angle in 1 sentence]
FEATURES: [8 key features, comma-separated]
PILLARS: [6 Instagram content pillars, comma-separated, 2-5 words]
BRAND_VOICE: [3-4 sentences on voice — what to always do, what to NEVER say]`,
        'You are a product analyst. Be specific and infer intelligently.'
      )
      const gf = (k: string) => (analysisRaw.match(new RegExp(k + ':\\s*([^\\n]+)')) ?? [])[1]?.trim() ?? ''
      const desc       = gf('DESCRIPTION')    || `${name} is a ${category} app.`
      const audience   = gf('AUDIENCE')       || ''
      const tone       = gf('TONE')           || ''
      const problem    = gf('PROBLEM')        || ''
      const diff       = gf('DIFFERENTIATOR') || ''
      const features   = gf('FEATURES').split(',').map(s=>s.trim()).filter(Boolean).slice(0,8)
      const pillars    = gf('PILLARS').split(',').map(s=>s.trim()).filter(Boolean).slice(0,6)
      const bvRaw      = (analysisRaw.match(/BRAND_VOICE:\s*([\s\S]+)/) ?? [])[1]?.trim() ?? ''
      setStep(1, 'done')

      // Step 2 — product test
      let productTest = null
      if (hasCreds && canUseProductTest) {  // Pro only — Sonnet is expensive
        setStep(2, 'active')
        try {
          productTest = await runProductTest({
            id: 0, name, platform: platform as AppData['platform'],
            color: '', stage: stage as AppData['stage'], category,
            url, desc, brand: '', pillars, features,
            testCreds: { user: testUser, loginUrl: loginUrl || url, flows: testFlows }
          } as AppData, testPass)
        } catch (e) {
          productTest = { error: (e as Error).message } as any
        }
        setStep(2, 'done')
      } else {
        setStep(2, 'skip')
      }

      // Step 3 — build brand voice
      setStep(3, 'active')
      let testCtx = ''
      if (productTest && !productTest.error) {
        testCtx = `\n\nPRODUCT TEST (${productTest.overall_score}/100 — ${productTest.verdict}):\n`
          + `• Works: ${(productTest.what_works_well??[]).join('; ')}\n`
          + `• Fix: ${(productTest.what_needs_fixing??[]).slice(0,2).join('; ')}\n`
          + `• Content: ${(productTest.content_implications??[]).join('; ')}`
      }
      const brand = `You are the Instagram content strategist for ${name}, a ${category.toLowerCase()} ${platform.toLowerCase()} app.\n\n`
        + `TARGET AUDIENCE: ${audience}\nCORE PROBLEM: ${problem}\nDIFFERENTIATOR: ${diff}\nBRAND TONE: ${tone}${testCtx}\n`
        + (bvRaw ? `\nBRAND VOICE:\n${bvRaw}\n` : '')
        + `\nRULES:\n• Write from the user's perspective\n• Never salesy\n• End with a question\n• NEVER: game-changer, hustle, crush it`
      setStep(3, 'done')

      const newApp: AppData = {
        id: Date.now(),
        name, platform: platform as AppData['platform'],
        color: COLORS[apps.length % COLORS.length],
        stage: stage as AppData['stage'],
        category, url, desc, brand, pillars, features,
        audience, problem, diff,
        testCreds: hasCreds ? { user: testUser, password: testPass, loginUrl: loginUrl || url, flows: testFlows } : null,
        productTest,
        analyzed: true
      }
      addApp(newApp)
      onClose()

      const msg = hasCreds && productTest && !productTest.error
        ? `✅ ${name} analyzed & tested! Score: ${productTest.overall_score}/100`
        : `✅ ${name} analyzed! Content engine ready.`
      toast(msg, 5000)

    } catch (e) {
      toast('Analysis failed: ' + (e as Error).message)
    }
    setRunning(false)
  }

  return (
    <Modal
      title="Add New App"
      subtitle="Enter your app URL — Markr analyzes it and optionally tests it as a real user before building your content engine."
      onClose={onClose}
    >
      <Field label="App Name">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. InvoiceZap, MealBuddy…" />
      </Field>

      <Field label="App URL ✦ AI reads this" hint="Landing page, App Store link, or any URL describing your app.">
        <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://yourapp.com" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SelectField label="Platform" value={platform} onChange={setPlatform} options={[...PLATFORMS]} />
        <SelectField label="Stage"    value={stage}    onChange={setStage}    options={[...STAGES]} />
      </div>

      <SelectField label="Category" value={category} onChange={setCategory} options={CATEGORIES} />

      <Field label="Extra context (optional)">
        <textarea value={extra} onChange={e=>setExtra(e.target.value)} rows={2}
          placeholder="Target audience, tone, competitors, unique angle…" />
      </Field>

      {/* Test credentials accordion */}
      <div style={{ border: '1px solid rgba(124,111,247,.3)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 4 }}>
        <div
          onClick={() => setCredsOpen(!credsOpen)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', background: 'rgba(124,111,247,.06)', userSelect: 'none' }}
        >
          <span style={{ fontSize: 15 }}>🔐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)' }}>
              Product Test Access <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text3)', marginLeft: 6 }}>optional · powerful</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Give test credentials and AI will explore your app as a real user
            </div>
          </div>
          <span style={{ color: 'var(--text3)', fontSize: 11, transition: 'transform .2s', transform: credsOpen ? 'rotate(180deg)' : '' }}>▼</span>
        </div>

        {credsOpen && (
          <div style={{ padding: 14, borderTop: '1px solid rgba(124,111,247,.2)' }}>
            <div style={{ background: 'rgba(245,166,35,.07)', border: '1px solid rgba(245,166,35,.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: 'var(--amber)', lineHeight: 1.55 }}>
              ⚠️ Use a sandbox / test account only. For Gmail apps, create a separate email+password test account.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field label="Test Email / Username">
                <input value={testUser} onChange={e=>setTestUser(e.target.value)} placeholder="test@yourapp.com" autoComplete="off" />
              </Field>
              <Field label="Password">
                <input type="password" value={testPass} onChange={e=>setTestPass(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </Field>
            </div>
            <Field label="Login URL (if different from app URL)">
              <input value={loginUrl} onChange={e=>setLoginUrl(e.target.value)} placeholder="https://app.yourapp.com/login" />
            </Field>
            <Field label="Features & flows to test — list every tab and screen">
              <textarea value={testFlows} onChange={e=>setTestFlows(e.target.value)} rows={3}
                placeholder="e.g. Onboarding, Sadhana tab, Habit Awareness screen, Mira AI chat, Addiction Support, Settings…" />
            </Field>
            <div style={{ background: 'rgba(52,201,138,.06)', border: '1px solid rgba(52,201,138,.2)', borderRadius: 6, padding: '9px 12px', fontSize: 11, color: 'var(--green)', lineHeight: 1.65 }}>
              ✦ With test access: explore UI flows · assess features · score UX · find bugs · generate QA report that enriches all content and strategy.
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      {running && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, margin: '12px 0 4px' }}>
          <ProgressStep label="Reading app URL & context"              state={steps[0]} />
          <ProgressStep label="Analyzing features & audience"          state={steps[1]} />
          <ProgressStep label="Product test — simulating user session" state={steps[2]} />
          <ProgressStep label="Building content engine & brand pillars" state={steps[3]} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="vbtn" onClick={onClose} disabled={running}>Cancel</button>
        <button className="gen-btn" onClick={handleSubmit} disabled={running} style={{ fontSize: 12, padding: '7px 16px' }}>
          {running
            ? <><span className="spinner" style={{ color: '#fff' }} /> Analyzing…</>
            : <><i className="ti ti-world" style={{ fontSize: 13 }} /> Analyze & Add App</>
          }
        </button>
      </div>
    </Modal>
  )
}
