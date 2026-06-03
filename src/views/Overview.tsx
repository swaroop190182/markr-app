import { useState } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader } from '../components/ui'
import { callClaude } from '../lib/claude'
import DeliverySettings from './DeliverySettings'

export default function Overview({ onAddApp }: { onAddApp?: () => void }) {
  const { apps, currentApp, setView, plan } = useStore()
  const [insight, setInsight] = useState<string | null>(null)
  const [loading, setLoading]  = useState(false)
  const pt  = currentApp?.productTest
  const ua  = (currentApp as any)?.url_analysis
  const hasApps = apps.length > 0

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
          { label:'Product Test', value: currentApp.productTest && !currentApp.productTest.error ? `${(currentApp.productTest as any).score ?? currentApp.productTest.overall_score ?? '—'}/100` : '—', change: currentApp.productTest && !currentApp.productTest.error ? ((currentApp.productTest as any).verdict ?? '') : 'Not run yet', c: currentApp.productTest && !currentApp.productTest.error ? 'var(--green)' : 'var(--text3)' },
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
            <strong style={{ color:'var(--green)' }}>Product test active</strong>
            {' '}— Score: {(pt as any).score ?? pt.overall_score ?? '—'}/100
            {(pt as any).verdict ? ` · ${(pt as any).verdict}` : ''}
            {(pt.features_found??[]).length > 0 && (
              <span style={{ color:'var(--text3)', marginLeft:8 }}>Features: {(pt.features_found??[]).map((f:any)=>f.name).join(', ')}</span>
            )}
          </div>
          <button className="vbtn" onClick={() => setView('insights')}>View QA report</button>
        </div>
      )}

      {/* Deep URL Analysis Scores */}
      {ua && !ua.error && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'18px 20px', marginBottom:14 }}>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:2 }}>
                Landing Page Analysis
                <span style={{ marginLeft:8, fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:700,
                  background: ua.overall >= 7 ? 'rgba(22,168,112,.1)' : ua.overall >= 5 ? 'rgba(212,138,10,.1)' : 'rgba(220,38,38,.1)',
                  color: ua.overall >= 7 ? 'var(--green)' : ua.overall >= 5 ? 'var(--amber)' : 'var(--red)'
                }}>
                  {ua.overall}/10
                </span>
              </div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>
                {ua.pagesRead?.length > 0 ? `Pages analyzed: Home${ua.pagesRead.map((p: string) => ` · ${p}`).join('')}` : 'Homepage analyzed'}
                {ua.analyzed_at ? ` · ${new Date(ua.analyzed_at).toLocaleDateString('en-IN')}` : ''}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:32, fontWeight:800, lineHeight:1,
                color: ua.overall >= 7 ? 'var(--green)' : ua.overall >= 5 ? 'var(--amber)' : 'var(--red)'
              }}>{ua.overall}</div>
              <div style={{ fontSize:10, color:'var(--text3)' }}>out of 10</div>
            </div>
          </div>

          {/* Score bars */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
            {(ua.dimensions ?? []).map((d: any) => {
              const c = d.score >= 7 ? 'var(--green)' : d.score >= 5 ? 'var(--amber)' : 'var(--red)'
              return (
                <div key={d.label}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{d.label}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:c }}>{d.score}/10</span>
                  </div>
                  <div style={{ height:6, background:'var(--surface2)', borderRadius:3, overflow:'hidden', marginBottom:3 }}>
                    <div style={{ height:'100%', width:`${d.score * 10}%`, background:c, borderRadius:3, transition:'width .5s' }} />
                  </div>
                  <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5 }}>{d.issue}</div>
                </div>
              )
            })}
          </div>

          {/* Bottleneck */}
          {ua.bottleneck && (
            <div style={{ background:'rgba(220,38,38,.05)', border:'1px solid rgba(220,38,38,.15)', borderRadius:'var(--r)', padding:'10px 12px', marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--red)', marginBottom:4 }}>
                🚨 Biggest Bottleneck — {ua.bottleneck.label}
              </div>
              <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.6 }}>{ua.bottleneck.issue}</div>
            </div>
          )}

          {/* Growth opportunity */}
          {ua.growth_teaser && (
            <div style={{ background:'rgba(124,111,247,.05)', border:'1px solid rgba(124,111,247,.15)', borderRadius:'var(--r)', padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginBottom:4 }}>💡 Content Opportunity</div>
              <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.6 }}>{ua.growth_teaser}</div>
            </div>
          )}
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
        <Card>
          <CardHeader title="Today's Posts" action={<button className="vbtn" onClick={() => setView('studio')}>Open studio →</button>} />
          {[
            { t:'morning', emoji:'🌅', label:'Morning Post', time:'7:00–9:00 AM',  color:'var(--morning-c)' },
            { t:'midday',  emoji:'💡', label:'Midday Post',  time:'12:00–1:30 PM', color:'var(--midday-c)'  },
            { t:'evening', emoji:'🌙', label:'Evening Post', time:'7:00–9:00 PM',  color:'var(--evening-c)' },
          ].map(c => (
            <div key={c.t} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:16 }}>{c.emoji}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:c.color }}>{c.label}</div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>{c.time}</div>
              </div>
              <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:600, background:'rgba(90,90,114,.15)', color:'var(--text3)' }}>Idle</span>
            </div>
          ))}
          <button className="gen-btn" style={{ width:'100%', justifyContent:'center', fontSize:12, marginTop:12 }} onClick={() => setView('studio')}>
            <i className="ti ti-bolt" style={{ fontSize:13 }} /> Generate All 3 Posts
          </button>
        </Card>

        <Card>
          <CardHeader title={`Content Pillars · ${currentApp.name}`} />
          {(currentApp.pillars ?? []).length > 0
            ? (currentApp.pillars ?? []).map((p, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:['#7c6ff7','#34c98a','#4f9cf7','#f5a623','#e26faf','#e55555'][i%6] }} />
                  <span style={{ fontSize:12 }}>{p}</span>
                </div>
              ))
            : <div style={{ fontSize:12, color:'var(--text3)', padding:'12px 0', textAlign:'center' }}>Add an app to see content pillars</div>
          }
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
