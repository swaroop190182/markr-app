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
      const prompt = `You are a sharp strategic advisor. Create an intelligent, actionable SWOT for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${ptCtx ? '\n'+ptCtx+'\nStrengths and Weaknesses MUST reference specific features from product test.' : ''}

For EVERY point include:
- A rating (High/Medium/Low impact)
- A specific action (what to DO about this point — not generic, specific to this app)
- An owner hint (who should action this: founder/marketing/product/dev)

Output ONLY valid JSON, no markdown:
{
  "overall_score": 72,
  "verdict": "1 sentence strategic summary — what is the single most important thing this company should focus on?",
  "strengths": [
    { "point": "specific strength", "rating": "High", "evidence": "why this is true — 1 sentence", "action": "how to LEVERAGE this strength — specific tactic", "owner": "marketing" },
    { "point": "specific strength", "rating": "Medium", "evidence": "why this is true", "action": "specific leverage tactic", "owner": "founder" },
    { "point": "specific strength", "rating": "High", "evidence": "why this is true", "action": "specific leverage tactic", "owner": "product" },
    { "point": "specific strength", "rating": "Low", "evidence": "why this is true", "action": "specific leverage tactic", "owner": "marketing" }
  ],
  "weaknesses": [
    { "point": "specific weakness", "rating": "High", "evidence": "why this hurts — 1 sentence", "action": "how to FIX or MITIGATE — specific step", "owner": "product", "timeframe": "Week 1-2" },
    { "point": "specific weakness", "rating": "Medium", "evidence": "why this hurts", "action": "specific fix", "owner": "dev", "timeframe": "Month 1" },
    { "point": "specific weakness", "rating": "High", "evidence": "why this hurts", "action": "specific fix", "owner": "founder", "timeframe": "Week 1" },
    { "point": "specific weakness", "rating": "Low", "evidence": "why this hurts", "action": "specific fix", "owner": "marketing", "timeframe": "Month 2" }
  ],
  "opportunities": [
    { "point": "specific opportunity", "rating": "High", "evidence": "why this is real — 1 sentence", "action": "how to CAPTURE this — specific next step", "owner": "founder", "timeframe": "Month 1" },
    { "point": "specific opportunity", "rating": "High", "evidence": "why this is real", "action": "specific capture step", "owner": "marketing", "timeframe": "Month 2" },
    { "point": "specific opportunity", "rating": "Medium", "evidence": "why this is real", "action": "specific capture step", "owner": "product", "timeframe": "Quarter 2" },
    { "point": "specific opportunity", "rating": "Medium", "evidence": "why this is real", "action": "specific capture step", "owner": "founder", "timeframe": "Quarter 2" }
  ],
  "threats": [
    { "point": "specific threat", "rating": "High", "evidence": "why this is dangerous — 1 sentence", "action": "how to DEFEND or NEUTRALISE — specific step", "owner": "founder", "timeframe": "Immediate" },
    { "point": "specific threat", "rating": "Medium", "evidence": "why this is dangerous", "action": "specific defence", "owner": "product", "timeframe": "Month 1" },
    { "point": "specific threat", "rating": "High", "evidence": "why this is dangerous", "action": "specific defence", "owner": "marketing", "timeframe": "Month 1" },
    { "point": "specific threat", "rating": "Low", "evidence": "why this is dangerous", "action": "specific defence", "owner": "founder", "timeframe": "Quarter 2" }
  ],
  "top_actions": [
    { "priority": 1, "action": "Single most important thing to do NOW — specific, not generic", "category": "weakness/threat/opportunity", "impact": "High", "timeframe": "This week" },
    { "priority": 2, "action": "Second most important action", "category": "weakness/opportunity", "impact": "High", "timeframe": "Month 1" },
    { "priority": 3, "action": "Third most important action", "category": "opportunity/strength", "impact": "Medium", "timeframe": "Month 2" }
  ]
}`

      const raw = await callClaude(prompt, 'Output ONLY valid JSON. Be specific and honest — no generic consulting filler.', 3000)
      setTabCache('swot', raw.replace(/```json|```/g,'').trim())
      toast('SWOT analysis ready!')
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
  if (loading) return <LoadingCard text="Running strategic SWOT analysis…" />
  if (!data) return (
    <EmptyTab emoji="⚡" title="Strategic SWOT Analysis" desc="Strengths, Weaknesses, Opportunities, Threats — each rated High/Medium/Low with specific action points and owners." onGenerate={onGenerate} btnLabel="Run SWOT Analysis" />
  )
  try {
    const d = JSON.parse(data)
    const ratingColor  = { High:'var(--green)', Medium:'var(--amber)', Low:'var(--text3)' } as Record<string,string>
    const ratingBg     = { High:'rgba(52,201,138,.1)', Medium:'rgba(245,166,35,.1)', Low:'rgba(90,90,114,.1)' } as Record<string,string>
    const ownerColor   = { founder:'#a78bfa', marketing:'#60a5fa', product:'#34c98a', dev:'#f5a623' } as Record<string,string>
    const quads = [
      { key:'strengths',    label:'Strengths',    emoji:'💪', color:'var(--green)',  bg:'rgba(52,201,138,.05)',  border:'rgba(52,201,138,.2)',  actionLabel:'Leverage' },
      { key:'weaknesses',   label:'Weaknesses',   emoji:'⚠️', color:'var(--red)',    bg:'rgba(229,85,85,.05)',   border:'rgba(229,85,85,.2)',   actionLabel:'Fix' },
      { key:'opportunities',label:'Opportunities',emoji:'🌟', color:'var(--blue)',   bg:'rgba(79,156,247,.05)',  border:'rgba(79,156,247,.2)',  actionLabel:'Capture' },
      { key:'threats',      label:'Threats',      emoji:'🔥', color:'var(--amber)',  bg:'rgba(245,166,35,.05)',  border:'rgba(245,166,35,.2)',  actionLabel:'Defend' },
    ]

    return (
      <>
        {/* Overall score + verdict */}
        {d.verdict && (
          <div style={{ background:'rgba(124,111,247,.06)', border:'1px solid rgba(124,111,247,.2)', borderRadius:'var(--r2)', padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:14 }}>
            {d.overall_score && (
              <div style={{ textAlign:'center', flexShrink:0 }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:32, fontWeight:800, color:'var(--accent2)', lineHeight:1 }}>{d.overall_score}</div>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>Strategic Score</div>
              </div>
            )}
            <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, fontStyle:'italic' }}>"{d.verdict}"</div>
          </div>
        )}

        {/* Top 3 actions */}
        {(d.top_actions ?? []).length > 0 && (
          <div style={{ background:'var(--surface)', border:'1px solid rgba(124,111,247,.25)', borderRadius:'var(--r2)', padding:16, marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--accent2)', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
              🎯 Top Priority Actions <span style={{ fontSize:11, color:'var(--text3)', fontWeight:400 }}>— do these first</span>
            </div>
            {d.top_actions.map((a: any, i: number) => (
              <div key={i} style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)', alignItems:'flex-start' }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:`rgba(124,111,247,${0.3 - i*0.08})`, color:'var(--accent2)', fontSize:12, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{a.priority}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>{a.action}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:ratingBg[a.impact]??ratingBg.Medium, color:ratingColor[a.impact]??ratingColor.Medium, fontWeight:600 }}>{a.impact} impact</span>
                    <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(255,255,255,.05)', color:'var(--text3)' }}>⏱ {a.timeframe}</span>
                    {a.category && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(255,255,255,.05)', color:'var(--text3)' }}>{a.category}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SWOT quadrants */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          {quads.map(q => (
            <div key={q.key} style={{ borderRadius:'var(--r2)', border:`1px solid ${q.border}`, background:q.bg, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase' as const, color:q.color, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                <span>{q.emoji}</span>{q.label}
              </div>
              {(d[q.key] ?? []).map((item: any, i: number) => (
                <div key={i} style={{ background:'rgba(255,255,255,.025)', borderRadius:'var(--r)', padding:'10px 12px', marginBottom:8, border:'1px solid rgba(255,255,255,.05)' }}>
                  {/* Point + rating */}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:6 }}>
                    <div style={{ fontSize:13, fontWeight:600, lineHeight:1.4, flex:1 }}>{item.point}</div>
                    <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:700, background:ratingBg[item.rating]??ratingBg.Medium, color:ratingColor[item.rating]??ratingColor.Medium, flexShrink:0, whiteSpace:'nowrap' as const }}>{item.rating}</span>
                  </div>
                  {/* Evidence */}
                  {item.evidence && (
                    <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5, marginBottom:8, fontStyle:'italic' }}>{item.evidence}</div>
                  )}
                  {/* Action */}
                  <div style={{ display:'flex', gap:6, alignItems:'flex-start', padding:'7px 9px', background:'rgba(255,255,255,.04)', borderRadius:6, borderLeft:`2px solid ${q.color}` }}>
                    <span style={{ fontSize:10, fontWeight:700, color:q.color, flexShrink:0, marginTop:1 }}>→ {q.actionLabel}:</span>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,.75)', lineHeight:1.5 }}>{item.action}</span>
                  </div>
                  {/* Owner + timeframe */}
                  <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' as const }}>
                    {item.owner && (
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(255,255,255,.06)', color:ownerColor[item.owner]??'var(--text3)', fontWeight:600 }}>
                        👤 {item.owner}
                      </span>
                    )}
                    {item.timeframe && (
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'rgba(255,255,255,.04)', color:'var(--text3)' }}>
                        ⏱ {item.timeframe}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ textAlign:'right' }}><button className="vbtn" onClick={onGenerate}>🔄 Regenerate</button></div>
      </>
    )
  } catch { return <ErrorCard message="Failed to render — try regenerating" onRetry={onGenerate} /> }
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
