import { useState, useEffect } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader } from '../components/ui'
import { callClaude } from '../lib/claude'
import DeliverySettings from './DeliverySettings'


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
  const [uaLoading,  setUaLoading]  = useState(false)
  const [compLoading,setCompLoading]= useState(false)
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
    }).then(r => r.ok ? r.json() : null).then(result => {
      if (result && !result.error) {
        updateApp(currentApp.id, {
          url_analysis: {
            overall: result.overall,
            headline: result.headline,
            category: result.category,
            dimensions: result.dimensions,
            bottleneck: result.bottleneck,
            growth_teaser: result.growth_teaser,
            pagesRead: result.pagesRead ?? [],
            analyzed_at: new Date().toISOString()
          }
        } as any)
      }
    }).catch(() => {}).finally(() => setUaLoading(false))
  }, [currentApp?.id])

  async function runCompetitorAnalysis() {
    setCompLoading(true)
    try {
      // First try: use competitor identified during URL analysis (based on actual content)
      let topComp = (ua as any)?.closestCompetitor ?? null

      // Second try: use existing competitive analysis cache
      if (!topComp?.url && currentApp?.competitive_analysis) {
        try {
          const parsed = JSON.parse(currentApp.competitive_analysis)
          const c = parsed.comps?.[0]
          if (c?.url) topComp = { name: c.name, url: c.url }
        } catch {}
      }

      // Third try: ask Claude based on actual website headline, not category
      if (!topComp?.url) {
        const appDesc = ua?.headline || currentApp?.desc || currentApp?.name || ''
        const raw = await callClaude(
          `Based on this app's actual purpose, find the single closest direct competitor.
App: "${appDesc}" (URL: ${currentApp?.url || ''})
Return ONLY JSON: {"name":"X","url":"https://competitor.com"}`,
          'Output ONLY valid JSON. No markdown.', 150
        )
        try {
          const cleaned = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim()
          topComp = JSON.parse(cleaned)
        } catch { setCompLoading(false); return }
      }

      if (!topComp?.url) { setCompLoading(false); return }

      const r = await fetch('/api/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-call': 'markr_internal' },
        body: JSON.stringify({ url: topComp.url })
      })
      if (r.ok) {
        const result = await r.json()
        if (!result.error) {
          updateApp(currentApp!.id, {
            competitor_url_analysis: {
              name: topComp.name,
              url: topComp.url,
              overall: result.overall,
              headline: result.headline,
              dimensions: result.dimensions,
              bottleneck: result.bottleneck,
              analyzed_at: new Date().toISOString()
            }
          } as any)
        }
      }
    } catch {}
    setCompLoading(false)
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
                </div>
              ) : (
                <button className="vbtn" style={{ width:'100%', justifyContent:'center', fontSize:11, marginTop:8 }}
                  onClick={runCompetitorAnalysis} disabled={compLoading}>
                  {compLoading
                    ? <><span className="spinner" style={{ color:'var(--accent)' }} /> Finding &amp; analyzing closest competitor…</>
                    : '⚔ Compare with closest competitor →'}
                </button>
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
          {(currentApp.pillars ?? []).length > 0
            ? (currentApp.pillars ?? []).map((p, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:['#7c6ff7','#34c98a','#4f9cf7','#f5a623','#e26faf','#e55555'][i%6] }} />
                  <span style={{ fontSize:12 }}>{p.replace(/\*/g, '').trim()}</span>
                </div>
              ))
            : <div style={{ fontSize:12, color:'var(--text3)', padding:'12px 0', textAlign:'center' as const }}>
                Run Deep Analysis to generate content pillars
              </div>
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
