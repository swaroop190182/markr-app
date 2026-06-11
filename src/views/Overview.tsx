import { useState, useEffect } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader } from '../components/ui'
import { callClaude } from '../lib/claude'
import DeliverySettings from './DeliverySettings'


function pickBiggestLever(dimensions: any[]) {
  const signalPoints: Record<string, number> = {
    'Clarity': 2, 'User Journey': 2, 'Emotional Pull': 3, 'Trust': 3, 'Conversion Readiness': 2
  }
  const ranked = dimensions
    .filter(d => d.score < 10)
    .map(d => {
      const cap = d.label === 'Clarity' ? 7 : 10
      const recoverable = Math.min(signalPoints[d.label] ?? 2, cap - d.score)
      return { name: d.label, score: d.score, recoverable, cap }
    })
    .filter(d => d.recoverable > 0)
    .sort((a, b) => b.recoverable - a.recoverable)
  return ranked[0] ?? null
}

function validateRecs(recs: any): boolean {
  const wc = (s: string) => s.trim().split(/\s+/).length
  const ctaOk = wc(recs.cta_rewrite) <= 6
  const headlinesOk = Array.isArray(recs.headline_rewrites) &&
    recs.headline_rewrites.every((h: any) => wc(h.text) <= 12)
  return ctaOk && headlinesOk
}

function getDimFix(label: string, score: number): string {
  const low = score < 5, mid = score < 8
  const fixes: Record<string, [string, string, string]> = {
    'Clarity':              ['Rewrite H1 to answer what will I achieve in one sentence. Remove jargon.', 'Add a specific outcome with a number — Save 2hrs/week beats save time.', 'Strong clarity. Keep headline tight across all pages.'],
    'User Journey':         ['Add one primary CTA above the fold. Remove competing links.', 'Replace Sign Up with outcome-driven text like Get my free analysis.', 'Clear journey. Add What happens next strip under hero.'],
    'Emotional Pull':       ['Flip every we/our to you/your. Lead with pain not solution.', 'Add urgency — Every week without strategy is growth you cannot recover.', 'Strong emotion. Add a specific number to anchor it.'],
    'Trust':                ['Add 1 real quote — even a WhatsApp screenshot converts better than polished testimonials.', 'Add founder story — Built by name who faced this exact problem.', 'Trust is solid. Add specific numbers: 47 founders beats many founders.'],
    'Conversion Readiness': ['Add Free to start or pricing above the fold — visitors cannot decide without knowing the cost.', 'Repeat CTA after each section — after problem, after solution, after testimonials.', 'Strong conversion. Test a URL-specific CTA: Analyze AppName free.'],
  }
  const f = fixes[label]
  if (!f) return ''
  return low ? f[0] : mid ? f[1] : f[2]
}

export default function Overview({ onAddApp }: { onAddApp?: () => void }) {
  const { apps, currentApp, setView, plan, updateApp } = useStore()
  const [insight,    setInsight]    = useState<string | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [uaLoading,    setUaLoading]    = useState(false)
  const [compLoading,       setCompLoading]       = useState(false)
  const [compStatus,        setCompStatus]        = useState<string | null>(null)
  const [compError,         setCompError]         = useState<string | null>(null)
  const [compChangeMode,    setCompChangeMode]    = useState(false)
  const [compChangeUrl,     setCompChangeUrl]     = useState('')
  const [compChangeLoading, setCompChangeLoading] = useState(false)
  const [compChangeError,   setCompChangeError]   = useState<string | null>(null)
  const [aiRecLoading,      setAiRecLoading]      = useState(false)
  const [aiRecError,        setAiRecError]        = useState<string | null>(null)
  const [pillarsLoading,       setPillarsLoading]       = useState(false)
  const [pillarsIdeaGenerating, setPillarsIdeaGenerating] = useState(false)
  const [collapsedPillars,     setCollapsedPillars]     = useState<Record<string, boolean>>({})
  const pt  = currentApp?.productTest
  const ua  = (currentApp as any)?.url_analysis
  const ca  = (currentApp as any)?.competitor_url_analysis
  const hasApps = apps.length > 0

  // Auto-fetch URL analysis if app has URL but no analysis
  useEffect(() => {
    if (!currentApp?.url || (currentApp as any)?.url_analysis) return
    setUaLoading(true)
    fetch('/api/analyze-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-call': 'markr_internal' },
      body: JSON.stringify({ url: currentApp.url })
    }).then(r => r.ok ? r.json() : null).then(async result => {
      if (result && !result.error) {
        // Save URL analysis
        updateApp(currentApp.id, {
          url_analysis: {
            overall: result.overall,
            headline: result.headline,
            category: result.category,
            dimensions: result.dimensions,
            bottleneck: result.bottleneck,
            growth_teaser: result.growth_teaser,
            pagesRead: result.pagesRead ?? [],
            closestCompetitor: result.closestCompetitor ?? null,
            analyzed_at: new Date().toISOString()
          }
        } as any)

        // Auto-generate score-improving pillars if none exist
        if (!currentApp.pillars?.length) {
          try {
            const dims = (result.dimensions ?? []).slice().sort((a: any, b: any) => a.score - b.score)
            const dimContext = dims.map((d: any) => `${d.label}: ${d.score}/10 — ${d.issue}`).join('\n')
            const raw = await callClaude(
              `Generate 6 Instagram content pillars for this app. Each pillar targets improving a weak area.

App: "${result.headline}"
URL: ${currentApp.url}

Landing page scores:
${dimContext}

Rules:
- Each pillar addresses a weak dimension specifically
- Names must be specific to what this app does, not generic
- 2-5 words each

Output exactly 6 pillar names, one per line, no bullets, no numbers.`,
              'Output ONLY 6 pillar names, one per line.', 300
            )
            const pillars = raw.split('\n').map((s: string) => s.trim()).filter(Boolean).slice(0, 6)
            if (pillars.length > 0) {
              updateApp(currentApp.id, { pillars } as any)
            }
          } catch { /* non-blocking */ }
        }
      }
    }).catch(() => {}).finally(() => setUaLoading(false))
  }, [currentApp?.id])

  // Reset local UI state when switching apps
  useEffect(() => {
    setCollapsedPillars({})
    setAiRecLoading(false)
    setAiRecError(null)
    setInsight(null)
    setLoading(false)
  }, [currentApp?.id])

  // Weekly pillar suggestions — generate once per 7 days, cache in Supabase
  useEffect(() => {
    if (!currentApp?.pillars?.length) return
    const saved   = currentApp.pillar_suggestions
    const savedAt = currentApp.pillar_suggestions_at
    const isFresh = !!saved && !!savedAt
      && (Date.now() - new Date(savedAt).getTime()) < 7 * 24 * 60 * 60 * 1000
    if (isFresh) return

    const headline    = (currentApp as any)?.url_analysis?.headline ?? currentApp.url
    const pillarNames = (currentApp.pillars ?? []).map((p: string) => p.replace(/\*/g, '').trim())

    setPillarsIdeaGenerating(true)
    callClaude(
      `For this app: "${headline}", generate 2 Instagram post ideas for each of these content pillars:\n${pillarNames.map((n: string) => `- ${n}`).join('\n')}\n\nReturn ONLY valid JSON where each key is the exact pillar name and the value is an array of 2 post idea strings. Example format:\n{"pillar name": ["post idea 1", "post idea 2"]}`,
      'Return ONLY valid JSON. Keys must be the exact pillar names provided. No markdown, no explanation.',
      1200
    ).then(raw => {
      try {
        const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (typeof parsed === 'object' && parsed !== null) {
          updateApp(currentApp.id, {
            pillar_suggestions:    parsed,
            pillar_suggestions_at: new Date().toISOString()
          })
        }
      } catch { /* malformed JSON — silently skip */ }
    }).catch(() => {}).finally(() => setPillarsIdeaGenerating(false))
  }, [currentApp?.id, currentApp?.pillars?.length])

  async function runCompetitorAnalysis() {
    setCompLoading(true)
    setCompError(null)
    setCompStatus('Finding competitor…')
    console.log('[competitor] start — url:', currentApp?.url, '| ua headline:', ua?.headline)

    const callAnalyze = (u: string) => fetch('/api/analyze-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-call': 'markr_internal' },
      body: JSON.stringify({ url: u })
    })

    const isValidUrl = (u?: string) => !!u && u.startsWith('https://') && u.includes('.')

    // Persist a successful analyze-url response and return true
    const trySave = async (r: Response, name: string, url: string): Promise<boolean> => {
      if (!r.ok) return false
      const result = await r.json().catch(() => null)
      if (!result || result.error) {
        console.log('[competitor] analyze-url returned error field:', result?.error)
        return false
      }
      updateApp(currentApp!.id, {
        competitor_url_analysis: {
          name, url,
          overall:    result.overall,
          headline:   result.headline,
          dimensions: result.dimensions,
          bottleneck: result.bottleneck,
          analyzed_at: new Date().toISOString()
        }
      } as any)
      console.log('[competitor] saved result for:', url)
      return true
    }

    try {
      // ── Step 1: resolve competitor name+url ────────────────────────────────────
      let topComp: { name: string; url: string } | null = ua?.closestCompetitor ?? null
      console.log('[competitor] step 1 — closestCompetitor from ua:', topComp)

      const askClaude = async (strict: boolean) => {
        const appDesc = ua?.headline || currentApp?.desc || currentApp?.name || ''
        const strictLine = strict
          ? '\nCRITICAL: url MUST start with "https://" and be a real working domain — no paths, no guesses.'
          : ''
        return callClaude(
          `Find the single closest direct competitor for this app.\nApp: "${appDesc}" (URL: ${currentApp?.url || ''})\nReturn ONLY JSON: {"name":"CompetitorName","url":"https://competitor.com"}${strictLine}`,
          'Output ONLY valid JSON with name (string) and url (string). No markdown.',
          150
        )
      }

      if (!isValidUrl(topComp?.url)) {
        setCompStatus('Identifying closest competitor…')
        const raw = await askClaude(false)
        try {
          topComp = JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim())
          console.log('[competitor] step 1b — Claude returned:', topComp)
        } catch (e) {
          console.log('[competitor] step 1b — JSON parse failed:', raw, e)
        }
      }

      // ── Step 2: validate URL — if bad, retry Claude once with stricter prompt ──
      if (!isValidUrl(topComp?.url)) {
        setCompStatus('Retrying competitor lookup…')
        console.log('[competitor] step 2 — URL invalid:', topComp?.url, '— strict retry')
        const raw2 = await askClaude(true)
        try {
          topComp = JSON.parse(raw2.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim())
          console.log('[competitor] step 2 retry — Claude returned:', topComp)
        } catch (e) {
          console.log('[competitor] step 2 retry — JSON parse failed:', raw2, e)
        }
      }

      if (!isValidUrl(topComp?.url)) {
        console.log('[competitor] no valid URL after both Claude attempts')
        setCompError('Could not identify a valid competitor URL — try running Competitive Analysis in Insights first.')
        setCompLoading(false); setCompStatus(null)
        return
      }

      // ── Step 3a: analyze original competitor URL ───────────────────────────────
      const comp = topComp!
      setCompStatus(`Analyzing ${comp.name}…`)
      console.log('[competitor] step 3a — analyze:', comp.url)
      let r = await callAnalyze(comp.url)
      if (await trySave(r, comp.name, comp.url)) { setCompLoading(false); setCompStatus(null); return }

      // ── Step 3b: 422 with path → strip to base domain ─────────────────────────
      if (r.status === 422) {
        const err3a = await r.json().catch(() => ({}))
        console.log('[competitor] step 3a — 422:', err3a.error ?? err3a.message ?? err3a)
        try {
          const parsed = new URL(comp.url)
          if (parsed.pathname.replace(/\/$/, '') !== '') {
            const base = parsed.origin
            setCompStatus('Retrying with base domain…')
            console.log('[competitor] step 3b — base domain retry:', base)
            r = await callAnalyze(base)
            if (await trySave(r, comp.name, base)) { setCompLoading(false); setCompStatus(null); return }
            if (r.status === 422) {
              const err3b = await r.json().catch(() => ({}))
              console.log('[competitor] step 3b — base domain 422:', err3b.error ?? err3b.message ?? err3b)
            }
          }
        } catch (e) { console.log('[competitor] step 3b — URL parse error:', e) }
      }

      // ── Step 3c: try a URL from competitive_analysis cache ────────────────────
      const caText = (currentApp as any).competitive_analysis as string | null | undefined
      if (caText) {
        const urlMatches = caText.match(/https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s)"'>]*)?/g) ?? []
        const myHost = (() => { try { return new URL(currentApp!.url).hostname } catch { return '' } })()
        const altUrl = urlMatches.find(u => {
          try { return new URL(u).hostname !== myHost } catch { return false }
        })
        if (altUrl) {
          setCompStatus('Trying alternate competitor…')
          console.log('[competitor] step 3c — from competitive_analysis cache:', altUrl)
          r = await callAnalyze(altUrl)
          const altHost = (() => { try { return new URL(altUrl).hostname } catch { return altUrl } })()
          if (await trySave(r, altHost, altUrl)) { setCompLoading(false); setCompStatus(null); return }
          if (r.status === 422) {
            try {
              const altBase = new URL(altUrl).origin
              r = await callAnalyze(altBase)
              if (await trySave(r, altHost, altBase)) { setCompLoading(false); setCompStatus(null); return }
            } catch {}
          }
          console.log('[competitor] step 3c — alternate also failed:', r.status)
        }
      }

      // ── All tries exhausted ────────────────────────────────────────────────────
      console.log('[competitor] all tries exhausted')
      setCompError('Could not analyze any competitor site — try running Competitive Analysis in Insights first to seed the cache.')
    } catch (e) {
      console.log('[competitor] unexpected error:', e)
      setCompError('An unexpected error occurred — check the console for details.')
    }
    setCompLoading(false)
    setCompStatus(null)
  }

  async function submitCompChange() {
    const url = compChangeUrl.trim()
    if (!url) return
    const normalized = url.startsWith('http') ? url : `https://${url}`
    setCompChangeLoading(true)
    setCompChangeError(null)
    console.log('[comp-change] analyzing custom URL:', normalized)
    try {
      const r = await fetch('/api/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-call': 'markr_internal' },
        body: JSON.stringify({ url: normalized })
      })
      if (r.ok) {
        const result = await r.json()
        if (result.error) {
          setCompChangeError(`Analysis failed: ${result.error}`)
        } else {
          const hostname = (() => { try { return new URL(normalized).hostname.replace(/^www\./, '') } catch { return normalized } })()
          updateApp(currentApp!.id, {
            competitor_url_analysis: {
              name:       hostname,
              url:        normalized,
              overall:    result.overall,
              headline:   result.headline,
              dimensions: result.dimensions,
              bottleneck: result.bottleneck,
              analyzed_at: new Date().toISOString()
            }
          } as any)
          setCompChangeMode(false)
          setCompChangeUrl('')
          console.log('[comp-change] saved:', normalized)
        }
      } else if (r.status === 422) {
        const body = await r.json().catch(() => ({}))
        const msg = body.error ?? body.message ?? 'Page could not be scraped'
        console.log('[comp-change] 422:', msg)
        setCompChangeError(`Could not analyze that URL — ${msg}`)
      } else {
        console.log('[comp-change] HTTP error:', r.status)
        setCompChangeError(`Request failed (HTTP ${r.status}) — check the URL and try again`)
      }
    } catch (e) {
      console.log('[comp-change] unexpected error:', e)
      setCompChangeError('Unexpected error — check the console')
    }
    setCompChangeLoading(false)
  }

  async function generateAiRecommendations() {
    if (!ua) return
    setAiRecLoading(true)
    setAiRecError(null)
    try {
      const lever = pickBiggestLever(ua.dimensions ?? [])
      const dimContext  = (ua.dimensions ?? []).map((d: any) => `${d.label} — ${d.score}/10 — ${d.issue}`).join('\n')
      const currentCta  = (ua as any).scraped?.btns?.[0] || 'unknown'
      const pagesRead   = (ua.pagesRead ?? []).join(', ') || 'homepage'
      const leverLine   = lever
        ? `THE BIGGEST LEVER IS PRE-DETERMINED: ${lever.name} (recovers ~${lever.recoverable} pts on this dimension, lifting overall by ~${(lever.recoverable / 5).toFixed(1)} pts)`
        : 'Focus on the lowest-scoring dimension.'

      const prompt = `You are a senior conversion copywriter. Write specific, usable copy and fixes — do not restate the diagnosis.

PRODUCT CONTEXT
App name: ${currentApp.name}
What it does: ${currentApp.desc || ua.headline}
URL: ${currentApp.url}
Current headline: "${ua.headline}"
Current primary CTA: "${currentCta}"
Pages analyzed: ${pagesRead}

DIAGNOSTIC (do NOT repeat these — give only solutions)
${dimContext}
Overall: ${ua.overall}/10

${leverLine}

RULES
- Be specific to THIS product and audience. No generic filler.
- headline_rewrites: exactly 3 options, MAX 12 words each, must LEAD with a concrete hook — a number, timeframe, or specific result.
  Bad: "Nourish your child's growth" Good: "Plan a week of toddler meals in 10 minutes"
- cta_rewrite: HARD LIMIT 6 words. Must name what the user gets.
  Bad: "Give Your Child Wholesome Nutrition" Good: "Get my first meal plan"
- priority_fixes: 3 fixes with exact how — include a specific example tailored to this app
  Bad: "Add testimonials" Good: "Add 2-3 quotes with name and result e.g. 'My toddler eats vegetables now — Priya, Mumbai'"
- biggest_lever_explanation: ONE sentence on why fixing ${lever?.name ?? 'the top dimension'} matters and what specifically to do
- NEVER invent statistics. Only use numbers from the page content.

Return ONLY this JSON, no markdown:
{"headline_rewrites":[{"text":"...","angle":"benefit"},{"text":"...","angle":"outcome"},{"text":"...","angle":"specificity"}],"cta_rewrite":"...","priority_fixes":[{"fix":"...","how":"exact step with example tailored to this app"},{"fix":"...","how":"..."},{"fix":"...","how":"..."}],"biggest_lever_explanation":"..."}`

      const sys = 'Return ONLY valid JSON. No markdown, no explanation.'
      const parseRaw = (raw: string) => JSON.parse(raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim())

      let parsed: any = parseRaw(await callClaude(prompt, sys, 900))

      if (!validateRecs(parsed)) {
        try {
          parsed = parseRaw(await callClaude(
            prompt + '\n\nYour previous CTA or headline exceeded word limits. Regenerate strictly within limits.',
            sys, 900
          ))
        } catch {}
        // hard fallback: truncate CTA to 6 words
        if (parsed?.cta_rewrite && !validateRecs(parsed)) {
          parsed.cta_rewrite = parsed.cta_rewrite.trim().split(/\s+/).slice(0, 6).join(' ')
        }
      }

      updateApp(currentApp!.id, {
        ai_recommendations:    { ...parsed, lever: lever ?? undefined },
        ai_recommendations_at: new Date().toISOString()
      })
    } catch {
      setAiRecError('Failed to generate recommendations — try again')
    }
    setAiRecLoading(false)
  }

  async function generateInsight() {
    setLoading(true); setInsight('')
    await callClaude(
      `Give a sharp 2-sentence marketing insight for "${currentApp.name}" (${currentApp.category}, ${currentApp.stage}). Which channel is most underused and what content type drives the most organic growth right now? Be specific.`,
      undefined, 400,
      chunk => setInsight(prev => (prev ?? '') + chunk)
    )
    setLoading(false)
  }

  // ── EMPTY STATE — no apps yet ────────────────────────────────────────────────
  if (!hasApps) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'70vh', textAlign:'center', padding:'40px 24px' }}>
        {/* Pulsing icon */}
        <div style={{ position:'relative', marginBottom:32 }}>
          <div style={{ width:72, height:72, borderRadius:20, background:'linear-gradient(135deg,rgba(124,111,247,.2),rgba(226,111,175,.15))', border:'1px solid rgba(124,111,247,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto' }}>
            🚀
          </div>
          <div style={{ position:'absolute', inset:-4, borderRadius:24, border:'1px solid rgba(124,111,247,.2)', animation:'pulse 2s infinite' }} />
        </div>

        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:24, fontWeight:800, letterSpacing:'-.02em', margin:'0 0 12px', color:'var(--text)' }}>
          Welcome to Markr
        </h2>
        <p style={{ fontSize:15, color:'var(--text3)', maxWidth:420, lineHeight:1.7, margin:'0 0 32px' }}>
          You're 2 minutes away from your first insights. Add your app and Markr will analyze it, test it, and generate content, strategy, and growth recommendations.
        </p>

        {/* Steps */}
        <div style={{ display:'flex', gap:12, marginBottom:36, flexWrap:'wrap', justifyContent:'center' }}>
          {[
            { n:'1', label:'Paste your app URL', color:'#7c6ff7' },
            { n:'2', label:'AI analyzes & tests it', color:'#34c98a' },
            { n:'3', label:'Get content & insights', color:'#e26faf' },
          ].map(s => (
            <div key={s.n} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:20, background:'var(--surface2)', border:'1px solid var(--surface3)', fontSize:12 }}>
              <div style={{ width:20, height:20, borderRadius:'50%', background:s.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>{s.n}</div>
              <span style={{ color:'var(--text2)' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* CTA — pulsing to draw the eye */}
        <button
          className="gen-btn"
          style={{ fontSize:15, padding:'13px 32px', boxShadow:'0 0 32px rgba(124,111,247,.3)', animation:'glow 2s infinite alternate' }}
          onClick={() => onAddApp ? onAddApp() : document.getElementById('add-app-btn')?.click()}
        >
          <i className="ti ti-plus" style={{ fontSize:15 }} />
          Add your first app
        </button>
        <div style={{ fontSize:12, color:'var(--text3)', marginTop:12 }}>Takes about 2 minutes</div>

        <style>{`
          @keyframes pulse { 0%,100% { opacity:.4; transform:scale(1); } 50% { opacity:.8; transform:scale(1.04); } }
          @keyframes glow  { from { box-shadow:0 0 20px rgba(124,111,247,.3); } to { box-shadow:0 0 40px rgba(124,111,247,.55); } }
        `}</style>
      </div>
    )
  }

  // ── NORMAL OVERVIEW ──────────────────────────────────────────────────────────
  return (
    <div>
      {/* Real metrics — no fake data */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:22 }}>
        {[
          { label:'Your Apps',      value: String(apps.length),  change: plan==='pro'?'Pro — unlimited':'Free — 1 app', c: plan==='pro'?'var(--green)':'var(--accent2)' },
          { label:'Content Pillars', value: String(currentApp.pillars?.length ?? 0), change:`for ${currentApp.name}`, c:'var(--text3)' },
          { label:'Plan',           value: plan==='pro'?'Pro':'Free', change: plan==='pro'?'All features unlocked':'7-day trial', c: plan==='pro'?'var(--green)':'var(--amber)' },
          { label:'AI Readiness Assessment', value: currentApp.productTest && !currentApp.productTest.error ? `${Math.min(100, (currentApp.productTest as any).score ?? currentApp.productTest.overall_score ?? 0)}/100` : '—', change: currentApp.productTest && !currentApp.productTest.error ? ((currentApp.productTest as any).verdict ?? '') : 'Not run yet', c: currentApp.productTest && !currentApp.productTest.error ? 'var(--green)' : 'var(--text3)' },
        ].map(m => (
          <div key={m.label} className="card">
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>{m.label}</div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:700 }}>{m.value}</div>
            <div style={{ fontSize:11, color:m.c, marginTop:4 }}>{m.change}</div>
          </div>
        ))}
      </div>

      {/* AI Insight banner */}
      <div className="banner" style={{ cursor:'pointer', marginBottom:14 }}>
        <span style={{ fontSize:16, color:'var(--accent2)', flexShrink:0 }}>✦</span>
        <div style={{ flex:1, fontSize:12, lineHeight:1.5 }}>
          {loading
            ? <><span className="spinner" style={{ color:'var(--accent2)' }} />{' '}<em style={{ color:'var(--text3)' }}>Analyzing…</em></>
            : insight || <>Click <strong style={{ color:'var(--accent2)' }}>AI Insight</strong> for a live analysis of <strong>{currentApp.name}</strong></>
          }
        </div>
        <button id="ai-insight-btn" className="gen-btn" style={{ fontSize:11, padding:'6px 12px', flexShrink:0 }} onClick={generateInsight}>
          AI Insight
        </button>
      </div>

      {/* QA banner */}
      {pt && !pt.error && (
        <div style={{ background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.25)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
          <span>🧪</span>
          <div style={{ flex:1, fontSize:12 }}>
            <strong style={{ color:'var(--green)' }}>AI Readiness Assessment active</strong>
            {' '}— Score: {Math.min(100, (pt as any).score ?? pt.overall_score ?? 0)}/100
            {(pt as any).verdict ? ` · ${(pt as any).verdict}` : ''}
            {(pt.features_found??[]).length > 0 && (
              <span style={{ color:'var(--text3)', marginLeft:8 }}>Features: {(pt.features_found??[]).map((f:any)=>f.name).join(', ')}</span>
            )}
          </div>
          <button className="vbtn" onClick={() => setView('insights')}>View QA report</button>
        </div>
      )}

            {/* First-time hint — app added but nothing generated yet */}
      {apps.length > 0 && !currentApp.analyzed && (
        <div style={{ background:'rgba(124,111,247,.06)', border:'1px solid rgba(124,111,247,.25)', borderRadius:'var(--r)', padding:'14px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:20 }}>👆</span>
          <div style={{ flex:1, fontSize:12, lineHeight:1.6 }}>
            <strong style={{ color:'var(--accent2)' }}>{currentApp.name} is ready.</strong> Head to <strong>Content Studio</strong> to generate your first posts, or <strong>Insights & Analysis</strong> for competitive intelligence and growth strategies.
          </div>
          <button className="gen-btn" style={{ fontSize:11, padding:'6px 12px', flexShrink:0 }} onClick={() => setView('studio')}>
            Generate posts →
          </button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

        {/* Landing Page Analysis — left column */}
        <Card>
          <CardHeader title="Landing Page Analysis" action={
            ua ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:700,
              background: ua.overall >= 7 ? 'rgba(22,168,112,.1)' : ua.overall >= 5 ? 'rgba(212,138,10,.1)' : 'rgba(220,38,38,.1)',
              color: ua.overall >= 7 ? 'var(--green)' : ua.overall >= 5 ? 'var(--amber)' : 'var(--red)'
            }}>{ua.overall}/10</span> : undefined
          } />
          {ua ? (
            <>
              {/* Score bars with specific fixes */}
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
                {(ua.dimensions ?? []).map((d: any) => {
                  const c = d.score >= 7 ? 'var(--green)' : d.score >= 5 ? 'var(--amber)' : 'var(--red)'
                  const fixes = getDimFix(d.label, d.score)
                  return (
                    <div key={d.label} style={{ paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{d.label}</span>
                        <span style={{ fontSize:12, fontWeight:700, color:c }}>{d.score}/10</span>
                      </div>
                      <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden', marginBottom:5 }}>
                        <div style={{ height:'100%', width:`${d.score*10}%`, background:c, borderRadius:3 }} />
                      </div>
                      <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5 }}>{d.issue}</div>
                      {d.score < 8 && (
                        <div style={{ fontSize:11, color:c, lineHeight:1.5, marginTop:3, paddingLeft:8, borderLeft:`2px solid ${c}` }}>
                          {fixes[d.label] ?? ''}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Priority fixes */}
              {(() => {
                const sorted = [...(ua.dimensions ?? [])].sort((a:any,b:any) => a.score - b.score).slice(0,3)
                return (
                  <div style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'10px 12px', marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', marginBottom:8 }}>🎯 Top 3 Priority Fixes</div>
                    {sorted.map((d:any, i:number) => (
                      <div key={d.label} style={{ display:'flex', gap:8, marginBottom:i<2 ? 6 : 0 }}>
                        <div style={{ width:18, height:18, borderRadius:'50%', background: i===0 ? 'var(--red)' : i===1 ? 'var(--amber)' : 'var(--accent)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>{i+1}</div>
                        <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.5 }}><strong>{d.label}</strong> ({d.score}/10) — {d.issue}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Growth opportunity */}
              {ua.growth_teaser && (
                <div style={{ fontSize:11, padding:'8px 10px', background:'rgba(124,111,247,.05)', border:'1px solid rgba(124,111,247,.15)', borderRadius:'var(--r)', color:'var(--text)', marginBottom:10, lineHeight:1.6 }}>
                  <span style={{ color:'var(--accent)', fontWeight:700 }}>💡 </span>{ua.growth_teaser}
                </div>
              )}

              {/* AI Recommendations */}
              {(plan === 'pro' || plan === 'guest_pro' || plan === 'analysis') ? (() => {
                const rec = currentApp.ai_recommendations   // read directly — never from local state
                const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => {})
                return (
                  <div style={{ borderTop:'1px solid var(--border)', paddingTop:14, marginTop:4, marginBottom:4 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: rec ? 12 : 8 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>✨ AI Recommendations</div>
                      {rec && (
                        <button
                          onClick={async () => {
                            await updateApp(currentApp!.id, { ai_recommendations: null, ai_recommendations_at: null })
                            generateAiRecommendations()
                          }}
                          disabled={aiRecLoading}
                          style={{ fontSize:10, color:'var(--text3)', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                          {aiRecLoading ? <span className="spinner" style={{ fontSize:10, color:'var(--accent)' }} /> : '🔄 Refresh'}
                        </button>
                      )}
                    </div>

                    {rec ? (
                      <>
                        {/* Headline rewrites — 3 angles */}
                        <div style={{ marginBottom:10 }}>
                          <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, marginBottom:6, textTransform:'uppercase' as const, letterSpacing:'.04em' }}>Headline options</div>
                          {(rec.headline_rewrites ?? []).map((h: { text: string; angle: string }, i: number) => (
                            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:6 }}>
                              <div style={{ flex:1, padding:'6px 8px', background:'var(--surface2)', borderRadius:'var(--r)' }}>
                                <div style={{ fontSize:9, color:'var(--accent)', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom:2 }}>{h.angle}</div>
                                <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.5 }}>{h.text}</div>
                              </div>
                              <button onClick={() => copy(h.text)} style={{ fontSize:14, background:'none', border:'none', cursor:'pointer', padding:'4px', flexShrink:0, color:'var(--text3)', marginTop:4 }} title="Copy">📋</button>
                            </div>
                          ))}
                        </div>

                        {/* CTA rewrite */}
                        <div style={{ marginBottom:10 }}>
                          <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, marginBottom:4, textTransform:'uppercase' as const, letterSpacing:'.04em' }}>CTA rewrite</div>
                          <div style={{ display:'flex', alignItems:'flex-start', gap:6 }}>
                            <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.5, flex:1, padding:'6px 8px', background:'var(--surface2)', borderRadius:'var(--r)' }}>
                              {rec.cta_rewrite}
                            </div>
                            <button onClick={() => copy(rec.cta_rewrite)} style={{ fontSize:14, background:'none', border:'none', cursor:'pointer', padding:'4px', flexShrink:0, color:'var(--text3)' }} title="Copy">📋</button>
                          </div>
                        </div>

                        {/* Priority fixes with how-to */}
                        <div style={{ marginBottom:10 }}>
                          <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, marginBottom:6, textTransform:'uppercase' as const, letterSpacing:'.04em' }}>Priority fixes</div>
                          {(rec.priority_fixes ?? []).map((item: { fix: string; how: string }, i: number) => (
                            <div key={i} style={{ display:'flex', gap:8, marginBottom:8 }}>
                              <div style={{ width:18, height:18, borderRadius:'50%', background: i===0 ? 'var(--red)' : i===1 ? 'var(--amber)' : 'var(--accent)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>{i+1}</div>
                              <div>
                                <div style={{ fontSize:11, color:'var(--text)', fontWeight:600, lineHeight:1.4, marginBottom:2 }}>{item.fix}</div>
                                <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5 }}>{item.how}</div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Biggest lever */}
                        {rec.biggest_lever_explanation && (
                          <div style={{ padding:'8px 10px', background:'rgba(22,168,112,.06)', border:'1px solid rgba(22,168,112,.2)', borderRadius:'var(--r)' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                              <div style={{ fontSize:10, color:'var(--green)', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'.04em' }}>Biggest lever</div>
                              {rec.lever && (
                                <div style={{ fontSize:10, color:'var(--green)', fontWeight:700, fontVariantNumeric:'tabular-nums' as const }}>
                                  {rec.lever.name}: {rec.lever.score} → {rec.lever.score + rec.lever.recoverable} (+{(rec.lever.recoverable / 5).toFixed(1)} overall)
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.5 }}>{rec.biggest_lever_explanation}</div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          className="gen-btn"
                          style={{ width:'100%', justifyContent:'center', fontSize:12 }}
                          disabled={aiRecLoading}
                          onClick={generateAiRecommendations}>
                          {aiRecLoading
                            ? <><span className="spinner" style={{ color:'var(--accent)' }} /> Generating recommendations…</>
                            : <><i className="ti ti-sparkles" style={{ fontSize:13 }} /> Get AI recommendations →</>}
                        </button>
                        {aiRecError && (
                          <div style={{ marginTop:6, fontSize:11, color:'#e55' }}>{aiRecError}</div>
                        )}
                      </>
                    )}
                  </div>
                )
              })() : (
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:14, marginTop:4, marginBottom:4, padding:'12px', background:'var(--surface2)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text3)', marginBottom:4 }}>✨ AI Recommendations</div>
                  <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5 }}>
                    Upgrade to Analysis Pack or Pro to get specific copy rewrites and priority fixes tailored to your landing page score.
                  </div>
                </div>
              )}

              {/* Competitor comparison */}
              {ca ? (
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:14, marginTop:4 }}>
                  {/* Header */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>vs {ca.name}</div>
                      <div style={{ fontSize:10, color:'var(--text3)' }}>{ca.url?.replace(/^https?:\/\//,'')}</div>
                    </div>
                    <div style={{ display:'flex', gap:16, textAlign:'center' as const }}>
                      <div>
                        <div style={{ fontSize:10, color:'var(--accent)', fontWeight:700, marginBottom:2 }}>YOU</div>
                        <div style={{ fontSize:20, fontWeight:800, color: ua.overall >= ca.overall ? 'var(--green)' : 'var(--red)' }}>{ua.overall}</div>
                      </div>
                      <div style={{ fontSize:20, color:'var(--text3)', paddingTop:18 }}>vs</div>
                      <div>
                        <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, marginBottom:2 }}>{ca.name.split(' ')[0].toUpperCase()}</div>
                        <div style={{ fontSize:20, fontWeight:800, color:'var(--text2)' }}>{ca.overall}</div>
                      </div>
                    </div>
                  </div>

                  {/* Dimension comparison */}
                  {(ua.dimensions ?? []).map((d: any) => {
                    const comp = ca.dimensions?.find((cd: any) => cd.label === d.label)
                    const cs = comp?.score ?? 0
                    const diff = d.score - cs
                    const youC = d.score >= 7 ? 'var(--green)' : d.score >= 5 ? 'var(--amber)' : 'var(--red)'
                    const compC = cs >= 7 ? 'var(--green)' : cs >= 5 ? 'var(--amber)' : 'var(--red)'
                    return (
                      <div key={d.label} style={{ marginBottom:10 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                          <span style={{ fontSize:11, fontWeight:600, color:'var(--text)', flex:1 }}>{d.label}</span>
                          <span style={{ fontSize:11, fontWeight:700, color:youC }}>{d.score}</span>
                          <span style={{ fontSize:10, color:'var(--text3)' }}>vs</span>
                          <span style={{ fontSize:11, fontWeight:700, color:compC }}>{cs}</span>
                          <span style={{ fontSize:10, fontWeight:700, minWidth:24, textAlign:'right' as const, color: diff > 0 ? 'var(--green)' : diff < -1 ? 'var(--red)' : 'var(--text3)' }}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </div>
                        {/* Dual bar */}
                        <div style={{ display:'flex', gap:2, height:5 }}>
                          <div style={{ flex:1, borderRadius:3, overflow:'hidden', background:'var(--surface2)' }}>
                            <div style={{ height:'100%', width:`${d.score*10}%`, background:youC, borderRadius:3 }} />
                          </div>
                          <div style={{ flex:1, borderRadius:3, overflow:'hidden', background:'var(--surface2)' }}>
                            <div style={{ height:'100%', width:`${cs*10}%`, background:compC, borderRadius:3 }} />
                          </div>
                        </div>
                        {/* Gap insight */}
                        {diff < -1 && comp?.issue && (
                          <div style={{ fontSize:10, color:'var(--red)', marginTop:3, lineHeight:1.4 }}>
                            They win: {comp.issue}
                          </div>
                        )}
                        {diff > 1 && (
                          <div style={{ fontSize:10, color:'var(--green)', marginTop:3, lineHeight:1.4 }}>
                            You win: {d.issue}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Verdict */}
                  {(() => {
                    const gaps = (ua.dimensions??[]).filter((d:any) => {
                      const cs = ca.dimensions?.find((cd:any)=>cd.label===d.label)?.score??0
                      return cs - d.score > 1
                    }).length
                    const wins = (ua.dimensions??[]).filter((d:any) => {
                      const cs = ca.dimensions?.find((cd:any)=>cd.label===d.label)?.score??0
                      return d.score - cs > 1
                    }).length
                    return (
                      <div style={{ marginTop:10, padding:'8px 10px', borderRadius:'var(--r)', fontSize:11, lineHeight:1.6,
                        background: wins >= gaps ? 'rgba(22,168,112,.06)' : 'rgba(220,38,38,.06)',
                        border: `1px solid ${wins >= gaps ? 'rgba(22,168,112,.2)' : 'rgba(220,38,38,.15)'}`,
                        color:'var(--text)'
                      }}>
                        {wins >= gaps
                          ? `You lead on ${wins} of 5 dimensions vs ${ca.name}. Focus on closing the ${gaps} gaps to dominate your category.`
                          : `${ca.name} leads on ${gaps} of 5 dimensions. Fix your top gaps to compete effectively.`
                        }
                      </div>
                    )
                  })()}

                  {/* Change competitor */}
                  {compChangeMode ? (
                    <div style={{ marginTop:12 }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <input
                          type="url"
                          placeholder="https://competitor.com"
                          value={compChangeUrl}
                          onChange={e => { setCompChangeUrl(e.target.value); setCompChangeError(null) }}
                          onKeyDown={async e => { if (e.key === 'Enter') await submitCompChange() }}
                          style={{ flex:1, fontSize:11, padding:'5px 8px', borderRadius:'var(--r)', border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', outline:'none' }}
                          autoFocus
                        />
                        <button
                          className="vbtn"
                          style={{ fontSize:11, padding:'5px 10px', flexShrink:0 }}
                          disabled={compChangeLoading || !compChangeUrl.trim()}
                          onClick={submitCompChange}>
                          {compChangeLoading ? <span className="spinner" style={{ color:'var(--accent)' }} /> : 'Analyze'}
                        </button>
                        <button
                          className="vbtn"
                          style={{ fontSize:11, padding:'5px 8px', flexShrink:0, opacity:.6 }}
                          onClick={() => { setCompChangeMode(false); setCompChangeUrl(''); setCompChangeError(null) }}>
                          ✕
                        </button>
                      </div>
                      {compChangeError && (
                        <div style={{ marginTop:6, fontSize:11, color:'#e55', lineHeight:1.4 }}>{compChangeError}</div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setCompChangeMode(true)}
                      style={{ marginTop:10, fontSize:10, color:'var(--text3)', background:'none', border:'none', cursor:'pointer', padding:0, textDecoration:'underline', textDecorationStyle:'dotted' as const }}>
                      Not your competitor? Change it
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <button className="vbtn" style={{ width:'100%', justifyContent:'center', fontSize:11, marginTop:8 }}
                    onClick={runCompetitorAnalysis} disabled={compLoading}>
                    {compLoading
                      ? <><span className="spinner" style={{ color:'var(--accent)' }} /> {compStatus ?? 'Finding competitor…'}</>
                      : '⚔ Compare with closest competitor →'}
                  </button>
                  {compError && (
                    <div style={{ marginTop:8, fontSize:11, color:'#e55', padding:'6px 10px', background:'rgba(220,38,38,.08)', borderRadius:6, border:'1px solid rgba(220,38,38,.2)', lineHeight:1.5 }}>
                      {compError}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div style={{ padding:'20px 0', textAlign:'center' as const }}>
              {uaLoading ? (
                <>
                  <span className="spinner" style={{ color:'var(--accent)' }} />
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:8 }}>Analyzing your landing page…</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:12, color:'var(--text3)', marginBottom:10 }}>
                    {currentApp?.url ? 'Analysis will appear shortly' : 'Add a URL to your app to get landing page analysis'}
                  </div>
                  {currentApp?.url && (
                    <button className="vbtn" onClick={() => {
                      setUaLoading(true)
                      fetch('/api/analyze-url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-internal-call': 'markr_internal' },
                        body: JSON.stringify({ url: currentApp.url })
                      }).then(r => r.ok ? r.json() : null).then(result => {
                        if (result && !result.error) {
                          updateApp(currentApp.id, { url_analysis: { ...result, analyzed_at: new Date().toISOString() } } as any)
                        }
                      }).catch(() => {}).finally(() => setUaLoading(false))
                    }}>Analyze now →</button>
                  )}
                </>
              )}
            </div>
          )}
        </Card>

        {/* Content Pillars — right column */}
        <Card>
          <CardHeader title={`Content Pillars · ${currentApp.name}`} />
          {(currentApp.pillars ?? []).length > 0 ? (
            <>
              {(currentApp.pillars ?? []).map((p, i) => {
                const pillarName  = p.replace(/\*/g, '').trim()
                const isCollapsed = !!collapsedPillars[pillarName]
                const ideas       = currentApp.pillar_suggestions?.[pillarName]
                const dotColor    = ['#7c6ff7','#34c98a','#4f9cf7','#f5a623','#e26faf','#e55555'][i%6]
                return (
                  <div key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                    <div
                      onClick={() => setCollapsedPillars(prev => ({ ...prev, [pillarName]: !prev[pillarName] }))}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', cursor:'pointer', userSelect:'none' as const }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:dotColor }} />
                      <span style={{ fontSize:12, flex:1 }}>{pillarName}</span>
                      <span style={{ fontSize:10, color:'var(--text3)' }}>{isCollapsed ? '▼' : '▲'}</span>
                    </div>
                    {!isCollapsed && (
                      <div style={{ paddingBottom:10, paddingLeft:16 }}>
                        {pillarsIdeaGenerating && !ideas ? (
                          <div style={{ fontSize:11, color:'var(--text3)', display:'flex', alignItems:'center', gap:6 }}>
                            <span className="spinner" style={{ fontSize:10, color:'var(--accent)' }} />
                            Generating ideas…
                          </div>
                        ) : ideas && ideas.length > 0 ? (
                          <ul style={{ margin:0, padding:0, listStyle:'none' }}>
                            {ideas.map((idea: string, j: number) => (
                              <li key={j} style={{ fontSize:11, color:'var(--text2)', lineHeight:1.6, paddingBottom:4, paddingLeft:10, position:'relative' as const }}>
                                <span style={{ position:'absolute' as const, left:0, color:dotColor }}>›</span>
                                {idea}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div style={{ fontSize:11, color:'var(--text3)' }}>No ideas yet.</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ marginTop:10, fontSize:11, color:'var(--text3)', lineHeight:1.6 }}>
                These are the strategic themes your content rotates through daily. Each post is tagged to a pillar.
              </div>
              <button className="vbtn" style={{ marginTop:8, fontSize:11 }} onClick={() => setView('strategy')}>
                Edit pillars →
              </button>
            </>
          ) : pillarsLoading ? (
            <div style={{ padding:'20px 0', textAlign:'center' as const }}>
              <span className="spinner" style={{ color:'var(--accent)' }} />
              <div style={{ fontSize:12, color:'var(--text3)', marginTop:8 }}>Generating content pillars…</div>
            </div>
          ) : (
            <div style={{ padding:'8px 0' }}>
              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.7, marginBottom:12 }}>
                <strong>Content pillars</strong> are the 5-6 strategic themes your Instagram content rotates through — keeping your feed focused, consistent, and algorithmically strong.
              </div>
              {ua ? (
                <>
                  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10, padding:'8px 10px', background:'var(--surface2)', borderRadius:'var(--r)', lineHeight:1.6 }}>
                    Based on your app: <strong>{ua.headline}</strong>
                    <br/>Suggested themes: {ua.growth_teaser ? ua.growth_teaser.split('.')[0] : 'emotional wellness, mindfulness, stress relief'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--accent)', fontWeight:600, marginBottom:6 }}>
                    💡 Pillars will target your weakest dimensions to improve your scores
                  </div>
                  {(ua.dimensions ?? []).slice().sort((a:any,b:any) => a.score - b.score).slice(0,3).map((d:any) => (
                    <div key={d.label} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, fontSize:11, color:'var(--text2)' }}>
                      <span style={{ color: d.score < 5 ? 'var(--red)' : 'var(--amber)', fontWeight:700 }}>{d.score}/10</span>
                      <span>{d.label} → content to improve this</span>
                    </div>
                  ))}
                  <button className="gen-btn" style={{ width:'100%', justifyContent:'center', fontSize:12, marginTop:8 }}
                    onClick={async () => {
                      setPillarsLoading(true)
                      try {
                        const dims = (ua.dimensions ?? []).slice().sort((a:any,b:any) => a.score - b.score)
                        const dimContext = dims.map((d:any) => `${d.label}: ${d.score}/10 — ${d.issue}`).join('\n')
                        const raw = await callClaude(
                          `Generate 6 Instagram content pillars for this app. Each pillar should target improving a weak area identified in the landing page analysis.

App: "${ua.headline}"
App URL: ${currentApp.url}

Landing page scores (lower = needs more content focus):
${dimContext}

Rules:
- Name each pillar to address the weak dimension (e.g. Trust 2/10 → "Real User Results")
- Make pillar names specific to what this app does, not generic
- Each pillar should produce content that improves the landing page score

Output exactly 6 pillar names, one per line, 2-5 words each, no bullets, no numbers, no explanations.`,
                          'Output ONLY the 6 pillar names, one per line.', 300
                        )
                        const pillars = raw.split('\n').map((s: string) => s.trim()).filter(Boolean).slice(0, 6)
                        if (pillars.length > 0) {
                          updateApp(currentApp.id, { pillars } as any)
                        }
                      } catch {}
                      setPillarsLoading(false)
                    }}>
                    <i className="ti ti-bolt" style={{ fontSize:13 }} /> Generate score-improving pillars →
                  </button>
                </>
              ) : (
                <button className="vbtn" style={{ width:'100%', justifyContent:'center', fontSize:11 }}
                  onClick={() => setView('strategy')}>
                  Go to Strategy to create pillars →
                </button>
              )}
            </div>
          )}


        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader title="Quick Actions" />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
          {[
            { icon:'✍️', label:'Generate content', view:'studio'   as const },
            { icon:'💡', label:'Build strategy',   view:'strategy' as const },
            { icon:'🔍', label:'Run analysis',     view:'insights' as const },
            { icon:'📅', label:'View calendar',    view:'calendar' as const },
          ].map(a => (
            <button key={a.label} onClick={() => setView(a.view)}
              style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'14px 12px', cursor:'pointer', transition:'all .15s', fontFamily:"'DM Sans',sans-serif" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,247,.08)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface2)' }}
            >
              <div style={{ fontSize:22, marginBottom:8 }}>{a.icon}</div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text2)' }}>{a.label}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Delivery settings */}
      <Card style={{ marginTop:16 }}>
        <DeliverySettings />
      </Card>
    </div>
  )
}
