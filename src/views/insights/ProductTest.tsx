import { useState } from 'react'
import { useStore } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/Toast'

type Severity = 'pass' | 'warn' | 'fail'
interface Check {
  id: string; category: string; label: string
  status: Severity; detail: string; impact: 'High'|'Medium'|'Low'
}
interface PTResult {
  url: string; appName: string; score: number; loadTime: number; runAt: string
  summary: { pass: number; warn: number; fail: number; total: number; highFails: number }
  checks: Check[]
  byCategory: Record<string, Check[]>
  verdict?: string
}

const CAT_ICONS: Record<string,string> = {
  Technical:'⚙️', SEO:'🔍', Accessibility:'♿', UX:'🎯'
}
const STATUS_COLOR: Record<Severity,string> = {
  pass:'var(--green)', warn:'var(--amber)', fail:'var(--red)'
}
const STATUS_BG: Record<Severity,string> = {
  pass:'rgba(52,201,138,.1)', warn:'rgba(245,166,35,.1)', fail:'rgba(229,85,85,.1)'
}
const STATUS_ICON: Record<Severity,string> = {
  pass:'✓', warn:'⚠', fail:'✗'
}

export default function ProductTest() {
  const { currentApp, updateApp, userEmail } = useStore()
  const [running, setRunning]   = useState(false)
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})
  const pt = currentApp.productTest as PTResult | null | undefined

  const isAdmin = userEmail === 'swaroop.raghu@gmail.com'

  async function runTest() {
    if (!currentApp.url) { toast('Add your app URL in Edit App first'); return }
    setRunning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast('Please sign in again'); setRunning(false); return }

      const res = await fetch('/api/product-test', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}` },
        body: JSON.stringify({
          url:         currentApp.url,
          appName:     currentApp.name,
          desc:        currentApp.desc,
          features:    currentApp.features,
          wantVerdict: true, // always get AI verdict — only 200 tokens
        })
      })
      const data = await res.json()
      if (!res.ok) { toast('Error: ' + data.error); setRunning(false); return }
      await updateApp(currentApp.id, { productTest: data } as any)
      toast(`Product test complete! Score: ${data.score}/100`, 4000)
    } catch(e) {
      toast('Test failed: ' + (e as Error).message)
    }
    setRunning(false)
  }

  // No URL
  if (!currentApp.url) {
    return (
      <div style={{ padding:'40px 24px', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🧪</div>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:10, color:'var(--text)' }}>Product Test</div>
        <div style={{ fontSize:13, color:'var(--text3)', maxWidth:380, margin:'0 auto 20px', lineHeight:1.7 }}>
          Add your app URL in Edit App to run a full technical, SEO, accessibility and UX audit — zero AI tokens for the core checks.
        </div>
        <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'14px 18px', maxWidth:380, margin:'0 auto', textAlign:'left' }}>
          {['⚙️ Technical — HTTPS, load time, 404s','🔍 SEO — title, meta, H1, sitemap, OG tags','♿ Accessibility — alt text, form labels, viewport','🎯 UX — CTA, pricing, social proof, contact'].map(s=>(
            <div key={s} style={{ fontSize:12, color:'var(--text2)', display:'flex', gap:8, marginBottom:7 }}>
              <span>{s.split(' ')[0]}</span><span>{s.slice(3)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Empty state — ready to run
  if (!pt || (pt as any).error) {
    return (
      <div style={{ padding:'32px 24px', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🧪</div>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:8, color:'var(--text)' }}>
          {(pt as any)?.error ? 'Test Failed — Try Again' : 'Ready to Test'}
        </div>
        {(pt as any)?.error && (
          <div style={{ fontSize:12, color:'var(--red)', marginBottom:16, maxWidth:380, margin:'0 auto 16px' }}>
            {(pt as any).error}
          </div>
        )}
        <div style={{ fontSize:13, color:'var(--text3)', marginBottom:6 }}>
          Testing: <strong style={{ color:'var(--text2)' }}>{currentApp.url}</strong>
        </div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:24, opacity:.7 }}>
          18 checks · Zero AI tokens for core audit · ~5 seconds
        </div>
        <button className="gen-btn" style={{ margin:'0 auto' }} onClick={runTest} disabled={running}>
          {running
            ? <><span className="spinner" style={{ color:'#fff' }} /> Running audit…</>
            : <><i className="ti ti-flask" style={{ fontSize:13 }} /> Run Product Test</>
          }
        </button>
        {running && (
          <div style={{ marginTop:16, fontSize:12, color:'var(--text3)', opacity:.7, lineHeight:1.8 }}>
            Checking HTTPS & load time…<br/>
            Scanning SEO signals…<br/>
            Testing accessibility…<br/>
            Auditing UX & conversion…
          </div>
        )}
      </div>
    )
  }

  // Results
  const scoreColor = pt.score >= 80 ? 'var(--green)' : pt.score >= 60 ? 'var(--amber)' : 'var(--red)'
  const scoreBg    = pt.score >= 80 ? 'rgba(52,201,138,.1)' : pt.score >= 60 ? 'rgba(245,166,35,.1)' : 'rgba(229,85,85,.1)'

  return (
    <>
      {/* Score header */}
      <div style={{ background:scoreBg, border:`1px solid ${scoreColor}40`, borderRadius:'var(--r2)', padding:'16px 18px', marginBottom:14, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ textAlign:'center', minWidth:64 }}>
          <div style={{ fontSize:42, fontWeight:800, color:scoreColor, lineHeight:1 }}>{pt.score}</div>
          <div style={{ fontSize:10, color:'var(--text3)', marginTop:2, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase' as const }}>/ 100</div>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', gap:10, marginBottom:8, flexWrap:'wrap' as const }}>
            <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background:'rgba(52,201,138,.15)', color:'var(--green)', fontWeight:700 }}>✓ {pt.summary.pass} passed</span>
            {pt.summary.warn > 0 && <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background:'rgba(245,166,35,.15)', color:'var(--amber)', fontWeight:700 }}>⚠ {pt.summary.warn} warnings</span>}
            {pt.summary.fail > 0 && <span style={{ fontSize:11, padding:'2px 10px', borderRadius:20, background:'rgba(229,85,85,.15)', color:'var(--red)', fontWeight:700 }}>✗ {pt.summary.fail} failed</span>}
            <span style={{ fontSize:11, color:'var(--text3)', marginLeft:'auto' }}>
              {(pt.loadTime/1000).toFixed(1)}s load · {new Date(pt.runAt).toLocaleDateString('en-IN')}
            </span>
          </div>
          {pt.verdict && (
            <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, fontStyle:'italic' }}>
              "{pt.verdict}"
            </div>
          )}
        </div>
      </div>

      {/* High priority fails */}
      {pt.summary.highFails > 0 && (
        <div style={{ background:'rgba(229,85,85,.06)', border:'1px solid rgba(229,85,85,.2)', borderRadius:'var(--r2)', padding:'12px 16px', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--red)', marginBottom:8, textTransform:'uppercase' as const, letterSpacing:'.06em' }}>
            🚨 Critical — Fix these first
          </div>
          {pt.checks.filter(c => c.status === 'fail' && c.impact === 'High').map(c => (
            <div key={c.id} style={{ display:'flex', gap:10, padding:'6px 0', borderBottom:'1px solid rgba(229,85,85,.1)', fontSize:12, color:'var(--text2)' }}>
              <span style={{ color:'var(--red)', flexShrink:0, fontWeight:700 }}>✗</span>
              <span>{c.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      {Object.entries(pt.byCategory).map(([cat, checks]) => {
        const catFails = checks.filter(c => c.status === 'fail').length
        const catWarns = checks.filter(c => c.status === 'warn').length
        const catPasses = checks.filter(c => c.status === 'pass').length
        const isOpen = expanded[cat] !== false // default open
        return (
          <div key={cat} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r2)', marginBottom:10, overflow:'hidden' }}>
            {/* Category header */}
            <div
              onClick={() => setExpanded(p => ({ ...p, [cat]: !isOpen }))}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', cursor:'pointer', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}
            >
              <span style={{ fontSize:16 }}>{CAT_ICONS[cat]}</span>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--text)', flex:1 }}>{cat}</span>
              <div style={{ display:'flex', gap:6 }}>
                {catFails > 0 && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(229,85,85,.15)', color:'var(--red)', fontWeight:700 }}>✗ {catFails}</span>}
                {catWarns > 0 && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(245,166,35,.15)', color:'var(--amber)', fontWeight:700 }}>⚠ {catWarns}</span>}
                {catPasses > 0 && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(52,201,138,.15)', color:'var(--green)', fontWeight:700 }}>✓ {catPasses}</span>}
              </div>
              <span style={{ fontSize:11, color:'var(--text3)' }}>{isOpen ? '▲' : '▼'}</span>
            </div>
            {/* Checks */}
            {isOpen && checks.map(c => (
              <div key={c.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:STATUS_BG[c.status], display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:STATUS_COLOR[c.status], flexShrink:0, marginTop:1 }}>
                  {STATUS_ICON[c.status]}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
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

      {/* Re-run button */}
      <div style={{ textAlign:'center', marginTop:16 }}>
        <button className="vbtn" onClick={runTest} disabled={running} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12 }}>
          <i className="ti ti-refresh" style={{ fontSize:13 }} />
          {running ? 'Running…' : 'Re-run audit'}
        </button>
        <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>
          Core audit uses zero AI tokens · AI verdict uses ~200 tokens
        </div>
      </div>
    </>
  )
}
