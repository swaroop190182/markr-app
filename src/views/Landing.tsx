import { useState, useEffect, useRef } from 'react'

const D = "'Syne', sans-serif"
const B = "'DM Sans', sans-serif"

function VideoEmbed() {
  const [playing, setPlaying] = useState(false)
  return (
    <div onClick={() => !playing && setPlaying(true)}
      style={{ position:'relative', width:'100%', paddingBottom:'56.25%', borderRadius:12, overflow:'hidden', cursor: playing?'default':'pointer', background:'#0f0f14', border:'1px solid rgba(255,255,255,.1)' }}>
      {playing ? (
        <iframe style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'none' }}
          src="https://www.youtube.com/embed/G8xh5wXhemU?autoplay=1&rel=0"
          title="Markr Demo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      ) : (
        <>
          <img src="https://img.youtube.com/vi/G8xh5wXhemU/maxresdefault.jpg" alt="Markr demo"
            style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', objectFit:'cover' }} />
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.45)' }} />
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:64, height:64, borderRadius:'50%', background:'rgba(124,111,247,.95)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 12px rgba(124,111,247,.2)' }}>
            <div style={{ width:0, height:0, borderTop:'10px solid transparent', borderBottom:'10px solid transparent', borderLeft:'16px solid #fff', marginLeft:4 }} />
          </div>
          <div style={{ position:'absolute', bottom:16, left:'50%', transform:'translateX(-50%)', fontSize:12, fontWeight:600, color:'rgba(255,255,255,.85)', whiteSpace:'nowrap', textShadow:'0 1px 4px rgba(0,0,0,.8)' }}>▶ Watch Markr analyze Emrise · 6 mins</div>
        </>
      )}
    </div>
  )
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)
  const [url, setUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const handleAnalyze = () => {
    window.location.href = url ? `/login?url=${encodeURIComponent(url)}` : '/app'
  }

  return (
    <div style={{ background:'#08080a', color:'#f0f0f5', fontFamily:B, overflowX:'hidden', lineHeight:1.6 }}>

      {/* ── NAV ── */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, display:'flex', alignItems:'center', height:56, padding:'0 5%', background: scrolled?'rgba(8,8,10,.96)':'transparent', backdropFilter: scrolled?'blur(20px)':'none', borderBottom: scrolled?'1px solid rgba(255,255,255,.06)':'none', transition:'all .25s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
          <div style={{ width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:14, fontWeight:800, color:'#fff' }}>M</div>
          <span style={{ fontFamily:D, fontSize:14, fontWeight:700 }}>Markr</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:24, fontSize:13, color:'rgba(255,255,255,.5)' }} className="landing-nav-links">
          {[['Features','#features'],['How it works','#how'],['Pricing','#pricing']].map(([l,h])=>(
            <a key={l} href={h} style={{ color:'inherit', textDecoration:'none', transition:'color .15s' }}
              onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.5)'}>{l}</a>
          ))}
        </div>
        <div style={{ flex:1, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <a href="/login" style={{ padding:'6px 14px', borderRadius:6, border:'1px solid rgba(255,255,255,.12)', color:'rgba(255,255,255,.6)', fontSize:13, textDecoration:'none', transition:'all .15s', fontFamily:B }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.3)';(e.currentTarget as HTMLElement).style.color='#fff'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.12)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.6)'}}>Sign in</a>
          <a href="/app" style={{ padding:'6px 16px', borderRadius:6, background:'#7c6ff7', color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none', fontFamily:B }}>Get started free</a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'100px 6% 60px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'20%', left:'50%', transform:'translateX(-50%)', width:700, height:400, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(124,111,247,.1) 0%, transparent 65%)', pointerEvents:'none' }} />

        {/* Badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 12px', borderRadius:20, border:'1px solid rgba(124,111,247,.3)', background:'rgba(124,111,247,.08)', fontSize:11, fontWeight:600, color:'#a599ff', marginBottom:20, letterSpacing:'.02em' }}>
          ✦ AI Co-founder for App Founders
        </div>

        {/* Headline — refined size */}
        <h1 style={{ fontFamily:D, fontSize:'clamp(28px,3.8vw,52px)', fontWeight:800, lineHeight:1.12, margin:'0 0 6px', letterSpacing:'-0.025em', color:'#f5f5f7', maxWidth:720 }}>
          Your app already knows how to grow.
        </h1>
        <h1 style={{ fontFamily:D, fontSize:'clamp(28px,3.8vw,52px)', fontWeight:800, lineHeight:1.12, margin:'0 0 20px', letterSpacing:'-0.025em', maxWidth:720, background:'linear-gradient(135deg,#7c6ff7 20%,#e26faf 80%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          We just make it obvious.
        </h1>

        <p style={{ fontSize:15, color:'rgba(255,255,255,.5)', maxWidth:480, lineHeight:1.75, margin:'0 0 16px' }}>
          Paste your app URL. Markr analyzes it like a real user, generates 3 posts daily, and delivers them to your inbox — automatically.
        </p>

        {/* Live indicator */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'7px 14px', borderRadius:8, border:'1px solid rgba(52,201,138,.25)', background:'rgba(52,201,138,.05)', marginBottom:28, fontSize:12 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#34c98a', boxShadow:'0 0 6px #34c98a' }} />
          <span style={{ color:'rgba(255,255,255,.7)' }}>
            <strong style={{ color:'#34c98a' }}>Daily delivery live</strong> — 3 posts in your inbox every morning
          </span>
        </div>

        {/* URL input */}
        <div style={{ display:'flex', gap:0, maxWidth:500, width:'100%', marginBottom:14, borderRadius:9, overflow:'hidden', border:'1.5px solid rgba(124,111,247,.4)', background:'rgba(255,255,255,.04)' }}>
          <input ref={inputRef} value={url} onChange={e=>setUrl(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleAnalyze()}
            placeholder="https://yourapp.com"
            style={{ flex:1, background:'transparent', border:'none', padding:'12px 14px', fontSize:13, color:'#fff', outline:'none', borderRadius:0 }} />
          <button onClick={handleAnalyze}
            style={{ padding:'12px 20px', background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:B, whiteSpace:'nowrap' }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
            Analyze my app →
          </button>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:16, fontSize:11, color:'rgba(255,255,255,.3)', flexWrap:'wrap', justifyContent:'center' }}>
          {['No sign-up required','No credit card','2 min setup','Real insights'].map(t=>(
            <span key={t} style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ color:'#7c6ff7' }}>✓</span>{t}</span>
          ))}
        </div>

        {/* 3-step flow */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:780, width:'100%', marginTop:56 }} className="how-steps">
          {[
            { n:'1', title:'Paste your app URL', color:'#7c6ff7', content:(
              <div style={{ background:'rgba(255,255,255,.04)', borderRadius:8, padding:'10px 12px', marginTop:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.05)', borderRadius:6, padding:'7px 10px' }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,.35)', flex:1 }}>https://yourapp.com</span>
                  <div style={{ width:20, height:20, borderRadius:'50%', background:'#7c6ff7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#fff' }}>→</div>
                </div>
              </div>
            )},
            { n:'2', title:'Markr analyzes & tests', color:'#34c98a', content:(
              <div style={{ background:'rgba(255,255,255,.04)', borderRadius:8, padding:'10px 12px', marginTop:8 }}>
                {['Exploring features','Testing user journey','Finding friction','Analyzing competitors'].map(s=>(
                  <div key={s} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#34c98a', marginBottom:4 }}>
                    <span style={{ fontSize:9 }}>✓</span>{s}
                  </div>
                ))}
              </div>
            )},
            { n:'3', title:'Posts in your inbox daily', color:'#e26faf', content:(
              <div style={{ marginTop:8 }}>
                {[['🌅','Morning','Saves'],['💡','Midday','Shares'],['🌙','Evening','Comments']].map(([e,t,m])=>(
                  <div key={t} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:6, background:'rgba(255,255,255,.03)', marginBottom:4, fontSize:11 }}>
                    <span>{e}</span>
                    <span style={{ color:'rgba(255,255,255,.7)', flex:1 }}>{t} post</span>
                    <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:'rgba(226,111,175,.15)', color:'#e26faf' }}>{m}</span>
                  </div>
                ))}
              </div>
            )},
          ].map((s,i)=>(
            <div key={s.n} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:10, padding:'14px', textAlign:'left', position:'relative' }}>
              {i < 2 && <div style={{ position:'absolute', right:-6, top:'50%', transform:'translateY(-50%)', fontSize:10, color:'rgba(255,255,255,.2)', zIndex:1 }}>›</div>}
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:6 }}>
                <div style={{ width:20, height:20, borderRadius:5, background:s.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#fff', flexShrink:0 }}>{s.n}</div>
                <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,.85)' }}>{s.title}</div>
              </div>
              {s.content}
            </div>
          ))}
        </div>

        {/* Social proof */}
        <div style={{ marginTop:40, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.25)', letterSpacing:'.06em', textTransform:'uppercase' as const }}>Used by founders building</span>
          {['Mindprint','Emrise','Tiny Tummies'].map(n=>(
            <span key={n} style={{ fontSize:11, padding:'3px 10px', borderRadius:20, border:'1px solid rgba(255,255,255,.08)', color:'rgba(255,255,255,.35)' }}>{n}</span>
          ))}
        </div>
      </section>

      {/* ── PAIN SECTION ── */}
      <section style={{ padding:'72px 6%', borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:56, alignItems:'center' }} className="two-col">
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#7c6ff7', letterSpacing:'.1em', textTransform:'uppercase' as const, marginBottom:12 }}>The problem</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,38px)', fontWeight:800, letterSpacing:'-0.025em', margin:'0 0 14px', lineHeight:1.15, color:'#f5f5f7' }}>
              Your app isn't the problem.<br />
              <span style={{ background:'linear-gradient(135deg,#7c6ff7,#e26faf)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Your marketing is guesswork.</span>
            </h2>
            <p style={{ fontSize:14, color:'rgba(255,255,255,.45)', lineHeight:1.8, marginBottom:24 }}>
              Most app founders spend hours trying to figure out what to post — then give up. Markr reads your app, understands it deeply, and tells you exactly what to say and who to say it to.
            </p>
            <a href="/app" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'10px 20px', borderRadius:7, background:'#7c6ff7', color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none', fontFamily:B }}>
              Analyze my app free →
            </a>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { icon:'😤', pain:'Spending 2 hours writing one caption', fix:'3 captions ready in your inbox every morning' },
              { icon:'🤷', pain:'No idea what your users actually care about', fix:'Real insight from app analysis + user testing' },
              { icon:'📉', pain:'Posts that get zero engagement', fix:'Content optimised for saves, shares, comments' },
              { icon:'🌀', pain:'Strategy that changes every week', fix:'Consistent pillars built from your app DNA' },
            ].map(p => (
              <div key={p.pain} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0, borderRadius:8, overflow:'hidden', border:'1px solid rgba(255,255,255,.07)' }}>
                <div style={{ padding:'10px 12px', background:'rgba(229,85,85,.05)', fontSize:12, color:'rgba(255,255,255,.45)', lineHeight:1.5, display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{p.icon}</span>{p.pain}
                </div>
                <div style={{ padding:'10px 12px', background:'rgba(52,201,138,.05)', fontSize:12, color:'rgba(255,255,255,.7)', lineHeight:1.5, display:'flex', alignItems:'center', gap:6, borderLeft:'1px solid rgba(255,255,255,.06)' }}>
                  <span style={{ color:'#34c98a', flexShrink:0 }}>→</span>{p.fix}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AUTOMATED DELIVERY ── */}
      <section style={{ padding:'72px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:56, alignItems:'center' }} className="two-col">
          <div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px', borderRadius:20, background:'rgba(52,201,138,.1)', border:'1px solid rgba(52,201,138,.25)', fontSize:11, fontWeight:700, color:'#34c98a', marginBottom:14, letterSpacing:'.04em', textTransform:'uppercase' as const }}>
              ✦ Agentic AI
            </div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,38px)', fontWeight:800, margin:'0 0 14px', letterSpacing:'-0.025em', color:'#f5f5f7', lineHeight:1.15 }}>
              Content plan in your inbox.<br /><span style={{ color:'#34c98a' }}>Every morning. Automatically.</span>
            </h2>
            <p style={{ fontSize:14, color:'rgba(255,255,255,.45)', lineHeight:1.8, marginBottom:20 }}>
              Enable daily delivery and Markr's AI agent generates 3 Instagram posts overnight — captions, hashtags, hooks, image prompts — and delivers them before you wake up.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
              {[
                { e:'🌅', t:'Morning post — caption, hook & hashtags optimised for saves' },
                { e:'💡', t:'Midday post — written for maximum shares & reach' },
                { e:'🌙', t:'Evening post — engineered for comments & community' },
              ].map(i=>(
                <div key={i.t} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:'rgba(255,255,255,.6)' }}>
                  <span style={{ fontSize:15, flexShrink:0 }}>{i.e}</span>{i.t}
                </div>
              ))}
            </div>
            <a href="/app" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'10px 20px', borderRadius:7, background:'rgba(52,201,138,.12)', border:'1px solid rgba(52,201,138,.3)', color:'#34c98a', fontSize:13, fontWeight:600, textDecoration:'none', fontFamily:B }}>
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
                { e:'💡', l:'Midday Post', t:'12–1 PM', c:'#a78bfa', m:'Shares', cap:'The parents who grew the most aren\'t the ones who never struggled. Who needs this?' },
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
              <div style={{ textAlign:'center', fontSize:10, color:'rgba(255,255,255,.2)', padding:'4px 0' }}>+ Evening post · hashtags · image prompts inside →</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding:'72px 6%' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#7c6ff7', letterSpacing:'.1em', textTransform:'uppercase' as const, marginBottom:10 }}>What Markr does</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,36px)', fontWeight:800, margin:0, letterSpacing:'-0.025em', color:'#f5f5f7' }}>Three things. Done properly.</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }} className="feature-buckets">
            {[
              { n:'1', color:'#34c98a', bg:'rgba(52,201,138,.06)', border:'rgba(52,201,138,.18)', title:'Understand your app', icon:'🧪', items:['Real user testing & journey mapping','Find friction, confusion & drop-offs','Competitor & positioning insights'] },
              { n:'2', color:'#a78bfa', bg:'rgba(139,92,246,.06)', border:'rgba(139,92,246,.18)', title:'Generate content', icon:'✍️', items:['Daily posts that fit your app perfectly','Captions, hooks, hashtags & image prompts','Built for saves, shares & comments'] },
              { n:'3', color:'#60a5fa', bg:'rgba(59,130,246,.06)', border:'rgba(59,130,246,.18)', title:'Grow with strategy', icon:'📊', items:['BMC, SWOT, growth playbook','Pricing strategy tailored to your stage','Competitive intelligence that updates'] },
            ].map(b=>(
              <div key={b.title} style={{ background:b.bg, border:`1px solid ${b.border}`, borderRadius:12, padding:'20px 18px' }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='translateY(-2px)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='none'}
                style2={{ transition:'transform .2s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <span style={{ fontSize:20 }}>{b.icon}</span>
                  <div style={{ fontFamily:D, fontSize:14, fontWeight:700, color:b.color }}>{b.title}</div>
                </div>
                {b.items.map((item,i)=>(
                  <div key={i} style={{ display:'flex', gap:7, alignItems:'flex-start', marginBottom:7, fontSize:12, lineHeight:1.5 }}>
                    <span style={{ color:b.color, flexShrink:0, fontSize:10, marginTop:2 }}>✓</span>
                    <span style={{ color:'rgba(255,255,255,.65)' }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VIDEO ── */}
      <section id="video" style={{ padding:'72px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:780, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#7c6ff7', letterSpacing:'.1em', textTransform:'uppercase' as const, marginBottom:10 }}>See it in action</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(20px,2.5vw,32px)', fontWeight:800, margin:'0 0 8px', letterSpacing:'-0.025em', color:'#f5f5f7' }}>
              Watch Markr break down a real app in <span style={{ color:'#7c6ff7' }}>6 minutes</span>
            </h2>
          </div>
          <VideoEmbed />
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding:'72px 6%' }}>
        <div style={{ maxWidth:700, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#7c6ff7', letterSpacing:'.1em', textTransform:'uppercase' as const, marginBottom:10 }}>Simple pricing</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,36px)', fontWeight:800, margin:0, letterSpacing:'-0.025em', color:'#f5f5f7' }}>Start free. Upgrade when ready.</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }} className="pricing-grid">
            {[
              { plan:'Free', price:'₹0', period:'forever', color:'rgba(255,255,255,.08)', border:'rgba(255,255,255,.1)', items:['1 app','5 AI calls/day','7-day trial of all features','Content Studio','Strategy & Insights'], cta:'Get started free', ctaStyle:{ background:'rgba(255,255,255,.08)', color:'rgba(255,255,255,.8)', border:'1px solid rgba(255,255,255,.12)' }, href:'/app' },
              { plan:'Pro', price:'₹999', period:'/month', color:'rgba(124,111,247,.1)', border:'rgba(124,111,247,.4)', items:['Unlimited apps','200 AI calls/day','Daily email delivery','Product Test (QA simulation)','Priority support'], cta:'Upgrade to Pro', ctaStyle:{ background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', border:'none', boxShadow:'0 4px 14px rgba(124,111,247,.35)' }, href:'/app', badge:'Most popular' },
            ].map(p=>(
              <div key={p.plan} style={{ background:p.color, border:`1.5px solid ${p.border}`, borderRadius:14, padding:'22px 20px', position:'relative' }}>
                {(p as any).badge && <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'#7c6ff7', color:'#fff', fontSize:10, fontWeight:700, padding:'3px 12px', borderRadius:20, whiteSpace:'nowrap' }}>{(p as any).badge}</div>}
                <div style={{ fontFamily:D, fontSize:15, fontWeight:700, color:'#f0f0f5', marginBottom:6 }}>{p.plan}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:16 }}>
                  <span style={{ fontFamily:D, fontSize:28, fontWeight:800, color:'#f0f0f5' }}>{p.price}</span>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,.4)' }}>{p.period}</span>
                </div>
                {p.items.map(item=>(
                  <div key={item} style={{ display:'flex', gap:8, fontSize:12, color:'rgba(255,255,255,.6)', marginBottom:8, lineHeight:1.5 }}>
                    <span style={{ color:'#34c98a', flexShrink:0 }}>✓</span>{item}
                  </div>
                ))}
                <a href={p.href} style={{ display:'block', textAlign:'center', padding:'10px', borderRadius:8, fontSize:13, fontWeight:700, textDecoration:'none', marginTop:16, fontFamily:B, transition:'opacity .15s', ...p.ctaStyle }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>{p.cta}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ padding:'72px 6%', textAlign:'center', background:'rgba(124,111,247,.06)', borderTop:'1px solid rgba(124,111,247,.15)' }}>
        <div style={{ maxWidth:560, margin:'0 auto' }}>
          <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,38px)', fontWeight:800, letterSpacing:'-0.025em', margin:'0 0 12px', color:'#f5f5f7' }}>
            Ready to stop guessing?
          </h2>
          <p style={{ fontSize:14, color:'rgba(255,255,255,.45)', marginBottom:24, lineHeight:1.7 }}>
            Wake up to 3 ready-to-post captions every morning. Paste your URL and get your first insights in 2 minutes — free.
          </p>
          <a href="/app" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'12px 28px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:14, fontWeight:700, textDecoration:'none', fontFamily:B, boxShadow:'0 4px 20px rgba(124,111,247,.3)', transition:'opacity .15s' }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
            Analyze my app free →
          </a>
          <div style={{ marginTop:14, fontSize:11, color:'rgba(255,255,255,.25)' }}>No credit card · Free forever plan · 2 min setup</div>
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
