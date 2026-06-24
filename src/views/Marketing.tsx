import { useState } from 'react'
import { useStore } from '../lib/store'
import { callClaude } from '../lib/claude'
import { toast } from '../components/Toast'
import GoToMarketTab from './insights/GoToMarket'

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

export default function Marketing() {
  const { currentApp, updateApp, userEmail, plan, setView } = useStore()
  const [loading, setLoading] = useState(false)
  const canUseAnalysis = plan === 'analysis' || plan === 'pro' || plan === 'guest_pro'

  function saveMarketing(json: any) {
    updateApp(currentApp.id, {
      gtm_analysis:    JSON.stringify(json),
      gtm_analyzed_at: new Date().toISOString(),
    } as any)
  }

  // ── Context builder ────────────────────────────────────────────────────────
  function buildGTMContext(): string {
    const ua  = currentApp.url_analysis
    const ctx = currentApp.content_context

    let competitive: any = null
    let swot:        any = null
    let growth:      any = null
    try { if (currentApp.competitive_analysis) competitive = JSON.parse(currentApp.competitive_analysis) } catch {}
    try { if (currentApp.swot_analysis)        swot        = JSON.parse(currentApp.swot_analysis)        } catch {}
    try { if (currentApp.growth_analysis)      growth      = JSON.parse(currentApp.growth_analysis)      } catch {}

    const dimScore    = (label: string) => ua?.dimensions?.find((d: any) => d.label === label)?.score ?? null
    const isBottleneck = (label: string) => ua?.bottleneck?.label === label

    const lines: string[] = []

    lines.push(`APP: "${currentApp.name}" — ${currentApp.category}${currentApp.stage ? ` (${currentApp.stage})` : ''}`)
    if (currentApp.desc)            lines.push(`DESCRIPTION: ${currentApp.desc}`)
    if (ctx?.typical_user)          lines.push(`TARGET USER: ${ctx.typical_user}`)
    if (currentApp.pillars?.length) lines.push(`CONTENT PILLARS: ${currentApp.pillars.join(', ')}`)

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

  // ── Full generation ────────────────────────────────────────────────────────
  async function genMarketingAll() {
    if (!canRefresh(currentApp.gtm_analyzed_at, userEmail)) {
      toast(`Marketing plan updated ${lastUpdatedLabel(currentApp.gtm_analyzed_at).toLowerCase()}. Refreshes once per month.`)
      return
    }
    setLoading(true)
    try {
      const ua      = currentApp.url_analysis
      const ctx     = currentApp.content_context
      const context = buildGTMContext()

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

      const prompt = `You are a go-to-market strategist and marketing expert. Using the CONTEXT below (from this app's actual stored analyses), generate a complete marketing strategy. Reference specific scores, competitor names, gaps, and real findings — not generic advice.

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
      saveMarketing({ ...parsed, generatedAtScore: ua?.overall ?? null })
      toast('Marketing strategy ready!')
    } catch (e: any) {
      toast('Error generating marketing strategy: ' + (e?.message ?? 'Unknown'))
    }
    setLoading(false)
  }

  // ── Playbook-only refresh ──────────────────────────────────────────────────
  async function genPlaybookOnly() {
    setLoading(true)
    try {
      const ua         = currentApp.url_analysis
      const ctx        = currentApp.content_context
      const context    = buildGTMContext()
      const targetUser = ctx?.typical_user ?? `${currentApp.category} users`

      const mandatory: string[] = []
      if (ua?.bottleneck) mandatory.push(`#1 bottleneck: "${ua.bottleneck.label}" — ${ua.bottleneck.issue}. Formula must address this.`)
      let swot: any = null
      try { if (currentApp.swot_analysis) swot = JSON.parse(currentApp.swot_analysis) } catch {}
      const topOpp   = swot?.opportunities?.[0]
      const oppLabel = topOpp?.title ?? (typeof topOpp === 'string' ? topOpp : '')
      if (oppLabel) mandatory.push(`Top SWOT opportunity: "${oppLabel}" — exploit in formula.`)
      let competitive: any = null
      try { if (currentApp.competitive_analysis) competitive = JSON.parse(currentApp.competitive_analysis) } catch {}
      if (competitive?.winCond) mandatory.push(`Win condition: "${competitive.winCond}" — reference in eternal principles.`)

      const prompt = `You are a marketing expert. Use the CONTEXT below to build an updated category playbook, failure patterns, step-by-step formula, and eternal principles for this app. Be specific — cite real companies, real numbers, real market conditions as of today.

CONTEXT:
${context}
${mandatory.length ? '\nMANDATORY:\n' + mandatory.map(m => `- ${m}`).join('\n') : ''}

Target user: ${targetUser}

Return JSON only, no markdown:
{"categoryPlaybook":[{"company":"real company","what":"specific action","when":"year/period","results":"specific measurable outcome"},{"company":"...","what":"...","when":"...","results":"..."},{"company":"...","what":"...","when":"...","results":"..."}],"whatNotToDo":[{"example":"company or pattern","approach":"what was tried","why":"specific reason it failed"},{"example":"...","approach":"...","why":"..."},{"example":"...","approach":"...","why":"..."}],"marketingFormula":[{"step":1,"action":"specific action","detail":"why first — address bottleneck if relevant"},{"step":2,"action":"...","detail":"..."},{"step":3,"action":"...","detail":"..."},{"step":4,"action":"...","detail":"..."},{"step":5,"action":"...","detail":"..."},{"step":6,"action":"...","detail":"..."}],"eternalPrinciples":[{"principle":"Find where users already gather","action":"specific step for ${currentApp.name} from context"},{"principle":"Make first users successful before scaling","action":"..."},{"principle":"Word of mouth is the best channel","action":"..."},{"principle":"Content before ads","action":"..."},{"principle":"Positioning before promotion","action":"..."}]}`

      const raw     = await callClaude(prompt, 'Output ONLY valid JSON. No markdown fences.', 3000, undefined, 'sonnet', 'gtm')
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').replace(/^[^{]*/, '').replace(/}[^}]*$/, '}').trim()
      if (!cleaned) throw new Error('Empty response')
      const parsed  = JSON.parse(cleaned)
      if (!parsed.categoryPlaybook) throw new Error('Invalid response')

      let existing: any = {}
      try { if (currentApp.gtm_analysis) existing = JSON.parse(currentApp.gtm_analysis) } catch {}
      saveMarketing({ ...existing, playbook: parsed, generatedAtScore: ua?.overall ?? existing.generatedAtScore ?? null })
      toast('Playbook refreshed!')
    } catch (e: any) {
      toast('Error refreshing playbook: ' + (e?.message ?? 'Unknown'))
    }
    setLoading(false)
  }

  // ── Smart refresh ──────────────────────────────────────────────────────────
  async function genSmartRefresh() {
    const currentScore = currentApp.url_analysis?.overall ?? null
    let storedScore: number | null = null
    try { if (currentApp.gtm_analysis) storedScore = JSON.parse(currentApp.gtm_analysis).generatedAtScore ?? null } catch {}

    const scoreDelta = currentScore != null && storedScore != null
      ? Math.abs(currentScore - storedScore)
      : null

    if (scoreDelta == null || scoreDelta >= 0.5) {
      await genMarketingAll()
    } else {
      await genPlaybookOnly()
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960, margin: '0 auto' }}>
      <GoToMarketTab
        data={currentApp.gtm_analysis ?? undefined}
        loading={loading}
        onGenerate={genMarketingAll}
        onRefresh={genSmartRefresh}
        onGoToOverview={() => setView('overview')}
        app={currentApp}
        canUseAnalysis={canUseAnalysis}
      />
    </div>
  )
}
