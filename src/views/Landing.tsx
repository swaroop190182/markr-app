import { useState, useEffect } from 'react'

const D = "'Syne', sans-serif"
const B = "'DM Sans', sans-serif"

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const grad = { background: 'linear-gradient(135deg,#7c6ff7 30%,#e26faf)', WebkitBackgroundClip: 'text' as const, WebkitTextFillColor: 'transparent' }

  return (
    <div style={{ background: '#0b0b0d', color: '#f0f0f5', fontFamily: B, overflowX: 'hidden', lineHeight: 1.6 }}>

      {/* NAV */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, display:'flex', alignItems:'center', height:60, padding:'0 6%', background: scrolled?'rgba(11,11,13,.92)':'transparent', backdropFilter: scrolled?'blur(16px)':'none', borderBottom: scrolled?'1px solid rgba(255,255,255,.06)':'none', transition:'all .25s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, flex:1 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:16, fontWeight:800, color:'#fff' }}>M</div>
          <span style={{ fontFamily:D, fontSize:15, fontWeight:700, letterSpacing:'-.01em' }}>Markr</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:32, fontSize:13, color:'rgba(255,255,255,.5)' }}>
          {[['Features','#features'],['How it works','#how'],['Pricing','#pricing']].map(([l,h])=>(
            <a key={l} href={h} style={{ color:'inherit', textDecoration:'none', transition:'color .15s' }} onMouseEnter={e=>(e.currentTarget.style.color='#fff')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,.5)')}>{l}</a>
          ))}
        </div>
        <div style={{ flex:1, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <a href="/login" style={{ padding:'7px 16px', borderRadius:7, border:'1px solid rgba(255,255,255,.12)', color:'rgba(255,255,255,.6)', fontSize:13, textDecoration:'none', transition:'all .15s', fontFamily:B }} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.3)';(e.currentTarget as HTMLElement).style.color='#fff'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.12)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.6)'}}>Sign in</a>
          <a href="/app" style={{ padding:'7px 18px', borderRadius:7, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none', fontFamily:B, transition:'opacity .15s' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>Get started free</a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'120px 6% 80px', position:'relative' }}>
        <div style={{ position:'absolute', top:'20%', left:'10%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(124,111,247,.09) 0%, transparent 65%)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:'40%', right:'5%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(226,111,175,.06) 0%, transparent 65%)', pointerEvents:'none' }} />

        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:20, border:'1px solid rgba(124,111,247,.3)', background:'rgba(124,111,247,.08)', fontSize:12, fontWeight:600, color:'#a599ff', marginBottom:28, letterSpacing:'.01em' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#7c6ff7', display:'inline-block' }} />
          Your AI co-founder for launch and growth
        </div>

        <h1 style={{ fontFamily:D, fontSize:'clamp(32px,4.5vw,64px)', fontWeight:800, lineHeight:1.1, margin:'0 0 8px', letterSpacing:'-0.03em', color:'#f5f5f7' }}>
          The AI co-founder you didn't have.
        </h1>
        <h1 style={{ fontFamily:D, fontSize:'clamp(24px,3vw,42px)', fontWeight:700, lineHeight:1.2, margin:'0 0 28px', letterSpacing:'-0.02em', color:'rgba(255,255,255,.5)' }}>
          Launch, grow, and market any app —{' '}
          <span style={grad}>without a team.</span>
        </h1>

        {/* Mechanism line */}
        <div style={{ background:'rgba(124,111,247,.08)', border:'1px solid rgba(124,111,247,.2)', borderRadius:12, padding:'14px 24px', maxWidth:600, marginBottom:36, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:18, flexShrink:0 }}>⚡</span>
          <p style={{ fontSize:15, color:'rgba(255,255,255,.85)', lineHeight:1.55, margin:0, fontWeight:500 }}>
            Paste your app URL. Markr analyzes it, tests it like a real user, and tells you <strong style={{ color:'#a599ff' }}>exactly what to post and why</strong>.
          </p>
        </div>

        <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center', marginBottom:52 }}>
          <a href="/app" style={{ padding:'13px 30px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:14, fontWeight:700, textDecoration:'none', boxShadow:'0 0 32px rgba(124,111,247,.28)', transition:'all .2s', fontFamily:B, letterSpacing:'-.01em' }} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 40px rgba(124,111,247,.4)'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow='0 0 32px rgba(124,111,247,.28)'}}>
            Get your first insights in 2 minutes →
          </a>
          <a href="#how" style={{ padding:'13px 24px', borderRadius:9, border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.6)', fontSize:14, textDecoration:'none', transition:'all .2s', fontFamily:B }} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.25)';(e.currentTarget as HTMLElement).style.color='#fff'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.1)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.6)'}}>
            See how it works →
          </a>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:24, fontSize:12, color:'rgba(255,255,255,.3)', flexWrap:'wrap', justifyContent:'center' }}>
          {['✓ No agency needed','✓ Works with any app','✓ First insights in 2 minutes','✓ Free to start'].map(t=><span key={t}>{t}</span>)}
        </div>

        {/* App mockup */}
        <div style={{ marginTop:64, width:'100%', maxWidth:960, position:'relative' }}>
          <div style={{ position:'absolute', inset:-1, borderRadius:18, background:'linear-gradient(135deg,rgba(124,111,247,.25),rgba(226,111,175,.15))', filter:'blur(1px)' }} />
          <div style={{ position:'relative', background:'#161619', borderRadius:16, border:'1px solid rgba(255,255,255,.08)', overflow:'hidden', boxShadow:'0 32px 80px rgba(0,0,0,.6)' }}>
            <div style={{ background:'#111113', padding:'10px 14px', display:'flex', alignItems:'center', gap:7, borderBottom:'1px solid rgba(255,255,255,.05)' }}>
              {['#e55','#f5a623','#34c98a'].map(c=><div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c }} />)}
              <div style={{ flex:1, background:'rgba(255,255,255,.04)', borderRadius:5, padding:'3px 12px', fontSize:11, color:'rgba(255,255,255,.25)', marginLeft:10 }}>markr.mindprintjournal.com</div>
            </div>
            <div style={{ display:'flex', height:380 }}>
              <div style={{ width:170, background:'#161619', borderRight:'1px solid rgba(255,255,255,.06)', padding:'14px 8px', flexShrink:0 }}>
                {['Overview','Content Studio','Strategy','Calendar','Insights'].map((item,i)=>(
                  <div key={item} style={{ padding:'7px 10px', borderRadius:6, fontSize:11, color:i===1?'#a599ff':'rgba(255,255,255,.35)', background:i===1?'rgba(124,111,247,.12)':'transparent', marginBottom:2 }}>{item}</div>
                ))}
                <div style={{ marginTop:14, fontSize:9, color:'rgba(255,255,255,.2)', padding:'0 10px 5px', letterSpacing:'.07em', textTransform:'uppercase' }}>My Apps</div>
                {[['Mindprint','#e26faf'],['TaskFlow Pro','#7c6ff7'],['SnapBudget','#34c98a']].map(([n,c])=>(
                  <div key={n} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6, marginBottom:2 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:c, flexShrink:0 }} />
                    <span style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>{n}</span>
                  </div>
                ))}
              </div>
              <div style={{ flex:1, padding:'18px 18px 14px', overflow:'hidden' }}>
                <div style={{ fontSize:13, fontWeight:700, fontFamily:D, marginBottom:12, color:'rgba(255,255,255,.85)', letterSpacing:'-.01em' }}>Content Studio · Mindprint</div>
                <div style={{ display:'flex', gap:7, marginBottom:12, flexWrap:'wrap' }}>
                  {[['#60a5fa','rgba(59,130,246,.1)','🌅 Daily journaling'],['#a78bfa','rgba(139,92,246,.1)','💡 Breaking bad habits'],['#34d399','rgba(16,185,129,.1)','🌙 Loneliness & connection']].map(([c,bg,l])=>(
                    <span key={l} style={{ fontSize:10, padding:'3px 9px', borderRadius:20, fontWeight:600, background:bg, color:c, border:`1px solid ${c}35` }}>{l}</span>
                  ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {[
                    { t:'Morning Post', time:'7–9 AM', c:'#60a5fa', bg:'rgba(59,130,246,.07)', b:'rgba(59,130,246,.2)', badge:true, text:"You don't have to earn a peaceful morning. Just notice the weight of the mug in your hand.\n\nWhat are you noticing right now?" },
                    { t:'Midday Post', time:'12–1:30 PM', c:'#a78bfa', bg:'rgba(139,92,246,.07)', b:'rgba(139,92,246,.2)', badge:true, text:"The people who've grown the most aren't the ones who never fell apart.\n\nWho needs to hear this today?" },
                    { t:'Evening Post', time:'7–9 PM', c:'#34d399', bg:'rgba(16,185,129,.07)', b:'rgba(16,185,129,.2)', badge:false, text:null },
                  ].map(card=>(
                    <div key={card.t} style={{ background:'#1e1e23', borderRadius:9, border:`1.5px solid ${card.badge?card.b:'#26262d'}`, overflow:'hidden' }}>
                      <div style={{ padding:'8px 10px', background:card.bg, borderBottom:'1px solid rgba(255,255,255,.04)', display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:10, fontWeight:600, color:card.c, fontFamily:D }}>{card.t}</div>
                          <div style={{ fontSize:9, color:'rgba(255,255,255,.3)', marginTop:1 }}>{card.time}</div>
                        </div>
                        {card.badge && <span style={{ fontSize:8, padding:'2px 5px', borderRadius:20, fontWeight:700, background:card.bg, color:card.c, border:`1px solid ${card.b}` }}>Ready ✓</span>}
                      </div>
                      <div style={{ padding:'9px 10px' }}>
                        {card.text ? <div style={{ fontSize:9.5, lineHeight:1.65, color:'rgba(255,255,255,.6)', whiteSpace:'pre-wrap' }}>{card.text}</div>
                          : <div style={{ textAlign:'center', padding:'10px 0' }}>
                              <div style={{ fontSize:9, color:'rgba(255,255,255,.25)', marginBottom:7 }}>Ready to generate</div>
                              <div style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${card.b}`, fontSize:9, fontWeight:600, color:card.c, display:'inline-block' }}>✨ Generate post</div>
                            </div>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PAIN SECTION */}
      <section style={{ padding:'80px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:760, margin:'0 auto', textAlign:'center' }}>
          <h2 style={{ fontFamily:D, fontSize:'clamp(22px,3vw,40px)', fontWeight:800, letterSpacing:'-0.03em', margin:'0 0 16px', color:'#f5f5f7' }}>
            Most founders build alone.
            <br />
            <span style={{ color:'rgba(255,255,255,.4)', fontWeight:600, fontSize:'.85em' }}>No marketing team. No growth strategist. Just you.</span>
          </h2>
          <p style={{ fontSize:16, color:'rgba(255,255,255,.45)', maxWidth:520, margin:'0 auto 40px', lineHeight:1.75 }}>
            You know your product better than anyone. But marketing it still feels like guessing — what to post, why users drop off, how you stack up. Markr is the co-founder who handles all of that.
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, textAlign:'left' }}>
            {[
              { icon:'😓', problem:'What do I post today?', fix:'Daily content — written, ready, optimised.' },
              { icon:'🤔', problem:'Why are users dropping off?', fix:'Real QA testing — bugs, friction, UX scores.' },
              { icon:'📊', problem:'How do I stack up against competitors?', fix:'Competitive analysis — benchmarks, gaps, wins.' },
            ].map(item=>(
              <div key={item.problem} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:14, padding:'20px 18px' }}>
                <div style={{ fontSize:28, marginBottom:12 }}>{item.icon}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.35)', marginBottom:10, lineHeight:1.5, fontStyle:'italic' }}>"{item.problem}"</div>
                <div style={{ width:28, height:2, background:'linear-gradient(90deg,#7c6ff7,#e26faf)', borderRadius:2, marginBottom:10 }} />
                <div style={{ fontSize:13, color:'rgba(255,255,255,.7)', lineHeight:1.6, fontWeight:500 }}>{item.fix}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding:'96px 6%' }}>
        <div style={{ maxWidth:860, margin:'0 auto', textAlign:'center' }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'#7c6ff7', marginBottom:12 }}>Simple by design</div>
          <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3.2vw,42px)', fontWeight:800, margin:'0 0 52px', letterSpacing:'-0.03em', color:'#f5f5f7' }}>Up and running in 3 steps</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:40, textAlign:'left' }}>
            {[
              { n:'01', icon:'🔗', c:'#7c6ff7', title:'Add your app', desc:'Paste your app URL. Markr reads it and extracts your features, audience, tone, and category — automatically.' },
              { n:'02', icon:'🧪', c:'#34c98a', title:'AI tests it', desc:'Give test credentials. Markr logs in, explores every feature, finds friction, and writes a full QA report.' },
              { n:'03', icon:'✨', c:'#e26faf', title:'Generate everything', desc:'Daily content, competitive analysis, growth strategies, and pricing — all grounded in your real product.' },
            ].map(s=>(
              <div key={s.n}>
                <div style={{ fontFamily:D, fontSize:44, fontWeight:800, color:'rgba(255,255,255,.04)', lineHeight:1, marginBottom:10 }}>{s.n}</div>
                <span style={{ fontSize:26, display:'block', marginBottom:10 }}>{s.icon}</span>
                <div style={{ fontFamily:D, fontSize:17, fontWeight:700, marginBottom:8, color:s.c, letterSpacing:'-.01em' }}>{s.title}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.45)', lineHeight:1.75 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VIDEO DEMO */}
      <section style={{ padding:'96px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:40 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' as const, color:'#7c6ff7', marginBottom:12 }}>See it in action</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3.2vw,42px)', fontWeight:800, margin:'0 0 12px', letterSpacing:'-0.03em', color:'#f5f5f7' }}>Watch Markr analyze a real app</h2>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.4)', maxWidth:480, margin:'0 auto' }}>
              Emrise — analyzed, tested, and content-ready in minutes. This is what Markr generates for a real app.
            </p>
          </div>

          {/* Video embed */}
          <div style={{ position:'relative', width:'100%', paddingBottom:'56.25%', borderRadius:16, overflow:'hidden', border:'1px solid rgba(255,255,255,.08)', boxShadow:'0 32px 80px rgba(0,0,0,.6)' }}>
            <iframe
              style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'none' }}
              src="https://www.youtube.com/embed/G8xh5wXhemU"
              title="Markr Demo — AI co-founder for app founders"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          <div style={{ display:'flex', justifyContent:'center', gap:32, marginTop:28, flexWrap:'wrap' }}>
            {[
              { t:'App analyzed', d:'Emrise' },
              { t:'Category', d:'Mental wellness' },
              { t:'Time to first insights', d:'Under 2 mins' },
            ].map(s=>(
              <div key={s.t} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:D, fontSize:18, fontWeight:700, color:'#a599ff', marginBottom:4 }}>{s.d}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.35)' }}>{s.t}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES — 3 buckets */}
      <section id="features" style={{ padding:'96px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:1060, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'#7c6ff7', marginBottom:12 }}>What Markr does</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3.2vw,42px)', fontWeight:800, margin:'0 0 14px', letterSpacing:'-0.03em', color:'#f5f5f7' }}>Three things. Done properly.</h2>
            <p style={{ fontSize:16, color:'rgba(255,255,255,.4)', maxWidth:440, margin:'0 auto' }}>Not a feature list. A focused system that moves your app forward.</p>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20, marginBottom:20 }}>
            {[
              { num:'01', icon:'🧪', color:'#34c98a', bg:'rgba(52,201,138,.07)', border:'rgba(52,201,138,.18)', title:'Understand your app', sub:'Real product testing', items:['Logs in and explores every feature','Rates UX across 6 dimensions','Finds bugs with severity ratings','Generates a full QA report','Content strategy informed by real findings'] },
              { num:'02', icon:'✍️', color:'#a78bfa', bg:'rgba(139,92,246,.07)', border:'rgba(139,92,246,.18)', title:'Generate content', sub:'Instagram content engine', items:['3 posts/day — morning, midday, evening','Each optimised for saves, shares, or comments','Full captions, hashtags, image prompts','Post ideas, hooks, and timing','Grounded in what your app actually does'] },
              { num:'03', icon:'📊', color:'#4f9cf7', bg:'rgba(79,156,247,.07)', border:'rgba(79,156,247,.18)', title:'Grow with confidence', sub:'Strategy & insights', items:['5 real competitors identified and compared','Business Model Canvas — all 9 blocks','AARRR growth playbook','Pricing strategy with tier recommendations','SWOT analysis and strategic priorities'] },
            ].map(b=>(
              <div key={b.title} style={{ background:b.bg, border:`1px solid ${b.border}`, borderRadius:16, padding:'28px 24px', transition:'transform .2s' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='translateY(-3px)'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='none'}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:28 }}>{b.icon}</span>
                  <span style={{ fontFamily:D, fontSize:11, color:b.color, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase' as const }}>{b.num}</span>
                </div>
                <div style={{ fontFamily:D, fontSize:19, fontWeight:800, color:b.color, marginBottom:4, letterSpacing:'-.02em' }}>{b.title}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.35)', marginBottom:18, fontWeight:500 }}>{b.sub}</div>
                {b.items.map(item=>(
                  <div key={item} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:9, fontSize:13, color:'rgba(255,255,255,.65)', lineHeight:1.5 }}>
                    <span style={{ color:b.color, flexShrink:0, fontSize:11, marginTop:2 }}>✓</span>{item}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section style={{ padding:'96px 6%' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'#7c6ff7', marginBottom:12 }}>The difference</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3.2vw,42px)', fontWeight:800, margin:0, letterSpacing:'-0.03em', color:'#f5f5f7' }}>Before and after Markr</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3, borderRadius:16, overflow:'hidden', border:'1px solid rgba(255,255,255,.08)' }}>
            <div style={{ background:'rgba(229,85,85,.05)', padding:'28px 28px 8px', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#e55555', marginBottom:20 }}>Before</div>
            </div>
            <div style={{ background:'rgba(52,201,138,.05)', padding:'28px 28px 8px', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'#34c98a', marginBottom:20 }}>With Markr</div>
            </div>
            {[
              ['Guessing what to post every day', 'AI-generated daily content, ready to publish'],
              ['No idea why users drop off', 'Real QA report — bugs, friction, UX scores'],
              ['Vague sense of the market', '5 competitors mapped with pricing and gaps'],
              ['No strategy, just vibes', 'Clear AARRR growth playbook for your stage'],
              ['Pricing set by gut feeling', 'Market-calibrated tier recommendations'],
            ].map(([before, after], i)=>(
              <>
                <div key={`b${i}`} style={{ background: i%2===0?'rgba(229,85,85,.03)':'rgba(229,85,85,.05)', padding:'14px 28px', borderBottom:'1px solid rgba(255,255,255,.05)', display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ color:'#e55555', fontSize:12, flexShrink:0 }}>✗</span>
                  <span style={{ fontSize:13, color:'rgba(255,255,255,.5)', lineHeight:1.5 }}>{before}</span>
                </div>
                <div key={`a${i}`} style={{ background: i%2===0?'rgba(52,201,138,.03)':'rgba(52,201,138,.05)', padding:'14px 28px', borderBottom:'1px solid rgba(255,255,255,.05)', display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ color:'#34c98a', fontSize:12, flexShrink:0 }}>✓</span>
                  <span style={{ fontSize:13, color:'rgba(255,255,255,.75)', lineHeight:1.5, fontWeight:500 }}>{after}</span>
                </div>
              </>
            ))}
          </div>
        </div>
      </section>

      {/* REAL EXAMPLE */}
      <section style={{ padding:'96px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'#7c6ff7', marginBottom:12 }}>Real output</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3.2vw,42px)', fontWeight:800, margin:'0 0 12px', letterSpacing:'-0.03em', color:'#f5f5f7' }}>What Markr actually generates</h2>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.4)' }}>From Mindprint — a real mental wellness app. Analyzed and generated in under 2 minutes.</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {/* Instagram post */}
            <div style={{ background:'#161619', border:'1px solid rgba(255,255,255,.08)', borderRadius:14, padding:'20px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                <span style={{ fontSize:12, padding:'2px 10px', borderRadius:20, background:'rgba(139,92,246,.12)', color:'#a78bfa', fontWeight:700 }}>📥 Morning Post — Optimised for Saves</span>
              </div>
              <div style={{ fontSize:13, lineHeight:1.85, color:'rgba(255,255,255,.75)', marginBottom:14, padding:'12px 14px', background:'rgba(255,255,255,.03)', borderRadius:10, borderLeft:'3px solid rgba(139,92,246,.4)' }}>
                You don't have to earn a peaceful morning.<br /><br />
                You don't need to meditate perfectly or have it all figured out before breakfast.<br /><br />
                Just notice: the weight of the mug in your hand, the sound of your own breath. That's enough.<br /><br />
                <em style={{ color:'rgba(255,255,255,.45)' }}>What are you noticing right now?</em>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {['#mindfulness','#mentalhealth','#journaling','#morningroutine','#selfawareness'].map(h=>(
                  <span key={h} style={{ fontSize:11, padding:'3px 9px', borderRadius:20, background:'rgba(139,92,246,.08)', color:'#a78bfa', border:'1px solid rgba(139,92,246,.2)' }}>{h}</span>
                ))}
              </div>
            </div>
            {/* QA finding */}
            <div style={{ background:'#161619', border:'1px solid rgba(255,255,255,.08)', borderRadius:14, padding:'20px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                <span style={{ fontSize:12, padding:'2px 10px', borderRadius:20, background:'rgba(52,201,138,.1)', color:'#34c98a', fontWeight:700 }}>🧪 Product Test — QA Score 78/100</span>
              </div>
              <div style={{ marginBottom:12 }}>
                {[
                  { label:'Onboarding', score:82, c:'#34c98a' },
                  { label:'Navigation', score:76, c:'#4f9cf7' },
                  { label:'Sadhana Tab', score:71, c:'#a78bfa' },
                  { label:'Mira AI Chat', score:84, c:'#34c98a' },
                  { label:'Error Handling', score:58, c:'#f5a623' },
                ].map(r=>(
                  <div key={r.label} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,.5)', width:110, flexShrink:0 }}>{r.label}</span>
                    <div style={{ flex:1, height:5, background:'rgba(255,255,255,.07)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${r.score}%`, background:r.c, borderRadius:3 }} />
                    </div>
                    <span style={{ fontSize:12, fontWeight:600, color:r.c, width:28, textAlign:'right' }}>{r.score}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding:'10px 12px', background:'rgba(245,166,35,.07)', border:'1px solid rgba(245,166,35,.2)', borderRadius:8, fontSize:12, color:'#f5a623', lineHeight:1.55 }}>
                ⚠ Friction: Error handling screens lack helpful recovery prompts — users get stuck silently.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding:'96px 6%' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:52 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', color:'#7c6ff7', marginBottom:12 }}>Pricing</div>
            <h2 style={{ fontFamily:D, fontSize:'clamp(24px,3.2vw,42px)', fontWeight:800, margin:'0 0 12px', letterSpacing:'-0.03em', color:'#f5f5f7' }}>Start free. Scale when ready.</h2>
            <p style={{ fontSize:15, color:'rgba(255,255,255,.4)' }}>No credit card required. Cancel anytime.</p>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
            {[
              { name:'Free', price:'₹0', period:'/month', highlight:false, desc:'Try Markr on your first app, free for 7 days.', features:['1 app','Content Studio','Basic strategy','Community support'], cta:'Get started free', href:'/app' },
              { name:'Pro', price:'₹999', period:'/month', highlight:true, desc:'Everything you need to grow your app.', features:['Unlimited apps','Daily content generation','Product test + QA report','Competitive intelligence','Growth playbook','Pricing strategy','Priority support'], cta:'Get your first insights →', href:'/app' },
              { name:'Agency', price:'₹2,999', period:'/month', highlight:false, desc:'For teams managing multiple client apps.', features:['Everything in Pro','Multiple workspaces','Client sharing','White-label exports','Team collaboration','Dedicated support'], cta:'Contact us', href:'mailto:hello@markr.app' },
            ].map(plan=>(
              <div key={plan.name} style={{ background: plan.highlight?'linear-gradient(135deg,rgba(124,111,247,.12),rgba(226,111,175,.08))':'rgba(255,255,255,.025)', border:`1px solid ${plan.highlight?'rgba(124,111,247,.4)':'rgba(255,255,255,.08)'}`, borderRadius:16, padding:26, position:'relative', boxShadow: plan.highlight?'0 0 50px rgba(124,111,247,.15)':'none' }}>
                {plan.highlight && <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:'linear-gradient(135deg,#7c6ff7,#e26faf)', padding:'3px 14px', borderRadius:20, fontSize:11, fontWeight:700, color:'#fff', whiteSpace:'nowrap', letterSpacing:'.02em' }}>Most popular</div>}
                <div style={{ fontFamily:D, fontSize:16, fontWeight:700, marginBottom:6, letterSpacing:'-.01em' }}>{plan.name}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:3, marginBottom:8 }}>
                  <span style={{ fontFamily:D, fontSize:36, fontWeight:800, color: plan.highlight?'#a599ff':'#f0f0f5', letterSpacing:'-0.03em' }}>{plan.price}</span>
                  <span style={{ fontSize:13, color:'rgba(255,255,255,.35)' }}>{plan.period}</span>
                </div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.4)', marginBottom:22, lineHeight:1.55 }}>{plan.desc}</div>
                <div style={{ marginBottom:24 }}>
                  {plan.features.map(f=>(
                    <div key={f} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:9, fontSize:13, color:'rgba(255,255,255,.7)' }}>
                      <span style={{ color:'#34c98a', flexShrink:0, fontSize:12 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
                <a href={plan.href} style={{ display:'block', textAlign:'center', padding:'11px 20px', borderRadius:8, background: plan.highlight?'linear-gradient(135deg,#7c6ff7,#9b8af4)':'rgba(255,255,255,.05)', border: plan.highlight?'none':'1px solid rgba(255,255,255,.1)', color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none', transition:'opacity .15s', fontFamily:B }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.8'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section style={{ padding:'64px 6%', background:'rgba(255,255,255,.015)', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:860, margin:'0 auto', textAlign:'center' }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' as const, color:'rgba(255,255,255,.3)', marginBottom:32 }}>Early access</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:48 }}>
            {[
              { stat:'2 min', label:'Average time to first insight', color:'#a599ff' },
              { stat:'3×', label:'More content ideas per week', color:'#34c98a' },
              { stat:'0', label:'Marketing hires needed', color:'#e26faf' },
            ].map(s=>(
              <div key={s.stat} style={{ padding:'24px 20px', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:14 }}>
                <div style={{ fontFamily:D, fontSize:40, fontWeight:800, color:s.color, letterSpacing:'-0.03em', marginBottom:8 }}>{s.stat}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,.45)', lineHeight:1.5 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Testimonial placeholders — swap with real quotes when ready */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {[
              { quote:"I used to spend hours on Monday planning what to post. Now I open Markr and everything is ready. The QA report alone found 3 things I didn't know were broken.", name:'Founder, B2B SaaS app', avatar:'🧑‍💻' },
              { quote:"The competitive analysis gave me more clarity in 5 minutes than 3 hours of manual research. I actually changed my pricing based on what it found.", name:'Solo founder, productivity app', avatar:'👩‍💼' },
            ].map((t,i)=>(
              <div key={i} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:14, padding:'22px 24px', textAlign:'left' }}>
                <div style={{ fontSize:24, color:'#7c6ff7', marginBottom:12, lineHeight:1 }}>"</div>
                <div style={{ fontSize:14, color:'rgba(255,255,255,.65)', lineHeight:1.75, marginBottom:16, fontStyle:'italic' }}>{t.quote}</div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(124,111,247,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{t.avatar}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,.4)' }}>{t.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding:'96px 6%', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:700, height:350, borderRadius:'50%', background:'radial-gradient(circle, rgba(124,111,247,.08) 0%, transparent 70%)', pointerEvents:'none' }} />
        <div style={{ position:'relative', maxWidth:540, margin:'0 auto' }}>
          <h2 style={{ fontFamily:D, fontSize:'clamp(26px,3.5vw,48px)', fontWeight:800, margin:'0 0 14px', letterSpacing:'-0.03em', color:'#f5f5f7', lineHeight:1.15 }}>
            Stop guessing what to post.
            <br />
            <span style={grad}>Let your app tell you.</span>
          </h2>
          <p style={{ fontSize:16, color:'rgba(255,255,255,.45)', marginBottom:32, lineHeight:1.65 }}>
            Markr is the co-founder you didn't have — handling strategy, content, testing, and growth so you can focus on building.
          </p>
          <a href="/app" style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'13px 32px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:15, fontWeight:700, textDecoration:'none', boxShadow:'0 0 40px rgba(124,111,247,.3)', transition:'all .2s', fontFamily:B, letterSpacing:'-.01em' }} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 40px rgba(124,111,247,.45)'}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow='0 0 40px rgba(124,111,247,.3)'}}>
            Get your first insights in 2 minutes →
          </a>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.25)', marginTop:12 }}>Free for 7 days · No credit card · Cancel anytime</div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding:'28px 6%', borderTop:'1px solid rgba(255,255,255,.05)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:24, height:24, borderRadius:6, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:D, fontSize:13, fontWeight:800, color:'#fff' }}>M</div>
          <span style={{ fontFamily:D, fontSize:13, fontWeight:700, color:'rgba(255,255,255,.5)' }}>Markr</span>
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,.25)' }}>© 2026 Markr. AI marketing for app teams.</div>
        <div style={{ display:'flex', gap:20, fontSize:12 }}>
          {[['App','/app'],['Sign in','/login'],['Contact','mailto:hello@markr.app']].map(([l,h])=>(
            <a key={l} href={h} style={{ color:'rgba(255,255,255,.3)', textDecoration:'none', transition:'color .15s' }} onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,.6)')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,.3)')}>{l}</a>
          ))}
        </div>
      </footer>
    </div>
  )
}
