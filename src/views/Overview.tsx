import { useState } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader, Banner } from '../components/ui'
import { callClaude } from '../lib/claude'

export default function Overview() {
  const { currentApp, setView } = useStore()
  const [insight, setInsight] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function generateInsight() {
    setLoading(true); setInsight('')
    await callClaude(
      `Give a sharp 2-sentence marketing insight for "${currentApp.name}" (${currentApp.category}, ${currentApp.stage}). Which channel is most underused and what content type drives the most organic growth right now? Be specific.`,
      undefined, 400,
      chunk => setInsight(prev => (prev ?? '') + chunk)
    )
    setLoading(false)
  }

  const pt = currentApp.productTest

  return (
    <div>
      {/* Metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:22 }}>
        {[
          { label:'Content Drafted', value:'47', change:'↑ 12 this week', c:'var(--green)' },
          { label:'Posts Scheduled', value:'23', change:'↑ 8 new',        c:'var(--green)' },
          { label:'Reach Est.',      value:'14k', change:'↑ +34%',        c:'var(--green)' },
          { label:'Strategy Score',  value:'82',  change:'Good positioning',c:'var(--accent2)' },
        ].map(m => (
          <div key={m.label} className="card">
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>{m.label}</div>
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:26, fontWeight:700 }}>{m.value}</div>
            <div style={{ fontSize:11, color:m.c, marginTop:4 }}>{m.change}</div>
          </div>
        ))}
      </div>

      {/* AI Insight banner */}
      <div className="banner" style={{ cursor:'pointer' }}>
        <span style={{ fontSize:16, color:'var(--accent2)', flexShrink:0 }}>✦</span>
        <div style={{ flex:1, fontSize:12, lineHeight:1.5 }}>
          {loading
            ? <><span className="spinner" style={{ color:'var(--accent2)' }} />{' '}<em style={{ color:'var(--text3)' }}>Analyzing…</em></>
            : insight
              ? insight
              : <>Click <strong style={{ color:'var(--accent2)' }}>AI Insight</strong> for a live analysis of <strong>{currentApp.name}</strong></>
          }
        </div>
        <button id="ai-insight-btn" className="gen-btn" style={{ fontSize:11, padding:'6px 12px', flexShrink:0 }} onClick={generateInsight}>
          AI Insight
        </button>
      </div>

      {/* QA active banner */}
      {pt && !pt.error && (
        <div style={{ background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.25)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
          <span>🧪</span>
          <div style={{ flex:1, fontSize:12 }}>
            <strong style={{ color:'var(--green)' }}>Product test active</strong> — Score: {pt.overall_score}/100 · {pt.verdict}
            <span style={{ color:'var(--text3)', marginLeft:8 }}>Features: {(pt.features_found??[]).map(f=>f.name).join(', ')}</span>
          </div>
          <button className="vbtn" onClick={() => setView('insights')}>View QA report</button>
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
          <CardHeader title="Content Pillars" />
          {(currentApp.pillars ?? []).map((p, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:['#7c6ff7','#34c98a','#4f9cf7','#f5a623','#e26faf','#e55555'][i%6] }} />
              <span style={{ fontSize:12 }}>{p}</span>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card>
          <CardHeader title="Platform Activity" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[['Instagram','◈','Primary','var(--pink)'],['X / Twitter','✕','Secondary','var(--text)'],['YouTube','▶','Planned','#e55555'],['Facebook','f','Low','var(--blue)']].map(([n,ic,s,col]) => (
              <div key={n as string} style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:12, border:'1px solid var(--border)' }}>
                <div style={{ fontSize:18, color:col as string, marginBottom:6 }}>{ic}</div>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{n}</div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>{s}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent Activity" />
          {[
            { s:'var(--green)',  t:'3 posts published on Instagram', ts:'2h ago' },
            { s:'var(--amber)',  t:'YouTube script awaiting review',  ts:'5h ago' },
            { s:'var(--amber)',  t:'Pricing updated — 2 tiers suggested', ts:'Yesterday' },
            { s:'var(--text3)', t:'X thread batch generated (7 posts)', ts:'Yesterday' },
            { s:'var(--green)',  t:'Competitor analysis refreshed', ts:'2d ago' },
          ].map((a, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:a.s, display:'inline-block', flexShrink:0 }} />
              <span style={{ fontSize:12, flex:1 }}>{a.t}</span>
              <span style={{ fontSize:11, color:'var(--text3)' }}>{a.ts}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
