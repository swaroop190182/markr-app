import { useState } from 'react'
import { useStore } from '../../lib/store'
import { Card, CardHeader, Banner, LoadingCard, CopyButton } from '../../components/ui'
import { runProductTest } from '../../lib/claude'
import { toast } from '../../components/Toast'

export default function ProductTest() {
  const { currentApp, updateApp, canUseProductTest, plan } = useStore()
  const [running, setRunning] = useState(false)
  const [testPass, setTestPass] = useState('')
  const pt = currentApp.productTest

  // Pro-only gate
  if (!canUseProductTest) {
    return (
      <div style={{ padding:'40px 24px', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, marginBottom:10 }}>Product Test is a Pro feature</div>
        <div style={{ fontSize:13, color:'var(--text3)', maxWidth:400, margin:'0 auto 24px', lineHeight:1.7 }}>
          The AI QA simulation uses our most powerful model to test every feature of your app as a real user. It's the most valuable — and most expensive — feature in Markr. Available on Pro only.
        </div>
        <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'16px 20px', margin:'0 auto 24px', maxWidth:380, textAlign:'left' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>What you get on Pro</div>
          {['🧪 Full QA simulation — every feature tested','⭐ UX scores across 6 dimensions','🐛 Bug report with severity ratings','💡 Content implications from real usage','🎯 Prioritised fix list for your team'].map(s => (
            <div key={s} style={{ fontSize:12, color:'var(--text2)', display:'flex', gap:8, marginBottom:7 }}>
              <span style={{ flexShrink:0 }}>{s.split(' ')[0]}</span>
              <span>{s.slice(s.indexOf(' ')+1)}</span>
            </div>
          ))}
        </div>
        <a href="mailto:swaroop.raghu@gmail.com?subject=Markr Pro Upgrade&body=Hi, I'd like to upgrade to Markr Pro to access Product Testing."
          style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'11px 24px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', fontSize:14, fontWeight:700, textDecoration:'none' }}>
          Upgrade to Pro — ₹999/mo →
        </a>
        <div style={{ fontSize:12, color:'var(--text3)', marginTop:12 }}>Currently on: <strong style={{ color:'var(--text2)' }}>{plan} plan</strong></div>
      </div>
    )
  }

  async function runTest() {
    if (!currentApp.testCreds) { toast('No test credentials saved. Edit the app to add them.'); return }
    const pass = testPass || currentApp.testCreds.password || ''
    if (!pass) { toast('Please enter the test password below'); return }
    setRunning(true)
    try {
      const result = await runProductTest(currentApp, pass)
      updateApp(currentApp.id, { productTest: result })
      toast(`Product test complete! Score: ${result.overall_score}/100`, 4000)
    } catch(e) {
      updateApp(currentApp.id, { productTest: { error: (e as Error).message } as any })
      toast('Product test failed: ' + (e as Error).message)
    }
    setRunning(false)
  }

  // No credentials
  if (!currentApp.testCreds) {
    return (
      <div className="card" style={{ padding:40, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🧪</div>
        <div style={{ fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:700, marginBottom:10 }}>Product Test</div>
        <div style={{ fontSize:13, color:'var(--text3)', maxWidth:420, margin:'0 auto 24px', lineHeight:1.7 }}>
          Add test credentials when editing your app and Markr will simulate a real user session — testing every feature, finding bugs, rating UX, and giving you a full QA verdict.
        </div>
        <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'16px 20px', margin:'0 auto 24px', maxWidth:420, textAlign:'left' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>What you get</div>
          {['🔬 Hands-on flow testing — every feature & tab','⭐ UX scores across 6 dimensions','🐛 Bug & issue report with severity ratings','📋 Feature inventory with quality assessment','💡 Content implications from real product usage','🎯 Prioritised fix list the team can act on'].map(s => (
            <div key={s} style={{ fontSize:12, color:'var(--text2)', display:'flex', alignItems:'flex-start', gap:8, marginBottom:7 }}>
              <span style={{ flexShrink:0 }}>{s.split(' ')[0]}</span>
              <span>{s.slice(s.indexOf(' ')+1)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Has creds — show run button or running state
  if (!pt || pt.error) {
    return (
      <div className="card" style={{ padding:32, textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:14 }}>{pt?.error ? '⚠️' : '🧪'}</div>
        <div style={{ fontFamily:'Syne,sans-serif', fontSize:16, fontWeight:700, marginBottom:8 }}>
          {pt?.error ? 'Product Test Failed' : 'Ready to Test'}
        </div>
        {pt?.error && <div style={{ fontSize:12, color:'var(--red)', marginBottom:16, maxWidth:380, margin:'0 auto 16px' }}>{pt.error}</div>}
        <div style={{ fontSize:13, color:'var(--text3)', marginBottom:20 }}>
          Test account: <strong style={{ color:'var(--text2)' }}>{currentApp.testCreds.user}</strong>
        </div>
        <div style={{ maxWidth:280, margin:'0 auto 16px' }}>
          <input
            type="password"
            value={testPass}
            onChange={e => setTestPass(e.target.value)}
            placeholder="Enter test password to run"
            style={{ textAlign:'center' }}
          />
        </div>
        <button className="gen-btn" style={{ margin:'0 auto' }} onClick={runTest} disabled={running}>
          {running
            ? <><span className="spinner" style={{ color:'#fff' }} /> Running test…</>
            : <><i className="ti ti-flask" style={{ fontSize:13 }} /> Run Product Test</>
          }
        </button>
        {running && (
          <div style={{ marginTop:16, fontSize:12, color:'var(--text3)', opacity:.7 }}>
            Exploring flows · Assessing features · Finding issues · Writing QA report
          </div>
        )}
      </div>
    )
  }

  // Full report
  const score = pt.overall_score ?? 0
  const scoreColor = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)'
  const scoreBg    = score >= 80 ? 'rgba(52,201,138,.12)' : score >= 60 ? 'rgba(245,166,35,.12)' : 'rgba(229,85,85,.12)'
  const sev  = { Critical:'var(--red)', High:'#f97316', Medium:'var(--amber)', Low:'var(--text3)' } as Record<string,string>
  const sevBg= { Critical:'rgba(229,85,85,.12)', High:'rgba(249,115,22,.12)', Medium:'rgba(245,166,35,.12)', Low:'rgba(90,90,114,.1)' } as Record<string,string>
  const qC   = { Excellent:'var(--green)', Good:'var(--blue)', Average:'var(--amber)', Poor:'var(--red)' } as Record<string,string>
  const qBg  = { Excellent:'rgba(52,201,138,.1)', Good:'rgba(79,156,247,.1)', Average:'rgba(245,166,35,.1)', Poor:'rgba(229,85,85,.1)' } as Record<string,string>
  const fC   = { Pass:'var(--green)', Partial:'var(--amber)', Fail:'var(--red)' } as Record<string,string>
  const fBg  = { Pass:'rgba(52,201,138,.1)', Partial:'rgba(245,166,35,.1)', Fail:'rgba(229,85,85,.1)' } as Record<string,string>
  const uxLabels: Record<string,string> = { onboarding:'Onboarding', navigation:'Navigation', visual_design:'Visual Design', performance:'Performance', mobile_responsiveness:'Mobile', error_handling:'Error Handling' }
  const circ = 2 * Math.PI * 16
  const prog = (score/100) * circ

  return (
    <>
      {/* Header */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r2)', overflow:'hidden', marginBottom:14 }}>
        <div style={{ padding:20, background:'linear-gradient(135deg,rgba(124,111,247,.06),rgba(226,111,175,.04))', display:'flex', alignItems:'center', gap:18, flexWrap:'wrap' }}>
          <div style={{ position:'relative', width:76, height:76, flexShrink:0 }}>
            <svg width="76" height="76" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" fill="none" stroke="var(--surface3)" strokeWidth="2.5"/>
              <circle cx="18" cy="18" r="16" fill="none" stroke={scoreColor} strokeWidth="2.5"
                strokeDasharray={`${prog.toFixed(1)} ${(circ-prog).toFixed(1)}`}
                strokeLinecap="round" transform="rotate(-90 18 18)"/>
            </svg>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:800, color:scoreColor }}>{score}</div>
          </div>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
              <span style={{ fontFamily:'Syne,sans-serif', fontSize:15, fontWeight:700 }}>{pt.verdict_emoji ?? '🧪'} Product Test — {currentApp.name}</span>
              <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:700, background:scoreBg, color:scoreColor, border:`1px solid ${scoreColor}` }}>{pt.verdict}</span>
            </div>
            {currentApp.testCreds && <div style={{ fontSize:11, color:'var(--text3)', marginBottom:7 }}>Tested as: <strong style={{ color:'var(--text2)' }}>{currentApp.testCreds.user}</strong></div>}
            <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.65, maxWidth:500 }}>{pt.executive_summary}</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end' }}>
            <button className="vbtn" onClick={() => updateApp(currentApp.id, { productTest: null })}>Clear</button>
            <div style={{ maxWidth:160 }}>
              <input type="password" value={testPass} onChange={e=>setTestPass(e.target.value)} placeholder="Password to re-test" style={{ fontSize:11, padding:'6px 10px' }} />
            </div>
            <button className="gen-btn" style={{ fontSize:11, padding:'6px 12px' }} onClick={runTest} disabled={running}>
              {running ? <><span className="spinner" style={{color:'#fff'}}/> Re-testing…</> : '🔄 Re-test'}
            </button>
          </div>
        </div>
        {pt.tester_recommendation && <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border)', fontSize:12, background:'rgba(124,111,247,.04)' }}><strong style={{ color:'var(--accent2)' }}>💬 Verdict:</strong> <span style={{ color:'var(--text2)' }}>{pt.tester_recommendation}</span></div>}
        {pt.first_impression && <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--text3)' }}><strong style={{ color:'var(--text2)' }}>👁 First 60s:</strong> {pt.first_impression}</div>}
      </div>

      {/* UX Scores */}
      <Card style={{ marginBottom:14 }}>
        <CardHeader title="UX Quality Scores" action={<span style={{ fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:700, color:scoreColor }}>{score}<span style={{ fontSize:11, color:'var(--text3)', fontWeight:400 }}>/100</span></span>} />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
          {Object.entries(pt.ux_ratings ?? {}).map(([k,v]) => {
            const vc = (v as number) >= 80 ? 'var(--green)' : (v as number) >= 60 ? 'var(--amber)' : 'var(--red)'
            return (
              <div key={k} style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'10px 12px', border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:7 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--text2)' }}>{uxLabels[k]??k}</span>
                  <span style={{ fontFamily:'Syne,sans-serif', fontSize:15, fontWeight:700, color:vc }}>{v as number}</span>
                </div>
                <div style={{ height:5, background:'var(--surface3)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${v}%`, background:vc, borderRadius:3, transition:'width .8s ease' }} />
                </div>
              </div>
            )
          })}
        </div>
        {pt.ux_observations && <div style={{ padding:'10px 12px', background:'var(--surface2)', borderRadius:'var(--r)', fontSize:12, color:'var(--text2)', lineHeight:1.6 }}>{pt.ux_observations}</div>}
      </Card>

      {/* Tested flows */}
      {(pt.tested_flows??[]).length > 0 && (
        <Card style={{ marginBottom:14 }}>
          <CardHeader title="Tested Flows" action={<span style={{ fontSize:11, color:'var(--text3)' }}>{pt.tested_flows!.length} flows explored</span>} />
          {pt.tested_flows!.map((f, i) => (
            <div key={i} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'12px 14px', marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:700 }}>{f.name}</span>
                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:fBg[f.status]??fBg.Partial, color:fC[f.status]??fC.Partial }}>{f.status}</span>
                <span style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, marginLeft:'auto', color:f.score>=80?'var(--green)':f.score>=60?'var(--amber)':'var(--red)' }}>{f.score}/100</span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                {f.steps_tested.map((s,j) => <span key={j} style={{ fontSize:10, background:'var(--surface3)', borderRadius:20, padding:'2px 8px', color:'var(--text3)' }}>{j+1}. {s}</span>)}
              </div>
              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, marginBottom: f.friction_point ? 8 : 0 }}>{f.observation}</div>
              {f.friction_point && <div style={{ display:'flex', gap:6, alignItems:'flex-start', padding:'7px 10px', background:'rgba(245,166,35,.06)', border:'1px solid rgba(245,166,35,.2)', borderRadius:6, fontSize:11, color:'var(--amber)' }}><span>⚠</span>{f.friction_point}</div>}
            </div>
          ))}
        </Card>
      )}

      {/* Features */}
      {(pt.features_found??[]).length > 0 && (
        <Card style={{ marginBottom:14 }}>
          <CardHeader title="Features Assessed" action={<span style={{ fontSize:11, color:'var(--text3)' }}>{pt.features_found!.length} features tested</span>} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {pt.features_found!.map((f,i) => (
              <div key={i} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'11px 13px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                  <span style={{ fontSize:12, fontWeight:700, flex:1 }}>{f.name}</span>
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:700, background:qBg[f.quality]??qBg.Average, color:qC[f.quality]??qC.Average }}>{f.quality}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5 }}>{f.description}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Bugs */}
      {(pt.bugs_and_issues??[]).length > 0 && (
        <Card style={{ marginBottom:14, borderColor: pt.bugs_and_issues!.some(b=>b.severity==='Critical') ? 'rgba(229,85,85,.3)' : undefined }}>
          <CardHeader title={`🐛 Bugs & Issues (${pt.bugs_and_issues!.length} found)`} action={
            <div style={{ display:'flex', gap:4 }}>
              {(['Critical','High','Medium','Low'] as const).map(s => {
                const n = pt.bugs_and_issues!.filter(b=>b.severity===s).length
                return n ? <span key={s} style={{ fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:700, background:sevBg[s], color:sev[s] }}>{n} {s}</span> : null
              })}
            </div>
          } />
          {pt.bugs_and_issues!.map((b,i) => (
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:sev[b.severity]??sev.Medium, marginTop:5, flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{b.title}</div>
                <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5, marginBottom:3 }}>{b.description}</div>
                {b.location && <div style={{ fontSize:10, color:'var(--text3)' }}>📍 {b.location}</div>}
              </div>
              <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:sevBg[b.severity]??sevBg.Medium, color:sev[b.severity]??sev.Medium, flexShrink:0 }}>{b.severity}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Works / Fixes */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <div style={{ background:'var(--surface)', border:'1px solid rgba(52,201,138,.25)', borderRadius:'var(--r2)', padding:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--green)', marginBottom:12 }}>✅ What Works Well</div>
          {(pt.what_works_well??[]).map((w,i) => (
            <div key={i} style={{ display:'flex', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:12, lineHeight:1.55 }}>
              <span style={{ color:'var(--green)', flexShrink:0 }}>✓</span><span>{w}</span>
            </div>
          ))}
        </div>
        <div style={{ background:'var(--surface)', border:'1px solid rgba(245,166,35,.25)', borderRadius:'var(--r2)', padding:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--amber)', marginBottom:12 }}>🔧 What Needs Fixing</div>
          {(pt.what_needs_fixing??[]).map((w,i) => (
            <div key={i} style={{ display:'flex', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:12, lineHeight:1.55 }}>
              <span style={{ color:'var(--amber)', fontWeight:700, flexShrink:0 }}>{i+1}</span><span>{w}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content implications */}
      {(pt.content_implications??[]).length > 0 && (
        <div style={{ background:'rgba(124,111,247,.04)', border:'1px solid rgba(124,111,247,.3)', borderRadius:'var(--r2)', padding:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--accent2)', marginBottom:12 }}>
            💡 Content Implications <span style={{ fontSize:11, fontWeight:400, color:'var(--text3)' }}>— how test findings shape your marketing</span>
          </div>
          {pt.content_implications!.map((c,i) => (
            <div key={i} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(124,111,247,.15)', color:'var(--accent2)', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i+1}</div>
              <div style={{ fontSize:12, lineHeight:1.65 }}>{c}</div>
            </div>
          ))}
          {pt.competitive_edge_from_test && <div style={{ marginTop:10, padding:'9px 12px', background:'rgba(255,255,255,.03)', borderRadius:'var(--r)', fontSize:12, color:'var(--text2)' }}><strong style={{ color:'var(--text)' }}>🏆 Real competitive edge:</strong> {pt.competitive_edge_from_test}</div>}
          {pt.onboarding_verdict && <div style={{ marginTop:8, padding:'9px 12px', background:'rgba(255,255,255,.03)', borderRadius:'var(--r)', fontSize:12, color:'var(--text2)' }}><strong style={{ color:'var(--text)' }}>⚡ Onboarding:</strong> {pt.onboarding_verdict}</div>}
        </div>
      )}
    </>
  )
}
