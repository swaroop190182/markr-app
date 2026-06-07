import { useState } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { callClaude, getTestContext } from '../../lib/claude'
import { toast } from '../../components/Toast'

// ── Types ─────────────────────────────────────────────────────────────────────
type Severity = 'pass' | 'warn' | 'fail'
interface Check { id:string; category:string; label:string; status:Severity; detail:string; impact:'High'|'Medium'|'Low' }
interface PTResult {
  url:string; appName:string; score:number; loadTime:number; runAt:string
  summary:{ pass:number; warn:number; fail:number; total:number; highFails:number }
  checks:Check[]; byCategory:Record<string,Check[]>; verdict?:string
}

const CAT_ICONS: Record<string,string> = { Technical:'⚙️', SEO:'🔍', Accessibility:'♿', UX:'🎯' }
const SC: Record<Severity,string> = { pass:'var(--green)', warn:'var(--amber)', fail:'var(--red)' }
const SBG: Record<Severity,string> = { pass:'rgba(52,201,138,.1)', warn:'rgba(245,166,35,.1)', fail:'rgba(229,85,85,.1)' }
const SI: Record<Severity,string>  = { pass:'✓', warn:'⚠', fail:'✗' }

export default function ProductTest() {
  const { currentApp, updateApp, plan, canUseProductTest, userEmail } = useStore()
  const isAdmin = userEmail === 'swaroop.raghu@gmail.com'
  const [running, setRunning]     = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  const [testEmail, setTestEmail]   = useState('')
  const [testPass, setTestPass]     = useState('')
  const [expanded, setExpanded]   = useState<Record<string,boolean>>({})
  const [activeTab, setActiveTab] = useState<'landing'|'deep'>('landing')

  const pt  = currentApp.productTest
  const isRuleBased = pt && (pt as any).checks && Array.isArray((pt as any).checks)
  const isAiBased   = pt && (pt as any).overall_score !== undefined
  const rulePt      = isRuleBased ? pt as unknown as PTResult : null
  const aiPt        = isAiBased   ? pt : null

  // ── Landing page audit (rule-based, zero tokens) ──────────────────────────
  async function runLandingAudit() {
    if (!currentApp.url) { toast('Add your app URL in Edit App first'); return }
    setRunning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast('Please sign in again'); setRunning(false); return }
      const res = await fetch('/api/product-test', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({ url:currentApp.url, appName:currentApp.name, desc:currentApp.desc, features:currentApp.features, wantVerdict:true })
      })
      const data = await res.json()
      if (!res.ok) { toast('Error: ' + data.error); setRunning(false); return }
      await updateApp(currentApp.id, { productTest: data } as any)
      toast(`Landing audit complete! Score: ${data.score}/100`, 4000)
      setActiveTab('landing')
    } catch(e) { toast('Error: ' + (e as Error).message) }
    setRunning(false)
  }

  async function runDeepTest() {
    if (!canUseProductTest) { toast('AI Readiness Assessment is a Pro feature'); return }
    if (!currentApp.url) { toast('Add your app URL in Edit App first'); return }
    const email = testEmail || currentApp.testCreds?.user || ''
    const pass  = testPass  || currentApp.testCreds?.password || ''
    if (!email) { toast('Enter a test email address'); return }
    if (!pass)  { toast('Enter the test password'); return }
    setAiRunning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast('Please sign in again'); setAiRunning(false); return }
      const res = await fetch('/api/deep-qa', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({
          url:           currentApp.url,
          loginEmail:    email,
          loginPassword: pass,
          appName:       currentApp.name,
          desc:          currentApp.desc,
          features:      currentApp.features,
        })
      })
      const data = await res.json()
      if (!res.ok) { toast('Error: ' + data.error); setAiRunning(false); return }
      await updateApp(currentApp.id, { productTest: data } as any)
      toast(`Deep QA complete! Score: ${data.overall_score}/100 · ${data.screens_captured} screens tested`, 5000)
      setActiveTab('deep')
    } catch(e) {
      toast('Deep test failed: ' + (e as Error).message)
    }
    setAiRunning(false)
  }

  // ── Tab switcher ──────────────────────────────────────────────────────────
  const tabs = [
    { id:'landing', label:'🔍 Landing Page Audit', sub:'Zero AI tokens', available:true },
    { id:'deep',    label:'🧪 Deep AI Test',        sub:'Simulates real user', available:canUseProductTest },
  ] as const

  return (
    <div>
      {/* Tab selector */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ flex:1, padding:'10px 14px', borderRadius:'var(--r)', border:`1px solid ${activeTab===t.id?'var(--accent)':'var(--border)'}`, background:activeTab===t.id?'rgba(124,111,247,.08)':'var(--surface)', cursor:'pointer', textAlign:'left' as const, opacity:t.available?1:.5 }}>
            <div style={{ fontSize:12, fontWeight:700, color:activeTab===t.id?'var(--accent2)':'var(--text)' }}>{t.label}</div>
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{t.sub}</div>
          </button>
        ))}
      </div>

      {/* ── LANDING PAGE AUDIT TAB ── */}
      {activeTab === 'landing' && (
        <>
          {!currentApp.url ? (
            <div style={{ padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:8 }}>Landing Page Audit</div>
              <div style={{ fontSize:13, color:'var(--text3)', maxWidth:380, margin:'0 auto' }}>Add your app URL in Edit App to run a free technical, SEO, accessibility and UX audit.</div>
            </div>
          ) : !rulePt ? (
            <div style={{ padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Landing Page Audit</div>
              <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6 }}>Testing: <strong style={{ color:'var(--text2)' }}>{currentApp.url}</strong></div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:20, opacity:.7 }}>18 checks · Zero AI tokens · ~5 seconds</div>
              <button className="gen-btn" style={{ margin:'0 auto' }} onClick={runLandingAudit} disabled={running}>
                {running ? <><span className="spinner" style={{ color:'#fff' }} /> Running audit…</> : <><i className="ti ti-search" style={{ fontSize:13 }} /> Run Landing Audit</>}
              </button>
            </div>
          ) : (
            <>
              {/* Score */}
              <div style={{ background:rulePt.score>=80?'rgba(52,201,138,.1)':rulePt.score>=60?'rgba(245,166,35,.1)':'rgba(229,85,85,.1)', border:`1px solid ${rulePt.score>=80?'var(--green)':rulePt.score>=60?'var(--amber)':'var(--red)'}40`, borderRadius:'var(--r2)', padding:'14px 18px', marginBottom:12, display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ textAlign:'center', minWidth:60 }}>
                  <div style={{ fontSize:38, fontWeight:800, color:rulePt.score>=80?'var(--green)':rulePt.score>=60?'var(--amber)':'var(--red)', lineHeight:1 }}>{rulePt.score}</div>
                  <div style={{ fontSize:9, color:'var(--text3)', marginTop:2, textTransform:'uppercase' as const, letterSpacing:'.05em' }}>/ 100</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:8, marginBottom:6, flexWrap:'wrap' as const }}>
                    <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background:'rgba(52,201,138,.15)', color:'var(--green)', fontWeight:700 }}>✓ {rulePt.summary.pass} passed</span>
                    {rulePt.summary.warn>0 && <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background:'rgba(245,166,35,.15)', color:'var(--amber)', fontWeight:700 }}>⚠ {rulePt.summary.warn} warnings</span>}
                    {rulePt.summary.fail>0 && <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background:'rgba(229,85,85,.15)', color:'var(--red)', fontWeight:700 }}>✗ {rulePt.summary.fail} failed</span>}
                    <span style={{ fontSize:11, color:'var(--text3)', marginLeft:'auto' }}>{(rulePt.loadTime/1000).toFixed(1)}s load</span>
                  </div>
                  {rulePt.verdict && <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, fontStyle:'italic' }}>"{rulePt.verdict}"</div>}
                </div>
              </div>

              {/* High priority fails */}
              {rulePt.summary.highFails>0 && (
                <div style={{ background:'rgba(229,85,85,.06)', border:'1px solid rgba(229,85,85,.2)', borderRadius:'var(--r2)', padding:'12px 16px', marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--red)', marginBottom:8, textTransform:'uppercase' as const, letterSpacing:'.06em' }}>🚨 Fix these first</div>
                  {rulePt.checks.filter(c=>c.status==='fail'&&c.impact==='High').map(c=>(
                    <div key={c.id} style={{ display:'flex', gap:10, padding:'5px 0', borderBottom:'1px solid rgba(229,85,85,.1)', fontSize:12, color:'var(--text2)' }}>
                      <span style={{ color:'var(--red)', flexShrink:0, fontWeight:700 }}>✗</span><span>{c.detail}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Categories */}
              {Object.entries(rulePt.byCategory).map(([cat, checks]) => {
                const fails = checks.filter(c=>c.status==='fail').length
                const warns = checks.filter(c=>c.status==='warn').length
                const passes = checks.filter(c=>c.status==='pass').length
                const isOpen = expanded[cat] !== false
                return (
                  <div key={cat} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r2)', marginBottom:8, overflow:'hidden' }}>
                    <div onClick={()=>setExpanded(p=>({...p,[cat]:!isOpen}))}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', cursor:'pointer', borderBottom:isOpen?'1px solid var(--border)':'none' }}>
                      <span style={{ fontSize:15 }}>{CAT_ICONS[cat]}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', flex:1 }}>{cat}</span>
                      <div style={{ display:'flex', gap:5 }}>
                        {fails>0 && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(229,85,85,.15)', color:'var(--red)', fontWeight:700 }}>✗ {fails}</span>}
                        {warns>0 && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(245,166,35,.15)', color:'var(--amber)', fontWeight:700 }}>⚠ {warns}</span>}
                        {passes>0 && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(52,201,138,.15)', color:'var(--green)', fontWeight:700 }}>✓ {passes}</span>}
                      </div>
                      <span style={{ fontSize:11, color:'var(--text3)' }}>{isOpen?'▲':'▼'}</span>
                    </div>
                    {isOpen && checks.map(c=>(
                      <div key={c.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'9px 16px', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:20, height:20, borderRadius:'50%', background:SBG[c.status], display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:SC[c.status], flexShrink:0, marginTop:1 }}>{SI[c.status]}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                            <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{c.label}</span>
                            <span style={{ fontSize:9, padding:'1px 6px', borderRadius:20, background:'var(--surface2)', color:'var(--text3)', fontWeight:600 }}>{c.impact}</span>
                          </div>
                          <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5 }}>{c.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}

              <div style={{ textAlign:'center', marginTop:12 }}>
                <button className="vbtn" onClick={runLandingAudit} disabled={running} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12 }}>
                  <i className="ti ti-refresh" style={{ fontSize:13 }} />{running?'Running…':'Re-run audit'}
                </button>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>Core audit uses zero AI tokens · AI verdict ~200 tokens</div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── DEEP AI TEST TAB ── */}
      {activeTab === 'deep' && (
        <>
          {!canUseProductTest ? (
            <div style={{ padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:8 }}>AI Readiness Assessment — Pro only</div>
              <div style={{ fontSize:13, color:'var(--text3)', maxWidth:380, margin:'0 auto', lineHeight:1.7 }}>Scores how well your app communicates its value — not a technical QA test.</div>
            </div>
          ) : !isAdmin ? (
            <div style={{ padding:'40px 24px', textAlign:'center' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🔬</div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 14px', borderRadius:20, background:'rgba(124,111,247,.12)', border:'1px solid rgba(124,111,247,.3)', fontSize:11, fontWeight:700, color:'var(--accent2)', marginBottom:16, letterSpacing:'.06em', textTransform:'uppercase' as const }}>Coming Soon</div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Real Browser QA Testing</div>
              <div style={{ fontSize:13, color:'var(--text3)', maxWidth:420, margin:'0 auto 20px', lineHeight:1.8 }}>Markr will open a real browser, log into your app, navigate every screen, take screenshots, and send them to Claude Vision for a genuine QA report — not simulated.</div>
              <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'16px 20px', maxWidth:400, margin:'0 auto', textAlign:'left' as const }}>
                {['🌐 Opens real headless browser','🔐 Logs in with your test credentials','📸 Screenshots every screen it visits','👁️ Claude Vision analyzes what it sees','🐛 Reports real bugs — not AI guesses'].map(s=>(
                  <div key={s} style={{ fontSize:12, color:'var(--text2)', display:'flex', gap:8, marginBottom:8 }}><span>{s.split(' ')[0]}</span><span>{s.slice(3)}</span></div>
                ))}
              </div>
              <div style={{ marginTop:20, fontSize:11, color:'var(--text3)', opacity:.6 }}>Available in the next update · Add test credentials in Edit App to be ready</div>
            </div>
          ) : !currentApp.testCreds ? (
            <div style={{ padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🧪</div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:8 }}>AI Readiness Assessment</div>
              <div style={{ fontSize:13, color:'var(--text3)', maxWidth:420, margin:'0 auto 16px', lineHeight:1.7 }}>
                Markr opens a <strong style={{ color:'var(--text2)' }}>real browser</strong>, logs into your app with test credentials, navigates through every screen, takes screenshots, and sends them to Claude Vision for a genuine QA report.
              </div>
              <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'14px 18px', maxWidth:400, margin:'0 auto', textAlign:'left' as const }}>
                {['🌐 Opens real browser — not simulated','📸 Screenshots every screen it visits','🔐 Logs in with your test credentials','👁️ Claude Vision analyzes what it actually sees','🐛 Reports real bugs from real screens'].map(s=>(
                  <div key={s} style={{ fontSize:12, color:'var(--text2)', display:'flex', gap:8, marginBottom:7 }}>
                    <span>{s.split(' ')[0]}</span><span>{s.slice(3)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:16, fontSize:12, color:'var(--text3)' }}>Add test credentials in Edit App to get started</div>
            </div>
          ) : !aiPt ? (
            <div style={{ padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🧪</div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:8, color:'var(--text)' }}>Ready for Deep Browser Test</div>
              <div style={{ fontSize:12, color:'var(--text3)', marginBottom:4 }}>
                Will open a real browser, log in as: <strong style={{ color:'var(--text2)' }}>{currentApp.testCreds.user}</strong>
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, opacity:.7 }}>
                Takes ~30-45 seconds · Captures 5-8 real screenshots · Claude Vision analyzes each one
              </div>
              <div style={{ fontSize:11, color:'var(--amber)', marginBottom:20, opacity:.8 }}>
                ⚠️ Uses ~1,500 tokens (vision) — counts toward your daily limit
              </div>
              <div style={{ maxWidth:300, margin:'0 auto 14px', display:'flex', flexDirection:'column', gap:8 }}>
                <input type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)}
                  placeholder={currentApp.testCreds?.user || 'Test email address'}
                  style={{ textAlign:'center' }} />
                <input type="password" value={testPass} onChange={e=>setTestPass(e.target.value)}
                  placeholder="Test password"
                  style={{ textAlign:'center' }} />
              </div>
              <button className="gen-btn" style={{ margin:'0 auto' }} onClick={runDeepTest} disabled={aiRunning}>
                {aiRunning
                  ? <><span className="spinner" style={{ color:'#fff' }} /> Opening browser…</>
                  : <><i className="ti ti-flask" style={{ fontSize:13 }} /> Run Deep Browser Test</>}
              </button>
              {aiRunning && (
                <div style={{ marginTop:14, fontSize:12, color:'var(--text3)', opacity:.7, lineHeight:2 }}>
                  🌐 Opening browser…<br/>
                  🔐 Logging in…<br/>
                  📸 Capturing screens…<br/>
                  👁️ Claude Vision analyzing…
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Existing AI test results renderer */}
              {(() => {
                const score = aiPt.overall_score ?? 0
                const sc = score>=80?'var(--green)':score>=60?'var(--amber)':'var(--red)'
                const sbg = score>=80?'rgba(52,201,138,.12)':score>=60?'rgba(245,166,35,.12)':'rgba(229,85,85,.12)'
                const sev = { Critical:'var(--red)', High:'#f97316', Medium:'var(--amber)', Low:'var(--text3)' } as Record<string,string>
                const sevBg = { Critical:'rgba(229,85,85,.12)', High:'rgba(249,115,22,.12)', Medium:'rgba(245,166,35,.12)', Low:'rgba(90,90,114,.1)' } as Record<string,string>
                return (
                  <>
                    <div style={{ background:sbg, border:`1px solid ${sc}40`, borderRadius:'var(--r2)', padding:'14px 18px', marginBottom:14, display:'flex', alignItems:'center', gap:14 }}>
                      <div style={{ textAlign:'center', flexShrink:0 }}>
                        <div style={{ fontSize:38, fontWeight:800, color:sc, lineHeight:1 }}>{score}</div>
                        <div style={{ fontSize:9, color:'var(--text3)', marginTop:2 }}>QA Score</div>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:4 }}>{aiPt.verdict_emoji} {aiPt.verdict}</div>
                        <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5, marginBottom:6 }}>{aiPt.executive_summary}</div>
                        {(aiPt as any).screens_captured && (
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(124,111,247,.15)', color:'var(--accent2)', fontWeight:600 }}>
                              📸 {(aiPt as any).screens_captured} screens tested
                            </span>
                            {(aiPt as any).screens_list?.slice(0,3).map((s: string, i: number) => (
                              <span key={i} style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'var(--surface2)', color:'var(--text3)' }}>{s.slice(0,30)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* UX scores */}
                    {aiPt.ux_ratings && (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                        {Object.entries(aiPt.ux_ratings).map(([k,v]) => {
                          const vc = (v as number)>=80?'var(--green)':(v as number)>=60?'var(--amber)':'var(--red)'
                          const labels: Record<string,string> = { onboarding:'Onboarding', navigation:'Navigation', visual_design:'Visual Design', performance:'Performance', mobile_responsiveness:'Mobile', error_handling:'Error Handling' }
                          return (
                            <div key={k} style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'10px 12px', border:'1px solid var(--border)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                                <span style={{ fontSize:11, fontWeight:600, color:'var(--text2)' }}>{labels[k]??k}</span>
                                <span style={{ fontSize:14, fontWeight:700, color:vc }}>{v as number}</span>
                              </div>
                              <div style={{ height:4, background:'var(--surface3)', borderRadius:2, overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${v}%`, background:vc, borderRadius:2 }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Bugs */}
                    {(aiPt.bugs_and_issues??[]).length>0 && (
                      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'14px 16px', marginBottom:14 }}>
                        <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>🐛 Bugs & Issues ({aiPt.bugs_and_issues!.length} found)</div>
                        {aiPt.bugs_and_issues!.map((b,i)=>(
                          <div key={i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)', alignItems:'flex-start' }}>
                            <div style={{ width:6, height:6, borderRadius:'50%', background:sev[b.severity]??sev.Medium, marginTop:5, flexShrink:0 }} />
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{b.title}</div>
                              <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5 }}>{b.description}</div>
                            </div>
                            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:sevBg[b.severity]??sevBg.Medium, color:sev[b.severity]??sev.Medium, flexShrink:0 }}>{b.severity}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* What works / needs fixing */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                      <div style={{ background:'var(--surface)', border:'1px solid rgba(52,201,138,.25)', borderRadius:'var(--r2)', padding:14 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--green)', marginBottom:10 }}>✅ What Works</div>
                        {(aiPt.what_works_well??[]).map((w,i)=>(
                          <div key={i} style={{ display:'flex', gap:8, padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                            <span style={{ color:'var(--green)', flexShrink:0 }}>✓</span><span>{w}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ background:'var(--surface)', border:'1px solid rgba(245,166,35,.25)', borderRadius:'var(--r2)', padding:14 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--amber)', marginBottom:10 }}>🔧 Needs Fixing</div>
                        {(aiPt.what_needs_fixing??[]).map((w,i)=>(
                          <div key={i} style={{ display:'flex', gap:8, padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                            <span style={{ color:'var(--amber)', fontWeight:700, flexShrink:0 }}>{i+1}</span><span>{w}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Re-run */}
                    <div style={{ textAlign:'center', marginTop:14 }}>
                      <div style={{ maxWidth:300, margin:'0 auto 10px', display:'flex', flexDirection:'column', gap:8 }}>
                        <input type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)}
                          placeholder={currentApp.testCreds?.user || 'Test email to re-run'}
                          style={{ textAlign:'center' }} />
                        <input type="password" value={testPass} onChange={e=>setTestPass(e.target.value)}
                          placeholder="Password to re-run"
                          style={{ textAlign:'center' }} />
                      </div>
                      <button className="vbtn" onClick={runDeepTest} disabled={aiRunning} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12 }}>
                        <i className="ti ti-refresh" />  {aiRunning?'Running…':'Re-run deep test'}
                      </button>
                    </div>
                  </>
                )
              })()}
            </>
          )}
        </>
      )}
    </div>
  )
}
