import { useState, useEffect } from 'react'

const DISPLAY = "'Syne', sans-serif"
const BODY    = "'DM Sans', sans-serif"

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div style={{ background: '#0b0b0d', color: '#f0f0f5', fontFamily: BODY, overflowX: 'hidden', lineHeight: 1.6 }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', height: 60, padding: '0 6%',
        background: scrolled ? 'rgba(11,11,13,.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,.06)' : 'none',
        transition: 'all .25s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 16, fontWeight: 800, color: '#fff' }}>M</div>
          <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>Markr</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, fontSize: 13, color: 'rgba(255,255,255,.5)' }}>
          {[['Features','#features'],['How it works','#how'],['Pricing','#pricing']].map(([l,h]) => (
            <a key={l} href={h} style={{ color: 'inherit', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e=>(e.currentTarget.style.color='#fff')}
              onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,.5)')}>{l}</a>
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <a href="/login" style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.6)', fontSize: 13, textDecoration: 'none', transition: 'all .15s', fontFamily: BODY }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.3)';(e.currentTarget as HTMLElement).style.color='#fff'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.12)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.6)'}}>Sign in</a>
          <a href="/app" style={{ padding: '7px 18px', borderRadius: 7, background: 'linear-gradient(135deg,#7c6ff7,#9b8af4)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: BODY, transition: 'opacity .15s' }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>Get started free</a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '120px 6% 80px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '25%', left: '15%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,111,247,.1) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '35%', right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(226,111,175,.07) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, border: '1px solid rgba(124,111,247,.3)', background: 'rgba(124,111,247,.08)', fontSize: 12, fontWeight: 600, color: '#a599ff', marginBottom: 28, letterSpacing: '.01em' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c6ff7', display: 'inline-block' }} />
          Built for indie hackers &amp; app founders
        </div>

        <h1 style={{ fontFamily: DISPLAY, fontSize: 'clamp(36px,5.5vw,72px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 20px', maxWidth: 820, letterSpacing: '-0.03em', color: '#f5f5f7' }}>
          Your AI Marketing Manager<br />
          <span style={{ background: 'linear-gradient(135deg,#7c6ff7 30%,#e26faf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            for Every App You Build
          </span>
        </h1>

        <p style={{ fontSize: 18, color: 'rgba(255,255,255,.5)', maxWidth: 520, lineHeight: 1.7, margin: '0 0 40px', fontWeight: 400 }}>
          Paste your app URL. Markr analyzes your product, tests it as a real user, and generates content, strategy, and insights — powered by Claude AI.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 52 }}>
          <a href="/app" style={{ padding: '13px 30px', borderRadius: 9, background: 'linear-gradient(135deg,#7c6ff7,#9b8af4)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', boxShadow: '0 0 32px rgba(124,111,247,.28)', transition: 'all .2s', fontFamily: BODY, letterSpacing: '-.01em' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 40px rgba(124,111,247,.4)'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow='0 0 32px rgba(124,111,247,.28)'}}>
            Start free — no credit card
          </a>
          <a href="#features" style={{ padding: '13px 24px', borderRadius: 9, border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', fontSize: 14, textDecoration: 'none', transition: 'all .2s', fontFamily: BODY }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.25)';(e.currentTarget as HTMLElement).style.color='#fff'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.1)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.6)'}}>
            See features →
          </a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 12, color: 'rgba(255,255,255,.35)', flexWrap: 'wrap', justifyContent: 'center' }}>
          {['✓ No agency needed','✓ Works with any app','✓ Real product QA testing','✓ Instagram-ready content'].map(t=>(
            <span key={t}>{t}</span>
          ))}
        </div>

        {/* App mockup */}
        <div style={{ marginTop: 64, width: '100%', maxWidth: 960, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: -1, borderRadius: 18, background: 'linear-gradient(135deg,rgba(124,111,247,.25),rgba(226,111,175,.15))', filter: 'blur(1px)', borderRadius: 18 }} />
          <div style={{ position: 'relative', background: '#161619', borderRadius: 16, border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,.6)' }}>
            <div style={{ background: '#111113', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
              {['#e55','#f5a623','#34c98a'].map(c=><div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
              <div style={{ flex: 1, background: 'rgba(255,255,255,.04)', borderRadius: 5, padding: '3px 12px', fontSize: 11, color: 'rgba(255,255,255,.25)', marginLeft: 10 }}>markr.mindprintjournal.com</div>
            </div>
            <div style={{ display: 'flex', height: 380 }}>
              <div style={{ width: 170, background: '#161619', borderRight: '1px solid rgba(255,255,255,.06)', padding: '14px 8px', flexShrink: 0 }}>
                {['Overview','Content Studio','Strategy','Calendar','Insights'].map((item,i)=>(
                  <div key={item} style={{ padding: '7px 10px', borderRadius: 6, fontSize: 11, color: i===1?'#a599ff':'rgba(255,255,255,.35)', background: i===1?'rgba(124,111,247,.12)':'transparent', marginBottom: 2 }}>{item}</div>
                ))}
                <div style={{ marginTop: 14, fontSize: 9, color: 'rgba(255,255,255,.2)', padding: '0 10px 5px', letterSpacing: '.07em', textTransform: 'uppercase' }}>My Apps</div>
                {[['Mindprint','#e26faf'],['TaskFlow Pro','#7c6ff7'],['SnapBudget','#34c98a']].map(([n,c])=>(
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6, marginBottom: 2 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{n}</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, padding: '18px 18px 14px', overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: DISPLAY, marginBottom: 12, color: 'rgba(255,255,255,.85)', letterSpacing: '-.01em' }}>Content Studio · Mindprint</div>
                <div style={{ display: 'flex', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
                  {[['#60a5fa','rgba(59,130,246,.1)','🌅 Daily journaling'],['#a78bfa','rgba(139,92,246,.1)','💡 Breaking bad habits'],['#34d399','rgba(16,185,129,.1)','🌙 Loneliness & connection']].map(([c,bg,l])=>(
                    <span key={l} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: bg, color: c, border: `1px solid ${c}35` }}>{l}</span>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {[
                    { t:'Morning Post', time:'7–9 AM', c:'#60a5fa', bg:'rgba(59,130,246,.07)', b:'rgba(59,130,246,.2)', badge:true, text:"You don't have to earn a peaceful morning. Just notice: the weight of the mug in your hand.\n\nWhat are you noticing right now?" },
                    { t:'Midday Post', time:'12–1:30 PM', c:'#a78bfa', bg:'rgba(139,92,246,.07)', b:'rgba(139,92,246,.2)', badge:true, text:"The people who've grown the most aren't the ones who never fell apart.\n\nWho needs to hear this today?" },
                    { t:'Evening Post', time:'7–9 PM', c:'#34d399', bg:'rgba(16,185,129,.07)', b:'rgba(16,185,129,.2)', badge:false, text:null },
                  ].map(card=>(
                    <div key={card.t} style={{ background: '#1e1e23', borderRadius: 9, border: `1.5px solid ${card.badge ? card.b : '#26262d'}`, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 10px', background: card.bg, borderBottom: '1px solid rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: card.c, fontFamily: DISPLAY }}>{card.t}</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', marginTop: 1 }}>{card.time}</div>
                        </div>
                        {card.badge && <span style={{ fontSize: 8, padding: '2px 5px', borderRadius: 20, fontWeight: 700, background: card.bg, color: card.c, border: `1px solid ${card.b}` }}>Ready ✓</span>}
                      </div>
                      <div style={{ padding: '9px 10px' }}>
                        {card.text
                          ? <div style={{ fontSize: 9.5, lineHeight: 1.65, color: 'rgba(255,255,255,.6)', whiteSpace: 'pre-wrap' }}>{card.text}</div>
                          : <div style={{ textAlign: 'center', padding: '10px 0' }}>
                              <div style={{ fontSize: 9, color: 'rgba(255,255,255,.25)', marginBottom: 7 }}>Ready to generate</div>
                              <div style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${card.b}`, fontSize: 9, fontWeight: 600, color: card.c, display: 'inline-block' }}>✨ Generate post</div>
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

      {/* FEATURES */}
      <section id="features" style={{ padding: '96px 6%' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7c6ff7', marginBottom: 12 }}>Everything you need</div>
            <h2 style={{ fontFamily: DISPLAY, fontSize: 'clamp(26px,3.5vw,44px)', fontWeight: 800, margin: '0 0 14px', letterSpacing: '-0.03em', color: '#f5f5f7' }}>One AI. Every marketing job done.</h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,.45)', maxWidth: 480, margin: '0 auto' }}>Stop juggling tools. Markr is your full marketing team — strategy, content, analysis, and QA testing in one place.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 16 }}>
            {[
              { icon:'🧪', color:'#34c98a', bg:'rgba(52,201,138,.07)', border:'rgba(52,201,138,.18)', tag:'Unique to Markr', title:'Real Product Testing', desc:'Provide test credentials and Markr explores your app as a real user — testing every feature, rating UX, finding bugs, and writing a full QA report that grounds all your content.' },
              { icon:'✍️', color:'#a78bfa', bg:'rgba(139,92,246,.07)', border:'rgba(139,92,246,.18)', tag:'3 posts/day', title:'Instagram Content Engine', desc:'Morning, midday, and evening posts — each optimised for saves, shares, or comments. Full captions, hashtags, image prompts, and timing. Built around what your app actually does.' },
              { icon:'🔍', color:'#4f9cf7', bg:'rgba(79,156,247,.07)', border:'rgba(79,156,247,.18)', tag:'Real competitors', title:'Competitive Intelligence', desc:'5 real competitors, side-by-side feature and pricing comparison, market positioning map, whitespace opportunity, and your single most important win condition.' },
              { icon:'🗂', color:'#f5a623', bg:'rgba(245,166,35,.07)', border:'rgba(245,166,35,.18)', tag:'All 9 blocks', title:'Business Model Canvas', desc:'AI-generated BMC across all 9 blocks — value propositions, key partners, revenue streams, customer segments, and more. Grounded in your actual product.' },
              { icon:'🚀', color:'#e26faf', bg:'rgba(226,111,175,.07)', border:'rgba(226,111,175,.18)', tag:'AARRR framework', title:'Growth Playbook', desc:'Prioritised tactics across Acquisition, Activation, Retention, Revenue, and Referral — specific to your app\'s category, stage, and what the product test found.' },
              { icon:'💰', color:'#60a5fa', bg:'rgba(59,130,246,.07)', border:'rgba(59,130,246,.18)', tag:'Market-calibrated', title:'Pricing Strategy', desc:'Tier structure, price points, and monetisation angles calibrated to your category. Informed by competitive benchmarks and your product\'s real quality scores.' },
            ].map(f=>(
              <div key={f.title} style={{ background: f.bg, border: `1px solid ${f.border}`, borderRadius: 14, padding: '22px 20px', transition: 'transform .2s' }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='translateY(-3px)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='none'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 22 }}>{f.icon}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: f.bg, color: f.color, border: `1px solid ${f.border}`, fontWeight: 700, letterSpacing: '.03em' }}>{f.tag}</span>
                </div>
                <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, marginBottom: 8, color: f.color, letterSpacing: '-.01em' }}>{f.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding: '96px 6%', background: 'rgba(255,255,255,.015)', borderTop: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7c6ff7', marginBottom: 12 }}>Simple by design</div>
          <h2 style={{ fontFamily: DISPLAY, fontSize: 'clamp(26px,3.5vw,44px)', fontWeight: 800, margin: '0 0 52px', letterSpacing: '-0.03em', color: '#f5f5f7' }}>Up and running in 3 steps</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 40, textAlign: 'left' }}>
            {[
              { n:'01', icon:'🔗', c:'#7c6ff7', title:'Add your app', desc:'Paste your app URL. Markr reads it and extracts your features, audience, tone, and category — automatically.' },
              { n:'02', icon:'🧪', c:'#34c98a', title:'AI tests it', desc:'Optionally give test credentials. Markr logs in, explores every feature, finds friction points, and writes a QA report.' },
              { n:'03', icon:'✨', c:'#e26faf', title:'Generate everything', desc:'Daily Instagram posts, competitive analysis, growth strategies, and pricing — all grounded in your real product.' },
            ].map(s=>(
              <div key={s.n}>
                <div style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 800, color: 'rgba(255,255,255,.04)', lineHeight: 1, marginBottom: 10 }}>{s.n}</div>
                <span style={{ fontSize: 26, display: 'block', marginBottom: 10 }}>{s.icon}</span>
                <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, marginBottom: 8, color: s.c, letterSpacing: '-.01em' }}>{s.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', lineHeight: 1.75 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: '96px 6%' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7c6ff7', marginBottom: 12 }}>Pricing</div>
            <h2 style={{ fontFamily: DISPLAY, fontSize: 'clamp(26px,3.5vw,44px)', fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.03em', color: '#f5f5f7' }}>Start free. Scale when ready.</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.4)' }}>No credit card required. Cancel anytime.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {[
              { name:'Free', price:'₹0', period:'/month', highlight:false, desc:'Try Markr on your first app, free for 7 days.', features:['1 app','Content Studio','Basic strategy','Community support'], cta:'Start free', href:'/app' },
              { name:'Pro', price:'₹999', period:'/month', highlight:true, desc:'Everything you need to grow your app.', features:['Unlimited apps','Daily content generation','Product test + QA report','Competitive intelligence','Growth playbook','Pricing strategy','Priority support'], cta:'Get Pro', href:'/app' },
              { name:'Agency', price:'₹2,999', period:'/month', highlight:false, desc:'For teams managing multiple client apps.', features:['Everything in Pro','Multiple workspaces','Client sharing','White-label exports','Team collaboration','Dedicated support'], cta:'Contact us', href:'mailto:hello@markr.app' },
            ].map(plan=>(
              <div key={plan.name} style={{ background: plan.highlight ? 'linear-gradient(135deg,rgba(124,111,247,.12),rgba(226,111,175,.08))' : 'rgba(255,255,255,.025)', border: `1px solid ${plan.highlight?'rgba(124,111,247,.4)':'rgba(255,255,255,.08)'}`, borderRadius: 16, padding: 26, position: 'relative', boxShadow: plan.highlight ? '0 0 50px rgba(124,111,247,.15)' : 'none' }}>
                {plan.highlight && (
                  <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', padding: '3px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', letterSpacing: '.02em' }}>Most popular</div>
                )}
                <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, marginBottom: 6, letterSpacing: '-.01em' }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 8 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 800, color: plan.highlight ? '#a599ff' : '#f0f0f5', letterSpacing: '-0.03em' }}>{plan.price}</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,.35)' }}>{plan.period}</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', marginBottom: 22, lineHeight: 1.55 }}>{plan.desc}</div>
                <div style={{ marginBottom: 24 }}>
                  {plan.features.map(f=>(
                    <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 9, fontSize: 13, color: 'rgba(255,255,255,.7)' }}>
                      <span style={{ color: '#34c98a', flexShrink: 0, fontSize: 12 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
                <a href={plan.href} style={{ display: 'block', textAlign: 'center', padding: '10px 20px', borderRadius: 8, background: plan.highlight ? 'linear-gradient(135deg,#7c6ff7,#9b8af4)' : 'rgba(255,255,255,.05)', border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,.1)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'opacity .15s', fontFamily: BODY }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.8'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '96px 6%', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 700, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,111,247,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontFamily: DISPLAY, fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, margin: '0 0 14px', letterSpacing: '-0.03em', color: '#f5f5f7', lineHeight: 1.1 }}>
            Your app deserves<br />
            <span style={{ background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>great marketing</span>
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,.45)', marginBottom: 32, lineHeight: 1.65 }}>Join indie hackers and founders who use Markr to grow their apps — without hiring a marketing team.</p>
          <a href="/app" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 32px', borderRadius: 9, background: 'linear-gradient(135deg,#7c6ff7,#9b8af4)', color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none', boxShadow: '0 0 40px rgba(124,111,247,.3)', transition: 'all .2s', fontFamily: BODY, letterSpacing: '-.01em' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 40px rgba(124,111,247,.45)'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow='0 0 40px rgba(124,111,247,.3)'}}>
            Get started free
          </a>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.25)', marginTop: 12 }}>Free for 7 days · No credit card · Cancel anytime</div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '28px 6%', borderTop: '1px solid rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 13, fontWeight: 800, color: '#fff' }}>M</div>
          <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.5)' }}>Markr</span>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.25)' }}>© 2026 Markr. Built for indie hackers.</div>
        <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
          {[['App','/app'],['Sign in','/login'],['Contact','mailto:hello@markr.app']].map(([l,h])=>(
            <a key={l} href={h} style={{ color: 'rgba(255,255,255,.3)', textDecoration: 'none', transition: 'color .15s' }}
              onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,.6)')}
              onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,.3)')}>{l}</a>
          ))}
        </div>
      </footer>
    </div>
  )
}
