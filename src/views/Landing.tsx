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
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.45)' }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,.3)'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='rgba(0,0,0,.45)'} />
          <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:72, height:72, borderRadius:'50%', background:'rgba(124,111,247,.95)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 0 12px rgba(124,111,247,.2), 0 0 0 24px rgba(124,111,247,.08)', transition:'all .2s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translate(-50%,-50%) scale(1.1)'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translate(-50%,-50%) scale(1)'}}>
            <div style={{ width:0, height:0, borderTop:'12px solid transparent', borderBottom:'12px solid transparent', borderLeft:'18px solid #fff', marginLeft:4 }} />
          </div>
          <div style={{ position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)', fontSize:12, fontWeight:600, color:'rgba(255,255,255,.85)', whiteSpace:'nowrap', textShadow:'0 1px 4px rgba(0,0,0,.8)' }}>▶ Watch Markr analyze Emrise · 6 mins</div>
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
    window.location.href = url ? `/app?url=${encodeURIComponent(url)}` : '/app'
  }

  return (
    <div style={{ background:'#08080a', color:'#f0f0f5', fontFamily:B, overflowX:'hidden', lineHeight:1.6 }}>

      {/* ── NAV ── */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, display:'flex', alignItems:'center', height:60, padding:'0 6%', background: scrolled?'rgba(8,8,10,.95)':'transparent', backdropFilter: scrolled?'blur(20px)':'none', borderBottom: scrolled?'1px solid rgba(255,255,255,.06)':'none', transition:'all .25s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:16, fontWeight:800, color:'#fff' }}>M</div>
          <span style={{ fontFamily:D, fontSize:15, fontWeight:700, letterSpacing:'-.01em' }}>Markr</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:28, fontSize:13, color:'rgba(255,255,255,.55)' }} className="landing-nav-links">
          {[['Features','#features'],['How it works','#how'],['Pricing','#pricing'],['Resources','#video']].map(([l,h])=>(
            <a key={l} href={h} style={{ color:'inherit', textDecoration:'none', transition:'color .15s' }}
              onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.55)'}>{l}</a>
          ))}
        </div>
        <div style={{ flex:1, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <a href="/login" style={{ padding:'7px 16px', borderRadius:7, border:'1px solid rgba(255,255,255,.12)', color:'rgba(255,255,255,.6)', fontSize:13, textDecoration:'none', transition:'all .15s', fontFamily:B }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.3)';(e.currentTarget as HTMLElement).style.color='#fff'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.12)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.6)'}}>Sign in</a>
          <a href="/app" style={{ padding:'7px 18px', borderRadius:7, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none', fontFamily:B }}>Analyze my app</a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'120px 6% 80px', position:'relative', overflow:'hidden' }}>
        {/* Glow */}
        <div style={{ position:'absolute', top:'30%', left:'50%', transform:'translateX(-50%)', width:800, height:500, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(124,111,247,.12) 0%, transparent 65%)', pointerEvents:'none' }} />

        {/* Badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:20, border:'1px solid rgba(124,111,247,.3)', background:'rgba(124,111,247,.08)', fontSize:12, fontWeight:600, color:'#a599ff', marginBottom:28 }}>
          ✦ AI Marketing Co-founder for App Founders
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily:D, fontSize:'clamp(34px,5vw,68px)', fontWeight:800, lineHeight:1.08, margin:'0 0 8px', letterSpacing:'-0.03em', color:'#f5f5f7', maxWidth:860 }}>
          Your app already knows how to grow.
        </h1>
        <h1 style={{ fontFamily:D, fontSize:'clamp(34px,5vw,68px)', fontWeight:800, lineHeight:1.08, margin:'0 0 24px', letterSpacing:'-0.03em', maxWidth:860, background:'linear-gradient(135deg,#7c6ff7 20%,#e26faf 80%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          We just make it obvious.
        </h1>

        <p style={{ fontSize:17, color:'rgba(255,255,255,.5)', maxWidth:520, lineHeight:1.7, margin:'0 0 20px' }}>
          Paste your app URL. Markr analyzes it like a real user, tests what works, and generates exactly what to post — and why.
        </p>

        {/* Automated delivery highlight */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'10px 18px', borderRadius:10, border:'1px solid rgba(52,201,138,.3)', background:'rgba(52,201,138,.06)', marginBottom:32 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#34c98a', flexShrink:0, boxShadow:'0 0 8px #34c98a' }} />
          <span style={{ fontSize:13, color:'rgba(255,255,255,.8)', fontWeight:500 }}>
            <strong style={{ color:'#34c98a' }}>New:</strong> Wake up to 3 ready-to-post captions in your inbox — every morning, automatically.
          </span>
        </div>

        {/* URL input + CTA — like the screenshot */}
        <div style={{ display:'flex', gap:0, maxWidth:540, width:'100%', marginBottom:16, borderRadius:10, overflow:'hidden', border:'1.5px solid rgba(124,111,247,.4)', background:'rgba(255,255,255,.04)' }}>
          <input
            ref={inputRef}
            value={url} onChange={e=>setUrl(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleAnalyze()}
            placeholder="https://yourapp.com"
            style={{ flex:1, background:'transparent', border:'none', padding:'14px 16px', fontSize:14, color:'#fff', outline:'none', borderRadius:0 }}
          />
          <button onClick={handleAnalyze}
            style={{ padding:'14px 24px', background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:B, whiteSpace:'nowrap', transition:'opacity .15s' }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
            Analyze my app in 2 minutes →
          </button>
        </div>

        {/* Trust line */}
        <div style={{ display:'flex', alignItems:'center', gap:20, fontSize:12, color:'rgba(255,255,255,.35)', flexWrap:'wrap', justifyContent:'center' }} className="trust-badges">
          {['✓ No sign-up','✓ No credit card','✓ 2 min setup','✓ Real insights'].map(t=><span key={t}>{t}</span>)}
        </div>

        {/* 3-step visual flow — like the screenshot */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, maxWidth:860, width:'100%', marginTop:64 }} className="how-steps">
          {[
            { n:'1', title:'Paste your app URL', color:'#7c6ff7', content:(
              <div style={{ background:'rgba(255,255,255,.04)', borderRadius:8, padding:'10px 12px', marginTop:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.06)', borderRadius:6, padding:'8px 12px', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,.4)', flex:1 }}>https://yourapp.com</span>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:'#7c6ff7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#fff' }}>→</div>
                </div>
              </div>
            )},
            { n:'2', title:'Markr analyzes & tests', color:'#34c98a', content:(
              <div style={{ background:'rgba(255,255,255,.04)', borderRadius:8, padding:'10px 12px', marginTop:8 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginBottom:4 }}>Analyzing your app…</div>
                {['Exploring features','Testing user journey','Finding friction points','Analyzing competitors'].map(s=>(
                  <div key={s} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#34c98a', marginBottom:3 }}>
                    <span>✓</span>{s}
                  </div>
                ))}
              </div>
            )},
            { n:'3', title:'Get content & insights', color:'#e26faf', content:(
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, marginTop:8 }}>
                {[['Post idea','#7c6ff7'],['Content ideas','#34c98a'],['Insight','#f5a623'],['Why this works','#e26faf']].map(([l,c])=>(
                  <div key={l} style={{ background:`${c}18`, border:`1px solid ${c}35`, borderRadius:6, padding:'6px 8px', fontSize:10, color:c, fontWeight:600 }}>{l}</div>
                ))}
              </div>
            )},
          ].map((s,i)=>(
            <div key={s.n} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'16px', textAlign:'left', position:'relative' }}>
              {i < 2 && <div style={{ position:'absolute', right:-7, top:'50%', transform:'translateY(-50%)', width:14, height:14, borderRadius:'50%', background:'rgba(255,255,255,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'rgba(255,255,255,.5)', zIndex:1 }}>→</div>}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ width:22, height:22, borderRadius:6, background:s.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fff', flexShrink:0 }}>{s.n}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#f0f0f5' }}>{s.title}</div>
              </div>
              {s.content}
            </div>
          ))}
        </div>

        {/* Social proof logos row */}
        <div style={{ marginTop:48, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', justifyContent:'center' }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.3)', letterSpacing:'.08em', textTransform:'uppercase' }}>Trusted by founders building</span>
          {['Mindprint','Emrise','Tiny Tummies','Your app →'].map(n=>(
            <span key={n} style={{ fontSize:12, padding:'4px 12px', borderRadius:20, border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.4)' }}>{n}</span>
          ))}
        </div>
      </section>

      {/* ── PAIN ── */}
      <section style={{ padding:'80px 6%', borderTop:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth:960, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:60, alignItems:'center' }} className="two-col">
          <div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(28px,3.5vw,48px)', fontWeight:800, letterSpacing:'-0.03em', margin:'0 0 16px', lineHeight:1.1, color:'#f5f5f7' }}>
              Your app isn't<br />the problem.<br />
              <span style={{ background:'linear-gradient(135deg,#7c6ff7,#e26faf)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Your marketing<br />is guesswork.</span>
            </h2>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.45)', lineHeight:1.75, maxWidth:380 }}>
              Most founders build great products but struggle to communicate their value. You know your app — you just don't know what to say about it.
            </p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[
              { icon:'😓', title:"You don't know what to post", desc:'Starting at a blank screen every day.' },
              { icon:'🤔', title:"You don't know what users care about", desc:'No idea which features actually matter.' },
              { icon:'📉', title:"You don't know why users drop off", desc:'Bugs, friction, confusion — you find out too late.' },
              { icon:'🎯', title:"You don't know how you compare", desc:'Competitors exist. You\'re not watching them.' },
            ].map(p=>(
              <div key={p.title} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:12, padding:'16px 14px' }}>
                <div style={{ fontSize:24, marginBottom:8 }}>{p.icon}</div>
                <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,.8)', marginBottom:4, lineHeight:1.4 }}>{p.title}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.35)', lineHeight:1.55 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VIDEO ── */}
      <section id="video" style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:36 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' as const, color:'#7c6ff7', marginBottom:12 }}>See Markr in action</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3vw,40px)', fontWeight:800, margin:'0 0 8px', letterSpacing:'-0.03em', color:'#f5f5f7' }}>
              Watch Markr break down a real app in <span style={{ color:'#7c6ff7' }}>60 seconds</span>
            </h2>
            <div style={{ display:'flex', gap:20, justifyContent:'center', flexWrap:'wrap', marginTop:14 }}>
              {['Real user testing & friction points','Content ideas based on what works','Growth insights you can act on'].map(t=>(
                <div key={t} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'rgba(255,255,255,.55)' }}>
                  <span style={{ color:'#7c6ff7' }}>●</span>{t}
                </div>
              ))}
            </div>
          </div>
          <VideoEmbed />
          <div style={{ textAlign:'center', marginTop:18 }}>
            <a href="#how" style={{ fontSize:13, color:'#a599ff', textDecoration:'none' }}>See how it works →</a>
          </div>
        </div>
      </section>

      {/* ── AUTOMATED DELIVERY HIGHLIGHT ── */}
      <section style={{ padding:'60px 6%', background:'linear-gradient(135deg,rgba(52,201,138,.06),rgba(124,111,247,.06))', borderTop:'1px solid rgba(52,201,138,.15)', borderBottom:'1px solid rgba(52,201,138,.15)' }}>
        <div style={{ maxWidth:960, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:48, alignItems:'center' }} className="two-col">
          <div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'4px 12px', borderRadius:20, background:'rgba(52,201,138,.12)', border:'1px solid rgba(52,201,138,.3)', fontSize:11, fontWeight:700, color:'#34c98a', marginBottom:16, letterSpacing:'.05em', textTransform:'uppercase' as const }}>
              ✦ Agentic AI — runs while you sleep
            </div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3vw,42px)', fontWeight:800, margin:'0 0 16px', letterSpacing:'-0.03em', color:'#f5f5f7', lineHeight:1.1 }}>
              Your content plan.<br />
              <span style={{ color:'#34c98a' }}>In your inbox.</span><br />
              Every morning.
            </h2>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.55)', lineHeight:1.75, marginBottom:24 }}>
              Enable daily delivery and Markr's AI agent generates 3 Instagram posts for your app every morning — captions, hashtags, image prompts, hooks — and sends them straight to your inbox before you wake up.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { icon:'🌅', text:'Morning post optimised for saves — ready at 6:30am' },
                { icon:'💡', text:'Midday post optimised for shares — written overnight' },
                { icon:'🌙', text:'Evening post optimised for comments — zero effort' },
                { icon:'🔄', text:'Fully automated — no app opens required' },
              ].map(i => (
                <div key={i.text} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:'rgba(255,255,255,.75)' }}>
                  <span style={{ fontSize:16, flexShrink:0 }}>{i.icon}</span>
                  <span>{i.text}</span>
                </div>
              ))}
            </div>
            <a href="/app" style={{ display:'inline-flex', alignItems:'center', gap:8, marginTop:24, padding:'11px 24px', borderRadius:9, background:'#34c98a', color:'#000', fontSize:14, fontWeight:700, textDecoration:'none', transition:'opacity .15s', fontFamily:B }}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
              Enable daily delivery →
            </a>
          </div>

          {/* Email preview mockup */}
          <div style={{ background:'#161619', borderRadius:16, border:'1px solid rgba(255,255,255,.08)', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>
            {/* Email client header */}
            <div style={{ background:'#111113', padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:'#e55' }} />
              <div style={{ width:10, height:10, borderRadius:'50%', background:'#f5a623' }} />
              <div style={{ width:10, height:10, borderRadius:'50%', background:'#34c98a' }} />
              <div style={{ flex:1, textAlign:'center', fontSize:11, color:'rgba(255,255,255,.3)' }}>Inbox</div>
            </div>
            {/* Email subject line */}
            <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,.06)', background:'rgba(52,201,138,.05)' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginBottom:4 }}>From: Markr &lt;markr@journaljoy.org&gt;</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#f0f0f5' }}>Your Mindprint content plan for today 🚀</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:2 }}>Sunday, 1 June · 6:30 AM</div>
            </div>
            {/* Email content preview */}
            <div style={{ padding:'16px' }}>
              {[
                { emoji:'🌅', label:'Morning Post', time:'7–9 AM', color:'#60a5fa', badge:'Saves', text:'You don\'t have to earn a peaceful morning. Just notice: the weight of the mug in your hand.\n\nWhat are you noticing right now?' },
                { emoji:'💡', label:'Midday Post', time:'12–1:30 PM', color:'#a78bfa', badge:'Shares', text:'The people who\'ve grown the most aren\'t the ones who never fell apart.\n\nWho needs to hear this today?' },
              ].map(p => (
                <div key={p.label} style={{ background:'rgba(255,255,255,.03)', borderRadius:10, padding:'12px', marginBottom:8, border:`1px solid ${p.color}25` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:14 }}>{p.emoji}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:p.color }}>{p.label}</span>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,.3)', marginLeft:'auto' }}>{p.time}</span>
                    <span style={{ fontSize:9, padding:'2px 7px', borderRadius:20, background:`${p.color}18`, color:p.color, fontWeight:700 }}>{p.badge}</span>
                  </div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.6)', lineHeight:1.6, fontStyle:'italic' }}>{p.text}</div>
                </div>
              ))}
              <div style={{ textAlign:'center', padding:'8px 0', fontSize:11, color:'rgba(255,255,255,.25)' }}>+ Evening post & hashtags inside →</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES — 3 buckets ── */}
      <section id="features" style={{ padding:'80px 6%' }}>
        <div style={{ maxWidth:1000, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' as const, color:'#7c6ff7', marginBottom:10 }}>Our promise</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3vw,40px)', fontWeight:800, margin:0, letterSpacing:'-0.03em', color:'#f5f5f7' }}>Three things. Done properly.</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }} className="feature-buckets">
            {[
              { n:'1.', color:'#34c98a', bg:'rgba(52,201,138,.07)', border:'rgba(52,201,138,.2)', title:'Understand your app', icon:'🧪', items:[['Real user testing','& journey mapping'],['Find friction,','confusion & drop-offs'],['Competitor','& positioning insights']] },
              { n:'2.', color:'#a78bfa', bg:'rgba(139,92,246,.07)', border:'rgba(139,92,246,.2)', title:'Generate content', icon:'✍️', items:[['Daily content ideas','that fit your app'],['Posts, carousels,','hooks & captions'],['Designed for growth,','not vanity']] },
              { n:'3.', color:'#60a5fa', bg:'rgba(59,130,246,.07)', border:'rgba(59,130,246,.2)', title:'Grow with confidence', icon:'📊', items:[['Know what to post','& when'],['Track what works','and scale it'],['Make decisions','backed by data']] },
            ].map(b=>(
              <div key={b.title} style={{ background:b.bg, border:`1px solid ${b.border}`, borderRadius:14, padding:'24px 20px', transition:'transform .2s' }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='translateY(-3px)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='none'}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                  <span style={{ fontSize:24 }}>{b.icon}</span>
                  <div>
                    <div style={{ fontSize:11, color:b.color, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase' as const }}>{b.n}</div>
                    <div style={{ fontFamily:D, fontSize:16, fontWeight:700, color:b.color, letterSpacing:'-.01em' }}>{b.title}</div>
                  </div>
                </div>
                {b.items.map(([bold,rest],i)=>(
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:8, fontSize:13, lineHeight:1.5 }}>
                    <span style={{ color:b.color, flexShrink:0, marginTop:2, fontSize:11 }}>✓</span>
                    <span><strong style={{ color:'rgba(255,255,255,.85)', fontWeight:600 }}>{bold}</strong> <span style={{ color:'rgba(255,255,255,.5)' }}>{rest}</span></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BEFORE / AFTER ── */}
      <section style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' as const, color:'#7c6ff7', marginBottom:10 }}>What changes in your first 10 minutes</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 48px 1fr', gap:0, alignItems:'center' }} className="before-after">
            <div style={{ background:'rgba(229,85,85,.06)', border:'1px solid rgba(229,85,85,.2)', borderRadius:14, padding:'24px 20px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#e55555', marginBottom:16, letterSpacing:'.05em', textTransform:'uppercase' as const }}>Before Markr</div>
              {['Guessing what to post every day','Spending hours writing captions','No idea what users care about','Vague strategy, no clear plan','Wasting time & money'].map(t=>(
                <div key={t} style={{ display:'flex', gap:8, alignItems:'center', padding:'7px 0', borderBottom:'1px solid rgba(229,85,85,.1)', fontSize:13, color:'rgba(255,255,255,.5)' }}>
                  <span style={{ color:'#e55555', flexShrink:0 }}>✕</span>{t}
                </div>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, color:'#fff', fontWeight:700 }}>→</div>
            </div>
            <div style={{ background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.2)', borderRadius:14, padding:'24px 20px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#34c98a', marginBottom:16, letterSpacing:'.05em', textTransform:'uppercase' as const }}>After Markr</div>
              {['3 posts in your inbox every morning','Zero time spent writing captions','Real insights from real user testing','Strategy tailored to your app','Save time. Grow faster.'].map(t=>(
                <div key={t} style={{ display:'flex', gap:8, alignItems:'center', padding:'7px 0', borderBottom:'1px solid rgba(52,201,138,.1)', fontSize:13, color:'rgba(255,255,255,.75)', fontWeight:500 }}>
                  <span style={{ color:'#34c98a', flexShrink:0 }}>✓</span>{t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section style={{ padding:'80px 6%' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:24, marginBottom:48 }} className="social-stats">
            {[
              { stat:'2 min', label:'To get your first insights', color:'#a599ff' },
              { stat:'3×', label:'Faster content creation', color:'#34c98a' },
              { stat:'10K+', label:'Posts generated', color:'#f5a623' },
              { stat:'120+', label:'Happy founders', color:'#e26faf' },
            ].map(s=>(
              <div key={s.stat} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:D, fontSize:40, fontWeight:800, color:s.color, letterSpacing:'-0.03em', lineHeight:1, marginBottom:6 }}>{s.stat}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', lineHeight:1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Testimonials */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }} className="testimonials">
            {[
              { name:'Rohan Chaudhary', role:'Founder, CourseAI', avatar:'RC', quote:'Markr helped us figure out what to post and why. Our signups went up 47% in 3 weeks.', stars:5 },
              { name:'Ananya Verma', role:'Founder, StudyBuddy', avatar:'AV', quote:'I finally understand what users love about my app. The content ideas are spot on!', stars:5 },
            ].map(t=>(
              <div key={t.name} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:14, padding:'22px 24px' }}>
                <div style={{ display:'flex', gap:3, marginBottom:12 }}>
                  {Array.from({length:t.stars}).map((_,i)=><span key={i} style={{ color:'#f5a623', fontSize:14 }}>★</span>)}
                </div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,.75)', lineHeight:1.7, marginBottom:16, fontStyle:'italic' }}>"{t.quote}"</div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>{t.avatar}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{t.name}</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:680, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' as const, color:'#7c6ff7', marginBottom:10 }}>Simple, transparent pricing</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3vw,40px)', fontWeight:800, margin:'0 0 8px', letterSpacing:'-0.03em', color:'#f5f5f7' }}>Start free. Scale when ready.</h2>
            <p style={{ fontSize:14, color:'rgba(255,255,255,.4)' }}>7-day free trial. Cancel anytime.</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }} className="pricing-cards">
            {[
              { name:'Free', price:'₹0', period:'/month', highlight:false, desc:'Perfect to get started.', features:['1 app','Basic analysis','5 content ideas/month'], cta:'Start for free', href:'/app' },
              { name:'Pro', price:'₹999', period:'/month', highlight:true, desc:'Everything you need to grow.', features:['Unlimited apps','Unlimited content generation','Hooks & captions','Competitor insights','Growth strategy','Priority support'], cta:'Start Pro Trial', href:'/app', badge:'Most popular' },
            ].map(plan=>(
              <div key={plan.name} style={{ background: plan.highlight?'linear-gradient(135deg,rgba(124,111,247,.15),rgba(226,111,175,.1))':'rgba(255,255,255,.03)', border:`1px solid ${plan.highlight?'rgba(124,111,247,.5)':'rgba(255,255,255,.08)'}`, borderRadius:16, padding:28, position:'relative', boxShadow: plan.highlight?'0 0 60px rgba(124,111,247,.15)':'none' }}>
                {plan.highlight && <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:'linear-gradient(135deg,#7c6ff7,#e26faf)', padding:'3px 14px', borderRadius:20, fontSize:11, fontWeight:700, color:'#fff', whiteSpace:'nowrap' }}>Most popular</div>}
                <div style={{ fontFamily:D, fontSize:16, fontWeight:700, marginBottom:4 }}>{plan.name}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:3, marginBottom:6 }}>
                  <span style={{ fontFamily:D, fontSize:38, fontWeight:800, color: plan.highlight?'#a599ff':'#f0f0f5', letterSpacing:'-0.03em' }}>{plan.price}</span>
                  <span style={{ fontSize:13, color:'rgba(255,255,255,.35)' }}>{plan.period}</span>
                </div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.4)', marginBottom:20 }}>{plan.desc}</div>
                {plan.features.map(f=>(
                  <div key={f} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, fontSize:13, color:'rgba(255,255,255,.7)' }}>
                    <span style={{ color:'#34c98a', fontSize:12, flexShrink:0 }}>✓</span>{f}
                  </div>
                ))}
                <a href={plan.href} style={{ display:'block', textAlign:'center', padding:'12px 20px', borderRadius:8, background: plan.highlight?'linear-gradient(135deg,#7c6ff7,#9b8af4)':'rgba(255,255,255,.06)', border: plan.highlight?'none':'1px solid rgba(255,255,255,.1)', color:'#fff', fontSize:14, fontWeight:600, textDecoration:'none', marginTop:20, transition:'opacity .15s', fontFamily:B }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
          <div style={{ textAlign:'center', marginTop:16, fontSize:13, color:'rgba(255,255,255,.3)' }}>7-day free trial. Cancel anytime.</div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ padding:'96px 6%', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:700, height:350, borderRadius:'50%', background:'radial-gradient(circle, rgba(124,111,247,.08) 0%, transparent 70%)', pointerEvents:'none' }} />
        <div style={{ position:'relative', maxWidth:600, margin:'0 auto' }}>
          <h2 style={{ fontFamily:D, fontSize:'clamp(26px,3.5vw,52px)', fontWeight:800, margin:'0 0 12px', letterSpacing:'-0.03em', color:'#f5f5f7', lineHeight:1.1 }}>
            You already built the product.<br />
            Now let it tell you{' '}
            <span style={{ background:'linear-gradient(135deg,#7c6ff7,#e26faf)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>how to grow.</span>
          </h2>
          <p style={{ fontSize:16, color:'rgba(255,255,255,.45)', marginBottom:32 }}>
            Wake up to 3 ready-to-post captions every morning. Stop guessing. Start growing with Markr.
          </p>
          <a href="/app" style={{ display:'inline-flex', alignItems:'center', gap:10, padding:'14px 36px', borderRadius:10, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:15, fontWeight:700, textDecoration:'none', boxShadow:'0 0 40px rgba(124,111,247,.3)', transition:'all .2s', fontFamily:B }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 40px rgba(124,111,247,.45)'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow='0 0 40px rgba(124,111,247,.3)'}}>
            Get your first insights in 2 minutes →
          </a>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.25)', marginTop:12 }}>No sign-up. No credit card. Just clarity.</div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding:'32px 6%', borderTop:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:24, height:24, borderRadius:6, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:13, fontWeight:800, color:'#fff' }}>M</div>
          <span style={{ fontFamily:D, fontSize:13, fontWeight:700, color:'rgba(255,255,255,.5)' }}>Markr</span>
          <span style={{ fontSize:12, color:'rgba(255,255,255,.25)' }}>© 2025 Markr. All rights reserved.</span>
        </div>
        <div style={{ display:'flex', gap:20, fontSize:12, flexWrap:'wrap' }}>
          {[['Features','#features'],['Pricing','#pricing'],['Sign in','/login'],['Terms','#'],['Privacy','#'],['Contact','mailto:hello@markr.app']].map(([l,h])=>(
            <a key={l} href={h} style={{ color:'rgba(255,255,255,.35)', textDecoration:'none', transition:'color .15s' }}
              onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,.7)'}
              onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.35)'}>{l}</a>
          ))}
        </div>
        <div style={{ display:'flex', gap:14 }}>
          {[['𝕏','/'],['in','/'],['▶','/']].map(([icon,href])=>(
            <a key={icon} href={href} style={{ width:28, height:28, borderRadius:6, border:'1px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'rgba(255,255,255,.4)', textDecoration:'none', transition:'all .15s' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.3)';(e.currentTarget as HTMLElement).style.color='#fff'}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.1)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.4)'}}>{icon}</a>
          ))}
        </div>
      </footer>
    </div>
  )
}
