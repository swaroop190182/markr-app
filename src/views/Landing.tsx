import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ResultSummaryBlock from '../components/ResultSummaryBlock'

const D = "'Inter', sans-serif"
const B = "'Inter', sans-serif"

// Product Hunt launch page. If this is ever set back to a '[TODO…' string, the badge shows it and stops linking.
const PRODUCT_HUNT_URL = 'https://www.producthunt.com/products/markr-growth-intelligence-for-founders?launch=markr-growth-intelligence-for-founders'
const PH_TODO = PRODUCT_HUNT_URL.startsWith('[TODO')

// "Why Markr" comparison table — [feature, others, markr]
const COMPARISON_ROWS: [string, string, string][] = [
  ['Diagnoses your landing page across 5 dimensions', '✗ Generic scoring',      '✓ Evidence-based findings per dimension'],
  ['Reads your product screens',                      '✗ Homepage only',        '✓ Up to 6 labelled screenshots'],
  ['Measures against what you intend',                '✗ Generic benchmarks',   '✓ Your founder brief'],
  ['Competitive intelligence',                        '✗ Not included',         '✓ AI-researched local and global rivals, starting with the ones you name'],
  ['Technical readiness checks',                      '✗ Not included',         '✓ Automated checks for speed, SEO, accessibility and trust signals, with a readiness score'],
  ['Multi-channel content engine',                    '✗ Instagram only',       '✓ Instagram, LinkedIn, X, YouTube Shorts, Facebook, WhatsApp, email and Reddit'],
  ['Go-to-Market strategy',                           '✗ Not included',         '✓ Channel recommendations, budget planner, launch readiness, outreach templates'],
  ['Score history & improvement tracking',            '✗ One-time audit',       '✓ Track score changes over time — see your growth'],
]

function VideoEmbed() {
  return (
    <iframe
      width="100%"
      style={{ aspectRatio:'16/9', borderRadius:12, border:'none', maxWidth:800, display:'block' }}
      src="https://www.youtube.com/embed/Or4gWJ2aDTY"
      title="Markr demo"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  )
}

type AnalysisState = 'idle' | 'loading' | 'done' | 'error' | 'blocked'
interface AnalysisResult {
  overall: number
  verifiedScore?: number | null
  coverage?: number
  headline: string
  category: string
  dimensions: { label: string; score: number; displayScore?: number | 'pending' | 'na'; issue: string; verificationStatus?: string }[]
  bottleneck: { label: string; issue: string; isUnverifiable?: boolean }
  growth_teaser: string
  scraped: { title: string; h1: string; metaDesc: string }
  isJSApp?: boolean
  pagesRead?: string[]
  confidence?: 'high' | 'medium' | 'low' | 'js-app'
  confidencePercent?: number
  confidenceReason?: string
  checkedSignals?: { label: string; found: boolean; js: boolean }[]
  totalWords?: number
}

function detectCurrency(): string | null {
  const locale = navigator.language
  const currencyMap: Record<string, string> = {
    'en-IN': 'INR', 'hi': 'INR', 'hi-IN': 'INR',
    'en-GB': 'GBP', 'en-AU': 'AUD',
    'en-CA': 'CAD', 'de': 'EUR', 'fr': 'EUR', 'es': 'EUR',
  }
  const lang = locale.split('-')[0]
  const fromLocale = currencyMap[locale] || currencyMap[lang]
  if (fromLocale) return fromLocale

  // Timezone fallback — handles en-US on Indian devices
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata') return 'INR'
  if (tz?.startsWith('Europe/')) return 'EUR'
  if (tz === 'Europe/London') return 'GBP'
  if (tz?.startsWith('Australia/')) return 'AUD'
  if (tz?.startsWith('America/Toronto') || tz?.startsWith('America/Vancouver')) return 'CAD'

  return null
}

export default function Landing() {
  const [scrolled,  setScrolled]  = useState(false)
  const [url,       setUrl]       = useState('')
  const [state,     setState]     = useState<AnalysisState>('idle')
  const [result,    setResult]    = useState<AnalysisResult | null>(null)
  const [error,     setError]     = useState('')
  const [step,      setStep]      = useState(0)
  const [leadEmail, setLeadEmail] = useState('')
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const [scorecardId, setScorecardId] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [rates,       setRates]       = useState<Record<string, number>>({})
  const [showChecked, setShowChecked] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then(data => setRates(data.rates || {}))
      .catch(() => {})
  }, [])

  function localPrice(usd: number): string {
    const currency = detectCurrency()
    if (!currency || !rates[currency]) return ''
    const amount = Math.round(usd * rates[currency])
    return `≈ ${new Intl.NumberFormat(navigator.language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)}`
  }

  const STEPS = ['Fetching your homepage…', 'Reading headlines & copy…', 'Scoring 5 dimensions…', 'Building your verdict…']

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const [sendError, setSendError] = useState('')

  const handleSendReport = useCallback(async () => {
    if (!result) return
    if (!leadEmail.trim()) { setSendError('Please enter your email address'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(leadEmail.trim())) { setSendError('Please enter a valid email address'); return }
    setSending(true); setSendError('')
    try {
      const res = await fetch('/api/report-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: leadEmail.trim(), url, result }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSendError('Could not send: ' + (data.error ?? 'Please try again'))
        setSending(false)
        return
      }
      setSent(true)
      localStorage.setItem('markr_lead_email', leadEmail.trim())
    } catch {
      setSendError('Network error — please try again')
    }
    setSending(false)
  }, [leadEmail, result, url])

  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) { inputRef.current?.focus(); return }
    setState('loading'); setError(''); setStep(0); setResult(null); setSent(false); setSending(false); setLeadEmail(''); setSendError(''); setScorecardId(null)
    // Step animation
    const interval = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 900)
    try {
      const res  = await fetch('/api/analyze-url', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      clearInterval(interval)
      if (!res.ok) { setState('error'); setError(data.error || 'Something went wrong'); return }
      if (data.blocked) { setState('blocked'); setError(data.message + ' ' + data.reason); return }
      setResult(data)
      setState('done')
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 100)
      try {
        const newId = crypto.randomUUID()
        const { error: scErr } = await supabase
          .from('markr_scorecards')
          .insert({
            id: newId,
            url: url.trim(),
            overall: data.overall,
            headline: data.headline ?? '',
            dimensions: data.dimensions,
            bottleneck: data.bottleneck,
            growth_teaser: data.growth_teaser ?? '',
            category: data.category ?? '',
            pages_read: data.pagesRead ?? [],
            confidence: data.confidence ?? 'low',
          })
        console.log('[markr] scorecard insert id:', newId)
        console.log('[markr] scorecard insert error:', scErr?.message ?? 'none')
        if (!scErr) setScorecardId(newId)
      } catch (scEx) {
        console.error('[markr] scorecard insert threw:', scEx)
      }
    } catch (e) {
      clearInterval(interval)
      setState('error')
      setError('Could not reach our server — please try again.')
    }
  }, [url])

  return (
    <div style={{ background:'#08080a', color:'#f0f0f5', fontFamily:B, overflowX:'hidden', lineHeight:1.6 }}>

      {/* ── NAV ── */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, display:'flex', alignItems:'center', height:56, padding:'0 5%', background:scrolled?'rgba(8,8,10,.96)':'transparent', backdropFilter:scrolled?'blur(20px)':'none', borderBottom:scrolled?'1px solid rgba(255,255,255,.06)':'none', transition:'all .25s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
          <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:19, fontWeight:800, color:'#fff' }}>M</div>
          <span style={{ fontFamily:D, fontSize:19, fontWeight:800, letterSpacing:'-.01em' }}>Markr</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:24, fontSize:13, color:'rgba(255,255,255,.5)' }} className="landing-nav-links">
          {[['How it works','#how'],['Features','#features'],['Why Markr','#why'],['For Whom','#forwho'],['Founder','#about'],['Pricing','#pricing']].map(([l,h])=>(
            <a key={l} href={h} style={{ color:'inherit', textDecoration:'none', transition:'color .15s' }}
              onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.5)'}>{l}</a>
          ))}
        </div>
        <div style={{ flex:1, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <a href="/login" style={{ padding:'6px 14px', borderRadius:6, border:'1px solid rgba(255,255,255,.12)', color:'rgba(255,255,255,.6)', fontSize:13, textDecoration:'none', transition:'all .15s', fontFamily:B }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.3)';(e.currentTarget as HTMLElement).style.color='#fff'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.12)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.6)'}}>Sign in</a>
          <a href="/login" style={{ padding:'6px 16px', borderRadius:6, background:'#7c6ff7', color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none', fontFamily:B }}>Get started free</a>
        </div>
      </nav>

      {/* ── HERO — Outcome first ── */}
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'76px 6% 40px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'15%', left:'50%', transform:'translateX(-50%)', width:800, height:500, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(124,111,247,.08) 0%, transparent 65%)', pointerEvents:'none' }} />

        {/* Brand lockup — sizes in index.css (.hero-lockup*): 64px mark / 56px wordmark, 40 / 36 on mobile */}
        <div className="hero-lockup" style={{ position:'relative' }}>
          <div className="hero-lockup-mark" style={{ background:'linear-gradient(135deg,#7c6ff7,#e26faf)', fontFamily:D, fontWeight:800, color:'#fff' }}>M</div>
          <span className="hero-lockup-word" style={{ fontFamily:D, fontWeight:800, color:'#f5f5f7' }}>Markr</span>
        </div>

        {/* Badge */}
        <a href={PH_TODO ? undefined : PRODUCT_HUNT_URL} target="_blank" rel="noopener noreferrer"
          style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 14px', borderRadius:20, border:'1px solid rgba(124,111,247,.3)', background:'rgba(124,111,247,.08)', fontSize:12, fontWeight:500, color:'#a599ff', marginBottom:24, letterSpacing:'.01em', fontFamily:D, textDecoration:'none' }}>
          ✦ Launched on Product Hunt · Free to try
          {PH_TODO && <span style={{ color:'#f5a623', fontWeight:700 }}>{PRODUCT_HUNT_URL}</span>}
        </a>

        {/* Headline */}
        <h1 style={{ fontFamily:D, fontSize:'clamp(24px,4vw,56px)', fontWeight:800, lineHeight:1.0, margin:'0 0 20px', letterSpacing:'-0.02em', color:'#f5f5f7', whiteSpace:'nowrap' }}>
          Grow the app you already built.
        </h1>
        <p style={{ fontFamily:D, fontSize:'clamp(15px,1.4vw,18px)', fontWeight:400, lineHeight:1.6, margin:'0 0 20px', letterSpacing:'-0.01em', maxWidth:520, color:'rgba(255,255,255,.5)', textAlign:'left' }}>
          Markr reads your landing page, sees your product through your screenshots, and checks both against what you're trying to build — then tells you what to fix first and what to post.
        </p>

        {/* URL input */}
        <div style={{ display:'flex', gap:0, maxWidth:520, width:'100%', marginBottom:8, borderRadius:10, overflow:'hidden', border:'1.5px solid rgba(124,111,247,.4)', background:'rgba(255,255,255,.04)', boxShadow:'0 0 0 4px rgba(124,111,247,.06)' }}>
          <input ref={inputRef} value={url}
            onChange={e=>{ setUrl(e.target.value); if(state==='blocked'||state==='error') setState('idle') }}
            onKeyDown={e=>e.key==='Enter'&&handleAnalyze()}
            placeholder="https://yourapp.com"
            disabled={state==='loading'}
            style={{ flex:1, background:'transparent', border:'none', padding:'14px 16px', fontSize:14, color:'#fff', outline:'none', borderRadius:0, fontFamily:D, opacity: state==='loading'?.6:1 }} />
          <button onClick={handleAnalyze} disabled={state==='loading'}
            style={{ padding:'14px 24px', background: state==='loading'?'rgba(124,111,247,.5)':'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', border:'none', fontSize:14, fontWeight:600, cursor: state==='loading'?'not-allowed':'pointer', fontFamily:D, whiteSpace:'nowrap', letterSpacing:'-0.01em', transition:'all .2s' }}>
            {state==='loading' ? 'Analyzing…' : 'Get my growth insights →'}
          </button>
        </div>

        {/* Fix 1: Expectation setting right below CTA */}
        {state === 'idle' && (
          <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', marginBottom:16, fontFamily:D, textAlign:'center' }}>
            Free audit in about a minute · No signup
          </div>
        )}

        {/* Fix 3: What happens next strip */}
        {state === 'idle' && (
          <div style={{ display:'flex', alignItems:'center', gap:0, maxWidth:520, width:'100%', marginBottom:32, borderRadius:8, overflow:'hidden', border:'1px solid rgba(255,255,255,.06)' }}>
            {[
              { step:'1', label:'Paste URL',        sub:'we read your site',  color:'#7c6ff7' },
              { step:'→', label:'', sub:'', color:'transparent' },
              { step:'2', label:'5 scores',         sub:'with the evidence',  color:'#a78bfa' },
              { step:'→', label:'', sub:'', color:'transparent' },
              { step:'3', label:'Your biggest fix', sub:'and what to do',     color:'#34c98a' },
            ].map((s,i) => s.step === '→'
              ? <div key={i} style={{ fontSize:14, color:'rgba(255,255,255,.2)', padding:'0 4px', background:'rgba(255,255,255,.02)' }}>→</div>
              : <div key={i} style={{ flex:1, padding:'10px 12px', background:'rgba(255,255,255,.02)', textAlign:'center' as const }}>
                  <div style={{ fontSize:11, fontWeight:700, color:s.color, fontFamily:D }}>{s.label}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', fontFamily:D, marginTop:2 }}>{s.sub}</div>
                </div>
            )}
          </div>
        )}

        {/* Loading state — Fix 2: More specific progress steps */}
        {state === 'loading' && (
          <div style={{ maxWidth:520, width:'100%', marginBottom:32, textAlign:'left' }}>
            <div style={{ background:'rgba(124,111,247,.08)', border:'1px solid rgba(124,111,247,.2)', borderRadius:10, padding:'16px 20px' }}>
              {[
                'Fetching your homepage…',
                'Detecting friction points & drop-offs…',
                'Scoring clarity, trust, conversion…',
                'Building your growth insights…',
              ].map((s, i) => (
                <div key={s} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0', fontSize:13, color: i < step ? '#34c98a' : i === step ? '#a599ff' : 'rgba(255,255,255,.25)', transition:'color .3s' }}>
                  <span style={{ fontSize:12, width:16, textAlign:'center' as const, flexShrink:0 }}>
                    {i < step ? '✓' : i === step ? '◉' : '○'}
                  </span>
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocked state */}
        {state === 'blocked' && (
          <div style={{ maxWidth:520, width:'100%', marginBottom:32 }}>
            <div style={{ background:'rgba(245,166,35,.08)', border:'1px solid rgba(245,166,35,.25)', borderRadius:12, padding:'20px 20px' }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#f5a623', marginBottom:8, fontFamily:D }}>
                🛡️ This site blocked our analyzer
              </div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', lineHeight:1.7, marginBottom:16, fontFamily:D }}>
                Large sites like Canva, Stripe, and Notion use bot protection that prevents automated analysis. This is expected — our tool is designed for founders analyzing their own apps, not established giants.
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', fontFamily:D }}>
                💡 Try analyzing <strong style={{ color:'rgba(255,255,255,.7)' }}>your own app's URL</strong> for accurate, actionable results.
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div style={{ maxWidth:520, width:'100%', marginBottom:32, padding:'12px 16px', background:'rgba(220,38,38,.08)', border:'1px solid rgba(220,38,38,.2)', borderRadius:10, fontSize:13, color:'#fca5a5' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Result card */}
        {state === 'done' && result && (
          <div ref={resultRef} style={{ maxWidth:620, width:'100%', marginBottom:32, textAlign:'left' }}>
            <div style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', borderRadius:14, overflow:'hidden', boxShadow:'0 20px 50px rgba(0,0,0,.4)' }}>

              {/* Header */}
              <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginBottom:3, fontFamily:D }}>Analysis for</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#f0f0f5', fontFamily:D }}>{url.replace(/^https?:\/\//,'').split('/')[0]}</div>
                  {(() => {
                    const pct = result.coverage ?? result.confidencePercent ?? 100
                    const tier = pct >= 90
                      ? { icon:'🟢', label:'High',   color:'#34c98a', bg:'rgba(52,201,138,.12)' }
                      : pct >= 60
                      ? { icon:'🟡', label:'Medium', color:'#f5a623', bg:'rgba(245,166,35,.12)' }
                      : { icon:'🔴', label:'Low',    color:'#e55',    bg:'rgba(220,38,38,.12)'  }
                    return (
                      <div style={{ marginTop:4, display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600, background:tier.bg, color:tier.color, fontFamily:D }}>
                        {tier.icon} Coverage: {pct}% — {tier.label}
                        {result.confidenceReason && <span style={{ fontWeight:400, opacity:.75 }}> · {result.confidenceReason}</span>}
                      </div>
                    )
                  })()}
                </div>
                <div style={{ textAlign:'center', minWidth:72 }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', fontFamily:D, marginBottom:2 }}>Verified Score</div>
                  {result.verifiedScore != null
                    ? <>
                        <div style={{ fontFamily:D, fontSize:34, fontWeight:700, lineHeight:1, color: result.verifiedScore >= 7 ? '#34c98a' : result.verifiedScore >= 5 ? '#f5a623' : '#e55' }}>{result.verifiedScore}</div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', fontFamily:D }}>/10</div>
                      </>
                    : <div style={{ fontSize:11, color:'rgba(144,144,176,.7)', fontFamily:D, lineHeight:1.3, textAlign:'center' }}>Insufficient<br/>data</div>
                  }
                </div>
              </div>

              {/* JavaScript / low-coverage notice — point to screenshot vision */}
              {(result.isJSApp === true || (result.coverage ?? result.confidencePercent ?? 100) < 60) && (
                <div style={{ padding:'12px 20px', borderBottom:'1px solid rgba(255,255,255,.07)', background:'rgba(245,166,35,.06)' }}>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,.75)', lineHeight:1.6, fontFamily:D }}>
                    Your site loads with JavaScript, so parts of it are invisible to crawlers. Sign up and upload a few screenshots — Markr reads your actual screens instead.
                  </div>
                  <a href={`/login?url=${encodeURIComponent(url)}`}
                    style={{ display:'inline-block', marginTop:6, fontSize:12, fontWeight:600, color:'#f5a623', textDecoration:'underline', fontFamily:D }}>
                    Sign up and upload screenshots →
                  </a>
                </div>
              )}

              {/* Pages analyzed */}
              {result.pagesRead && result.pagesRead.length > 0 && (
                <div style={{ padding:'10px 20px', background:'rgba(52,201,138,.04)', borderBottom:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' as const }}>
                  <span style={{ fontSize:11, color:'#34c98a', fontWeight:600 }}>✓ Analyzed:</span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>Home</span>
                  {result.pagesRead.map(p => (
                    <span key={p} style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>· {p.charAt(0).toUpperCase() + p.slice(1)}</span>
                  ))}
                </div>
              )}
              <div style={{ padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {result.dimensions.map(d => {
                    const ds = d.displayScore ?? d.score
                    const isPending          = ds === 'pending'
                    const isNA               = ds === 'na'
                    const isNotFoundRendered = d.verificationStatus === 'not_found_rendered'
                    const num       = typeof ds === 'number' ? ds : null
                    const dc        = num !== null ? (num >= 7 ? '#34c98a' : num >= 5 ? '#f5a623' : '#e55') : '#9090b0'
                    return (
                      <div key={d.label}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <span style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontFamily:D }}>{d.label}</span>
                          {isPending
                            ? <span style={{ fontSize:10, fontWeight:600, color:'#f5a623', fontFamily:D }}>⏳ Pending</span>
                            : isNA
                            ? <span style={{ fontSize:10, fontWeight:600, color:'rgba(144,144,176,.8)', fontFamily:D }}>N/A</span>
                            : <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                                {isNotFoundRendered && <span style={{ fontSize:10, fontWeight:600, color:'#f5a623', fontFamily:D }}>⚠️ Not detected</span>}
                                <span style={{ fontSize:11, fontWeight:700, color:dc, fontFamily:D }}>{num}/10</span>
                              </span>
                          }
                        </div>
                        {num !== null && (
                          <div style={{ height:4, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden', marginBottom:4 }}>
                            <div style={{ height:'100%', width:`${num*10}%`, background:dc, borderRadius:2, transition:'width .6s' }} />
                          </div>
                        )}
                        <div style={{ fontSize:10, lineHeight:1.4, fontFamily:D, color: isPending ? 'rgba(245,166,35,.8)' : isNA ? 'rgba(144,144,176,.65)' : isNotFoundRendered ? 'rgba(245,166,35,.7)' : 'rgba(255,255,255,.4)' }}>
                          {isPending ? 'Pending — needs manual review' : isNA ? 'N/A — JavaScript-rendered' : (d.issue || '')}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* What we checked — collapsible */}
                {result.checkedSignals && result.checkedSignals.length > 0 && (
                  <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid rgba(255,255,255,.06)' }}>
                    <button
                      onClick={() => setShowChecked(v => !v)}
                      style={{ background:'none', border:'none', color:'rgba(255,255,255,.35)', fontSize:11, cursor:'pointer', fontFamily:D, display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:0 }}
                    >
                      <span>What we checked</span>
                      <span style={{ fontSize:10, opacity:.7 }}>{showChecked ? '▲ collapse' : '▼ expand'}</span>
                    </button>
                    {showChecked && (
                      <div style={{ marginTop:8, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 12px' }}>
                        {result.checkedSignals.map(sig => (
                          <div key={sig.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10 }}>
                            <span style={{ color: sig.found ? '#34c98a' : sig.js ? '#f5a623' : 'rgba(144,144,176,.8)', flexShrink:0, fontWeight:700 }}>
                              {sig.found ? '✓' : '✗'}
                            </span>
                            <span style={{ color: sig.found ? 'rgba(255,255,255,.55)' : sig.js ? 'rgba(245,166,35,.75)' : 'rgba(144,144,176,.6)', fontFamily:D }}>
                              {sig.label}{!sig.found && sig.js ? ' (JS)' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bottleneck (only below 7) / no major bottleneck / manual review */}
              <ResultSummaryBlock result={result} />

              {/* Growth teaser */}
              <div style={{ padding:'14px 20px', background:'rgba(124,111,247,.05)' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#a599ff', letterSpacing:'.06em', textTransform:'uppercase' as const, marginBottom:5, fontFamily:D }}>
                  💡 Growth Opportunity
                </div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.7)', lineHeight:1.6, fontFamily:D }}>{result.growth_teaser}</div>
              </div>

              {/* CTA — email capture + share */}
              <div style={{ padding:'16px 20px', background:'rgba(255,255,255,.03)' }}>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', fontFamily:D, marginBottom:12 }}>
                  Full analysis: Competitive · SWOT · BMC · Growth · Pricing + Daily posts
                </div>

                {/* Email capture */}
                {!sent ? (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', gap:8, marginBottom:6, flexWrap:'wrap' as const }}>
                      <input
                        type="email"
                        value={leadEmail}
                        onChange={e => { setLeadEmail(e.target.value); setSendError('') }}
                        onKeyDown={e => e.key === 'Enter' && handleSendReport()}
                        placeholder="Enter email to get your score report"
                        style={{ flex:1, minWidth:200, padding:'10px 14px', borderRadius:8, border:`1px solid ${sendError ? '#e55' : 'rgba(124,111,247,.3)'}`, background:'rgba(255,255,255,.05)', color:'#fff', fontSize:13, outline:'none', fontFamily:D }}
                      />
                      <button
                        onClick={handleSendReport}
                        disabled={sending}
                        style={{ padding:'10px 18px', background: sending ? 'rgba(124,111,247,.5)' : 'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', borderRadius:8, fontSize:13, fontWeight:600, border:'none', cursor: sending ? 'not-allowed' : 'pointer', fontFamily:D, whiteSpace:'nowrap' as const }}>
                        {sending ? 'Sending…' : 'Email my report →'}
                      </button>
                    </div>
                    {sendError && (
                      <div style={{ fontSize:12, color:'#e55', marginBottom:6, fontFamily:D }}>⚠ {sendError}</div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,.2)', fontFamily:D }}>or</span>
                      <a href={`/login?url=${encodeURIComponent(url)}`}
                        style={{ fontSize:12, color:'rgba(124,111,247,.8)', fontFamily:D, textDecoration:'underline' }}>
                        Sign up for the full analysis →
                      </a>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding:'12px 16px', background:'rgba(52,201,138,.1)', border:'1px solid rgba(52,201,138,.25)', borderRadius:8, marginBottom:10, textAlign:'center' as const }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#34c98a', marginBottom:4, fontFamily:D }}>✓ Report sent to {leadEmail}</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', fontFamily:D }}>Check your inbox — full score breakdown with fixes</div>
                    <a href={`/login?url=${encodeURIComponent(url)}`}
                      style={{ display:'inline-block', marginTop:10, padding:'8px 18px', background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', borderRadius:8, fontSize:12, fontWeight:600, textDecoration:'none', fontFamily:D }}>
                      Get full analysis free →
                    </a>
                  </div>
                )}

                {/* Share this scorecard */}
                {scorecardId && (
                  <div style={{ marginBottom:12 }}>
                    <button
                      onClick={() => {
                        const link = `https://markr.mindprintjournal.com/scorecard/${scorecardId}`
                        navigator.clipboard.writeText(link).then(() => {
                          setShareCopied(true)
                          setTimeout(() => setShareCopied(false), 2500)
                        })
                      }}
                      style={{ width:'100%', padding:'10px 18px', background: shareCopied ? 'rgba(52,201,138,.12)' : 'rgba(255,255,255,.05)', border:`1px solid ${shareCopied ? 'rgba(52,201,138,.35)' : 'rgba(255,255,255,.12)'}`, borderRadius:8, color: shareCopied ? '#34c98a' : 'rgba(255,255,255,.8)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:D, display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all .2s' }}>
                      {shareCopied ? '✓ Link copied to clipboard!' : '🔗 Share this scorecard'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Video — shown when idle or after result */}
        {/* Video — shown when idle or after result */}
        {(state === 'idle' || state === 'done' || state === 'error' || state === 'blocked') && (
          <div style={{ maxWidth:820, width:'100%' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,.3)', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:12, fontFamily:D }}>
              See Markr in action
            </div>
            <VideoEmbed />
          </div>
        )}
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ padding:'80px 6%', borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>How it works</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,38px)', fontWeight:700, margin:'0 0 10px', letterSpacing:'-0.02em', color:'#f5f5f7' }}>
              From URL to growth plan
            </h2>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flexWrap:'wrap' as const, gap:6, fontSize:13, color:'rgba(255,255,255,.4)', fontFamily:D }}>
              <span style={{ color:'#7c6ff7' }}>Step 1:</span> Score your page
              <span style={{ color:'rgba(255,255,255,.2)', margin:'0 4px' }}>·</span>
              <span style={{ color:'#34c98a' }}>Step 2:</span> Show your product
              <span style={{ color:'rgba(255,255,255,.2)', margin:'0 4px' }}>·</span>
              <span style={{ color:'#e26faf' }}>Step 3:</span> Share your intent
              <span style={{ color:'rgba(255,255,255,.2)', margin:'0 4px' }}>·</span>
              <span style={{ color:'#a599ff' }}>Step 4:</span> Get the gaps & plan
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:2 }} className="how-steps">
            {[
              { n:'01', color:'#7c6ff7', icon:'🔗', title:'Paste your URL',               outcome:'Markr scores your landing page on clarity, user journey, emotional pull, trust and conversion, with the evidence behind every score.' },
              { n:'02', color:'#34c98a', icon:'📸', title:'Show it your product',         outcome:'Upload up to 6 screenshots: home, onboarding, paywall, results. Markr reads the headlines, buttons, pricing and friction on each screen once, and remembers it.' },
              { n:'03', color:'#e26faf', icon:'🧭', title:"Tell it what you're building", outcome:"A short founder brief: who it's for, your vision and mission, the competitors that matter and the ones that don't." },
              { n:'04', color:'#a599ff', icon:'⚡', title:'Get the gaps and the plan',    outcome:'Competitive, SWOT, BMC, pricing, positioning and go-to-market, each comparing your intent with what your page and product actually show. Then content for 8 channels.' },
            ].map((s,i)=>(
              <div key={s.n} style={{ padding:'28px 24px', background: i===1 ? 'rgba(52,201,138,.04)' : 'rgba(255,255,255,.02)', border:`1px solid ${i===1?'rgba(52,201,138,.15)':'rgba(255,255,255,.06)'}`, borderRadius:12, position:'relative' }}>
                <div style={{ fontSize:11, fontWeight:700, color:s.color, letterSpacing:'.1em', marginBottom:12 }}>{s.n}</div>
                <div style={{ fontSize:22, marginBottom:10 }}>{s.icon}</div>
                <div style={{ fontFamily:D, fontSize:16, fontWeight:700, color:'#f0f0f5', marginBottom:10 }}>{s.title}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.5)', lineHeight:1.7 }}>{s.outcome}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:'center', marginTop:32 }}>
            <a href="/login" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 24px', borderRadius:9, background:'rgba(124,111,247,.15)', border:'1px solid rgba(124,111,247,.3)', color:'#a599ff', fontSize:13, fontWeight:600, textDecoration:'none', fontFamily:B }}>
              See why your app isn't growing →
            </a>
          </div>
        </div>
      </section>

      {/* ── WHY IT'S DIFFERENT ── */}
      <section id="different" style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>Why it's different</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,36px)', fontWeight:700, margin:0, letterSpacing:'-0.02em', color:'#f5f5f7', maxWidth:700, marginLeft:'auto', marginRight:'auto' }}>
              Most tools tell you what's on your page. Markr tells you what's missing from it.
            </h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }} className="how-steps">
            {[
              { icon:'📸', title:'Sees your product',  desc:"Reads your real screens, not just your homepage, including apps a crawler can't read." },
              { icon:'🧭', title:'Knows your intent',  desc:'Your audience, vision and chosen competitors guide every analysis.' },
              { icon:'🔍', title:'Shows the gap',      desc:"Points out exactly where your product doesn't yet say what you mean." },
            ].map(c => (
              <div key={c.title} style={{ padding:'24px 22px', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:12 }}>
                <div style={{ fontSize:22, marginBottom:10 }}>{c.icon}</div>
                <div style={{ fontFamily:D, fontSize:15, fontWeight:700, color:'#f0f0f5', marginBottom:8 }}>{c.title}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.5)', lineHeight:1.7 }}>{c.desc}</div>
              </div>
            ))}
          </div>
          {/* Example strip */}
          <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' as const, padding:'14px 18px', borderRadius:10, border:'1px dashed rgba(124,111,247,.35)', background:'rgba(124,111,247,.05)' }}>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase' as const, color:'#a599ff', padding:'2px 10px', borderRadius:20, background:'rgba(124,111,247,.15)', fontFamily:D, flexShrink:0 }}>Example</span>
            <span style={{ fontSize:13, color:'rgba(255,255,255,.75)', fontFamily:D }}>Your vision says 'no one has to sit alone with an overwhelming emotion' — but the product has no peer or community features yet.</span>
          </div>
          <div style={{ marginTop:6, fontSize:11, color:'rgba(255,255,255,.35)', fontFamily:D }}>
            Real gap Markr found in Emrise.
          </div>
        </div>
      </section>

      {/* ── REAL EXAMPLE ── */}
      <section style={{ padding:'80px 6%', background:'rgba(124,111,247,.04)', borderTop:'1px solid rgba(124,111,247,.1)' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>Real results — our own app</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(20px,2.8vw,34px)', fontWeight:700, margin:'0 0 10px', letterSpacing:'-0.02em', color:'#f5f5f7' }}>
              We ran Markr on Emrise first
            </h2>
            <p style={{ fontSize:14, color:'rgba(255,255,255,.4)', maxWidth:520, margin:'0 auto', fontFamily:D }}>
              Emrise is an emotional reset app for moments of overwhelm. Built by Markr's founder and audited 68 times while we fixed it.
            </p>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:3 }} className="how-steps">
            {/* Before */}
            <div style={{ background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)', borderRadius:'12px 0 0 12px', padding:'24px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(220,38,38,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>🔍</div>
                <div style={{ fontSize:11, fontWeight:700, color:'#fca5a5', letterSpacing:'.08em', textTransform:'uppercase' as const, fontFamily:D }}>Before</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'#f0f0f5', marginBottom:8, fontFamily:D }}>User Journey 4/10</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', lineHeight:1.7, fontFamily:D }}>
                No action-oriented CTA found across all pages — users don't know what to do.
              </div>
            </div>

            {/* What changed */}
            <div style={{ background:'rgba(124,111,247,.08)', border:'1px solid rgba(124,111,247,.25)', borderTop:'3px solid #7c6ff7', padding:'24px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(124,111,247,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>🛠️</div>
                <div style={{ fontSize:11, fontWeight:700, color:'#a599ff', letterSpacing:'.08em', textTransform:'uppercase' as const, fontFamily:D }}>What changed</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'#f0f0f5', marginBottom:10, fontFamily:D }}>One clear CTA</div>
              <div style={{ display:'inline-block', fontSize:13, fontWeight:600, color:'#f0f0f5', padding:'6px 12px', borderRadius:8, background:'rgba(124,111,247,.18)', fontFamily:D }}>
                Get Emrise free on Google Play
              </div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', lineHeight:1.7, marginTop:10, fontFamily:D }}>
                plus a how-it-works path.
              </div>
            </div>

            {/* After */}
            <div style={{ background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.2)', borderRadius:'0 12px 12px 0', padding:'24px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(52,201,138,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>📈</div>
                <div style={{ fontSize:11, fontWeight:700, color:'#34c98a', letterSpacing:'.08em', textTransform:'uppercase' as const, fontFamily:D }}>After</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'#f0f0f5', marginBottom:8, fontFamily:D }}>User Journey 10/10 · Overall 4.8 → 6</div>
            </div>
          </div>

          <div style={{ textAlign:'center', marginTop:14, fontSize:12, color:'rgba(255,255,255,.45)', fontFamily:D }}>
            Overall is still 6/10 — Trust is the next fix. Markr shows that too.
          </div>

          {/* What to post */}
          <div style={{ marginTop:16, background:'rgba(124,111,247,.08)', border:'1px solid rgba(124,111,247,.25)', borderTop:'3px solid #7c6ff7', borderRadius:12, padding:'20px 22px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(124,111,247,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>✍️</div>
              <div style={{ fontSize:11, fontWeight:700, color:'#a599ff', letterSpacing:'.08em', textTransform:'uppercase' as const, fontFamily:D }}>What to post</div>
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,.8)', lineHeight:1.8, fontStyle:'italic', fontFamily:D, padding:'10px 14px', background:'rgba(255,255,255,.04)', borderRadius:8, borderLeft:'3px solid #7c6ff7' }}>
              That moment when an emotion hits different and you can't name it. You open Emrise, hit the emoji wheel, and suddenly it clicks. Naming it changes everything. Which lands harder for you — finally having words for what you're feeling, or realizing you're not alone in it?
            </div>
            <div style={{ marginTop:10, fontSize:12, color:'rgba(255,255,255,.45)', lineHeight:1.6, fontFamily:D }}>
              It mentions the emoji wheel — a real screen in the app, not a generic wellness line.
            </div>
            <a href="https://www.instagram.com/reel/DehBC4WNQUJ/" target="_blank" rel="noopener noreferrer"
              style={{ display:'inline-block', marginTop:8, fontSize:12, fontWeight:600, color:'#a599ff', textDecoration:'none', fontFamily:D }}>
              Posted for real: see a Markr-written caption on Mindprint's Instagram →
            </a>
          </div>

          <div style={{ textAlign:'center', marginTop:36 }}>
            <a href="/login" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'13px 28px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:14, fontWeight:600, textDecoration:'none', fontFamily:B, boxShadow:'0 4px 20px rgba(124,111,247,.3)' }}>
              Get this for your app →
            </a>
            <div style={{ marginTop:10, fontSize:12, color:'rgba(255,255,255,.3)', fontFamily:D }}>Free to start · Your first score in about a minute</div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding:'80px 6%', borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth:980, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>Features</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,38px)', fontWeight:700, margin:0, letterSpacing:'-0.02em', color:'#f5f5f7' }}>
              Everything you need to go from built to bought
            </h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }} className="features-grid">
            {[
              { emoji:'🎯', name:'Landing page audit',       desc:'5 dimensions, the evidence for every score, and how much of your page we could read.' },
              { emoji:'📸', name:'Screenshot vision',        desc:'Reads your real screens: headlines, buttons, pricing, friction. Works for JavaScript apps.' },
              { emoji:'🧭', name:'Founder brief',            desc:'Your audience, vision and mission. Every analysis is measured against it.' },
              { emoji:'⚔️', name:'Competitive intelligence', desc:"Your chosen competitors first, the rest discovered. AI-researched; anything Markr can't verify is flagged." },
              { emoji:'📊', name:'Strategy suite',           desc:'SWOT, BMC, growth, pricing and positioning, grounded in your scores and screens.' },
              { emoji:'🗺️', name:'Go-to-market plan',        desc:'Channel picks, budget split, launch readiness and outreach templates.' },
              { emoji:'✍️', name:'Content in 8 channels',    desc:'Instagram, LinkedIn, X, YouTube Shorts, Facebook, WhatsApp, email and Reddit. References your real screens; never names competitors.' },
              { emoji:'📈', name:'History & scorecards',     desc:'Track your score over time and share a public scorecard link.' },
            ].map(f => (
              <div key={f.name}
                style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:12, padding:'22px 18px', transition:'border-color .2s, background .2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,111,247,.4)'; (e.currentTarget as HTMLElement).style.background = 'rgba(124,111,247,.06)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.07)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)' }}
              >
                <div style={{ fontSize:26, marginBottom:12 }}>{f.emoji}</div>
                <div style={{ fontFamily:D, fontSize:13, fontWeight:700, color:'#f0f0f5', marginBottom:7 }}>{f.name}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.45)', lineHeight:1.65 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY MARKR — vs others ── */}
      <section id="why" style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>Why Markr</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,38px)', fontWeight:700, margin:'0 0 10px', letterSpacing:'-0.02em', color:'#f5f5f7' }}>
              Not another generic tool
            </h2>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.45)', maxWidth:480, margin:'0 auto', lineHeight:1.7 }}>
              Most tools give generic advice. Markr reads your actual app, maps your competitive landscape, and builds a complete growth intelligence system specific to you.
            </p>
          </div>

          {/* Comparison table */}
          <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <div style={{ padding:'12px 20px', fontSize:11, fontWeight:600, color:'rgba(255,255,255,.3)', letterSpacing:'.06em' }}>FEATURE</div>
              <div style={{ padding:'12px 20px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.3)', letterSpacing:'.06em', borderLeft:'1px solid rgba(255,255,255,.06)' }}>Others</div>
              <div style={{ padding:'12px 20px', fontSize:11, fontWeight:700, color:'#a599ff', letterSpacing:'.06em', borderLeft:'1px solid rgba(255,255,255,.06)', background:'rgba(124,111,247,.06)' }}>Markr</div>
            </div>
            {COMPARISON_ROWS.map(([feat, other, markr], i) => (
              <div key={feat} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom: i < COMPARISON_ROWS.length - 1 ? '1px solid rgba(255,255,255,.04)':'none' }}>
                <div style={{ padding:'13px 20px', fontSize:13, color:'rgba(255,255,255,.6)' }}>{feat}</div>
                <div style={{ padding:'13px 20px', fontSize:12, color:'rgba(255,255,255,.3)', borderLeft:'1px solid rgba(255,255,255,.04)' }}>{other}</div>
                <div style={{ padding:'13px 20px', fontSize:12, color:'#34c98a', fontWeight:600, borderLeft:'1px solid rgba(255,255,255,.04)', background:'rgba(124,111,247,.04)' }}>{markr}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AUTOMATED DELIVERY ── */}
      <section style={{ padding:'80px 6%', borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:56, alignItems:'center' }} className="two-col">
          <div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px', borderRadius:20, background:'rgba(52,201,138,.1)', border:'1px solid rgba(52,201,138,.25)', fontSize:11, fontWeight:700, color:'#34c98a', marginBottom:14, letterSpacing:'.04em', textTransform:'uppercase' as const }}>
              ✦ Agentic AI
            </div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,36px)', fontWeight:700, margin:'0 0 14px', letterSpacing:'-0.02em', color:'#f5f5f7', lineHeight:1.1 }}>
              Content plan in your inbox.<br /><span style={{ color:'#34c98a' }}>Every morning. Automatically.</span>
            </h2>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.45)', lineHeight:1.7, marginBottom:20 }}>
              Enable daily delivery and Markr's AI generates 3 posts overnight — captions, hashtags, hooks, image prompts — delivered before you wake up.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
              {[
                { e:'🌅', t:'Morning — caption & hook optimised for saves' },
                { e:'💡', t:'Midday — written for maximum shares & reach' },
                { e:'🌙', t:'Evening — engineered for comments & community' },
              ].map(i=>(
                <div key={i.t} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:'rgba(255,255,255,.6)' }}>
                  <span style={{ fontSize:15, flexShrink:0 }}>{i.e}</span>{i.t}
                </div>
              ))}
            </div>
            <a href="/login" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'10px 20px', borderRadius:7, background:'rgba(52,201,138,.12)', border:'1px solid rgba(52,201,138,.3)', color:'#34c98a', fontSize:13, fontWeight:600, textDecoration:'none', fontFamily:B }}>
              Enable daily delivery →
            </a>
          </div>

          {/* Email mockup */}
          <div style={{ background:'#111113', borderRadius:14, border:'1px solid rgba(255,255,255,.08)', overflow:'hidden', boxShadow:'0 20px 50px rgba(0,0,0,.4)' }}>
            <div style={{ background:'#0d0d0f', padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,.05)', display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:'#e55' }} />
              <div style={{ width:9, height:9, borderRadius:'50%', background:'#f5a623' }} />
              <div style={{ width:9, height:9, borderRadius:'50%', background:'#34c98a' }} />
              <div style={{ flex:1, textAlign:'center', fontSize:10, color:'rgba(255,255,255,.25)' }}>Inbox</div>
            </div>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.05)', background:'rgba(52,201,138,.04)' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:3 }}>From: Markr · 6:30 AM</div>
              <div style={{ fontSize:12, fontWeight:700, color:'#f0f0f5' }}>Your Tiny Tummies content plan for today 🚀</div>
            </div>
            <div style={{ padding:'12px 14px' }}>
              {[
                { e:'🌅', l:'Morning Post', t:'7–9 AM', c:'#60a5fa', m:'Saves', cap:'You don\'t have to earn peaceful mornings. What are you noticing right now?' },
                { e:'💡', l:'Midday Post', t:'12–1 PM', c:'#a78bfa', m:'Shares', cap:'The parents who grew the most aren\'t the ones who never struggled. Who needs this today?' },
              ].map(p=>(
                <div key={p.l} style={{ background:'rgba(255,255,255,.03)', borderRadius:8, padding:'10px 12px', marginBottom:8, border:`1px solid ${p.c}20` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                    <span style={{ fontSize:12 }}>{p.e}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:p.c }}>{p.l}</span>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,.25)', marginLeft:'auto' }}>{p.t}</span>
                    <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:`${p.c}18`, color:p.c }}>{p.m}</span>
                  </div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.55)', lineHeight:1.6, fontStyle:'italic' }}>{p.cap}</div>
                </div>
              ))}
              <div style={{ textAlign:'center', fontSize:10, color:'rgba(255,255,255,.2)', padding:'4px 0' }}>+ Evening post · hashtags · image prompts →</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOUNDER STORY ── */}
      <section id="about" style={{ padding:'80px 6%', borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth:780, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:56, alignItems:'center' }} className="two-col">
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:12, fontFamily:D }}>Why I built this</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(20px,2.8vw,34px)', fontWeight:700, margin:'0 0 16px', letterSpacing:'-0.02em', color:'#f5f5f7', lineHeight:1.15 }}>
              Built by a founder<br />who felt the same pain.
            </h2>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.55)', lineHeight:1.8, marginBottom:16 }}>
              Many founders — including myself — are very good at building apps. But the real problem arises when you try to get users, understand the hook, and grow from 0 to 1. Or worse, 1 to 100.
            </p>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.55)', lineHeight:1.8, marginBottom:20 }}>
              Questions like <em style={{ color:'rgba(255,255,255,.75)' }}>who's my first user, what's my growth roadmap, what should I post, how do I get my first paying customer</em> — they go unanswered for months.
            </p>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.7)', lineHeight:1.8, marginBottom:24, borderLeft:'2px solid #7c6ff7', paddingLeft:16 }}>
              "Markr is built to answer some of these questions and provide direction to lost founders who build amazing products that get lost due to wrong marketing — or even lack of it."
            </p>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>S</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#f0f0f5', fontFamily:D }}>Swaroop</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', fontFamily:D }}>Founder of Markr · Also built Mindprint, Emrise & Tiny Tummies</div>
              </div>
            </div>
          </div>
          {/* Stats */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {[
              { n:'5',              label:'Apps built before Markr', sub:'Each one taught me what Markr now does automatically', color:'#7c6ff7' },
              { n:'68',             label:'Audits of Emrise alone',  sub:'Every insight tested on our own apps first',           color:'#e26faf' },
              { n:'~1 min',         label:'To your first score',     sub:'Paste your URL — Markr does the rest',                 color:'#34c98a' },
            ].map(s=>(
              <div key={s.label} style={{ padding:'18px 20px', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:12 }}>
                <div style={{ fontFamily:D, fontSize: s.n.startsWith('[TODO') ? 14 : 28, fontWeight:800, color: s.n.startsWith('[TODO') ? '#f5a623' : s.color, lineHeight:1, marginBottom:6 }}>{s.n}</div>
                <div style={{ fontSize:13, fontWeight:600, color:'#f0f0f5', marginBottom:4, fontFamily:D }}>{s.label}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', lineHeight:1.5 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>What founders say</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(20px,2.8vw,34px)', fontWeight:700, margin:0, letterSpacing:'-0.02em', color:'#f5f5f7' }}>
              Real founders. Real clarity.
            </h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }} className="how-steps">
            {[
              { quote:'I barely found a problem with this one. The focus is on the user for sure — going through the landing page felt like an experience, which is enough to get me in. My favourite part is the call to action — "Analyze my app" all through. Simple and clear.', name:'Discord community member', app:'App founder', color:'#7c6ff7', tag:'✓ Headline feedback implemented' },
              { quote:'The video should be 100% in the hero — it proves the value more than 90% of things above it. The analyse URL piece is a great hook bait. Also flagged that "no sign up required" was a 🚩 — went to analyze my site and it instantly asked me to sign up. Both fixed. Page flow now goes outcome first, then how it works.', name:'Discord community member', app:'Product founder', color:'#34c98a', tag:'✓ All feedback implemented' },
              { quote:'The idea is absolutely fire and I haven\'t signed up yet — that\'s how good the concept is. As a software QA I spotted mobile responsiveness issues, broken cards, and accessibility gaps. Fast turnaround on every single point. The onboarding flow is also much smoother now.', name:'Discord community member', app:'Software QA & founder', color:'#e26faf', tag:'✓ All 4 issues fixed' },
            ].map(t=>(
              <div key={t.name} style={{ padding:'22px 20px', background:'rgba(255,255,255,.03)', border:`1px solid ${t.color}20`, borderRadius:12, position:'relative' }}>
                {t.tag && (
                  <div style={{ position:'absolute', top:-10, left:16, background:'rgba(52,201,138,.15)', border:'1px solid rgba(52,201,138,.3)', borderRadius:20, padding:'2px 10px', fontSize:9, fontWeight:700, color:'#34c98a', fontFamily:D, whiteSpace:'nowrap' as const }}>
                    {t.tag}
                  </div>
                )}
                <div style={{ fontSize:24, color:t.color, marginBottom:10, lineHeight:1 }}>"</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.7)', lineHeight:1.7, marginBottom:16, fontStyle:'italic' }}>{t.quote}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:`${t.color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:t.color, fontWeight:700, flexShrink:0 }}>
                    {t.name[0]}
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#f0f0f5', fontFamily:D }}>{t.name}</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,.35)', fontFamily:D }}>{t.app}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Swaroop's own testimonial — founder eating own cooking */}
          <div style={{ marginTop:14, padding:'24px 28px', background:'rgba(124,111,247,.06)', border:'1px solid rgba(124,111,247,.25)', borderRadius:14, position:'relative' }}>
            <div style={{ position:'absolute', top:-10, left:20, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', borderRadius:20, padding:'3px 12px', fontSize:10, fontWeight:700, color:'#fff', fontFamily:D }}>
              The founder's own discovery
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:24, alignItems:'center' }} className="two-col">
              <div>
                <div style={{ fontSize:24, color:'#a599ff', marginBottom:8, lineHeight:1 }}>"</div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,.75)', lineHeight:1.8, fontStyle:'italic', marginBottom:16 }}>
                  I run Tiny Tummies — a meal planning app for young Indian mothers. I thought I had a decent landing page. Markr told me otherwise in about a minute: User Journey 4/10, Trust 4/10. No mentor, no agency had flagged this. I've since revised the landing page based on the feedback and I'm now collecting testimonials to fix the trust gap. I didn't know what I didn't know — until Markr showed me.
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>S</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#f0f0f5', fontFamily:D }}>Swaroop</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', fontFamily:D }}>Founder of Markr · Also built Mindprint, Emrise & Tiny Tummies</div>
                  </div>
                </div>
              </div>
              {/* Mini score card */}
              <div style={{ background:'rgba(0,0,0,.3)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'16px 18px', minWidth:160, textAlign:'center' }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:8, fontFamily:D }}>Tiny Tummies score</div>
                <div style={{ fontFamily:D, fontSize:42, fontWeight:800, color:'#f5a623', lineHeight:1 }}>4.6</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', marginBottom:12, fontFamily:D }}>/10 before fixes</div>
                {[
                  { label:'User Journey', score:4, color:'#e55' },
                  { label:'Trust',        score:4, color:'#e55' },
                  { label:'Clarity',      score:7, color:'#34c98a' },
                ].map(d=>(
                  <div key={d.label} style={{ marginBottom:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                      <span style={{ fontSize:9, color:'rgba(255,255,255,.4)', fontFamily:D }}>{d.label}</span>
                      <span style={{ fontSize:9, fontWeight:700, color:d.color, fontFamily:D }}>{d.score}/10</span>
                    </div>
                    <div style={{ height:3, background:'rgba(255,255,255,.06)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${d.score*10}%`, background:d.color, borderRadius:2 }} />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize:9, color:'rgba(255,255,255,.25)', marginTop:8, fontFamily:D }}>Now being fixed ↑</div>
              </div>
            </div>
          </div>
          {/* Mid-page CTA */}
          <div style={{ textAlign:'center', marginTop:40 }}>
            <a href="/login" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 28px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:14, fontWeight:600, textDecoration:'none', fontFamily:B }}>
              Get my growth insights →
            </a>
            <div style={{ marginTop:10, fontSize:11, color:'rgba(255,255,255,.25)' }}>Join founders already using Markr</div>
          </div>
        </div>
      </section>
      {/* ── WHO USES MARKR ── */}
      <section id="forwho" style={{ padding:'80px 6%', borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>Who uses Markr</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(20px,2.8vw,32px)', fontWeight:700, margin:0, letterSpacing:'-0.02em', color:'#f5f5f7' }}>Built for founders — and the people who help them</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }} className="persona-grid">
            {([
              { role:'Solo founders',      desc:"Find out why visitors don't convert, and what to post while you fix it." },
              { role:'Mentors & coaches',  desc:"Score a founder's page before your next session." },
              { role:'Small studios',      desc:'Run up to 3 apps from one account.' },
            ] as const).map(({ role, desc }) => (
              <div key={role} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:14, padding:'28px 24px', display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase' as const, color:'#7c6ff7', fontFamily:D }}>{role}</div>
                <div style={{ fontSize:'clamp(15px,1.6vw,18px)', fontWeight:600, color:'#f5f5f7', lineHeight:1.45, fontFamily:D }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:700, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>Pricing</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,36px)', fontWeight:700, margin:0, letterSpacing:'-0.02em', color:'#f5f5f7' }}>Start free. Upgrade when ready.</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.3fr', gap:14, alignItems:'start' }} className="pricing-grid">

            {/* Free */}
            <div style={{ background:'rgba(255,255,255,.04)', border:'1.5px solid rgba(255,255,255,.1)', borderRadius:14, padding:'24px 20px' }}>
              <div style={{ fontFamily:D, fontSize:15, fontWeight:700, color:'#f0f0f5', marginBottom:6 }}>Free</div>
              <div style={{ fontFamily:D, fontSize:28, fontWeight:800, color:'#f0f0f5', marginBottom:2 }}>$0</div>
              <div style={{ fontSize:10, fontWeight:600, color:'rgba(255,255,255,.3)', textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom:16 }}>forever</div>
              {(['Landing page score for 1 app', 'Evidence for every dimension', 'Shareable scorecard'] as const).map(item => (
                <div key={item} style={{ display:'flex', gap:8, fontSize:12, color:'rgba(255,255,255,.6)', marginBottom:8, lineHeight:1.5 }}>
                  <span style={{ color:'#34c98a', flexShrink:0 }}>✓</span>{item}
                </div>
              ))}
              <a href="/login" style={{ display:'block', textAlign:'center', padding:'11px', borderRadius:8, fontSize:13, fontWeight:700, textDecoration:'none', marginTop:18, fontFamily:B, background:'rgba(255,255,255,.08)', color:'rgba(255,255,255,.8)', border:'1px solid rgba(255,255,255,.12)', transition:'opacity .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '.85'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>Get started free</a>
            </div>

            {/* Analysis Pack */}
            <div style={{ background:'rgba(52,201,138,.05)', border:'1.5px solid rgba(52,201,138,.3)', borderRadius:14, padding:'24px 20px', position:'relative' }}>
              <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'#34c98a', color:'#fff', fontSize:9, fontWeight:700, padding:'3px 12px', borderRadius:20, whiteSpace:'nowrap' as const }}>ONE-TIME PURCHASE</div>
              <div style={{ fontFamily:D, fontSize:15, fontWeight:700, color:'#f0f0f5', marginBottom:6 }}>Analysis Pack</div>
              <div style={{ fontFamily:D, fontSize:28, fontWeight:800, color:'#34c98a', marginBottom:2 }}>$10</div>
              <div style={{ fontSize:10, fontWeight:600, color:'#34c98a', textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom: localPrice(10) ? 2 : 16 }}>one-time · no subscription</div>
              {localPrice(10) && <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:14 }}>{localPrice(10)}</div>}
              {(['Everything in Free', 'Competitive intelligence', 'SWOT, BMC, growth & pricing strategy', 'AI copy rewrites (headlines, CTAs, priority fixes)', '1 app, results saved permanently'] as const).map(item => (
                <div key={item} style={{ display:'flex', gap:8, fontSize:12, color:'rgba(255,255,255,.6)', marginBottom:8, lineHeight:1.5 }}>
                  <span style={{ color:'#34c98a', flexShrink:0 }}>✓</span>{item}
                </div>
              ))}
              <a href="/login" style={{ display:'block', textAlign:'center', padding:'11px', borderRadius:8, fontSize:13, fontWeight:700, textDecoration:'none', marginTop:18, fontFamily:B, background:'linear-gradient(135deg,#34c98a,#22b573)', color:'#fff', border:'none', transition:'opacity .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '.85'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>Buy audit — $10</a>
            </div>

            {/* Pro — hero */}
            <div style={{ background:'rgba(124,111,247,.1)', border:'2px solid rgba(124,111,247,.65)', borderRadius:14, padding:'28px 22px', position:'relative', boxShadow:'0 0 0 1px rgba(124,111,247,.2), 0 12px 40px rgba(124,111,247,.2)' }}>
              <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'#7c6ff7', color:'#fff', fontSize:9, fontWeight:700, padding:'3px 14px', borderRadius:20, whiteSpace:'nowrap' as const }}>MOST POPULAR</div>
              <div style={{ fontFamily:D, fontSize:16, fontWeight:700, color:'#f0f0f5', marginBottom:6 }}>Pro</div>
              <div style={{ fontFamily:D, fontSize:32, fontWeight:800, color:'#a599ff', marginBottom:2 }}>$14</div>
              <div style={{ fontSize:10, fontWeight:600, color:'#a599ff', textTransform:'uppercase' as const, letterSpacing:'.06em', marginBottom: localPrice(14) ? 2 : 16 }}>/month · cancel anytime</div>
              {localPrice(14) && <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:14 }}>{localPrice(14)}/month</div>}
              {(['Everything in Analysis Pack', 'Up to 3 apps', 'Screenshot vision & founder brief', 'Positioning & go-to-market plan', 'Content for 8 channels with daily email delivery', 'Technical readiness checks', '50 AI runs a day'] as const).map(item => (
                <div key={item} style={{ display:'flex', gap:8, fontSize:12, color:'rgba(255,255,255,.75)', marginBottom:9, lineHeight:1.5 }}>
                  <span style={{ color:'#a599ff', flexShrink:0 }}>✓</span>{item}
                </div>
              ))}
              <a href="/login" style={{ display:'block', textAlign:'center', padding:'13px', borderRadius:8, fontSize:14, fontWeight:700, textDecoration:'none', marginTop:20, fontFamily:B, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', border:'none', transition:'opacity .15s', boxShadow:'0 4px 16px rgba(124,111,247,.35)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '.85'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>Start Pro — $14/month</a>
            </div>

          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ padding:'80px 6%', textAlign:'center', background:'rgba(124,111,247,.06)', borderTop:'1px solid rgba(124,111,247,.15)' }}>
        <div style={{ maxWidth:560, margin:'0 auto' }}>
          <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,38px)', fontWeight:700, letterSpacing:'-0.02em', margin:'0 0 12px', color:'#f5f5f7' }}>
            Ready to stop guessing?
          </h2>
          <p style={{ fontSize:16, color:'rgba(255,255,255,.45)', marginBottom:28, lineHeight:1.65 }}>
            Get your first score in about a minute and wake up to 3 ready-to-post captions tomorrow morning.
          </p>
          <a href="/login" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'14px 32px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:15, fontWeight:600, textDecoration:'none', fontFamily:B, boxShadow:'0 4px 20px rgba(124,111,247,.3)', transition:'opacity .15s' }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
            Get my growth insights →
          </a>
          <div style={{ marginTop:14, fontSize:11, color:'rgba(255,255,255,.25)' }}>Free to start · No credit card · About a minute to your first score</div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding:'24px 6%', borderTop:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <div style={{ width:22, height:22, borderRadius:6, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:12, fontWeight:800, color:'#fff' }}>M</div>
          <span style={{ fontFamily:D, fontSize:13, fontWeight:700, color:'rgba(255,255,255,.5)' }}>Markr</span>
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,.25)' }}>© 2026 Markr · Built for app founders</div>
        <a href="/login" style={{ fontSize:12, color:'rgba(255,255,255,.35)', textDecoration:'none' }}>Sign in →</a>
      </footer>

    </div>
  )
}
