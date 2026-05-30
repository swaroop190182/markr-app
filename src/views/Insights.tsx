import { useState } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader, Banner, LoadingCard, ErrorCard, CopyButton } from '../components/ui'
import { callClaude, getTestContext, safeParseJSON } from '../lib/claude'
import { toast } from '../components/Toast'
import ProductTest from './insights/ProductTest'

type Tab = 'competitive' | 'bmc' | 'swot' | 'growth' | 'pricing' | 'product'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id:'competitive', label:'Competitive',           emoji:'🔍' },
  { id:'bmc',         label:'Business Model Canvas', emoji:'🗂' },
  { id:'swot',        label:'SWOT',                  emoji:'⚡' },
  { id:'growth',      label:'Growth Strategies',     emoji:'🚀' },
  { id:'pricing',     label:'Pricing',               emoji:'💰' },
  { id:'product',     label:'Product Test',          emoji:'🧪' },
]

export default function Insights() {
  const { currentApp, updateApp } = useStore()
  const [activeTab, setActiveTab] = useState<Tab>('competitive')
  const [cache, setCache] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [runningFull, setRunningFull] = useState(false)
  const [fullSteps, setFullSteps] = useState<Record<string,string>>({})

  const setLoad = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))
  const setFStep = (k: string, s: string) => setFullSteps(p => ({ ...p, [k]: s }))
  const setTabCache = (k: string, html: string) => setCache(p => ({ ...p, [k]: html }))

  const pt = currentApp.productTest

  // ── COMPETITIVE ─────────────────────────────────────────────────────────────
  async function genCompetitive() {
    setLoad('competitive', true)
    const ptCtx = getTestContext(currentApp)
    try {
      const prompt = `Identify 5 real competitors for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${currentApp.url ? ' URL: '+currentApp.url : ''}${ptCtx ? '\n'+ptCtx+'\nUse product test findings to sharpen the differentiation column.' : ''}

For each output exactly:
COMPETITOR: [name]
CATEGORY: [direct/indirect/emerging]
PRICING: [actual pricing]
STRENGTHS: [s1 | s2 | s3]
WEAKNESSES: [w1 | w2]
THREAT_LEVEL: [High/Medium/Low]
THREAT_SCORE: [1-10]
DIFFERENTIATION: [1 sentence how ${currentApp.name} wins]
---
After all 5:
MARKET_POSITIONING: [2 sentences]
WHITESPACE: [2 sentences]
WIN_CONDITION: [1 sentence]`

      const raw = await callClaude(prompt, 'You are a sharp startup analyst. Name real companies.', 2500)
      const parts = raw.split('---')
      const blocks = parts.slice(0, -1)
      const summary = parts[parts.length - 1] ?? ''
      const get = (b: string, k: string) => (b.match(new RegExp(k + ':\\s*([^\\n]+)')) ?? [])[1]?.trim() ?? ''
      const getML = (b: string, k: string) => get(b,k).split('|').map(s=>s.trim()).filter(Boolean)
      const comps = blocks.filter(b=>b.trim()).map(b => ({
        name: get(b,'COMPETITOR'), cat: get(b,'CATEGORY'), price: get(b,'PRICING'),
        strengths: getML(b,'STRENGTHS'), weaknesses: getML(b,'WEAKNESSES'),
        threat: get(b,'THREAT_LEVEL'), score: parseInt(get(b,'THREAT_SCORE')) || 5,
        diff: get(b,'DIFFERENTIATION')
      })).filter(c=>c.name)
      const mktPos  = get(summary,'MARKET_POSITIONING')
      const wspace  = get(summary,'WHITESPACE')
      const winCond = get(summary,'WIN_CONDITION')
      const tC  = { High:'var(--red)', Medium:'var(--amber)', Low:'var(--green)' } as Record<string,string>
      const tBg = { High:'rgba(229,85,85,.12)', Medium:'rgba(245,166,35,.12)', Low:'rgba(52,201,138,.12)' } as Record<string,string>

      setTabCache('competitive', JSON.stringify({ comps, mktPos, wspace, winCond, tC, tBg }))
      toast('Competitive analysis ready!')
    } catch(e) { toast('Error: '+(e as Error).message) }
    setLoad('competitive', false)
  }

  // ── BMC ──────────────────────────────────────────────────────────────────────
  async function genBMC() {
    setLoad('bmc', true)
    const ptCtx = getTestContext(currentApp)
    try {
      const prompt = `Build a complete Business Model Canvas for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${ptCtx ? '\n'+ptCtx+'\nValue propositions must reflect REAL features from product testing.' : ''}
Output ONLY valid JSON:
{"key_partners":["3-4 real partner types"],"key_activities":["3-4 core activities"],"key_resources":["3-4 key assets"],"value_propositions":["3-4 specific value props"],"customer_relationships":["2-3 relationship modes"],"channels":["3-4 channels"],"customer_segments":["2-3 specific segments"],"cost_structure":["3-4 major costs"],"revenue_streams":["2-3 revenue streams"],"unfair_advantage":"1 sentence"}`

      const raw = await callClaude(prompt, 'Output ONLY valid JSON. No markdown.', 2500)
      setTabCache('bmc', raw.replace(/```json|```/g,'').trim())
      toast('Business Model Canvas ready!')
    } catch(e) { toast('Error: '+(e as Error).message) }
    setLoad('bmc', false)
  }

  // ── SWOT ─────────────────────────────────────────────────────────────────────
  async function genSWOT() {
    setLoad('swot', true)
    const ptCtx = getTestContext(currentApp)
    try {
      const prompt = `Detailed SWOT for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${ptCtx ? '\n'+ptCtx+'\nStrengths and Weaknesses MUST come from product test findings. Name specific features.' : ' No generic filler.'}
Output ONLY valid JSON:
{"strengths":["4 specific strengths"],"weaknesses":["4 honest weaknesses"],"opportunities":["4 real opportunities"],"threats":["4 real threats"],"strategic_priorities":["3 actions to focus on RIGHT NOW"]}`

      const raw = await callClaude(prompt, 'Output ONLY valid JSON.', 2000)
      setTabCache('swot', raw.replace(/```json|```/g,'').trim())
      toast('SWOT ready!')
    } catch(e) { toast('Error: '+(e as Error).message) }
    setLoad('swot', false)
  }

  // ── GROWTH ───────────────────────────────────────────────────────────────────
  async function genGrowth() {
    setLoad('growth', true)
    const ptCtx = getTestContext(currentApp)
    try {
      const prompt = `AARRR growth strategy for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${ptCtx ? '\n'+ptCtx+'\nReference specific real features by name in Activation/Retention.' : ''}

2 tactics per lane. Each description is ONE sentence max (under 20 words).
Output ONLY valid JSON — no markdown, no trailing commas:
{"top_priority":"single most impactful 30-day action","acquisition":[{"title":"t","description":"1 sentence","impact":"High","effort":"Low","timeframe":"Week 1-2"},{"title":"t","description":"1 sentence","impact":"Medium","effort":"Medium","timeframe":"Week 2-4"}],"activation":[{"title":"t","description":"1 sentence","impact":"High","effort":"Low","timeframe":"Week 1"},{"title":"t","description":"1 sentence","impact":"High","effort":"Medium","timeframe":"Week 2-3"}],"retention":[{"title":"t","description":"1 sentence","impact":"High","effort":"Low","timeframe":"Ongoing"},{"title":"t","description":"1 sentence","impact":"Medium","effort":"Medium","timeframe":"Month 2"}],"revenue":[{"title":"t","description":"1 sentence","impact":"High","effort":"Medium","timeframe":"Month 1"},{"title":"t","description":"1 sentence","impact":"Medium","effort":"Low","timeframe":"Month 2"}],"referral":[{"title":"t","description":"1 sentence","impact":"Medium","effort":"Low","timeframe":"Month 2"},{"title":"t","description":"1 sentence","impact":"High","effort":"Medium","timeframe":"Month 3"}]}`

      const raw = await callClaude(prompt, 'Output ONLY valid JSON. Each description ONE sentence under 20 words. No trailing commas.', 3000)
      setTabCache('growth', raw.replace(/```json|```/g,'').trim())
      toast('Growth playbook ready!')
    } catch(e) { toast('Error: '+(e as Error).message) }
    setLoad('growth', false)
  }

  // ── PRICING ──────────────────────────────────────────────────────────────────
  async function genPricing() {
    setLoad('pricing', true)
    const ptCtx = getTestContext(currentApp)
    try {
      const prompt = `Complete pricing strategy for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${ptCtx ? '\n'+ptCtx+'\nPricing must reflect real product quality from testing.' : ''}
Output ONLY valid JSON:
{"strategy_type":"Freemium/Usage-based/Flat-rate/Tiered","strategy_rationale":"2 sentence explanation","tiers":[{"name":"tier","price":"$X/mo","target":"5 words","features":["3-4 features"],"recommended":true,"conversion_note":"1 sentence"},{"name":"tier","price":"$X/mo","target":"5 words","features":["3-4 features"],"recommended":false,"conversion_note":"1 sentence"},{"name":"tier","price":"$X/mo","target":"5 words","features":["3-4 features"],"recommended":false,"conversion_note":"1 sentence"}],"monetization_angles":[{"angle":"name","description":"1 sentence","revenue_potential":"High"},{"angle":"name","description":"1 sentence","revenue_potential":"Medium"},{"angle":"name","description":"1 sentence","revenue_potential":"Medium"},{"angle":"name","description":"1 sentence","revenue_potential":"Low"}],"pricing_risks":["risk 1","risk 2","risk 3"],"benchmark_note":"1 sentence"}`

      const raw = await callClaude(prompt, 'Output ONLY valid JSON.', 2000)
      setTabCache('pricing', raw.replace(/```json|```/g,'').trim())
      toast('Pricing plan ready!')
    } catch(e) { toast('Error: '+(e as Error).message) }
    setLoad('pricing', false)
  }

  // ── RUN ALL ──────────────────────────────────────────────────────────────────
  async function runFullAnalysis() {
    setRunningFull(true)
    const fns = [
      { key:'competitive', fn:genCompetitive },
      { key:'bmc',         fn:genBMC         },
      { key:'swot',        fn:genSWOT        },
      { key:'growth',      fn:genGrowth      },
      { key:'pricing',     fn:genPricing     },
    ]
    for (const { key, fn } of fns) {
      setFStep(key, 'active')
      await fn()
      setFStep(key, 'done')
    }
    setRunningFull(false)
    toast('Full analysis complete! 🎉', 4000)
    setActiveTab('competitive')
  }

  const stepLabels: Record<string,string> = {
    competitive:'🔍 Competitive landscape',
    bmc:        '🗂 Business Model Canvas',
    swot:       '⚡ SWOT analysis',
    growth:     '🚀 Growth strategies',
    pricing:    '💰 Pricing recommendations',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontFamily:'Syne,sans-serif', fontSize:15, fontWeight:700, marginBottom:4 }}>
          Insights & Analysis — {currentApp.name}
        </div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16 }}>
          {currentApp.category} · {currentApp.stage} · {currentApp.platform}
          {currentApp.url && <> · <a href={currentApp.url} target="_blank" style={{ color:'var(--accent2)', textDecoration:'none' }}>{currentApp.url}</a></>}
        </div>

        <button
          onClick={runFullAnalysis}
          disabled={runningFull}
          style={{ width:'100%', padding:14, background:'linear-gradient(135deg,rgba(124,111,247,.15),rgba(226,111,175,.1))', border:'1px solid rgba(124,111,247,.3)', borderRadius:'var(--r2)', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, color:'var(--accent2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, transition:'all .2s' }}
        >
          {runningFull
            ? <><span className="spinner" style={{ color:'var(--accent2)' }} /> Running full analysis…</>
            : <><i className="ti ti-telescope" style={{ fontSize:16 }} /> ✦ Run Deep AI Analysis — Competitive · BMC · SWOT · Growth · Pricing</>
          }
        </button>

        {/* Progress when running */}
        {runningFull && (
          <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:3 }}>
            {Object.entries(stepLabels).map(([k, label]) => {
              const s = fullSteps[k] ?? 'pending'
              return (
                <div key={k} className={`ap-step ${s}`}>
                  <span style={{ fontSize:14, width:18, textAlign:'center' }}>
                    {s==='done' ? '✓' : s==='active' ? '●' : '○'}
                  </span>
                  {label}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:22, paddingBottom:14, borderBottom:'1px solid var(--border)' }}>
        {TABS.map(tab => {
          const hasData = tab.id === 'product' ? !!(pt) : !!(cache[tab.id])
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding:'6px 14px', borderRadius:7, fontSize:12, fontWeight:600,
                fontFamily:'DM Sans,sans-serif', cursor:'pointer', transition:'all .15s',
                background: activeTab===tab.id ? 'rgba(124,111,247,.12)' : 'transparent',
                border: `1px solid ${activeTab===tab.id ? 'var(--accent)' : 'var(--border)'}`,
                color: activeTab===tab.id ? 'var(--accent2)' : hasData ? 'var(--text2)' : 'var(--text3)',
              }}
            >
              {tab.emoji} {tab.label}{hasData ? ' ✓' : ''}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'competitive' && (
        <CompetitiveTab data={cache.competitive} loading={loading.competitive} onGenerate={genCompetitive} appName={currentApp.name} />
      )}
      {activeTab === 'bmc' && (
        <BMCTab data={cache.bmc} loading={loading.bmc} onGenerate={genBMC} appName={currentApp.name} />
      )}
      {activeTab === 'swot' && (
        <SWOTTab data={cache.swot} loading={loading.swot} onGenerate={genSWOT} />
      )}
      {activeTab === 'growth' && (
        <GrowthTab data={cache.growth} loading={loading.growth} onGenerate={genGrowth} />
      )}
      {activeTab === 'pricing' && (
        <PricingTab data={cache.pricing} loading={loading.pricing} onGenerate={genPricing} />
      )}
      {activeTab === 'product' && (
        <ProductTest />
      )}
    </div>
  )
}

// ── COMPETITIVE TAB ──────────────────────────────────────────────────────────
function CompetitiveTab({ data, loading, onGenerate, appName }: { data?:string; loading?:boolean; onGenerate:()=>void; appName:string }) {
  if (loading) return <LoadingCard text="Researching competitors…" />
  if (!data) return <EmptyTab emoji="🔍" title="Competitive Analysis" desc="Identify your top 5 competitors, compare features, pricing, and positioning." onGenerate={onGenerate} btnLabel="Run Competitive Analysis" />
  try {
    const { comps, mktPos, wspace, winCond, tC, tBg } = JSON.parse(data)
    return (
      <>
        <Banner icon="🔭">
          <strong style={{ color:'var(--accent2)' }}>Market Position:</strong> {mktPos}<br/><br/>
          <strong style={{ color:'var(--green)' }}>Whitespace:</strong> {wspace}<br/><br/>
          <strong style={{ color:'var(--amber)' }}>Win Condition:</strong> {winCond}
        </Banner>
        <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:12 }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700 }}>Competitor Matrix</div>
            <button className="vbtn" onClick={onGenerate}>🔄 Refresh</button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>{['Competitor','Type','Pricing','Threat','Strengths','Weaknesses',`How ${appName} Wins`].map(h => (
                  <th key={h} style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--text3)', padding:'8px 10px', textAlign:'left', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {comps.map((c: any, i: number) => (
                  <tr key={i}>
                    <td style={{ padding:'9px 10px', borderBottom:'1px solid var(--border)', fontWeight:600 }}>{c.name}</td>
                    <td style={{ padding:'9px 10px', borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--text3)' }}>{c.cat}</td>
                    <td style={{ padding:'9px 10px', borderBottom:'1px solid var(--border)', color:'var(--green)', fontWeight:600 }}>{c.price}</td>
                    <td style={{ padding:'9px 10px', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:tBg[c.threat]??tBg.Medium, color:tC[c.threat]??tC.Medium }}>{c.threat}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                        <div style={{ flex:1, height:4, background:'var(--surface3)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${c.score*10}%`, background:tC[c.threat]??tC.Medium, borderRadius:2 }} />
                        </div>
                        <span style={{ fontSize:10, color:'var(--text3)' }}>{c.score}/10</span>
                      </div>
                    </td>
                    <td style={{ padding:'9px 10px', borderBottom:'1px solid var(--border)' }}>{c.strengths.map((s:string,j:number) => <div key={j} style={{ fontSize:11, color:'var(--text2)', marginBottom:2 }}>• {s}</div>)}</td>
                    <td style={{ padding:'9px 10px', borderBottom:'1px solid var(--border)' }}>{c.weaknesses.map((s:string,j:number) => <div key={j} style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>• {s}</div>)}</td>
                    <td style={{ padding:'9px 10px', borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--accent2)', lineHeight:1.55 }}>{c.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  } catch { return <ErrorCard message="Failed to render — try regenerating" onRetry={onGenerate} /> }
}

// ── BMC TAB ──────────────────────────────────────────────────────────────────
function BMCTab({ data, loading, onGenerate, appName }: { data?:string; loading?:boolean; onGenerate:()=>void; appName:string }) {
  if (loading) return <LoadingCard text="Building Business Model Canvas…" />
  if (!data) return <EmptyTab emoji="🗂" title="Business Model Canvas" desc="AI-generated BMC across all 9 blocks — value props, channels, revenue, costs, and more." onGenerate={onGenerate} btnLabel="Build Canvas" />
  try {
    const d = JSON.parse(data)
    const blocks = [
      { key:'key_partners',        label:'Key Partners',        emoji:'🤝', color:'#60a5fa' },
      { key:'key_activities',      label:'Key Activities',      emoji:'⚙️', color:'#a78bfa' },
      { key:'key_resources',       label:'Key Resources',       emoji:'🏗',  color:'#f5a623' },
      { key:'value_propositions',  label:'Value Propositions',  emoji:'💎', color:'#7c6ff7', highlight:true },
      { key:'customer_relationships',label:'Customer Relations',emoji:'💬', color:'#34d399' },
      { key:'channels',            label:'Channels',            emoji:'📡', color:'#4f9cf7' },
      { key:'customer_segments',   label:'Customer Segments',   emoji:'👥', color:'#e26faf' },
      { key:'cost_structure',      label:'Cost Structure',      emoji:'📉', color:'#e55555' },
      { key:'revenue_streams',     label:'Revenue Streams',     emoji:'💰', color:'#34c98a' },
    ]
    const BMCBlock = ({ b }: { b: typeof blocks[0] }) => (
      <div style={{ background:'var(--surface2)', borderRadius:8, padding:'13px 14px', border:`1px solid ${b.highlight ? 'var(--accent)' : 'var(--border)'}`, height:'100%' }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:b.color, marginBottom:8 }}>
          {b.emoji} {b.label}
        </div>
        {(d[b.key]??[]).map((item: string, i: number) => (
          <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:5 }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:b.color, flexShrink:0, marginTop:6 }} />
            <span style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6 }}>{item}</span>
          </div>
        ))}
      </div>
    )
    return (
      <>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, marginBottom:4 }}>Business Model Canvas — {appName}</div>
          {d.unfair_advantage && (
            <Banner icon="🏆"><strong style={{ color:'var(--accent2)' }}>Unfair Advantage:</strong> {d.unfair_advantage}</Banner>
          )}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1fr', gap:3, marginBottom:3 }}>
          <BMCBlock b={blocks[0]} />
          <div style={{ display:'grid', gridTemplateRows:'1fr 1fr', gap:3 }}>
            <BMCBlock b={blocks[1]} />
            <BMCBlock b={blocks[2]} />
          </div>
          <BMCBlock b={blocks[3]} />
          <div style={{ display:'grid', gridTemplateRows:'1fr 1fr', gap:3 }}>
            <BMCBlock b={blocks[4]} />
            <BMCBlock b={blocks[5]} />
          </div>
          <BMCBlock b={blocks[6]} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3, marginBottom:10 }}>
          <BMCBlock b={blocks[7]} />
          <BMCBlock b={blocks[8]} />
        </div>
        <div style={{ textAlign:'right' }}><button className="vbtn" onClick={onGenerate}>🔄 Regenerate</button></div>
      </>
    )
  } catch { return <ErrorCard message="Failed to render" onRetry={onGenerate} /> }
}

// ── SWOT TAB ─────────────────────────────────────────────────────────────────
function SWOTTab({ data, loading, onGenerate }: { data?:string; loading?:boolean; onGenerate:()=>void }) {
  if (loading) return <LoadingCard text="Running SWOT analysis…" />
  if (!data) return <EmptyTab emoji="⚡" title="SWOT Analysis" desc="Strengths, Weaknesses, Opportunities, Threats — grounded in your market and stage." onGenerate={onGenerate} btnLabel="Run SWOT" />
  try {
    const d = JSON.parse(data)
    const quads = [
      { key:'strengths',     label:'Strengths',     emoji:'💪', bg:'rgba(52,201,138,.06)',  border:'rgba(52,201,138,.25)',  color:'var(--green)', dot:'#34c98a' },
      { key:'weaknesses',    label:'Weaknesses',    emoji:'⚠️', bg:'rgba(229,85,85,.06)',   border:'rgba(229,85,85,.25)',   color:'var(--red)',   dot:'#e55555' },
      { key:'opportunities', label:'Opportunities', emoji:'🌟', bg:'rgba(79,156,247,.06)',  border:'rgba(79,156,247,.25)',  color:'var(--blue)',  dot:'#4f9cf7' },
      { key:'threats',       label:'Threats',       emoji:'🔥', bg:'rgba(245,166,35,.06)',  border:'rgba(245,166,35,.25)',  color:'var(--amber)', dot:'#f5a623' },
    ]
    return (
      <>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3, marginBottom:16 }}>
          {quads.map(q => (
            <div key={q.key} style={{ borderRadius:8, padding:14, border:`1px solid ${q.border}`, background:q.bg }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:q.color, marginBottom:10 }}>{q.emoji} {q.label}</div>
              {(d[q.key]??[]).map((item:string, i:number) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ width:5, height:5, borderRadius:'50%', background:q.dot, flexShrink:0, marginTop:7 }} />
                  <span style={{ fontSize:12, lineHeight:1.55 }}>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {d.strategic_priorities?.length > 0 && (
          <Card>
            <CardHeader title="🎯 Strategic Priorities Right Now" action={<button className="vbtn" onClick={onGenerate}>🔄 Refresh</button>} />
            {d.strategic_priorities.map((p:string, i:number) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(124,111,247,.15)', color:'var(--accent2)', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i+1}</div>
                <div style={{ fontSize:13, lineHeight:1.6 }}>{p}</div>
              </div>
            ))}
          </Card>
        )}
      </>
    )
  } catch { return <ErrorCard message="Failed to render" onRetry={onGenerate} /> }
}

// ── GROWTH TAB ───────────────────────────────────────────────────────────────
function GrowthTab({ data, loading, onGenerate }: { data?:string; loading?:boolean; onGenerate:()=>void }) {
  if (loading) return <LoadingCard text="Generating growth playbook…" />
  if (!data) return <EmptyTab emoji="🚀" title="Growth Strategies" desc="Tactical, prioritised AARRR playbook — acquisition, activation, retention, revenue, referral." onGenerate={onGenerate} btnLabel="Generate Growth Plan" />
  try {
    const d = JSON.parse(data)
    const lanes = [
      { key:'acquisition', label:'Acquisition', emoji:'📣', color:'var(--blue)',    desc:'Get new users' },
      { key:'activation',  label:'Activation',  emoji:'⚡', color:'var(--accent2)', desc:'Turn signups into active users' },
      { key:'retention',   label:'Retention',   emoji:'🔁', color:'var(--green)',   desc:'Keep users coming back' },
      { key:'revenue',     label:'Revenue',     emoji:'💰', color:'var(--amber)',   desc:'Convert to paying customers' },
      { key:'referral',    label:'Referral',    emoji:'🤝', color:'var(--pink)',    desc:'Users bring users' },
    ]
    const iBg = { High:'rgba(52,201,138,.12)', Medium:'rgba(245,166,35,.12)', Low:'rgba(90,90,114,.15)' } as Record<string,string>
    const iC  = { High:'var(--green)', Medium:'var(--amber)', Low:'var(--text3)' } as Record<string,string>
    return (
      <>
        {d.top_priority && (
          <Banner icon="🎯"><strong style={{ color:'var(--accent2)' }}>Top Priority — Next 30 Days:</strong><br/>{d.top_priority}</Banner>
        )}
        {lanes.map(lane => (
          <div key={lane.key} style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:700, color:lane.color, marginBottom:10, display:'flex', alignItems:'center', gap:8, paddingBottom:6, borderBottom:'1px solid var(--border)' }}>
              {lane.emoji} {lane.label} <span style={{ fontSize:11, color:'var(--text3)', fontWeight:400 }}>— {lane.desc}</span>
            </div>
            {(d[lane.key]??[]).map((s:any, i:number) => (
              <div key={i} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'12px 14px', marginBottom:8 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{s.title}</div>
                  <div style={{ display:'flex', gap:5 }}>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:iBg[s.impact]??iBg.Medium, color:iC[s.impact]??iC.Medium }}>Impact: {s.impact}</span>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:'var(--surface3)', color:'var(--text3)' }}>Effort: {s.effort}</span>
                  </div>
                </div>
                <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6 }}>{s.description}</div>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:5 }}>⏱ {s.timeframe}</div>
              </div>
            ))}
          </div>
        ))}
        <div style={{ textAlign:'right' }}><button className="vbtn" onClick={onGenerate}>🔄 Regenerate</button></div>
      </>
    )
  } catch { return <ErrorCard message="Failed to render" onRetry={onGenerate} /> }
}

// ── PRICING TAB ──────────────────────────────────────────────────────────────
function PricingTab({ data, loading, onGenerate }: { data?:string; loading?:boolean; onGenerate:()=>void }) {
  if (loading) return <LoadingCard text="Calculating pricing strategy…" />
  if (!data) return <EmptyTab emoji="💰" title="Pricing Recommendations" desc="Tier structure, price points, monetisation angles, and market positioning." onGenerate={onGenerate} btnLabel="Generate Pricing Plan" />
  try {
    const d = JSON.parse(data)
    const rBg = { High:'rgba(52,201,138,.12)', Medium:'rgba(245,166,35,.12)', Low:'rgba(90,90,114,.15)' } as Record<string,string>
    const rC  = { High:'var(--green)', Medium:'var(--amber)', Low:'var(--text3)' } as Record<string,string>
    return (
      <>
        <Banner icon="💡">
          <strong style={{ color:'var(--accent2)' }}>Strategy: {d.strategy_type}</strong><br/>
          {d.strategy_rationale}<br/>
          <span style={{ color:'var(--text3)', fontSize:11 }}>{d.benchmark_note}</span>
        </Banner>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, marginBottom:14 }}>Recommended Tiers</div>
          {(d.tiers??[]).map((t:any, i:number) => (
            <div key={i} style={{ padding:'12px 14px', borderRadius:'var(--r)', border:`1px solid ${t.recommended ? 'var(--green)' : 'var(--border)'}`, background:t.recommended ? 'rgba(52,201,138,.04)' : 'var(--surface2)', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700 }}>{t.name}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{t.target}</div>
                </div>
                {t.recommended && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(52,201,138,.12)', color:'var(--green)', fontWeight:700 }}>⭐ Recommended</span>}
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:700, color:'var(--green)', marginLeft:'auto' }}>{t.price}</div>
              </div>
              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.7 }}>
                {(t.features??[]).map((f:string,j:number) => <div key={j} style={{ display:'flex', gap:6, marginBottom:3 }}><span style={{ color:'var(--green)' }}>✓</span>{f}</div>)}
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>💡 {t.conversion_note}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontSize:13, fontWeight:700, marginBottom:14 }}>Monetisation Angles</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {(d.monetization_angles??[]).map((m:any,i:number) => (
              <div key={i} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{m.angle}</div>
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:700, background:rBg[m.revenue_potential]??rBg.Medium, color:rC[m.revenue_potential]??rC.Medium }}>{m.revenue_potential}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--text2)' }}>{m.description}</div>
              </div>
            ))}
          </div>
        </div>
        {d.pricing_risks?.length > 0 && (
          <div style={{ border:'1px solid rgba(245,166,35,.2)', borderRadius:'var(--r2)', padding:16, background:'rgba(245,166,35,.03)' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--amber)', marginBottom:10 }}>⚠️ Pricing Risks</div>
            {d.pricing_risks.map((r:string,i:number) => (
              <div key={i} style={{ display:'flex', gap:8, padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--text2)' }}>
                <span style={{ color:'var(--amber)' }}>⚠</span>{r}
              </div>
            ))}
          </div>
        )}
        <div style={{ textAlign:'right', marginTop:10 }}><button className="vbtn" onClick={onGenerate}>🔄 Regenerate</button></div>
      </>
    )
  } catch { return <ErrorCard message="Failed to render" onRetry={onGenerate} /> }
}

// ── EMPTY STATE ───────────────────────────────────────────────────────────────
function EmptyTab({ emoji, title, desc, onGenerate, btnLabel }: { emoji:string; title:string; desc:string; onGenerate:()=>void; btnLabel:string }) {
  return (
    <div className="card" style={{ padding:32, textAlign:'center' }}>
      <div style={{ fontSize:40, marginBottom:14 }}>{emoji}</div>
      <div style={{ fontFamily:'Syne,sans-serif', fontSize:16, fontWeight:700, marginBottom:8 }}>{title}</div>
      <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20, maxWidth:380, margin:'0 auto 20px', lineHeight:1.7 }}>{desc}</div>
      <button className="gen-btn" style={{ margin:'0 auto' }} onClick={onGenerate}>
        <i className="ti ti-sparkles" style={{ fontSize:13 }} /> {btnLabel}
      </button>
    </div>
  )
}
