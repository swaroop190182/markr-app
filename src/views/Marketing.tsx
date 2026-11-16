import { useState } from 'react'
import { useStore } from '../lib/store'
import { callClaude, extractJSON, getInstagramContext, getFounderContext, getVisionContext, AiLimitError } from '../lib/claude'
import { isOutdated, outdatedReason, canBypassLock, isOneTimeUsed, markGenerated } from '../lib/outdated'
import { CURRENCY_RULE, fixAnalysisCurrency } from '../lib/prices'
import { isAdminEmail } from '../lib/admin'
import OutdatedNotice from '../components/OutdatedNotice'
import { readCompetitive } from '../lib/founder'
import { bottleneckLine, isRealBottleneck } from '../lib/bottleneck'
import { toast } from '../components/Toast'
import GoToMarketTab from './insights/GoToMarket'
import FirstHundred from './insights/FirstHundred'
import { GTM_PARTS, GTM_PART_INFO, GTM_PROMPTS, gtmMandatory, parseGtmPart, startRun, applyPart, failPart, missingParts, isRunComplete, readGtm, type GtmPart } from '../lib/gtm'

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

export default function Marketing({ onUpgrade, onEditApp }: { onUpgrade?: () => void; onEditApp?: (id: number) => void } = {}) {
  const { currentApp, updateApp, userEmail, plan, setView } = useStore()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ part: GtmPart; n: number; of: number } | null>(null)
  const canUseAnalysis = plan === 'analysis' || plan === 'pro' || plan === 'guest_pro'
  // The saved GTM JSON can hold only the "first 100" section — that is not a generated plan
  const savedGtm = readGtm(currentApp.gtm_analysis)
  const hasGtmPlan = Array.isArray(savedGtm.channels) || !!savedGtm.templates || !!savedGtm.playbook
  const missing = missingParts(savedGtm).map(p => ({ part: p, error: savedGtm._gtm_run?.errors?.[p] ?? null }))

  function saveMarketing(json: any) {
    updateApp(currentApp.id, {
      gtm_analysis:    markGenerated(JSON.stringify(fixAnalysisCurrency(currentApp, 'gtm', json))),   // original currencies + current context rules
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
    competitive = readCompetitive(currentApp)   // exclusions applied
    try { if (currentApp.swot_analysis)       swot        = JSON.parse(currentApp.swot_analysis)        } catch {}
    try { if (currentApp.growth_analysis)      growth      = JSON.parse(currentApp.growth_analysis)      } catch {}

    const dimScore    = (label: string) => ua?.dimensions?.find((d: any) => d.label === label)?.score ?? null
    const isBottleneck = (label: string) => isRealBottleneck(ua, label)   // only below 7

    const lines: string[] = []

    lines.push(`APP: "${currentApp.name}" — ${currentApp.category}${currentApp.stage ? ` (${currentApp.stage})` : ''}`)
    if (currentApp.desc)            lines.push(`DESCRIPTION: ${currentApp.desc}`)
    if (ctx?.typical_user)          lines.push(`TARGET USER: ${ctx.typical_user}`)
    if (currentApp.pillars?.length) lines.push(`CONTENT PILLARS: ${currentApp.pillars.join(', ')}`)

    if (ua) {
      lines.push(`\nLANDING PAGE (from stored URL analysis — do NOT re-analyze):`)
      lines.push(`  Overall score: ${ua.overall}/10${ua.overall < 7 ? ' — BELOW ad-ready threshold of 7' : ' — ad-ready'}`)
      if (ua.headline)   lines.push(`  Headline: "${ua.headline}"`)
      const bn = bottleneckLine(ua, '#1 bottleneck')   // or "No bottleneck — … maintain it." when every dimension is 7+
      if (bn) lines.push(`  ${bn}`)
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

    // Founder intent + real product screens — re-running GTM after either changes now reflects it
    const fCtx = getFounderContext(currentApp)
    if (fCtx) lines.push(fCtx)
    const vCtx = getVisionContext(currentApp)
    if (vCtx) lines.push(vCtx)

    lines.push(`\n${getInstagramContext(currentApp, 'If followers exceed 10,000, recommend converting the existing audience rather than building a new presence; if under 1,000, treat Instagram as a channel to build.')}`)

    return lines.filter(Boolean).join('\n')
  }

  // ── Generation in parts ────────────────────────────────────────────────────
  // Three sequential calls (channels, templates, playbook), each well under the 60s limit.
  // Each part is saved as it completes; gtm_analyzed_at moves only once every part of the run is done.
  // A failed part keeps its previous version and can be retried alone (see retryPart).
  function savePlan(obj: any) {
    const complete = isRunComplete(obj)
    return updateApp(currentApp.id, {
      gtm_analysis: markGenerated(JSON.stringify(fixAnalysisCurrency(currentApp, 'gtm', obj))),   // original currencies + current context rules
      ...(complete ? { gtm_analyzed_at: new Date().toISOString() } : {}),
    } as any)
  }

  async function runParts(parts: GtmPart[], resume = false, budgetArg?: unknown) {
    const budgetIn = typeof budgetArg === 'number' ? budgetArg : undefined   // handlers wired to onClick pass an event
    setLoading(true)
    const ua      = currentApp.url_analysis
    const context = buildGTMContext()
    let swot: any = null
    try { if (currentApp.swot_analysis) swot = JSON.parse(currentApp.swot_analysis) } catch {}
    const mandatory  = gtmMandatory(ua, readCompetitive(currentApp), swot)
    const targetUser = currentApp.content_context?.typical_user ?? `${currentApp.category} users`

    // A retry continues the saved run; a new run keeps everything already saved (first100, other parts)
    // The Budget Planner's monthly budget (saved with the plan so a retry uses the same one)
    const budget = budgetIn ?? (typeof savedGtm.budget === 'number' ? savedGtm.budget : 0)
    let obj = resume ? readGtm(currentApp.gtm_analysis)
      : startRun(currentApp.gtm_analysis, parts, crypto.randomUUID(), undefined, { generatedAtScore: ua?.overall ?? null, budget })
    let limitHit = false
    try {
      for (const [n, part] of parts.entries()) {
        if (limitHit) { obj = failPart(obj, part, 'Daily AI limit reached'); continue }
        setProgress({ part, n: n + 1, of: parts.length })
        const info = GTM_PART_INFO[part]
        try {
          const raw = await callClaude(
            GTM_PROMPTS[part]({ appName: currentApp.name, category: currentApp.category, context, targetUser, currencyRule: CURRENCY_RULE, mandatory: mandatory[part], budget }),
            'Output ONLY valid JSON. No markdown fences.', info.maxTokens, undefined, 'sonnet', info.feature)
          const cleaned = extractJSON(raw)
          if (!cleaned) throw new Error('the response was empty')
          obj = applyPart(obj, part, parseGtmPart(part, JSON.parse(cleaned), context, { budget }).data)
        } catch (e: any) {
          if (e instanceof AiLimitError) limitHit = true
          const msg = e instanceof AiLimitError ? 'Daily AI limit reached' : (e?.message ?? 'unknown error')
          console.warn(`[gtm] ${part} failed:`, e)
          obj = failPart(obj, part, msg)
        }
        await savePlan(obj)   // keep what succeeded so far
      }
      const missing = missingParts(obj)
      if (!missing.length) toast(parts.length === 1 ? `${GTM_PART_INFO[parts[0]].label} updated` : 'Marketing strategy ready!')
      else toast(`${parts.length - missing.length} of ${parts.length} parts updated — retry ${missing.map(p => GTM_PART_INFO[p].label).join(', ')}`, 6000)
    } finally {
      setProgress(null)
      setLoading(false)
    }
  }

  // ── Full generation ────────────────────────────────────────────────────────
  async function genMarketingAll(budget?: unknown) {
    if (!canRefresh(currentApp.gtm_analyzed_at, userEmail) && !canBypassLock(currentApp, plan, 'gtm')) {
      toast(`Marketing plan updated ${lastUpdatedLabel(currentApp.gtm_analyzed_at).toLowerCase()}. Refreshes once per month.`)
      return
    }
    await runParts(GTM_PARTS, false, budget)
  }

  // ── Playbook-only refresh ──────────────────────────────────────────────────
  async function genPlaybookOnly(budget?: unknown) {
    await runParts(['playbook'], false, budget)
  }

  // ── Retry one part that didn't complete (not subject to the monthly lock) ───
  async function retryPart(part: GtmPart) {
    await runParts([part], true)
  }

  // ── Smart refresh ──────────────────────────────────────────────────────────
  async function genSmartRefresh(budgetArg?: unknown) {
    const budget = typeof budgetArg === 'number' ? budgetArg : undefined
    // Outdated (brief/screenshots changed): channels and templates must be redone too, not just the playbook
    if (isOutdated(currentApp, 'gtm')) { await genMarketingAll(budget); return }
    // A different budget changes which channels fit — redo everything
    if (budget !== undefined && budget !== (typeof savedGtm.budget === 'number' ? savedGtm.budget : 0)) { await genMarketingAll(budget); return }
    const currentScore = currentApp.url_analysis?.overall ?? null
    let storedScore: number | null = null
    try { if (currentApp.gtm_analysis) storedScore = JSON.parse(currentApp.gtm_analysis).generatedAtScore ?? null } catch {}

    const scoreDelta = currentScore != null && storedScore != null
      ? Math.abs(currentScore - storedScore)
      : null

    if (scoreDelta == null || scoreDelta >= 0.5) {
      await genMarketingAll(budget)
    } else {
      await genPlaybookOnly(budget)
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960, margin: '0 auto' }}>
      {currentApp.gtm_analysis && isOutdated(currentApp, 'gtm') && (
        <OutdatedNotice reason={outdatedReason(currentApp, 'gtm') ?? 'inputs'} onRerun={genMarketingAll} busy={loading} oneTimeUsed={isOneTimeUsed(currentApp, plan)} onUpgrade={onUpgrade} />
      )}
      {isAdminEmail(userEmail) && (() => {
        try {
          const n = JSON.parse(currentApp.gtm_analysis ?? '{}')?._currency_fixes
          return n > 0 ? <div style={{ fontSize:11, color:'var(--text3)', margin:'-6px 0 10px' }}>🔧 {n} {n === 1 ? 'price' : 'prices'} corrected to {n === 1 ? 'its' : 'their'} original currency (admin only)</div> : null
        } catch { return null }
      })()}
      <GoToMarketTab
        data={hasGtmPlan ? currentApp.gtm_analysis! : undefined}
        loading={loading}
        onGenerate={genMarketingAll}
        onRefresh={genSmartRefresh}
        onGoToOverview={() => setView('overview')}
        app={currentApp}
        canUseAnalysis={canUseAnalysis}
        progress={progress ? { label: GTM_PART_INFO[progress.part].progress, n: progress.n, of: progress.of } : null}
        missing={loading ? [] : missing}
        onRetryPart={retryPart}
        callsPerRun={GTM_PARTS.length}
        afterChannels={<FirstHundred app={currentApp} plan={plan} onUpgrade={onUpgrade} onEditApp={onEditApp} />}
      />
    </div>
  )
}
