// Strategy view — full implementation in next session
import { useState } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader, Banner, LoadingCard, ErrorCard } from '../components/ui'
import { callClaude, getTestContext } from '../lib/claude'
import { toast } from '../components/Toast'

export default function Strategy() {
  const { currentApp } = useStore()
  const [pillars,   setPillars]   = useState<string[] | null>(null)
  const [valueProp, setValueProp] = useState<{oneliner:string,positioning:string} | null>(null)
  const [loading,   setLoading]   = useState<Record<string,boolean>>({})
  const pt = currentApp.productTest

  const setLoad = (k: string, v: boolean) => setLoading(p => ({...p, [k]:v}))

  async function genPillars() {
    setLoad('pillars', true)
    const ptCtx = getTestContext(currentApp)
    const raw = await callClaude(
      `Create 6 Instagram content pillars for "${currentApp.name}" (${currentApp.category}).
${currentApp.desc ? 'App: '+currentApp.desc : ''}
${ptCtx}
${ptCtx ? 'Pillars MUST reflect real features found in product testing. Name specific screens and features.' : ''}
Output one pillar per line, 2-5 words each, no bullets or numbers.`
    )
    setPillars(raw.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,6))
    setLoad('pillars', false)
    toast('Pillars generated!')
  }

  async function genValueProp() {
    setLoad('vp', true)
    const ptCtx = getTestContext(currentApp)
    const raw = await callClaude(
      `Write a value proposition for "${currentApp.name}" (${currentApp.category}).
${currentApp.desc ?? ''}
${ptCtx ? ptCtx+'\nValue prop must be grounded in real tested features.' : ''}
ONELINER: [10-15 word punchy statement]
POSITIONING: [2 sentence "For X who Y, Product Z is the only W that V — unlike Q" format]`
    )
    const oneliner    = (raw.match(/ONELINER:\s*(.+)/) ?? [])[1]?.trim() ?? ''
    const positioning = (raw.match(/POSITIONING:\s*([\s\S]+)/) ?? [])[1]?.trim() ?? ''
    setValueProp({ oneliner, positioning })
    setLoad('vp', false)
    toast('Value prop generated!')
  }

  return (
    <div>
      {pt && !pt.error && (
        <div style={{ background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.25)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
          <span>🧪</span>
          <div style={{ flex:1, fontSize:12 }}>
            <strong style={{ color:'var(--green)' }}>Strategy informed by product test</strong> — pillars and value prop grounded in real QA findings.
            <span style={{ color:'var(--text3)', marginLeft:8 }}>Works well: {(pt.what_works_well??[]).slice(0,2).join(' · ')}</span>
          </div>
        </div>
      )}
      <Banner icon="💡">
        Strategy for <strong style={{ color:'var(--accent2)' }}>{currentApp.name}</strong> · {currentApp.category} · {currentApp.stage} stage.
      </Banner>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <Card>
          <CardHeader title="Messaging Pillars" action={
            <button className="ca" style={{ fontSize:11, color:'var(--accent)', cursor:'pointer', background:'none', border:'none' }} onClick={genPillars}>
              {loading.pillars ? <span className="spinner" style={{color:'var(--accent2)'}} /> : '✦ Generate'}
            </button>
          } />
          {loading.pillars
            ? <LoadingCard text="Generating pillars…" />
            : (pillars ?? currentApp.pillars ?? []).map((p, i) => (
              <div key={i} style={{ padding:'10px 12px', background:'var(--surface2)', borderRadius:'var(--r)', marginBottom:8, borderLeft:'3px solid var(--accent)' }}>
                <div style={{ fontSize:12, fontWeight:600 }}>{p}</div>
              </div>
            ))}
        </Card>

        <Card>
          <CardHeader title="Value Proposition" action={
            <button className="ca" style={{ fontSize:11, color:'var(--accent)', cursor:'pointer', background:'none', border:'none' }} onClick={genValueProp}>
              {loading.vp ? <span className="spinner" style={{color:'var(--accent2)'}} /> : '✦ Generate'}
            </button>
          } />
          {loading.vp
            ? <LoadingCard text="Crafting value prop…" />
            : valueProp
              ? <>
                  <div style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:14, marginBottom:10 }}>
                    <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>One-liner</div>
                    <div style={{ fontSize:14, fontWeight:500, lineHeight:1.5 }}>{valueProp.oneliner}</div>
                  </div>
                  <div style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:14 }}>
                    <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>Positioning</div>
                    <div style={{ fontSize:12, lineHeight:1.6, color:'var(--text2)' }}>{valueProp.positioning}</div>
                  </div>
                </>
              : <div style={{ fontSize:12, color:'var(--text3)' }}>Click ✦ Generate for AI-crafted positioning grounded in your app's real strengths.</div>
          }
        </Card>
      </div>
    </div>
  )
}
