import { useState, useEffect, useRef, useCallback } from 'react'

const D = "'Inter', sans-serif"
const B = "'Inter', sans-serif"

function VideoEmbed() {
  const [playing, setPlaying] = useState(false)
  return (
    <div onClick={() => !playing && setPlaying(true)}
      style={{ position:'relative', width:'100%', paddingBottom:'56.25%', borderRadius:14, overflow:'hidden', cursor:playing?'default':'pointer', background:'#0a0a0e', border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 24px 60px rgba(0,0,0,.6)' }}>
      {playing ? (
        <iframe style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'none' }}
          src="https://www.youtube.com/embed/G8xh5wXhemU?autoplay=1&rel=0"
          title="Markr Demo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      ) : (
        <>
          <img src="https://img.youtube.com/vi/G8xh5wXhemU/maxresdefault.jpg" alt="Markr demo"
            style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', objectFit:'cover' }} />
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.5)' }} />
          {/* Play button */}
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(124,111,247,.95)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 16px rgba(124,111,247,.15)', transition:'transform .2s' }}>
              <div style={{ width:0, height:0, borderTop:'12px solid transparent', borderBottom:'12px solid transparent', borderLeft:'20px solid #fff', marginLeft:5 }} />
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,.85)', textShadow:'0 1px 4px rgba(0,0,0,.8)', fontFamily:B }}>
              Watch Markr analyze a real app
            </div>
          </div>
        </>
      )}
    </div>
  )
}

type AnalysisState = 'idle' | 'loading' | 'done' | 'error' | 'blocked'
interface AnalysisResult {
  overall: number
  headline: string
  category: string
  dimensions: { label: string; score: number; issue: string }[]
  bottleneck: { label: string; issue: string }
  growth_teaser: string
  scraped: { title: string; h1: string; metaDesc: string }
  isJSApp?: boolean
  pagesRead?: string[]
  confidence?: 'high' | 'medium' | 'low'
  totalWords?: number
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
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

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
    setState('loading'); setError(''); setStep(0); setResult(null); setSent(false); setSending(false); setLeadEmail(''); setSendError('')
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
        <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
          <div style={{ width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:14, fontWeight:800, color:'#fff' }}>M</div>
          <span style={{ fontFamily:D, fontSize:14, fontWeight:600 }}>Markr</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:24, fontSize:13, color:'rgba(255,255,255,.5)' }} className="landing-nav-links">
          {[['How it works','#how'],['Why Markr','#why'],['Founder','#about'],['Pricing','#pricing']].map(([l,h])=>(
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
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'100px 6% 40px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'15%', left:'50%', transform:'translateX(-50%)', width:800, height:500, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(124,111,247,.08) 0%, transparent 65%)', pointerEvents:'none' }} />

        {/* Badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 14px', borderRadius:20, border:'1px solid rgba(124,111,247,.3)', background:'rgba(124,111,247,.08)', fontSize:12, fontWeight:500, color:'#a599ff', marginBottom:24, letterSpacing:'.01em', fontFamily:D }}>
          ✦ Launched on Product Hunt · Free to try
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily:D, fontSize:'clamp(32px,4.2vw,58px)', fontWeight:700, lineHeight:1.07, margin:'0 0 10px', letterSpacing:'-0.02em', color:'#f5f5f7', maxWidth:740 }}>
          Your landing page is losing users.
        </h1>
        <h1 style={{ fontFamily:D, fontSize:'clamp(32px,4.2vw,58px)', fontWeight:600, lineHeight:1.07, margin:'0 0 16px', letterSpacing:'-0.02em', maxWidth:740, background:'linear-gradient(135deg,#7c6ff7 20%,#e26faf 80%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Markr shows you exactly where — and what to post to fix it.
        </h1>

        {/* New subline */}
        <p style={{ fontFamily:D, fontSize:18, fontWeight:500, color:'rgba(255,255,255,.75)', maxWidth:560, lineHeight:1.5, margin:'0 0 16px', letterSpacing:'-0.01em' }}>
          See exactly why your app isn't growing — and what to post to fix it.
        </p>

        <p style={{ fontFamily:D, fontSize:15, fontWeight:400, color:'rgba(255,255,255,.4)', maxWidth:460, lineHeight:1.65, margin:'0 0 20px' }}>
          Paste your URL. Get a free audit in 60 seconds — no signup needed.
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
            Takes 2 minutes · No signup · See where users drop off instantly
          </div>
        )}

        {/* Fix 3: What happens next strip */}
        {state === 'idle' && (
          <div style={{ display:'flex', alignItems:'center', gap:0, maxWidth:520, width:'100%', marginBottom:32, borderRadius:8, overflow:'hidden', border:'1px solid rgba(255,255,255,.06)' }}>
            {[
              { step:'1', label:'Paste URL', sub:'We fetch your site', color:'#7c6ff7' },
              { step:'→', label:'', sub:'', color:'transparent' },
              { step:'2', label:'We analyze', sub:'5 dimensions scored', color:'#a78bfa' },
              { step:'→', label:'', sub:'', color:'transparent' },
              { step:'3', label:'You get insights', sub:'+ content templates', color:'#34c98a' },
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
                  {result.confidence && (
                    <div style={{ marginTop:4, display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600,
                      background: result.confidence==='high' ? 'rgba(52,201,138,.12)' : result.confidence==='medium' ? 'rgba(245,166,35,.12)' : 'rgba(144,144,176,.12)',
                      color: result.confidence==='high' ? '#34c98a' : result.confidence==='medium' ? '#f5a623' : '#9090b0'
                    }}>
                      {result.confidence==='high' ? '● High confidence' : result.confidence==='medium' ? '● Medium confidence' : '● Low confidence'}
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:D, fontSize:36, fontWeight:700, color: result.overall >= 7 ? '#34c98a' : result.overall >= 5 ? '#f5a623' : '#e55', lineHeight:1 }}>{result.overall}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', fontFamily:D }}>/10</div>
                </div>
              </div>

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
                  {result.dimensions.map(d => (
                    <div key={d.label}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,.5)', fontFamily:D }}>{d.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, color: d.score >= 7 ? '#34c98a' : d.score >= 5 ? '#f5a623' : '#e55', fontFamily:D }}>{d.score}/10</span>
                      </div>
                      <div style={{ height:4, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${d.score*10}%`, background: d.score >= 7 ? '#34c98a' : d.score >= 5 ? '#f5a623' : '#e55', borderRadius:2, transition:'width .6s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Biggest bottleneck */}
              <div style={{ padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,.07)', background:'rgba(220,38,38,.04)' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#fca5a5', letterSpacing:'.06em', textTransform:'uppercase' as const, marginBottom:5, fontFamily:D }}>
                  🚨 Biggest Bottleneck — {result.bottleneck.label}
                </div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.75)', lineHeight:1.6, fontFamily:D }}>{result.bottleneck.issue}</div>
              </div>

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

                {/* Share buttons */}
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' as const }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,.3)', fontFamily:D }}>Share your score:</span>
                  <button onClick={() => {
                    const text = `My app scored ${result.overall}/10 on Markr's landing page analyzer 🚀\n\nBiggest gap: ${result.bottleneck.label}\n\nAnalyze yours free → https://markr.mindprintjournal.com`
                    if (navigator.share) { navigator.share({ text, url:'https://markr.mindprintjournal.com' }).catch(()=>{}) }
                    else { navigator.clipboard.writeText(text).then(()=>alert('Copied!')) }
                  }} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid rgba(255,255,255,.15)', background:'transparent', color:'rgba(255,255,255,.6)', fontSize:11, cursor:'pointer', fontFamily:D }}>
                    🐦 Twitter/X
                  </button>
                  <button onClick={() => {
                    const text = `I analyzed my app's landing page with Markr and scored ${result.overall}/10.\n\nBiggest bottleneck: ${result.bottleneck.label}\n\nGet your free analysis → https://markr.mindprintjournal.com`
                    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://markr.mindprintjournal.com')}&summary=${encodeURIComponent(text)}`, '_blank')
                  }} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid rgba(255,255,255,.15)', background:'transparent', color:'rgba(255,255,255,.6)', fontSize:11, cursor:'pointer', fontFamily:D }}>
                    💼 LinkedIn
                  </button>
                  <button onClick={() => {
                    const text = `My app scored ${result.overall}/10 on Markr 🚀 Biggest gap: ${result.bottleneck.label}. Analyze yours free → https://markr.mindprintjournal.com`
                    navigator.clipboard.writeText(text).then(()=>alert('Copied!'))
                  }} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid rgba(255,255,255,.15)', background:'transparent', color:'rgba(255,255,255,.6)', fontSize:11, cursor:'pointer', fontFamily:D }}>
                    📋 Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video — shown when idle or after result */}
        {/* Video — shown when idle or after result */}
        {(state === 'idle' || state === 'done' || state === 'error' || state === 'blocked') && (
          <div style={{ maxWidth:820, width:'100%' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,.3)', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:12, fontFamily:D }}>
              See the outcome in 6 minutes
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
              From URL to content plan in 2 minutes
            </h2>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:13, color:'rgba(255,255,255,.4)', fontFamily:D }}>
              <span style={{ color:'#7c6ff7' }}>Step 1:</span> We detect drop-off
              <span style={{ color:'rgba(255,255,255,.2)', margin:'0 4px' }}>·</span>
              <span style={{ color:'#a78bfa' }}>Step 2:</span> We generate content
              <span style={{ color:'rgba(255,255,255,.2)', margin:'0 4px' }}>·</span>
              <span style={{ color:'#34c98a' }}>Step 3:</span> You fix it and grow
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:2 }} className="how-steps">
            {[
              { n:'01', color:'#7c6ff7', title:'Paste your URL', outcome:'Markr reads your app like a real user — features, positioning, target audience, friction points.', icon:'🔗' },
              { n:'02', color:'#34c98a', title:'AI runs deep analysis', outcome:'Competitive landscape, SWOT, growth playbook, pricing strategy, BMC — all generated and saved.', icon:'⚡' },
              { n:'03', color:'#e26faf', title:'Content arrives daily', outcome:'3 Instagram posts — morning, midday, evening — optimised for saves, shares and comments. In your inbox by 6:30am.', icon:'📬' },
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

      {/* ── REAL EXAMPLE ── */}
      <section style={{ padding:'80px 6%', background:'rgba(124,111,247,.04)', borderTop:'1px solid rgba(124,111,247,.1)' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>Real output — no fluff</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(20px,2.8vw,34px)', fontWeight:700, margin:'0 0 10px', letterSpacing:'-0.02em', color:'#f5f5f7' }}>
              This is what Markr actually found
            </h2>
            <p style={{ fontSize:14, color:'rgba(255,255,255,.4)', maxWidth:460, margin:'0 auto', fontFamily:D }}>
              Real analysis from a real app — Emrise, a wellness app for founders.
            </p>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:3 }} className="how-steps">
            {/* Step 1 — Insight */}
            <div style={{ background:'rgba(220,38,38,.06)', border:'1px solid rgba(220,38,38,.2)', borderRadius:'12px 0 0 12px', padding:'24px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(220,38,38,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>🔍</div>
                <div style={{ fontSize:11, fontWeight:700, color:'#fca5a5', letterSpacing:'.08em', textTransform:'uppercase' as const, fontFamily:D }}>What Markr found</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'#f0f0f5', marginBottom:8, fontFamily:D }}>Emotional Pull: 3/10</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', lineHeight:1.7, fontFamily:D }}>
                The page uses "we/our" 14× vs "you/your" 3×. It talks about the product — not the person using it. A founder visiting this page doesn't feel seen.
              </div>
              <div style={{ marginTop:12, padding:'8px 12px', background:'rgba(220,38,38,.08)', borderRadius:8, fontSize:12, color:'#fca5a5', fontFamily:D }}>
                ⚠️ This is why visitors browse but don't convert
              </div>
            </div>

            {/* Step 2 — Content */}
            <div style={{ background:'rgba(124,111,247,.08)', border:'1px solid rgba(124,111,247,.25)', borderTop:'3px solid #7c6ff7', padding:'24px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(124,111,247,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>✍️</div>
                <div style={{ fontSize:11, fontWeight:700, color:'#a599ff', letterSpacing:'.08em', textTransform:'uppercase' as const, fontFamily:D }}>What to post</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'#f0f0f5', marginBottom:10, fontFamily:D }}>Generated caption:</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,.8)', lineHeight:1.8, fontStyle:'italic', fontFamily:D, padding:'10px 14px', background:'rgba(255,255,255,.04)', borderRadius:8, borderLeft:'3px solid #7c6ff7' }}>
                "Most founders don't burn out from overwork. They burn out from building in silence — no feedback, no traction, no sign it's working. This app was built for that moment. 🧘"
              </div>
              <div style={{ marginTop:10, display:'flex', flexWrap:'wrap' as const, gap:4 }}>
                {['#founders','#buildinpublic','#solofounder','#mentalhealth','#startuplife'].map(h=>(
                  <span key={h} style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(124,111,247,.12)', color:'#a599ff', fontFamily:D }}>{h}</span>
                ))}
              </div>
            </div>

            {/* Step 3 — Why it works */}
            <div style={{ background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.2)', borderRadius:'0 12px 12px 0', padding:'24px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(52,201,138,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>💡</div>
                <div style={{ fontSize:11, fontWeight:700, color:'#34c98a', letterSpacing:'.08em', textTransform:'uppercase' as const, fontFamily:D }}>Why it works</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'#f0f0f5', marginBottom:8, fontFamily:D }}>Optimised for saves</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', lineHeight:1.7, fontFamily:D }}>
                Speaks directly to the founder's emotional state — not the product. "Burning out from building in silence" mirrors exactly what Emrise's audience feels. Saves-optimised content validates, it doesn't sell.
              </div>
              <div style={{ marginTop:12, padding:'8px 12px', background:'rgba(52,201,138,.08)', borderRadius:8, fontSize:12, color:'#34c98a', fontFamily:D }}>
                ✓ This is Markr understanding your app — not generic AI
              </div>
            </div>
          </div>

          <div style={{ textAlign:'center', marginTop:36 }}>
            <a href="/login" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'13px 28px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:14, fontWeight:600, textDecoration:'none', fontFamily:B, boxShadow:'0 4px 20px rgba(124,111,247,.3)' }}>
              Get this for your app →
            </a>
            <div style={{ marginTop:10, fontSize:12, color:'rgba(255,255,255,.3)', fontFamily:D }}>Free to start · Your first analysis in 2 minutes</div>
          </div>
        </div>
      </section>

      {/* ── WHY MARKR — vs others ── */}
      <section id="why" style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>Why Markr</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,38px)', fontWeight:700, margin:'0 0 10px', letterSpacing:'-0.02em', color:'#f5f5f7' }}>
              Not another content tool
            </h2>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.45)', maxWidth:480, margin:'0 auto', lineHeight:1.7 }}>
              Most tools generate generic content. Markr reads your actual app and generates content only your app could post.
            </p>
          </div>

          {/* Comparison table */}
          <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <div style={{ padding:'12px 20px', fontSize:11, fontWeight:600, color:'rgba(255,255,255,.3)', letterSpacing:'.06em' }}>FEATURE</div>
              <div style={{ padding:'12px 20px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.3)', letterSpacing:'.06em', borderLeft:'1px solid rgba(255,255,255,.06)' }}>Others</div>
              <div style={{ padding:'12px 20px', fontSize:11, fontWeight:700, color:'#a599ff', letterSpacing:'.06em', borderLeft:'1px solid rgba(255,255,255,.06)', background:'rgba(124,111,247,.06)' }}>Markr</div>
            </div>
            {[
              ['Understands your specific app',        '✗ Generic prompts',    '✓ Reads your actual URL'],
              ['Competitive analysis',                  '✗ Not included',       '✓ 5 real named competitors'],
              ['Product testing & QA',                  '✗ Not included',       '✓ Simulates real user journey'],
              ['Daily automated delivery',              '✗ You have to log in', '✓ In your inbox by 6:30am'],
              ['SWOT, BMC, growth playbook',            '✗ Extra tools needed', '✓ All in one place'],
              ['Content optimised by engagement goal',  '✗ Same for everything','✓ Saves / Shares / Comments'],
            ].map(([feat, other, markr], i) => (
              <div key={feat} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom: i < 5 ? '1px solid rgba(255,255,255,.04)':'none' }}>
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
                <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', fontFamily:D }}>Founder of Markr · Also built Mindprint & Emrise</div>
              </div>
            </div>
          </div>
          {/* Stats */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {[
              { n:'3', label:'Apps built before Markr', sub:'Each one taught me what Markr now does automatically', color:'#7c6ff7' },
              { n:'6mo', label:'Average time founders waste', sub:'On guessing strategy before finding their first 100 users', color:'#e26faf' },
              { n:'2min', label:'To get your first insight', sub:'Paste your URL — Markr does the rest', color:'#34c98a' },
            ].map(s=>(
              <div key={s.label} style={{ padding:'18px 20px', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:12 }}>
                <div style={{ fontFamily:D, fontSize:28, fontWeight:800, color:s.color, lineHeight:1, marginBottom:6 }}>{s.n}</div>
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
                  I run Tiny Tummies — a meal planning app for young Indian mothers. I thought I had a decent landing page. Markr told me otherwise in 60 seconds: User Journey 4/10, Trust 4/10. No mentor, no agency had flagged this. I've since revised the landing page based on the feedback and I'm now collecting testimonials to fix the trust gap. I didn't know what I didn't know — until Markr showed me.
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>S</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#f0f0f5', fontFamily:D }}>Swaroop</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', fontFamily:D }}>Founder of Markr · Also built Tiny Tummies, Emrise & Mindprint</div>
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
      <section id="pricing" style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:700, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#7c6ff7', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:10, fontFamily:D }}>Pricing</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,36px)', fontWeight:700, margin:0, letterSpacing:'-0.02em', color:'#f5f5f7' }}>Start free. Upgrade when ready.</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="pricing-grid">
            {[
              { plan:'Free', price:'₹0', period:'forever', color:'rgba(255,255,255,.04)', border:'rgba(255,255,255,.1)', items:['1 app','5 AI calls/day','7-day trial of all features','Content Studio, Strategy & Insights'], cta:'Get started free', ctaHref:'/login', ctaBg:'rgba(255,255,255,.08)', ctaColor:'rgba(255,255,255,.8)', ctaBorder:'1px solid rgba(255,255,255,.12)', badge:null },
              { plan:'Pro', price:'₹999', period:'/month', color:'rgba(124,111,247,.08)', border:'rgba(124,111,247,.4)', items:['Unlimited apps','200 AI calls/day','Daily email delivery — 3 posts/morning','Product Test (QA simulation)','All 5 deep analyses'], cta:'Upgrade to Pro', ctaHref:'/login', ctaBg:'linear-gradient(135deg,#7c6ff7,#9b8af4)', ctaColor:'#fff', ctaBorder:'none', badge:'Most popular' },
            ].map(p=>(
              <div key={p.plan} style={{ background:p.color, border:`1.5px solid ${p.border}`, borderRadius:14, padding:'24px 20px', position:'relative' }}>
                {p.badge && <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'#7c6ff7', color:'#fff', fontSize:10, fontWeight:700, padding:'3px 12px', borderRadius:20, whiteSpace:'nowrap' }}>{p.badge}</div>}
                <div style={{ fontFamily:D, fontSize:15, fontWeight:700, color:'#f0f0f5', marginBottom:6 }}>{p.plan}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:18 }}>
                  <span style={{ fontFamily:D, fontSize:30, fontWeight:800, color:'#f0f0f5' }}>{p.price}</span>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,.4)' }}>{p.period}</span>
                </div>
                {p.items.map(item=>(
                  <div key={item} style={{ display:'flex', gap:8, fontSize:12, color:'rgba(255,255,255,.6)', marginBottom:9, lineHeight:1.5 }}>
                    <span style={{ color:'#34c98a', flexShrink:0 }}>✓</span>{item}
                  </div>
                ))}
                <a href={p.ctaHref} style={{ display:'block', textAlign:'center', padding:'11px', borderRadius:8, fontSize:13, fontWeight:700, textDecoration:'none', marginTop:18, fontFamily:B, background:p.ctaBg, color:p.ctaColor, border:p.ctaBorder, transition:'opacity .15s' }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>{p.cta}</a>
              </div>
            ))}
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
            Get your first insights in 2 minutes and wake up to 3 ready-to-post captions tomorrow morning.
          </p>
          <a href="/login" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'14px 32px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:15, fontWeight:600, textDecoration:'none', fontFamily:B, boxShadow:'0 4px 20px rgba(124,111,247,.3)', transition:'opacity .15s' }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
            Get my growth insights →
          </a>
          <div style={{ marginTop:14, fontSize:11, color:'rgba(255,255,255,.25)' }}>Free to start · No credit card · 2 min setup</div>
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
