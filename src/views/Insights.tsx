import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader, Banner, LoadingCard, ErrorCard, CopyButton } from '../components/ui'
import { callClaude, getTestContext, safeParseJSON } from '../lib/claude'

const ADMIN_EMAILS = ['swaroop.raghu@gmail.com']
const MONTHLY_LIMIT_DAYS = 30

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

function daysSince(ts: string | null | undefined): number | null {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24))
}

function canRefresh(ts: string | null | undefined, email: string): boolean {
  if (isAdmin(email)) return true
  const days = daysSince(ts)
  return days === null || days >= MONTHLY_LIMIT_DAYS
}

function lastUpdatedLabel(ts: string | null | undefined): string {
  const days = daysSince(ts)
  if (days === null) return ''
  if (days === 0) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  return `Updated ${days} days ago`
}
import { toast } from '../components/Toast'
import ProductTest from './insights/ProductTest'
import GoToMarketTab from './insights/GoToMarket'

type Tab = 'competitive' | 'bmc' | 'swot' | 'growth' | 'pricing' | 'product' | 'gtm'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id:'competitive', label:'Competitive',           emoji:'🔍' },
  { id:'bmc',         label:'Business Model Canvas', emoji:'🗂' },
  { id:'swot',        label:'SWOT',                  emoji:'⚡' },
  { id:'growth',      label:'Growth Strategies',     emoji:'🚀' },
  { id:'pricing',     label:'Pricing',               emoji:'💰' },
  { id:'gtm',         label:'Go-to-Market',          emoji:'📣' },
  { id:'product',     label:'AI Readiness Assessment', emoji:'🧪' },
]

export default function Insights({ onUpgrade }: { onUpgrade?: () => void }) {
  const { currentApp, updateApp, userEmail, plan } = useStore()
  const canUseAnalysis = plan === 'analysis' || plan === 'pro' || plan === 'guest_pro'
  const [activeTab, setActiveTab] = useState<Tab>('competitive')
  const [cache, setCache] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [runningFull, setRunningFull] = useState(false)
  const [fullSteps, setFullSteps] = useState<Record<string,string>>({})

  // Load persisted analysis from app on mount / app change
  useEffect(() => {
    const saved: Record<string,string> = {}
    if (currentApp.competitive_analysis) saved['competitive'] = currentApp.competitive_analysis
    if (currentApp.bmc_analysis)         saved['bmc']         = currentApp.bmc_analysis
    if (currentApp.swot_analysis)        saved['swot']        = currentApp.swot_analysis
    if (currentApp.growth_analysis)      saved['growth']      = currentApp.growth_analysis
    if (currentApp.pricing_analysis)     saved['pricing']     = currentApp.pricing_analysis
    if (currentApp.gtm_analysis)         saved['gtm']         = currentApp.gtm_analysis
    setCache(saved)
  }, [currentApp.id])

  const setLoad = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))
  const setFStep = (k: string, s: string) => setFullSteps(p => ({ ...p, [k]: s }))
  const setTabCache = (k: string, data: string) => {
    setCache(p => ({ ...p, [k]: data }))
    const fieldMap: Record<string, string> = {
      competitive: 'competitive_analysis',
      bmc:         'bmc_analysis',
      swot:        'swot_analysis',
      growth:      'growth_analysis',
      pricing:     'pricing_analysis',
      gtm:         'gtm_analysis',
    }
    const tsMap: Record<string, string> = {
      competitive: 'competitive_analyzed_at',
      bmc:         'bmc_analyzed_at',
      swot:        'swot_analyzed_at',
      growth:      'growth_analyzed_at',
      pricing:     'pricing_analyzed_at',
      gtm:         'gtm_analyzed_at',
    }
    const field = fieldMap[k]
    const tsField = tsMap[k]
    const now = new Date().toISOString()
        if (field) updateApp(currentApp.id, { [field]: data, ...(tsField ? { [tsField]: now } : {}) } as any)

    // After competitive analysis saves — run URL analysis on top competitor
    if (k === 'competitive') {
      try {
        const parsed = JSON.parse(data)
        const topComp = parsed.comps?.[0]
        if (topComp?.url && topComp.url.startsWith('http')) {
          // Run in background — non-blocking
          fetch('/api/analyze-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-call': 'markr_internal' },
            body: JSON.stringify({ url: topComp.url })
          }).then(r => r.ok ? r.json() : null).then(compAnalysis => {
            if (compAnalysis && !compAnalysis.error) {
              updateApp(currentApp.id, {
                competitor_url_analysis: {
                  name: topComp.name,
                  url: topComp.url,
                  overall: compAnalysis.overall,
                  headline: compAnalysis.headline,
                  dimensions: compAnalysis.dimensions,
                  bottleneck: compAnalysis.bottleneck,
                  analyzed_at: new Date().toISOString()
                }
              } as any)
            }
          }).catch(() => {})
        }
      } catch { /* non-blocking */ }
    }
  }
  const pt = currentApp.productTest

  // Build recent context string injected into all prompts
  function getRecentContext(): string {
    const rc = currentApp.recent_context
    if (!rc || !rc.trim()) return ''
    return `

━━━ RECENT REAL-WORLD DATA (use this to make analysis current and specific) ━━━
${rc.trim()}
━━━ This data is more recent than the landing page — weight it heavily ━━━`
  }

  // ── COMPETITIVE ─────────────────────────────────────────────────────────────
  async function genCompetitive() {
    // 7-day refresh for competitive (shorter window than other tabs)
    const daysOld = daysSince(currentApp.competitive_analyzed_at)
    if (!isAdmin(userEmail) && daysOld !== null && daysOld < 7) {
      toast(`Competitive analysis was last run ${lastUpdatedLabel(currentApp.competitive_analyzed_at).toLowerCase()}. Refreshes after 7 days.`)
      return
    }
    setLoad('competitive', true)
    const rcCtx = getRecentContext()
    try {
      const urlAnalysis = (currentApp as any).url_analysis
      const appContext = urlAnalysis
        ? `App: "${urlAnalysis.headline}" — ${currentApp.url}`
        : `App: "${currentApp.name}" — ${currentApp.desc || currentApp.category}`

      const prompt = `Find 5 real direct competitors for this app. Prioritise local/regional competitors first.

${appContext}${rcCtx}

PRIORITY: list 2-3 LOCAL competitors first (same country/region — detect from currency, domain, language), then 2-3 GLOBAL ones. Total must be exactly 5.

For each competitor draw on your training knowledge across ALL sources: Crunchbase, LinkedIn, G2, Capterra, Reddit, ProductHunt, TechCrunch, and app store data. Provide specific numbers where you know them (funding amounts, employee counts, review counts, upvotes).

RECENT NEWS RULE: For recentMoves, only include news announcements, launches, or updates from the last 6 months (i.e. from approximately January 2026 onwards). Search your knowledge for: [competitor name] news announcement launch update 2025 2026. Each item must include a clear specific date (e.g. "March 2026", "Q1 2026"). If you cannot find any news items from the last 6 months for a competitor, set recentMoves to [{"headline":"No recent news in the last 6 months","date":"","source":""}] — do NOT include older articles to fill the slots.

JSON only, no markdown:
{"comps":[{"name":"X","url":"https://example.com","type":"local","cat":"direct","price":"$X/mo","strengths":["s1","s2"],"weaknesses":["w1","w2"],"threat":"High","score":8,"diff":"how ${currentApp.name} wins in one line","reason":"why this is a competitor","reviews":{"rating":"4.3/5","ratingSource":"G2","ratingCount":"~450 reviews","praise":"top praise under 10 words","complaints":"top complaint under 10 words","traction":"downloads or user count signal"},"funding":"Seed · $1.2M · 2022","fundingSource":"Crunchbase","employees":"10-50","employeesSource":"LinkedIn","userLoves":["specific strength users praise 1","specific strength 2","specific strength 3"],"userHates":["specific complaint users raise 1","complaint 2","complaint 3"],"recentMoves":[{"headline":"specific event from last 6 months only","date":"March 2026","source":"TechCrunch"},{"headline":"another recent move — omit if none","date":"Q1 2026","source":"ProductHunt"}],"redditSentiment":"positive","redditQuote":"representative opinion from a real reddit discussion","phUpvotes":"~450","phYear":"2023","positioningGap":"one specific sentence on what they genuinely cannot do that ${currentApp.name} can"}],"mktPos":"2 sentence market position","wspace":"whitespace opportunity","winCond":"win condition"}`

      const raw = await callClaude(prompt, 'Output ONLY valid JSON. No markdown.', 4000, undefined, 'sonnet', 'competitive')
      const cleaned = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').replace(/^[^{]*/,'').replace(/}[^}]*$/,'}').trim()
      if (!cleaned) throw new Error('Empty response')
      const parsed = JSON.parse(cleaned)
      if (!parsed.comps || !Array.isArray(parsed.comps) || parsed.comps.length === 0) {
        throw new Error('No competitors — keys: ' + Object.keys(parsed).join(', '))
      }

      // Enrich each competitor with live App Store data via iTunes Search API (parallel)
      parsed.comps = await Promise.all(parsed.comps.map(async (comp: any) => {
        try {
          const res = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(comp.name)}&entity=software&limit=1`,
            { signal: AbortSignal.timeout(4000) }
          )
          if (!res.ok) return comp
          const data = await res.json()
          const hit  = data.results?.[0]
          if (!hit) return comp
          const monthsAgo = hit.currentVersionReleaseDate
            ? Math.max(0, Math.floor((Date.now() - new Date(hit.currentVersionReleaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30.5)))
            : null
          return {
            ...comp,
            appStore: {
              rating:       hit.averageUserRating != null ? Math.round(hit.averageUserRating * 10) / 10 : null,
              ratingCount:  hit.userRatingCount ?? null,
              price:        hit.price === 0 ? 'Free' : hit.price ? `$${hit.price}` : null,
              updatedMonths: monthsAgo,
            },
          }
        } catch {
          return comp
        }
      }))

      setTabCache('competitive', JSON.stringify(parsed))
      toast('Competitive intelligence ready!')
    } catch(e) { toast('Error: '+(e as Error).message) }
    setLoad('competitive', false)
  }

  // ── BMC ──────────────────────────────────────────────────────────────────────
  async function genBMC() {
    // Monthly limit check — skip for admin
    if (!canRefresh(currentApp.bmc_analyzed_at, userEmail)) {
      toast(`Analysis was last run ${lastUpdatedLabel(currentApp.bmc_analyzed_at).toLowerCase()}. Refreshes once per month to avoid redundant AI calls.`)
      return
    }
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
    // Monthly limit check — skip for admin
    if (!canRefresh(currentApp.swot_analyzed_at, userEmail)) {
      toast(`Analysis was last run ${lastUpdatedLabel(currentApp.swot_analyzed_at).toLowerCase()}. Refreshes once per month to avoid redundant AI calls.`)
      return
    }
    setLoad('swot', true)
    const ptCtx = getTestContext(currentApp)
    const rcCtx = getRecentContext()
    try {
      const prompt = `You are a sharp strategic advisor. Create an intelligent, actionable SWOT for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${ptCtx ? '\n'+ptCtx+'\nStrengths and Weaknesses MUST reference specific features from product test.' : ''}${rcCtx}

SCORING RULES — you MUST calculate each component score honestly based on actual evidence:
- strength_score (0-25): High strength = +6pts, Medium = +4pts, Low = +2pts. Cap at 25.
- weakness_score (0-25): Start at 25. High weakness = -6pts, Medium = -3pts, Low = -1pt. Floor at 0.
- opportunity_score (0-25): High opportunity = +6pts, Medium = +4pts. Cap at 25.
- threat_score (0-25): Start at 25. High threat = -6pts, Medium = -3pts. Floor at 0.
- overall_score = sum of all four components (0-100)

HONEST BENCHMARKS — do NOT default to 70-75:
- 20-40: struggling, unvalidated, high risk
- 41-55: early with real problems to fix
- 56-68: solid foundation but gaps remain
- 69-79: strong with clear path forward
- 80+: proven traction (rare — only if strong evidence)

For EVERY point: rating (High/Medium/Low), specific evidence (not generic), specific action, owner, timeframe.

Output ONLY valid JSON, no markdown:
{
  "strength_score": 14,
  "weakness_score": 10,
  "opportunity_score": 16,
  "threat_score": 11,
  "overall_score": 51,
  "verdict": "1 sentence — the single most important strategic focus for THIS specific app right now",
  "strengths": [
    { "point": "specific strength unique to this app", "rating": "High", "evidence": "concrete reason this is a real strength for this specific app", "action": "specific tactic to leverage this", "owner": "marketing" },
    { "point": "specific strength", "rating": "Medium", "evidence": "concrete reason", "action": "specific leverage tactic", "owner": "founder" },
    { "point": "specific strength", "rating": "High", "evidence": "concrete reason", "action": "specific leverage tactic", "owner": "product" },
    { "point": "specific strength", "rating": "Low", "evidence": "concrete reason", "action": "specific leverage tactic", "owner": "marketing" }
  ],
  "weaknesses": [
    { "point": "specific weakness unique to this app", "rating": "High", "evidence": "concrete reason this hurts growth", "action": "specific fix step", "owner": "product", "timeframe": "Week 1-2" },
    { "point": "specific weakness", "rating": "Medium", "evidence": "concrete reason", "action": "specific fix", "owner": "dev", "timeframe": "Month 1" },
    { "point": "specific weakness", "rating": "High", "evidence": "concrete reason", "action": "specific fix", "owner": "founder", "timeframe": "Week 1" },
    { "point": "specific weakness", "rating": "Low", "evidence": "concrete reason", "action": "specific fix", "owner": "marketing", "timeframe": "Month 2" }
  ],
  "opportunities": [
    { "point": "specific opportunity for this app", "rating": "High", "evidence": "concrete reason this is real and addressable now", "action": "specific capture step", "owner": "founder", "timeframe": "Month 1" },
    { "point": "specific opportunity", "rating": "High", "evidence": "concrete reason", "action": "specific capture step", "owner": "marketing", "timeframe": "Month 2" },
    { "point": "specific opportunity", "rating": "Medium", "evidence": "concrete reason", "action": "specific capture step", "owner": "product", "timeframe": "Quarter 2" },
    { "point": "specific opportunity", "rating": "Medium", "evidence": "concrete reason", "action": "specific capture step", "owner": "founder", "timeframe": "Quarter 2" }
  ],
  "threats": [
    { "point": "specific threat to this app", "rating": "High", "evidence": "concrete reason this is dangerous", "action": "specific defence step", "owner": "founder", "timeframe": "Immediate" },
    { "point": "specific threat", "rating": "Medium", "evidence": "concrete reason", "action": "specific defence", "owner": "product", "timeframe": "Month 1" },
    { "point": "specific threat", "rating": "High", "evidence": "concrete reason", "action": "specific defence", "owner": "marketing", "timeframe": "Month 1" },
    { "point": "specific threat", "rating": "Low", "evidence": "concrete reason", "action": "specific defence", "owner": "founder", "timeframe": "Quarter 2" }
  ],
  "top_actions": [
    { "priority": 1, "action": "Most important action NOW — specific to this app only", "category": "weakness", "impact": "High", "timeframe": "This week" },
    { "priority": 2, "action": "Second most important action — specific", "category": "opportunity", "impact": "High", "timeframe": "Month 1" },
    { "priority": 3, "action": "Third action — specific", "category": "strength", "impact": "Medium", "timeframe": "Month 2" }
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
    // Monthly limit check — skip for admin
    if (!canRefresh(currentApp.growth_analyzed_at, userEmail)) {
      toast(`Analysis was last run ${lastUpdatedLabel(currentApp.growth_analyzed_at).toLowerCase()}. Refreshes once per month to avoid redundant AI calls.`)
      return
    }
    setLoad('growth', true)
    const ptCtx  = getTestContext(currentApp)
    const rcCtx  = getRecentContext()

    // Pull existing analysis to cross-reference
    let existingCtx = ''
    try {
      if (cache.competitive) {
        const c = JSON.parse(cache.competitive)
        const competitorNames = (c.comps||[]).map((x:any)=>x.name).join(', ')
        const weaknesses = (c.comps||[]).map((x:any)=>`${x.name}: ${(x.weaknesses||[]).join(', ')}`).join(' | ')
        existingCtx += `\n\nCOMPETITOR INTELLIGENCE:\nCompetitors: ${competitorNames}\nTheir weaknesses to exploit: ${weaknesses}\nMarket whitespace: ${c.wspace||''}\nWin condition: ${c.winCond||''}`
      }
      if (cache.swot) {
        const s = JSON.parse(cache.swot)
        const topStrengths = (s.strengths||[]).filter((x:any)=>x.rating==='High').map((x:any)=>x.point).join(', ')
        const topWeaknesses = (s.weaknesses||[]).filter((x:any)=>x.rating==='High').map((x:any)=>x.point).join(', ')
        const topOpps = (s.opportunities||[]).filter((x:any)=>x.rating==='High').map((x:any)=>x.point).join(', ')
        existingCtx += `\n\nSWOT INTELLIGENCE:\nTop strengths to leverage: ${topStrengths}\nCritical weaknesses to fix first: ${topWeaknesses}\nBiggest opportunities: ${topOpps}\nVerdict: ${s.verdict||''}`
      }
      if (cache.bmc) {
        const b = JSON.parse(cache.bmc)
        existingCtx += `\n\nBUSINESS MODEL:\nValue props: ${(b.value_propositions||[]).join(', ')}\nKey channels: ${(b.channels||[]).join(', ')}\nRevenue streams: ${(b.revenue_streams||[]).join(', ')}\nCustomer segments: ${(b.customer_segments||[]).join(', ')}`
      }
    } catch { /* ignore parse errors */ }

    try {
      const prompt = `You are a growth strategist. Create a specific, data-driven AARRR growth plan for "${currentApp.name}" — ${currentApp.category} app (${currentApp.stage} stage, ${currentApp.platform}).

App description: ${currentApp.desc || 'Not provided'}
Target audience: ${currentApp.audience || 'Not specified'}
Key features: ${(currentApp.features||[]).join(', ') || 'Not listed'}
${ptCtx}${rcCtx}${existingCtx}

RULES — this must NOT be generic:
1. Every tactic MUST reference specific features, competitor weaknesses, or SWOT findings above
2. Acquisition tactics must name specific channels relevant to this app's audience (not just "social ads")
3. Activation tactics must reference the actual app features users need to reach
4. Retention tactics must be specific to this app's category and user behaviour
5. Revenue tactics must align with the pricing model and customer segments
6. Each title should be a specific action (e.g. "Partner with Indian pediatricians for Tiny Tummies" not "Influencer Marketing")
7. NO generic tactics — if it could apply to any app, rewrite it

2 tactics per lane. Each description max 25 words.
Output ONLY valid JSON:
{"top_priority":"single most impactful specific 30-day action for THIS app","acquisition":[{"title":"specific tactic name","description":"specific 1 sentence action referencing app features or competitors","impact":"High","effort":"Low","timeframe":"Week 1-2"},{"title":"specific tactic","description":"specific action","impact":"Medium","effort":"Medium","timeframe":"Week 2-4"}],"activation":[{"title":"specific tactic","description":"specific action referencing actual app feature","impact":"High","effort":"Low","timeframe":"Week 1"},{"title":"specific tactic","description":"specific action","impact":"High","effort":"Medium","timeframe":"Week 2-3"}],"retention":[{"title":"specific tactic","description":"specific action unique to this app category","impact":"High","effort":"Low","timeframe":"Ongoing"},{"title":"specific tactic","description":"specific action","impact":"Medium","effort":"Medium","timeframe":"Month 2"}],"revenue":[{"title":"specific tactic","description":"specific monetisation action for this app","impact":"High","effort":"Medium","timeframe":"Month 1"},{"title":"specific tactic","description":"specific action","impact":"Medium","effort":"Low","timeframe":"Month 2"}],"referral":[{"title":"specific tactic","description":"specific referral mechanic for this app's users","impact":"Medium","effort":"Low","timeframe":"Month 2"},{"title":"specific tactic","description":"specific action","impact":"High","effort":"Medium","timeframe":"Month 3"}]}`

      const raw = await callClaude(prompt, 'Output ONLY valid JSON. Every tactic must be specific to this exact app — no generic advice. No trailing commas.', 3500)
      setTabCache('growth', raw.replace(/```json|```/g,'').trim())
      toast('Growth playbook ready!')
    } catch(e) { toast('Error: '+(e as Error).message) }
    setLoad('growth', false)
  }

  // ── PRICING ──────────────────────────────────────────────────────────────────
  async function genPricing() {
    // Monthly limit check — skip for admin
    if (!canRefresh(currentApp.pricing_analyzed_at, userEmail)) {
      toast(`Analysis was last run ${lastUpdatedLabel(currentApp.pricing_analyzed_at).toLowerCase()}. Refreshes once per month to avoid redundant AI calls.`)
      return
    }
    setLoad('pricing', true)
    const ptCtx = getTestContext(currentApp)
    const rcCtx = getRecentContext()
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

  // ── GTM CONTEXT BUILDER ───────────────────────────────────────────────────────
  // Parses all cached analyses and returns a rich context string for GTM prompts.
  function buildGTMContext(): string {
    const ua  = currentApp.url_analysis
    const ctx = currentApp.content_context

    let competitive: any = null
    let swot:        any = null
    let growth:      any = null
    try { if (currentApp.competitive_analysis) competitive = JSON.parse(currentApp.competitive_analysis) } catch {}
    try { if (currentApp.swot_analysis)        swot        = JSON.parse(currentApp.swot_analysis)        } catch {}
    try { if (currentApp.growth_analysis)      growth      = JSON.parse(currentApp.growth_analysis)      } catch {}

    const dimScore = (label: string) => ua?.dimensions?.find((d: any) => d.label === label)?.score ?? null
    const isBottleneck = (label: string) => ua?.bottleneck?.label === label

    const lines: string[] = []

    // ── App basics ──
    lines.push(`APP: "${currentApp.name}" — ${currentApp.category}${currentApp.stage ? ` (${currentApp.stage})` : ''}`)
    if (currentApp.desc)          lines.push(`DESCRIPTION: ${currentApp.desc}`)
    if (ctx?.typical_user)        lines.push(`TARGET USER: ${ctx.typical_user}`)
    if (currentApp.pillars?.length) lines.push(`CONTENT PILLARS: ${currentApp.pillars.join(', ')}`)

    // ── URL Analysis ──
    if (ua) {
      lines.push(`\nLANDING PAGE (from stored URL analysis — do NOT re-analyze):`)
      lines.push(`  Overall score: ${ua.overall}/10${ua.overall < 7 ? ' — BELOW ad-ready threshold of 7' : ' — ad-ready'}`)
      if (ua.headline)   lines.push(`  Headline: "${ua.headline}"`)
      if (ua.bottleneck) lines.push(`  #1 bottleneck: ${ua.bottleneck.label} — ${ua.bottleneck.issue}`)
      const trust = dimScore('Trust')
      const conv  = dimScore('Conversion Readiness')
      const clar  = dimScore('Clarity')
      const emo   = dimScore('Emotional Pull')
      if (clar  != null) lines.push(`  Clarity: ${clar}/10${isBottleneck('Clarity') ? ' ← #1 bottleneck' : clar < 6 ? ' ← weak' : ''}`)
      if (trust != null) lines.push(`  Trust (social proof): ${trust}/10${isBottleneck('Trust') ? ' ← #1 bottleneck' : trust < 6 ? ' ← weak — add testimonials before running ads' : ''}`)
      if (conv  != null) lines.push(`  Conversion readiness: ${conv}/10${isBottleneck('Conversion Readiness') ? ' ← #1 bottleneck' : conv < 5 ? ' ← weak — fix CTA friction' : ''}`)
      if (emo   != null) lines.push(`  Emotional pull: ${emo}/10${emo < 5 ? ' ← weak — messaging not connecting' : ''}`)
    }

    // ── Competitive ──
    if (competitive?.comps?.length) {
      lines.push(`\nCOMPETITORS (from stored Competitive Intelligence):`)
      competitive.comps.slice(0, 3).forEach((c: any) => {
        const score = c.overallScore ?? c.score
        lines.push(`  ${c.name}${score ? ` — score ${score}/10` : ''}`)
        if (c.positioningGap) lines.push(`    Gap to exploit: "${c.positioningGap}"`)
        if (c.userHates?.length) lines.push(`    User complaints: ${c.userHates.slice(0, 2).join('; ')}`)
      })
      if (competitive.winCond) lines.push(`  Win condition: ${competitive.winCond}`)
      if (competitive.mktPos)  lines.push(`  Market position: ${competitive.mktPos}`)
      if (competitive.wspace)  lines.push(`  Whitespace: ${competitive.wspace}`)
    }

    // ── SWOT ──
    if (swot) {
      const pick = (arr: any[]) => (arr ?? []).slice(0, 2).map((x: any) =>
        x.title ?? x.strength ?? x.weakness ?? x.opportunity ?? x.threat ?? (typeof x === 'string' ? x : '')
      ).filter(Boolean).join('; ')
      lines.push(`\nSWOT (from stored analysis):`)
      if (swot.strengths?.length)     lines.push(`  Strengths: ${pick(swot.strengths)}`)
      if (swot.weaknesses?.length)    lines.push(`  Weaknesses: ${pick(swot.weaknesses)}`)
      if (swot.opportunities?.length) lines.push(`  Opportunities: ${pick(swot.opportunities)}`)
      if (swot.threats?.length)       lines.push(`  Threats: ${pick(swot.threats)}`)
    }

    // ── Growth strategies ──
    if (growth) {
      const strategies: any[] = growth.strategies
        ?? growth.channels
        ?? (growth.lanes ?? []).flatMap((l: any) => l.strategies ?? [])
      if (strategies.length) {
        lines.push(`\nGROWTH STRATEGIES (already identified):`)
        strategies.slice(0, 3).forEach((s: any) => {
          const title = s.title ?? s.name ?? (typeof s === 'string' ? s : '')
          const desc  = s.description ? ` — ${s.description.slice(0, 80)}` : ''
          if (title) lines.push(`  ${title}${desc}`)
        })
      }
    }

    return lines.filter(Boolean).join('\n')
  }

  // ── GTM — single combined call ────────────────────────────────────────────────
  async function genGTMAll() {
    if (!canRefresh(currentApp.gtm_analyzed_at, userEmail)) {
      toast(`GTM plan updated ${lastUpdatedLabel(currentApp.gtm_analyzed_at).toLowerCase()}. Refreshes once per month.`)
      return
    }
    setLoad('gtm', true)
    try {
      const ua      = currentApp.url_analysis
      const ctx     = currentApp.content_context
      const context = buildGTMContext()

      // Collect specific coaching notes from all stored data
      const mandatory: string[] = []
      const trustScore = ua?.dimensions?.find((d: any) => d.label === 'Trust')?.score
      const convScore  = ua?.dimensions?.find((d: any) => d.label === 'Conversion Readiness')?.score
      if (ua && ua.overall < 7)
        mandatory.push(`Landing page is ${ua.overall}/10 — BELOW ad-ready threshold. In channels, flag that paid spend should wait until the page is fixed. Say so explicitly.`)
      if (trustScore != null && trustScore < 7)
        mandatory.push(`Trust score is ${trustScore}/10 — cite this in channel reasoning: paid ads to a low-trust page waste budget. The fix: ${ua?.bottleneck?.issue ?? 'add social proof'}.`)
      if (convScore != null && convScore < 5)
        mandatory.push(`Conversion readiness is ${convScore}/10 — sign-up friction will kill paid ROI. Address in formula step ordering.`)
      if (ua?.bottleneck)
        mandatory.push(`#1 bottleneck is "${ua.bottleneck.label}": ${ua.bottleneck.issue} — the formula must address fixing this before any scaling.`)
      let competitive: any = null
      try { if (currentApp.competitive_analysis) competitive = JSON.parse(currentApp.competitive_analysis) } catch {}
      const topGap = competitive?.comps?.[0]?.positioningGap
      if (topGap) mandatory.push(`Top competitor gap: "${topGap}" — at least one channel's firstAction must exploit this positioning.`)
      if (competitive?.winCond) mandatory.push(`Win condition: "${competitive.winCond}" — eternal principles should reference this.`)
      let swot: any = null
      try { if (currentApp.swot_analysis) swot = JSON.parse(currentApp.swot_analysis) } catch {}
      const topOpp = swot?.opportunities?.[0]
      const oppLabel = topOpp?.title ?? (typeof topOpp === 'string' ? topOpp : '')
      if (oppLabel) mandatory.push(`Top SWOT opportunity: "${oppLabel}" — marketing formula should exploit this immediately.`)

      const targetUser = ctx?.typical_user ?? `${currentApp.category} users`

      const prompt = `You are a go-to-market strategist and marketing expert. Using the CONTEXT below (from this app's actual stored analyses), generate a complete GTM strategy. Reference specific scores, competitor names, gaps, and real findings — not generic advice.

CONTEXT:
${context}
${mandatory.length ? '\nMANDATORY — weave these specific findings into your output:\n' + mandatory.map(m => `- ${m}`).join('\n') : ''}

Target user: ${targetUser}

Rules:
- Channel "why" must cite a specific finding from context (score, competitor weakness, SWOT opportunity)
- firstAction must be ultra-specific: real subreddit names, real hashtags, real influencer types
- Templates: [Name], [Your Name], [App Name] as placeholders; cold DM under 150 words
- ProductHunt tagline under 60 chars
- Category playbook: real companies with real measurable outcomes
- Marketing formula: steps must be ordered correctly — page fixes before paid scale

Return JSON only, no markdown:
{"channels":[{"name":"channel name","why":"cite specific score/gap/finding","timeline":"e.g. 2-4 weeks","cost":"e.g. ₹0/mo","effort":"Low","firstAction":"ultra-specific step with real names"},{"name":"...","why":"...","timeline":"...","cost":"...","effort":"Medium","firstAction":"..."},{"name":"...","why":"...","timeline":"...","cost":"...","effort":"High","firstAction":"..."}],"templates":{"coldDM":"Hey [Name],\\n\\n[specific observation].\\n\\n[Pain point]. [App Name] helps [target user] [specific outcome].\\n\\nHappy to give you free access.\\n\\n[Your Name]","redditPost":{"subreddit":"r/real_subreddit","title":"genuine helpful title — not an ad","body":"3-4 paragraph value-first post, [App Name] mentioned naturally"},"productHunt":{"tagline":"under 60 chars — punchy","description":"under 260 chars — what, who, differentiator"}},"playbook":{"categoryPlaybook":[{"company":"real company","what":"specific action they took","when":"year/period","results":"specific measurable outcome"},{"company":"...","what":"...","when":"...","results":"..."},{"company":"...","what":"...","when":"...","results":"..."}],"whatNotToDo":[{"example":"company or pattern","approach":"what was tried","why":"specific reason it failed or wasted money"},{"example":"...","approach":"...","why":"..."},{"example":"...","approach":"...","why":"..."}],"marketingFormula":[{"step":1,"action":"specific action","detail":"why first — reference bottleneck if relevant"},{"step":2,"action":"...","detail":"..."},{"step":3,"action":"...","detail":"..."},{"step":4,"action":"...","detail":"..."},{"step":5,"action":"...","detail":"..."},{"step":6,"action":"...","detail":"..."}],"eternalPrinciples":[{"principle":"Find where users already gather","action":"specific step for ${currentApp.name} from context"},{"principle":"Make first users successful before scaling","action":"..."},{"principle":"Word of mouth is the best channel","action":"..."},{"principle":"Content before ads","action":"..."},{"principle":"Positioning before promotion","action":"..."}]}}`

      const raw     = await callClaude(prompt, 'Output ONLY valid JSON. No markdown fences.', 5000, undefined, 'sonnet', 'gtm')
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').replace(/^[^{]*/, '').replace(/}[^}]*$/, '}').trim()
      if (!cleaned) throw new Error('Empty response')
      const parsed  = JSON.parse(cleaned)
      if (!Array.isArray(parsed.channels)) throw new Error('Invalid response — missing channels')
      setTabCache('gtm', JSON.stringify(parsed))
      toast('GTM strategy ready!')
    } catch (e: any) {
      toast('Error generating GTM strategy: ' + (e?.message ?? 'Unknown'))
    }
    setLoad('gtm', false)
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
      // Skip if already cached — don't waste tokens
      if (cache[key]) { setFStep(key, 'done'); continue }
      setFStep(key, 'active')
      await fn()
      setFStep(key, 'done')
    }
    setRunningFull(false)
    toast('Deep analysis complete! All 5 insights ready. 🎉', 5000)
    setActiveTab('competitive')
    // Track first analysis run for Analysis Pack (one-time plan)
    if (plan === 'analysis' && !currentApp.analysis_used_at) {
      await updateApp(currentApp.id, { analysis_used_at: new Date().toISOString() } as any)
    }
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

        {!canUseAnalysis ? (
          <div style={{ width:'100%', padding:'20px 24px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', textAlign:'center' }}>
            <div style={{ fontSize:22, marginBottom:10 }}>🔒</div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Insights & Analysis require Analysis Pack</div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6, marginBottom:16 }}>
              Get SWOT, Business Model Canvas, Competitive Intelligence, Growth Strategies, and Pricing analysis for your app.
            </div>
            <button
              onClick={onUpgrade}
              style={{ padding:'10px 24px', borderRadius:8, background:'linear-gradient(135deg,#34c98a,#22b573)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}
            >
              Upgrade to Analysis Pack →
            </button>
            <div style={{ marginTop:8, fontSize:11, color:'var(--text3)' }}>$10 one-time · 3 apps · Results saved permanently</div>
          </div>
        ) : plan === 'analysis' && currentApp.analysis_used_at ? (
          <div style={{ width:'100%', padding:'16px 20px', background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.25)', borderRadius:'var(--r2)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' as const }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--green)', marginBottom:3 }}>
                ✓ Analysis completed on {new Date(currentApp.analysis_used_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
              </div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>Results are saved permanently below · Purchase again to re-run</div>
            </div>
            <button
              onClick={onUpgrade}
              style={{ padding:'8px 18px', borderRadius:7, background:'linear-gradient(135deg,#34c98a,#22b573)', color:'#fff', border:'none', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}
            >
              Buy Another Analysis →
            </button>
          </div>
        ) : (
          <button
            id="run-full-analysis-btn"
            onClick={runFullAnalysis}
            disabled={runningFull}
            style={{ width:'100%', padding:14, background: runningFull ? 'linear-gradient(135deg,rgba(124,111,247,.2),rgba(226,111,175,.15))' : 'linear-gradient(135deg,rgba(124,111,247,.15),rgba(226,111,175,.1))', border:'1px solid rgba(124,111,247,.3)', borderRadius:'var(--r2)', fontFamily:'DM Sans,sans-serif', fontSize:14, fontWeight:700, color:'var(--accent2)', cursor: runningFull ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, transition:'all .2s', opacity: runningFull ? .8 : 1 }}
          >
            {runningFull
              ? <><span className="spinner" style={{ color:'var(--accent2)' }} /> Running deep analysis…</>
              : <><i className="ti ti-telescope" style={{ fontSize:16 }} /> ✦ Run Deep AI Analysis — Competitive · BMC · SWOT · Growth · Pricing</>
            }
          </button>
        )}

        {/* Progress steps */}
        {runningFull && (
          <div style={{ marginTop:14, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'12px 16px', display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', letterSpacing:'.06em', textTransform:'uppercase' as const, marginBottom:4 }}>Running all 5 analyses…</div>
            {Object.entries(stepLabels).map(([k, label]) => {
              const s = fullSteps[k] ?? 'pending'
              const isCached = !!cache[k]
              return (
                <div key={k} style={{ display:'flex', alignItems:'center', gap:10, fontSize:12, color: s==='done'?'var(--green)': s==='active'?'var(--accent2)':'var(--text3)', transition:'color .3s' }}>
                  <span style={{ fontSize:13, width:16, textAlign:'center' as const, flexShrink:0 }}>
                    {s==='done' ? '✓' : s==='active' ? '◉' : '○'}
                  </span>
                  <span style={{ flex:1 }}>{label}</span>
                  {s==='active' && <span style={{ fontSize:10, color:'var(--accent2)' }}>Generating…</span>}
                  {s==='done' && isCached && <span style={{ fontSize:10, color:'var(--text3)' }}>Loaded from cache</span>}
                  {s==='done' && !isCached && <span style={{ fontSize:10, color:'var(--green)' }}>Done</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:22, paddingBottom:14, borderBottom:'1px solid var(--border)' }}>
        {TABS.map(tab => {
          const isAnalysisTab = tab.id !== 'product'
          const locked = isAnalysisTab && !canUseAnalysis
          const hasData = tab.id === 'product' ? !!(pt) : !!(cache[tab.id])
          const tsMap: Record<string,string> = {
            competitive: currentApp.competitive_analyzed_at ?? '',
            bmc:         currentApp.bmc_analyzed_at ?? '',
            swot:        currentApp.swot_analyzed_at ?? '',
            growth:      currentApp.growth_analyzed_at ?? '',
            pricing:     currentApp.pricing_analyzed_at ?? '',
          }
          const lastUpdated = tab.id !== 'product' ? lastUpdatedLabel(tsMap[tab.id]) : ''
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding:'6px 14px', borderRadius:7, fontSize:12, fontWeight:600,
                fontFamily:'DM Sans,sans-serif', cursor: locked ? 'default' : 'pointer', transition:'all .15s',
                background: activeTab===tab.id ? 'rgba(124,111,247,.12)' : 'transparent',
                border: `1px solid ${activeTab===tab.id ? 'var(--accent)' : 'var(--border)'}`,
                color: locked ? 'var(--text3)' : activeTab===tab.id ? 'var(--accent2)' : hasData ? 'var(--text2)' : 'var(--text3)',
                opacity: locked ? 0.5 : 1,
              }}
            >
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:1 }}>
                <span>{tab.emoji} {tab.label}{locked ? ' 🔒' : (hasData ? ' ✓' : '')}</span>
                {lastUpdated && <span style={{ fontSize:9, color:'var(--text3)', fontWeight:400 }}>{lastUpdated}</span>}
              </div>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div style={{ position:'relative' }}>
        {/* Download + refresh info */}
        {cache[activeTab] && activeTab !== 'product' && (
          <div style={{ position:'absolute', top:-40, right:0, zIndex:10, display:'flex', alignItems:'center', gap:8 }}>
            {(() => {
              const tsMap: Record<string,string> = {
                competitive: currentApp.competitive_analyzed_at ?? '',
                bmc:         currentApp.bmc_analyzed_at ?? '',
                swot:        currentApp.swot_analyzed_at ?? '',
                growth:      currentApp.growth_analyzed_at ?? '',
                pricing:     currentApp.pricing_analyzed_at ?? '',
              }
              const ts = tsMap[activeTab]
              const days = daysSince(ts)
              const locked = !canRefresh(ts, userEmail)
              return locked && days !== null ? (
                <span style={{ fontSize:10, color:'var(--text3)' }}>
                  🔒 Refresh available in {MONTHLY_LIMIT_DAYS - days} days
                </span>
              ) : null
            })()}
            <button
              onClick={() => downloadAnalysisPDF(
                currentApp.name,
                TABS.find(t=>t.id===activeTab)?.label ?? activeTab,
                cache[activeTab]
              )}
              className="vbtn"
              style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}
            >
              <i className="ti ti-download" style={{ fontSize:12 }} />
              Download report
            </button>
          </div>
        )}

        {activeTab !== 'product' && !canUseAnalysis ? (
          <div style={{ textAlign:'center', padding:'40px 20px' }}>
            <div style={{ fontSize:28, marginBottom:12 }}>🔒</div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Upgrade to Analysis Pack to unlock this tab</div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6, marginBottom:18 }}>
              One-time purchase · Results saved permanently
            </div>
            <button
              onClick={onUpgrade}
              style={{ padding:'10px 24px', borderRadius:8, background:'linear-gradient(135deg,#34c98a,#22b573)', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}
            >
              Upgrade to Analysis Pack →
            </button>
          </div>
        ) : (
          <>
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
            {activeTab === 'gtm' && (
              <GoToMarketTab data={cache.gtm} loading={loading.gtm} onGenerate={genGTMAll} app={currentApp} canUseAnalysis={canUseAnalysis} />
            )}
            {activeTab === 'product' && (
              <ProductTest />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── COMPETITIVE TAB ──────────────────────────────────────────────────────────
function CompetitiveTab({ data, loading, onGenerate, appName }: { data?:string; loading?:boolean; onGenerate:()=>void; appName:string }) {
  const [view, setView] = useState<'cards'|'table'>(() => {
    try { return (localStorage.getItem('markr_compView') as 'cards'|'table') ?? 'cards' } catch { return 'cards' }
  })
  const switchView = (v: 'cards'|'table') => { setView(v); try { localStorage.setItem('markr_compView', v) } catch {} }

  if (loading) return <LoadingCard text="Researching competitors across all sources…" />
  if (!data) return <EmptyTab emoji="🔍" title="Competitive Intelligence" desc="Deep analysis of your top 5 competitors — funding, sentiment, recent moves, positioning gaps, and more." onGenerate={onGenerate} btnLabel="Run Competitive Intelligence" />
  try {
    const { comps, mktPos, wspace, winCond } = JSON.parse(data)
    const tC  = { High:'var(--red)', Medium:'var(--amber)', Low:'var(--green)' } as Record<string,string>
    const tBg = { High:'rgba(229,85,85,.12)', Medium:'rgba(245,166,35,.12)', Low:'rgba(52,201,138,.12)' } as Record<string,string>

    const SrcBadge = ({ src, live }: { src: string; live?: boolean }) => (
      <span style={{ display:'inline-block', fontSize:9, padding:'1px 5px', borderRadius:20, fontWeight:700, letterSpacing:'.04em', marginLeft:4,
        background: live ? 'rgba(245,166,35,.15)' : 'rgba(124,111,247,.12)',
        color: live ? 'var(--amber)' : 'var(--accent)',
      }}>{src}</span>
    )

    const SecLabel = ({ children, color }: { children: string; color?: string }) => (
      <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'.04em', color: color ?? 'var(--text3)', marginBottom:6 }}>{children}</div>
    )

    return (
      <>
        <Banner icon="🔭">
          <strong style={{ color:'var(--accent2)' }}>Market Position:</strong> {mktPos}<br/><br/>
          <strong style={{ color:'var(--green)' }}>Whitespace:</strong> {wspace}<br/><br/>
          <strong style={{ color:'var(--amber)' }}>Win Condition:</strong> {winCond}
        </Banner>

        {/* View toggle */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ display:'flex', gap:4, background:'var(--surface2)', borderRadius:8, padding:3, border:'1px solid var(--border)' }}>
            {(['cards','table'] as const).map(v => (
              <button key={v} onClick={() => switchView(v)} style={{
                padding:'5px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                background: view === v ? 'var(--accent)' : 'transparent',
                color:      view === v ? '#fff' : 'var(--text3)',
                transition: 'all .15s',
              }}>{v === 'cards' ? '⊞ Cards' : '☰ Table'}</button>
            ))}
          </div>
          <button className="vbtn" onClick={onGenerate}>🔄 Refresh</button>
        </div>

        {/* ── Table view ── */}
        {view === 'table' && (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr>{['Name','Score','App Store','Funding','Team','Top Gap'].map(h => (
                    <th key={h} style={{ padding:'9px 12px', textAlign:'left' as const, fontSize:10, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'.06em', color:'var(--text3)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' as const, background:'var(--surface2)' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {comps.map((c: any, i: number) => {
                    const score  = c.score ?? 0
                    const sColor = score >= 7 ? 'var(--green)' : score >= 5 ? 'var(--amber)' : 'var(--red)'
                    const sBg    = score >= 7 ? 'rgba(52,201,138,.1)' : score >= 5 ? 'rgba(245,166,35,.1)' : 'rgba(229,85,85,.1)'
                    const rating = c.appStore?.rating ?? null
                    const ratingFallback = c.reviews?.rating ?? null
                    const topGap = c.positioningGap ?? c.userHates?.[0] ?? c.weaknesses?.[0] ?? '—'
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'10px 12px', fontWeight:600 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            {c.name}
                            {c.type && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:20, fontWeight:700, textTransform:'uppercase' as const, background: c.type==='local' ? 'rgba(52,201,138,.15)' : 'rgba(124,111,247,.15)', color: c.type==='local' ? 'var(--green)' : 'var(--accent)' }}>{c.type==='local' ? 'Local' : 'Global'}</span>}
                          </div>
                          {c.price && <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{c.price}</div>}
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ fontSize:12, fontWeight:700, padding:'3px 8px', borderRadius:6, background:sBg, color:sColor }}>{score}/10</span>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          {rating != null ? (
                            <span style={{ color:'var(--amber)', fontWeight:600 }}>⭐ {rating}/5 <span style={{ fontSize:9, color:'var(--text3)', fontWeight:400 }}>(live)</span></span>
                          ) : ratingFallback ? (
                            <span style={{ color:'var(--amber)', fontWeight:600 }}>⭐ {ratingFallback}</span>
                          ) : <span style={{ color:'var(--text3)' }}>—</span>}
                        </td>
                        <td style={{ padding:'10px 12px', color:'var(--text2)' }}>{c.funding ?? '—'}</td>
                        <td style={{ padding:'10px 12px', color:'var(--text2)' }}>{c.employees ?? '—'}</td>
                        <td style={{ padding:'10px 12px', color:'var(--text2)', maxWidth:220 }}>
                          <div style={{ overflow:'hidden', display:'-webkit-box' as any, WebkitLineClamp:2, WebkitBoxOrient:'vertical' as any }}>{topGap}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Cards view ── */}
        {view === 'cards' && <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {comps.map((c: any, i: number) => (
            <div key={i} className="card" style={{ padding:0, overflow:'hidden' }}>

              {/* ── Card header ── */}
              <div style={{ padding:'12px 16px', background:'var(--surface2)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontWeight:700, fontSize:14 }}>{c.name}</span>
                  {c.type && (
                    <span style={{ fontSize:9, padding:'2px 7px', borderRadius:20, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'.04em',
                      background: c.type==='local' ? 'rgba(52,201,138,.15)' : 'rgba(124,111,247,.15)',
                      color: c.type==='local' ? 'var(--green)' : 'var(--accent)',
                    }}>{c.type==='local' ? 'Local' : 'Global'}</span>
                  )}
                  {c.cat && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:20, background:'var(--surface3)', color:'var(--text3)' }}>{c.cat}</span>}
                  {c.url && <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize:10, color:'var(--text3)', textDecoration:'none' }}>{c.url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]}</a>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  {c.price && <span style={{ fontSize:11, fontWeight:600, color:'var(--green)' }}>{c.price}</span>}
                  <span style={{ fontSize:10, padding:'3px 9px', borderRadius:20, fontWeight:700,
                    background:tBg[c.threat]??tBg.Medium, color:tC[c.threat]??tC.Medium,
                  }}>{c.threat} threat · {c.score}/10</span>
                </div>
              </div>

              {/* ── Row 1: App Store | Funding | Team ── */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom:'1px solid var(--border)' }}>
                {/* App Store (live) */}
                <div style={{ padding:'10px 14px', borderRight:'1px solid var(--border)' }}>
                  <SecLabel>App Store</SecLabel>
                  {c.appStore?.rating != null ? (
                    <>
                      <div>
                        <span style={{ color:'var(--amber)', fontWeight:700 }}>⭐ {c.appStore.rating}/5</span>
                        {c.appStore.ratingCount != null && <span style={{ fontSize:11, color:'var(--text3)' }}> ({c.appStore.ratingCount.toLocaleString()})</span>}
                        <SrcBadge src="Live" live />
                      </div>
                      {c.appStore.price && <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>{c.appStore.price}{c.appStore.updatedMonths != null ? ` · ${c.appStore.updatedMonths === 0 ? 'updated this month' : `updated ${c.appStore.updatedMonths}mo ago`}` : ''}</div>}
                    </>
                  ) : c.reviews?.rating ? (
                    <div>
                      <span style={{ color:'var(--amber)', fontWeight:700 }}>⭐ {c.reviews.rating}</span>
                      {c.reviews.ratingCount && <span style={{ fontSize:11, color:'var(--text3)' }}> ({c.reviews.ratingCount})</span>}
                      {c.reviews.ratingSource && <SrcBadge src={c.reviews.ratingSource} />}
                      {c.reviews.traction && <div style={{ fontSize:11, color:'var(--green)', marginTop:2 }}>📈 {c.reviews.traction}</div>}
                    </div>
                  ) : (
                    <span style={{ fontSize:11, color:'var(--text3)' }}>Web only</span>
                  )}
                </div>
                {/* Funding */}
                <div style={{ padding:'10px 14px', borderRight:'1px solid var(--border)' }}>
                  <SecLabel>Funding</SecLabel>
                  {c.funding ? (
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
                      {c.funding}
                      {c.fundingSource && <SrcBadge src={c.fundingSource} />}
                    </div>
                  ) : <span style={{ fontSize:11, color:'var(--text3)' }}>—</span>}
                  {c.phUpvotes && (
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>
                      PH: {c.phUpvotes} upvotes{c.phYear ? ` · ${c.phYear}` : ''}
                      <SrcBadge src="ProductHunt" />
                    </div>
                  )}
                </div>
                {/* Team size */}
                <div style={{ padding:'10px 14px' }}>
                  <SecLabel>Team Size</SecLabel>
                  {c.employees ? (
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
                      👥 {c.employees}
                      {c.employeesSource && <SrcBadge src={c.employeesSource} />}
                    </div>
                  ) : <span style={{ fontSize:11, color:'var(--text3)' }}>—</span>}
                </div>
              </div>

              {/* ── Row 2: User Loves | User Hates ── */}
              {(c.userLoves?.length || c.userHates?.length || c.reviews?.praise || c.reviews?.complaints) && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ padding:'10px 14px', borderRight:'1px solid var(--border)' }}>
                    <SecLabel color="var(--green)">👍 What users love</SecLabel>
                    {(c.userLoves?.length ? c.userLoves : c.reviews?.praise ? [c.reviews.praise] : []).map((pt: string, j: number) => (
                      <div key={j} style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5, marginBottom:3 }}>• {pt}</div>
                    ))}
                  </div>
                  <div style={{ padding:'10px 14px', background:'rgba(229,85,85,.02)' }}>
                    <SecLabel color="var(--red)">👎 Their gaps = your chances</SecLabel>
                    {(c.userHates?.length ? c.userHates : c.reviews?.complaints ? [c.reviews.complaints] : []).map((pt: string, j: number) => (
                      <div key={j} style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5, marginBottom:3 }}>• {pt}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Row 3: Recent Moves | Reddit Sentiment ── */}
              {(c.recentMoves?.length || c.redditSentiment) && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid var(--border)' }}>
                  {c.recentMoves?.length > 0 && (
                    <div style={{ padding:'10px 14px', borderRight:'1px solid var(--border)' }}>
                      <SecLabel>📰 Recent moves</SecLabel>
                      {c.recentMoves.map((m: any, j: number) => {
                        const noNews = !m.date && !m.source
                        return (
                          <div key={j} style={{ marginBottom:7 }}>
                            <div style={{ fontSize:11, color: noNews ? 'var(--text3)' : 'var(--text)', lineHeight:1.4, fontStyle: noNews ? 'italic' as const : 'normal' as const }}>{m.headline}</div>
                            {!noNews && (
                              <div style={{ display:'flex', alignItems:'center', gap:2, marginTop:2 }}>
                                {m.date && <span style={{ fontSize:10, color:'var(--text3)' }}>{m.date}</span>}
                                {m.source && <SrcBadge src={m.source} />}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {c.redditSentiment && (
                    <div style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                        <SecLabel>💬 Reddit sentiment</SecLabel>
                        <span style={{ fontSize:9, padding:'2px 7px', borderRadius:20, fontWeight:700, textTransform:'uppercase' as const, marginBottom:6,
                          background: c.redditSentiment==='positive' ? 'rgba(52,201,138,.15)' : c.redditSentiment==='negative' ? 'rgba(229,85,85,.12)' : 'rgba(245,166,35,.12)',
                          color: c.redditSentiment==='positive' ? 'var(--green)' : c.redditSentiment==='negative' ? 'var(--red)' : 'var(--amber)',
                        }}>{c.redditSentiment}</span>
                        <SrcBadge src="Reddit" />
                      </div>
                      {c.redditQuote && (
                        <div style={{ fontSize:11, color:'var(--text2)', lineHeight:1.5, fontStyle:'italic' as const, borderLeft:'2px solid var(--border)', paddingLeft:8 }}>
                          "{c.redditQuote}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Positioning gap ── */}
              {c.positioningGap && (
                <div style={{ padding:'10px 14px', background:'rgba(124,111,247,.04)', borderBottom:'1px solid rgba(124,111,247,.12)' }}>
                  <span style={{ fontSize:10, color:'var(--accent)', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'.04em' }}>🎯 Positioning gap: </span>
                  <span style={{ fontSize:12, color:'var(--text)', lineHeight:1.5 }}>{c.positioningGap}</span>
                </div>
              )}

              {/* ── How you win ── */}
              {c.diff && (
                <div style={{ padding:'10px 14px', background:'rgba(52,201,138,.04)' }}>
                  <span style={{ fontSize:10, color:'var(--green)', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'.04em' }}>✅ How {appName} wins: </span>
                  <span style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{c.diff}</span>
                </div>
              )}

            </div>
          ))}
        </div>}
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
        {/* Overall score + component breakdown + verdict */}
        {d.verdict && (
          <div style={{ background:'rgba(124,111,247,.06)', border:'1px solid rgba(124,111,247,.2)', borderRadius:'var(--r2)', padding:'16px 18px', marginBottom:20 }}>
            <div style={{ display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap' as const }}>
              {/* Big score */}
              {d.overall_score && (
                <div style={{ textAlign:'center', flexShrink:0, minWidth:64 }}>
                  <div style={{ fontFamily:"'Inter',sans-serif", fontSize:40, fontWeight:700, color:'var(--accent)', lineHeight:1 }}>{d.overall_score}</div>
                  <div style={{ fontSize:9, color:'var(--text3)', marginTop:2, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase' as const }}>/ 100</div>
                </div>
              )}
              {/* Component bars */}
              <div style={{ flex:1, minWidth:200 }}>
                {d.strength_score !== undefined && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px', marginBottom:10 }}>
                    {[
                      { label:'Strengths',     score:d.strength_score,     color:'var(--green)' },
                      { label:'Opportunities', score:d.opportunity_score,   color:'var(--blue)'  },
                      { label:'Weaknesses',    score:d.weakness_score,     color:'var(--red)'   },
                      { label:'Threats',       score:d.threat_score,       color:'var(--amber)' },
                    ].map(c => (
                      <div key={c.label}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                          <span style={{ fontSize:10, color:'var(--text3)', fontWeight:600 }}>{c.label}</span>
                          <span style={{ fontSize:10, fontWeight:700, color:c.color }}>{c.score}/25</span>
                        </div>
                        <div style={{ height:4, background:'var(--surface3)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${(c.score/25)*100}%`, background:c.color, borderRadius:2 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6, fontStyle:'italic' }}>"{d.verdict}"</div>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>
                  ℹ️ Score calculated from weighted strengths, weaknesses, opportunities and threats. Add recent metrics in Edit App for a more accurate assessment.
                </div>
              </div>
            </div>
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
                    <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'var(--surface2)', color:'var(--text3)' }}>⏱ {a.timeframe}</span>
                    {a.category && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'var(--surface2)', color:'var(--text3)' }}>{a.category}</span>}
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
                <div key={i} style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'10px 12px', marginBottom:8, border:'1px solid rgba(255,255,255,.05)' }}>
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
                  <div style={{ display:'flex', gap:6, alignItems:'flex-start', padding:'7px 9px', background:'var(--surface2)', borderRadius:6, borderLeft:`2px solid ${q.color}` }}>
                    <span style={{ fontSize:10, fontWeight:700, color:q.color, flexShrink:0, marginTop:1 }}>→ {q.actionLabel}:</span>
                    <span style={{ fontSize:11, color:'var(--text)', lineHeight:1.5 }}>{item.action}</span>
                  </div>
                  {/* Owner + timeframe */}
                  <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' as const }}>
                    {item.owner && (
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'var(--surface2)', color:ownerColor[item.owner]??'var(--text3)', fontWeight:600 }}>
                        👤 {item.owner}
                      </span>
                    )}
                    {item.timeframe && (
                      <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'var(--surface2)', color:'var(--text3)' }}>
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
  } catch {
    return (
      <div style={{ textAlign:'center', padding:'32px 16px' }}>
        <div style={{ fontSize:13, color:'var(--amber)', marginBottom:16 }}>
          ⚠️ This analysis was generated with an older format — please regenerate to get the new intelligent SWOT with ratings and action points.
        </div>
        <button className="gen-btn" style={{ margin:'0 auto' }} onClick={onGenerate}>
          🔄 Regenerate SWOT
        </button>
      </div>
    )
  }
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

// ── PDF DOWNLOAD ──────────────────────────────────────────────────────────────
export function downloadAnalysisPDF(appName: string, tabLabel: string, data: string) {
  const date = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })
  let body = ''

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; background: #f8f8fc; color: #111118; font-size: 13px; line-height: 1.5; }
    .page { max-width: 860px; margin: 0 auto; padding: 32px 28px; }
    .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 2px solid #7c6ff7; margin-bottom: 24px; }
    .logo-name { font-size: 18px; font-weight: 800; color: #111; }
    .meta { text-align: right; font-size: 11px; color: #888; }
    .meta h1 { font-size: 15px; color: #111; font-weight: 700; margin-bottom: 2px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #7c6ff7; margin: 20px 0 10px; }
    .verdict-box { background: #f0effe; border: 1px solid rgba(124,111,247,.3); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 14px; }
    .score { font-size: 36px; font-weight: 800; color: #7c6ff7; line-height: 1; min-width: 48px; }
    .verdict-text { font-size: 13px; color: #333; font-style: italic; line-height: 1.6; }
    .actions-box { background: #fff; border: 1px solid rgba(124,111,247,.2); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
    .action-row { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0f0f7; align-items: flex-start; }
    .action-row:last-child { border-bottom: none; }
    .priority-badge { width: 22px; height: 22px; border-radius: 50%; background: rgba(124,111,247,.15); color: #7c6ff7; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
    .badge { display: inline-block; padding: 1px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; margin-left: 4px; }
    .badge-high { background: rgba(22,168,112,.15); color: #16a870; }
    .badge-medium { background: rgba(212,138,10,.15); color: #d48a0a; }
    .badge-low { background: rgba(144,144,176,.15); color: #9090b0; }
    .quads { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
    .quad { border-radius: 10px; padding: 14px; }
    .quad-s { background: rgba(22,168,112,.06); border: 1px solid rgba(22,168,112,.2); }
    .quad-w { background: rgba(220,38,38,.06); border: 1px solid rgba(220,38,38,.2); }
    .quad-o { background: rgba(37,99,235,.06); border: 1px solid rgba(37,99,235,.2); }
    .quad-t { background: rgba(212,138,10,.06); border: 1px solid rgba(212,138,10,.2); }
    .quad-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 10px; }
    .quad-s .quad-title { color: #16a870; }
    .quad-w .quad-title { color: #dc2626; }
    .quad-o .quad-title { color: #2563eb; }
    .quad-t .quad-title { color: #d48a0a; }
    .quad-item { background: #fff; border-radius: 7px; padding: 8px 10px; margin-bottom: 7px; }
    .quad-item-title { font-size: 12px; font-weight: 600; color: #111; margin-bottom: 3px; }
    .quad-item-evidence { font-size: 11px; color: #666; margin-bottom: 4px; line-height: 1.5; }
    .quad-item-action { font-size: 11px; color: #7c6ff7; font-weight: 500; }
    .card { background: #fff; border: 1px solid #e4e4f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
    .card-title { font-size: 13px; font-weight: 600; color: #111; margin-bottom: 4px; }
    .card-sub { font-size: 11px; color: #555; line-height: 1.6; }
    .lane-title { font-size: 12px; font-weight: 700; color: #5a4fd4; margin: 16px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #e4e4f0; }
    .competitor-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 16px; }
    .competitor-card { background: #fff; border: 1px solid #e4e4f0; border-radius: 8px; padding: 10px 12px; }
    .tier-box { background: #fff; border: 1px solid rgba(124,111,247,.25); border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; }
    .tier-name { font-size: 13px; font-weight: 700; color: #7c6ff7; }
    .tier-price { font-size: 24px; font-weight: 800; color: #111; margin: 4px 0; }
    @media print { body { background: #fff; } }
  `

  try {
    const d = JSON.parse(data)
    const tab = tabLabel.toLowerCase()

    const rBadge = (r: string) => {
      const cls = r === 'High' ? 'badge-high' : r === 'Medium' ? 'badge-medium' : 'badge-low'
      return `<span class="badge ${cls}">${r}</span>`
    }

    if (tab === 'swot') {
      const quads = [
        { key:'strengths',     label:'💪 Strengths',     cls:'quad-s', action:'Leverage' },
        { key:'weaknesses',    label:'⚠️ Weaknesses',    cls:'quad-w', action:'Fix' },
        { key:'opportunities', label:'🌟 Opportunities', cls:'quad-o', action:'Capture' },
        { key:'threats',       label:'🔥 Threats',       cls:'quad-t', action:'Defend' },
      ]
      body = `
        ${(d.overall_score || d.verdict) ? `
          <div class="verdict-box">
            ${d.overall_score ? `<div class="score">${d.overall_score}</div>` : ''}
            <div class="verdict-text">"${d.verdict || ''}"</div>
          </div>` : ''}
        ${(d.top_actions || []).length ? `
          <div class="section-title">🎯 Top Priority Actions</div>
          <div class="actions-box">
            ${(d.top_actions || []).map((a: any) => `
              <div class="action-row">
                <div class="priority-badge">${a.priority}</div>
                <div>
                  <span class="card-title">${a.action}</span>${rBadge(a.impact)}
                  <div style="font-size:10px;color:#888;margin-top:2px">⏱ ${a.timeframe || ''} ${a.category ? '· ' + a.category : ''}</div>
                </div>
              </div>`).join('')}
          </div>` : ''}
        <div class="quads">
          ${quads.map(q => `
            <div class="quad ${q.cls}">
              <div class="quad-title">${q.label}</div>
              ${(d[q.key] || []).map((item: any) => `
                <div class="quad-item">
                  <div class="quad-item-title">${item.point || item} ${item.rating ? rBadge(item.rating) : ''}</div>
                  ${item.evidence ? `<div class="quad-item-evidence">${item.evidence}</div>` : ''}
                  ${item.action ? `<div class="quad-item-action">→ ${q.action}: ${item.action}</div>` : ''}
                </div>`).join('')}
            </div>`).join('')}
        </div>`

    } else if (tab === 'competitive') {
      const tColor: Record<string,string> = { High:'#dc2626', Medium:'#d48a0a', Low:'#16a870' }
      body = `
        ${(d.mktPos || d.wspace || d.winCond) ? `
        <div style="background:#f0effe;border:1px solid rgba(124,111,247,.3);border-radius:10px;padding:14px 16px;margin-bottom:20px;font-size:13px;line-height:1.7">
          ${d.mktPos ? `<div><strong style="color:#5a4fd4">Market Position:</strong> ${d.mktPos}</div>` : ''}
          ${d.wspace ? `<div style="margin-top:6px"><strong style="color:#16a870">Whitespace:</strong> ${d.wspace}</div>` : ''}
          ${d.winCond ? `<div style="margin-top:6px"><strong style="color:#d48a0a">Win Condition:</strong> ${d.winCond}</div>` : ''}
        </div>` : ''}
        <div class="section-title">🔍 Competitor Matrix</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px">
          <thead>
            <tr style="border-bottom:2px solid #e4e4f0">
              <th style="text-align:left;padding:8px 10px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.06em">Competitor</th>
              <th style="text-align:left;padding:8px 10px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.06em">Type</th>
              <th style="text-align:left;padding:8px 10px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.06em">Pricing</th>
              <th style="text-align:left;padding:8px 10px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.06em">Threat</th>
              <th style="text-align:left;padding:8px 10px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.06em">Strengths</th>
              <th style="text-align:left;padding:8px 10px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.06em">Weaknesses</th>
              <th style="text-align:left;padding:8px 10px;font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.06em">How ${appName} Wins</th>
            </tr>
          </thead>
          <tbody>
            ${(d.comps || []).map((c: any) => `
              <tr style="border-bottom:1px solid #f0f0f7">
                <td style="padding:9px 10px;font-weight:600;color:#111">${c.name}</td>
                <td style="padding:9px 10px;color:#888;font-size:11px">${c.cat || ''}</td>
                <td style="padding:9px 10px;color:#16a870;font-weight:600">${c.price || '-'}</td>
                <td style="padding:9px 10px">
                  <span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:${(tColor[c.threat]||'#888')}18;color:${tColor[c.threat]||'#888'}">${c.threat || '-'}</span>
                  <div style="font-size:10px;color:#888;margin-top:3px">${c.score || ''}/10</div>
                </td>
                <td style="padding:9px 10px">${(c.strengths||[]).map((s: string)=>`<div style="font-size:11px;color:#444;margin-bottom:2px">• ${s}</div>`).join('')}</td>
                <td style="padding:9px 10px">${(c.weaknesses||[]).map((w: string)=>`<div style="font-size:11px;color:#666;margin-bottom:2px">• ${w}</div>`).join('')}</td>
                <td style="padding:9px 10px;font-size:11px;color:#5a4fd4;line-height:1.5">${c.diff || ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>`

    } else if (tab === 'business model canvas') {
      const blocks = ['value_propositions','customer_segments','channels','customer_relationships','revenue_streams','key_resources','key_activities','key_partners','cost_structure']
      const labels: Record<string,string> = { key_partners:'Key Partners', key_activities:'Key Activities', key_resources:'Key Resources', value_propositions:'Value Propositions', customer_relationships:'Customer Relationships', channels:'Channels', customer_segments:'Customer Segments', cost_structure:'Cost Structure', revenue_streams:'Revenue Streams' }
      body = blocks.filter(k => d[k]).map(k => `
        <div class="card">
          <div class="section-title" style="margin-top:0">${labels[k] || k}</div>
          ${Array.isArray(d[k])
            ? d[k].map((item: any) => `<div style="margin-bottom:8px"><div class="card-title">${item.title || item}</div>${item.description ? `<div class="card-sub">${item.description}</div>` : ''}${item.insight ? `<div style="font-size:11px;color:#7c6ff7;margin-top:3px">💡 ${item.insight}</div>` : ''}</div>`).join('')
            : `<div class="card-sub">${d[k]}</div>`}
        </div>`).join('')

    } else if (tab === 'growth strategies') {
      const lanes = [{k:'acquisition',l:'📣 Acquisition'},{k:'activation',l:'⚡ Activation'},{k:'retention',l:'🔁 Retention'},{k:'revenue',l:'💰 Revenue'},{k:'referral',l:'🤝 Referral'}]
      body = `
        ${d.top_priority ? `<div class="verdict-box"><div class="verdict-text"><strong>🎯 Top Priority:</strong> ${d.top_priority}</div></div>` : ''}
        ${lanes.filter(({k}) => (d[k] || []).length).map(({k, l}) => `
          <div class="lane-title">${l}</div>
          ${(d[k] || []).map((s: any) => `
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div class="card-title">${s.title}</div>
                <div>${rBadge(s.impact)}<span class="badge" style="background:#f0f0f7;color:#666">Effort: ${s.effort}</span></div>
              </div>
              <div class="card-sub">${s.description}</div>
              <div style="font-size:10px;color:#888;margin-top:4px">⏱ ${s.timeframe}</div>
            </div>`).join('')}`).join('')}
      `

    } else if (tab === 'pricing') {
      body = `
        ${d.strategy_type ? `<div class="verdict-box"><div class="verdict-text"><strong>Strategy: ${d.strategy_type}</strong>${d.rationale ? '<br>' + d.rationale : ''}</div></div>` : ''}
        <div class="section-title">💰 Recommended Tiers</div>
        ${(d.recommended_tiers || []).map((t: any) => `
          <div class="tier-box">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div class="tier-name">${t.name}</div>
                <div class="tier-price">${t.price}</div>
              </div>
              ${t.positioning ? `<span class="badge" style="background:#f0effe;color:#7c6ff7;padding:4px 10px;font-size:11px">${t.positioning}</span>` : ''}
            </div>
            ${t.description ? `<div class="card-sub" style="margin-top:6px">${t.description}</div>` : ''}
            ${(t.features || []).map((f: string) => `<div style="font-size:11px;color:#444;margin-top:3px"><span style="color:#16a870">✓</span> ${f}</div>`).join('')}
          </div>`).join('')}
      `
    } else {
      body = `<pre style="font-size:11px;color:#333;white-space:pre-wrap;line-height:1.6">${JSON.stringify(d, null, 2)}</pre>`
    }
  } catch {
    body = `<div style="color:#dc2626;padding:16px">Failed to parse analysis data.</div>`
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${appName} — ${tabLabel} Analysis</title>
  <style>${css}</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="logo-name">Markr — ${appName}</div>
        <div style="font-size:11px;color:#888;margin-top:2px">markr.mindprintjournal.com</div>
      </div>
      <div class="meta">
        <h1>${tabLabel} Analysis</h1>
        <div>${date}</div>
      </div>
    </div>
    ${body}
  </div>
  <script>window.onload = () => window.print()<\/script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const blobUrl = URL.createObjectURL(blob)
  const win = window.open(blobUrl, '_blank')
  if (!win) {
    const a = document.createElement('a')
    a.href = blobUrl; a.download = `${appName}-${tabLabel}-analysis.html`; a.click()
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
}
