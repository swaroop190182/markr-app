import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)
  const [email, setEmail] = useState('')
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    setJoined(true)
  }

  return (
    <div style={{ background: '#0a0a0c', color: '#f0f0f5', fontFamily: 'DM Sans, sans-serif', overflowX: 'hidden' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '0 5%',
        background: scrolled ? 'rgba(10,10,12,.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,.07)' : 'none',
        transition: 'all .3s',
        display: 'flex', alignItems: 'center', height: 64,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne,sans-serif', fontSize: 17, fontWeight: 800, color: '#fff' }}>M</div>
          <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 700 }}>Markr</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 13, color: 'rgba(255,255,255,.6)' }}>
          <a href="#features" style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e=>(e.currentTarget.style.color='#fff')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,.6)')}>Features</a>
          <a href="#how" style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e=>(e.currentTarget.style.color='#fff')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,.6)')}>How it works</a>
          <a href="#pricing" style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e=>(e.currentTarget.style.color='#fff')} onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,.6)')}>Pricing</a>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <a href="/app" style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.7)', fontSize: 13, textDecoration: 'none', transition: 'all .15s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.4)';(e.currentTarget as HTMLElement).style.color='#fff'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.15)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.7)'}}>
            Sign in
          </a>
          <a href="/app" style={{ padding: '7px 18px', borderRadius: 7, background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'opacity .15s' }}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
            Get started free
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '120px 5% 80px', position: 'relative', overflow: 'hidden' }}>
        {/* Glow blobs */}
        <div style={{ position: 'absolute', top: '20%', left: '20%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,111,247,.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '30%', right: '15%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(226,111,175,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, border: '1px solid rgba(124,111,247,.35)', background: 'rgba(124,111,247,.08)', fontSize: 12, fontWeight: 600, color: '#a599ff', marginBottom: 28 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c6ff7', animation: 'pulse 2s infinite' }} />
          AI-powered · Built for indie hackers & app founders
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(38px,6vw,80px)', fontWeight: 800, lineHeight: 1.08, margin: '0 0 24px', maxWidth: 900, letterSpacing: '-0.02em' }}>
          Your AI Marketing Manager
          <br />
          <span style={{ background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            for Every App You Build
          </span>
        </h1>

        {/* Sub */}
        <p style={{ fontSize: 'clamp(16px,2vw,20px)', color: 'rgba(255,255,255,.55)', maxWidth: 600, lineHeight: 1.65, margin: '0 0 44px' }}>
          Add your app URL. Markr analyzes your product, tests it as a real user, generates Instagram content, competitive analysis, growth strategies, and pricing — all powered by Claude AI.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 56 }}>
          <a href="/app" style={{ padding: '14px 32px', borderRadius: 10, background: 'linear-gradient(135deg,#7c6ff7,#9b8af4)', color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 0 40px rgba(124,111,247,.3)', transition: 'all .2s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 40px rgba(124,111,247,.45)'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(0)';(e.currentTarget as HTMLElement).style.boxShadow='0 0 40px rgba(124,111,247,.3)'}}>
            ✦ Start free — no credit card
          </a>
          <a href="#how" style={{ padding: '14px 28px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', color: 'rgba(255,255,255,.7)', fontSize: 15, fontWeight: 500, textDecoration: 'none', transition: 'all .2s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.3)';(e.currentTarget as HTMLElement).style.color='#fff'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,.12)';(e.currentTarget as HTMLElement).style.color='rgba(255,255,255,.7)'}}>
            See how it works →
          </a>
        </div>

        {/* Social proof */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: 'rgba(255,255,255,.4)' }}>
          {['✓ No agency needed', '✓ Works with any app', '✓ Real QA product testing', '✓ Instagram-ready content'].map(t => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{t}</span>
          ))}
        </div>

        {/* App preview */}
        <div style={{ marginTop: 72, width: '100%', maxWidth: 1000, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: -1, borderRadius: 18, background: 'linear-gradient(135deg,rgba(124,111,247,.3),rgba(226,111,175,.2))', filter: 'blur(1px)' }} />
          <div style={{ position: 'relative', background: '#161619', borderRadius: 16, border: '1px solid rgba(255,255,255,.1)', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.6)' }}>
            {/* Fake browser bar */}
            <div style={{ background: '#0f0f11', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#e55555' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f5a623' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#34c98a' }} />
              <div style={{ flex: 1, background: 'rgba(255,255,255,.05)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,.3)', marginLeft: 12 }}>
                markr-app.vercel.app
              </div>
            </div>
            {/* Mock UI */}
            <div style={{ display: 'flex', height: 420 }}>
              {/* Sidebar mock */}
              <div style={{ width: 180, background: '#161619', borderRight: '1px solid rgba(255,255,255,.07)', padding: '16px 10px', flexShrink: 0 }}>
                {['Overview','Content Studio','Strategy','Calendar','Insights'].map((item, i) => (
                  <div key={item} style={{ padding: '8px 10px', borderRadius: 7, fontSize: 12, color: i===1?'#a599ff':'rgba(255,255,255,.4)', background: i===1?'rgba(124,111,247,.15)':'transparent', marginBottom: 3 }}>{item}</div>
                ))}
                <div style={{ marginTop: 16, fontSize: 10, color: 'rgba(255,255,255,.25)', padding: '0 10px 6px', letterSpacing: '.06em', textTransform: 'uppercase' }}>My Apps</div>
                {[['Mindprint','#e26faf','Both'],['TaskFlow Pro','#7c6ff7','Web'],['SnapBudget','#34c98a','Mobile']].map(([n,c,p]) => (
                  <div key={n as string} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, marginBottom: 2 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: c as string }} />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', flex: 1 }}>{n}</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,.25)' }}>{p}</span>
                  </div>
                ))}
              </div>
              {/* Main mock */}
              <div style={{ flex: 1, padding: '20px 20px 16px', overflow: 'hidden' }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Syne,sans-serif', marginBottom: 14, color: 'rgba(255,255,255,.9)' }}>Content Studio · Mindprint</div>
                {/* Pillar strip */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {[['#60a5fa','rgba(59,130,246,.12)','🌅 Daily journaling'],['#a78bfa','rgba(139,92,246,.12)','💡 Breaking bad habits'],['#34d399','rgba(16,185,129,.12)','🌙 Loneliness & connection']].map(([c,bg,l]) => (
                    <span key={l as string} style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: bg as string, color: c as string, border: `1px solid ${c}40` }}>{l}</span>
                  ))}
                </div>
                {/* 3 cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {[
                    { t:'Morning Post', time:'7:00–9:00 AM', c:'#60a5fa', bg:'rgba(59,130,246,.08)', b:'rgba(59,130,246,.25)', m:'📥 Saves', badge:'Ready ✓', text:'You don\'t have to earn a peaceful morning. Just notice: the weight of the mug in your hand.\n\nWhat are you noticing right now?' },
                    { t:'Midday Post', time:'12:00–1:30 PM', c:'#a78bfa', bg:'rgba(139,92,246,.08)', b:'rgba(139,92,246,.25)', m:'🔁 Shares', badge:'Ready ✓', text:'The people who\'ve grown the most aren\'t the ones who never fell apart — they\'re the ones who stopped pretending they hadn\'t.\n\nWho needs to hear this today?' },
                    { t:'Evening Post', time:'7:00–9:00 PM', c:'#34d399', bg:'rgba(16,185,129,.08)', b:'rgba(16,185,129,.25)', m:'💬 Comments', badge:'Idle', text:null },
                  ].map(card => (
                    <div key={card.t} style={{ background: '#1e1e23', borderRadius: 10, border: `1.5px solid ${card.badge==='Idle'?'#26262d':card.b}`, overflow: 'hidden' }}>
                      <div style={{ padding: '9px 11px', background: card.bg, borderBottom: '1px solid rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: card.c }}>{card.t}</div>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', marginTop: 1 }}>{card.time}</div>
                        </div>
                        {card.badge === 'Ready ✓' && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700, background: card.bg, color: card.c, border: `1px solid ${card.b}` }}>{card.badge}</span>}
                      </div>
                      <div style={{ padding: '10px 11px' }}>
                        {card.text
                          ? <div style={{ fontSize: 10, lineHeight: 1.65, color: 'rgba(255,255,255,.65)', whiteSpace: 'pre-wrap' }}>{card.text}</div>
                          : <div style={{ textAlign: 'center', padding: '12px 0' }}>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginBottom: 8 }}>Ready to generate</div>
                              <div style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${card.b}`, fontSize: 10, fontWeight: 600, color: card.c, display: 'inline-block' }}>✨ Generate post</div>
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

      {/* ── LOGOS / TRUST ── */}
      <section style={{ padding: '32px 5%', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginBottom: 20, letterSpacing: '.08em', textTransform: 'uppercase' }}>Powered by</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
          {[
            { name: 'Claude AI', logo: '🤖' },
            { name: 'Supabase', logo: '⚡' },
            { name: 'Vercel', logo: '▲' },
            { name: 'Instagram', logo: '◈' },
          ].map(b => (
            <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.35)' }}>
              <span style={{ fontSize: 18 }}>{b.logo}</span> {b.name}
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '100px 5%', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7c6ff7', marginBottom: 12 }}>Everything you need</div>
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(28px,4vw,48px)', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-.02em' }}>One AI. Every marketing job done.</h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,.5)', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>Stop juggling tools. Markr is your full marketing team — strategy, content, analysis, and testing in one place.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
          {[
            {
              icon: '🧪', color: '#34c98a', bg: 'rgba(52,201,138,.08)', border: 'rgba(52,201,138,.2)',
              title: 'Real Product Testing',
              desc: 'Give Markr test credentials and it explores your app as a real user — testing every feature, finding bugs, rating UX across 6 dimensions, and writing a full QA report that informs all your content.',
              tag: 'Unique to Markr'
            },
            {
              icon: '✍️', color: '#a78bfa', bg: 'rgba(139,92,246,.08)', border: 'rgba(139,92,246,.2)',
              title: 'Instagram Content Engine',
              desc: 'Three posts daily — Morning (Saves), Midday (Shares), Evening (Comments). Each with captions, hashtags, image prompts, hooks, and timing. Grounded in what\'s real about your app.',
              tag: '3 posts/day'
            },
            {
              icon: '🔍', color: '#4f9cf7', bg: 'rgba(79,156,247,.08)', border: 'rgba(79,156,247,.2)',
              title: 'Competitive Intelligence',
              desc: 'Identify 5 real competitors, compare pricing and features, find your whitespace. Know exactly where you win and where you need to improve.',
              tag: 'Real data'
            },
            {
              icon: '🗂', color: '#f5a623', bg: 'rgba(245,166,35,.08)', border: 'rgba(245,166,35,.2)',
              title: 'Business Model Canvas',
              desc: 'AI-generated BMC across all 9 blocks — value propositions, key partners, revenue streams, cost structure, and more. Grounded in your actual app.',
              tag: 'Full BMC'
            },
            {
              icon: '🚀', color: '#e26faf', bg: 'rgba(226,111,175,.08)', border: 'rgba(226,111,175,.2)',
              title: 'Growth Playbook',
              desc: 'AARRR framework: Acquisition, Activation, Retention, Revenue, Referral. Tactical, prioritised strategies specific to your app\'s stage and category.',
              tag: 'AARRR framework'
            },
            {
              icon: '💰', color: '#60a5fa', bg: 'rgba(59,130,246,.08)', border: 'rgba(59,130,246,.2)',
              title: 'Pricing Strategy',
              desc: 'Recommended tier structure, price points, monetisation angles — calibrated to your category and informed by what your product actually does well.',
              tag: 'Market-calibrated'
            },
          ].map(f => (
            <div key={f.title} style={{ background: f.bg, border: `1px solid ${f.border}`, borderRadius: 16, padding: '24px 22px', transition: 'transform .2s', cursor: 'default' }}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='translateY(-4px)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='translateY(0)'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 24 }}>{f.icon}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: f.bg, color: f.color, border: `1px solid ${f.border}`, fontWeight: 700 }}>{f.tag}</span>
              </div>
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 10, color: f.color }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ padding: '100px 5%', background: 'rgba(255,255,255,.02)', borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7c6ff7', marginBottom: 12 }}>Dead simple</div>
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, margin: '0 0 56px', letterSpacing: '-.02em' }}>Up and running in 3 steps</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 32, textAlign: 'left' }}>
            {[
              { step: '01', icon: '🔗', color: '#7c6ff7', title: 'Add your app', desc: 'Paste your app URL. Markr reads it and understands your features, audience, tone, and category automatically.' },
              { step: '02', icon: '🧪', color: '#34c98a', title: 'AI tests & analyzes', desc: 'Optionally provide test credentials. Markr explores your app as a real user, finds bugs, rates UX, and generates a full QA report.' },
              { step: '03', icon: '✨', color: '#e26faf', title: 'Generate everything', desc: 'Get daily Instagram posts, competitive analysis, growth strategies, pricing recommendations — all grounded in your real product.' },
            ].map(s => (
              <div key={s.step}>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 48, fontWeight: 800, color: 'rgba(255,255,255,.06)', lineHeight: 1, marginBottom: 12 }}>{s.step}</div>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{s.icon}</div>
                <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 10, color: s.color }}>{s.title}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', lineHeight: 1.7 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: '100px 5%', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7c6ff7', marginBottom: 12 }}>Pricing</div>
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-.02em' }}>Start free. Scale when ready.</h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,.5)' }}>No credit card required to get started.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[
            {
              name: 'Free', price: '$0', period: '/month', highlight: false,
              desc: 'Perfect for trying Markr on your first app.',
              features: ['2 apps', 'Content Studio (5 posts/day)', 'Basic strategy', 'Community support'],
              cta: 'Start free', href: '/app'
            },
            {
              name: 'Pro', price: '$29', period: '/month', highlight: true,
              desc: 'Everything you need to grow your app.',
              features: ['Unlimited apps', 'Unlimited content generation', 'Product test with QA report', 'Full insights & analysis', 'Competitive intelligence', 'Growth playbook', 'Priority support'],
              cta: 'Get Pro', href: '/app'
            },
            {
              name: 'Agency', price: '$79', period: '/month', highlight: false,
              desc: 'For teams managing multiple client apps.',
              features: ['Everything in Pro', 'Multiple workspaces', 'Client sharing', 'White-label exports', 'Team collaboration', 'Dedicated support'],
              cta: 'Contact us', href: 'mailto:hello@markr.app'
            },
          ].map(plan => (
            <div key={plan.name} style={{
              background: plan.highlight ? 'linear-gradient(135deg,rgba(124,111,247,.15),rgba(226,111,175,.1))' : 'rgba(255,255,255,.03)',
              border: `1px solid ${plan.highlight ? 'rgba(124,111,247,.5)' : 'rgba(255,255,255,.1)'}`,
              borderRadius: 16, padding: 28, position: 'relative',
              boxShadow: plan.highlight ? '0 0 60px rgba(124,111,247,.2)' : 'none',
            }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', padding: '4px 16px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                  Most popular
                </div>
              )}
              <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
                <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 40, fontWeight: 800, color: plan.highlight ? '#a599ff' : '#f0f0f5' }}>{plan.price}</span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,.4)' }}>{plan.period}</span>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 24, lineHeight: 1.5 }}>{plan.desc}</div>
              <div style={{ marginBottom: 28 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 10, fontSize: 13, color: 'rgba(255,255,255,.75)' }}>
                    <span style={{ color: '#34c98a', flexShrink: 0 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <a href={plan.href} style={{
                display: 'block', textAlign: 'center', padding: '11px 20px', borderRadius: 9,
                background: plan.highlight ? 'linear-gradient(135deg,#7c6ff7,#9b8af4)' : 'rgba(255,255,255,.06)',
                border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,.12)',
                color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                transition: 'opacity .15s'
              }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='.85'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '100px 5%', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 800, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,111,247,.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-.02em' }}>
            Your app deserves<br/>
            <span style={{ background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              great marketing
            </span>
          </h2>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,.5)', marginBottom: 36, lineHeight: 1.6 }}>
            Join indie hackers and founders who use Markr to grow their apps without hiring a marketing team.
          </p>
          <a href="/app" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 36px', borderRadius: 10, background: 'linear-gradient(135deg,#7c6ff7,#9b8af4)', color: '#fff', fontSize: 16, fontWeight: 700, textDecoration: 'none', boxShadow: '0 0 50px rgba(124,111,247,.35)', transition: 'all .2s' }}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 50px rgba(124,111,247,.5)'}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(0)';(e.currentTarget as HTMLElement).style.boxShadow='0 0 50px rgba(124,111,247,.35)'}}>
            ✦ Get started free
          </a>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginTop: 14 }}>No credit card · Takes 2 minutes · Cancel anytime</div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: '32px 5%', borderTop: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 800, color: '#fff' }}>M</div>
          <span style={{ fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.6)' }}>Markr</span>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>
          © 2026 Markr. Built for indie hackers.
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'rgba(255,255,255,.35)' }}>
          <a href="/app" style={{ color: 'inherit', textDecoration: 'none' }}>App</a>
          <a href="mailto:hello@markr.app" style={{ color: 'inherit', textDecoration: 'none' }}>Contact</a>
        </div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
