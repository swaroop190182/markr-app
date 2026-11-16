// Go-to-Market plan generation in three parts, each its own AI call sized to finish well under
// the 60s function limit: channels, outreach templates, playbook. Each part is saved as it
// completes; a failed part keeps its previous version and can be retried on its own.
// Pure (type imports only) so it can be unit-tested (tests/gtm.test.ts).

export type GtmPart = 'channels' | 'templates' | 'playbook'
export const GTM_PARTS: GtmPart[] = ['channels', 'templates', 'playbook']

export const GTM_PART_INFO: Record<GtmPart, { label: string; progress: string; feature: string; maxTokens: number }> = {
  channels:  { label: 'Channel recommendations', progress: 'Writing channels…',           feature: 'gtm_channels',  maxTokens: 1500 },
  templates: { label: 'Outreach templates',      progress: 'Writing outreach templates…', feature: 'gtm_templates', maxTokens: 2000 },
  playbook:  { label: 'Category patterns',       progress: 'Writing the playbook…',       feature: 'gtm_playbook',  maxTokens: 3000 },
}

export type PartState = 'pending' | 'done' | 'failed'
export interface GtmRun {
  id: string
  parts: Partial<Record<GtmPart, PartState>>   // only the parts this run covers
  errors?: Partial<Record<GtmPart, string>>
  started_at: string
}

import { realBottleneck, noBottleneck, NO_BOTTLENECK_TEXT } from './bottleneck.ts'

// ── Mandatory findings, routed to the part that uses them ────────────────────
export function gtmMandatory(ua: any, competitive: any, swot: any): Record<GtmPart, string[]> {
  const m: Record<GtmPart, string[]> = { channels: [], templates: [], playbook: [] }
  const dim = (label: string) => ua?.dimensions?.find((d: any) => d.label === label)?.score
  const trust = dim('Trust'), conv = dim('Conversion Readiness')
  const bn = realBottleneck(ua)   // only a dimension below 7
  if (ua && ua.overall < 7)
    m.channels.push(`Landing page is ${ua.overall}/10 — BELOW the ad-ready threshold of 7. Say explicitly that paid spend should wait until the page is fixed.`)
  if (trust != null && trust < 7)
    m.channels.push(`Trust score is ${trust}/10 — cite it in channel reasoning: paid ads to a low-trust page waste budget. The fix: ${bn?.issue || 'add social proof'}.`)
  if (conv != null && conv < 5)
    m.playbook.push(`Conversion readiness is ${conv}/10 — sign-up friction will kill paid ROI. Address it in the formula's step order.`)
  if (bn)
    m.playbook.push(`#1 bottleneck is "${bn.label}"${bn.score !== null ? ` (${bn.score}/10)` : ''}: ${bn.issue} — the formula must fix this before any scaling.`)
  else if (noBottleneck(ua))
    m.playbook.push(`${NO_BOTTLENECK_TEXT} Do not call any dimension a bottleneck; the formula should maintain the page and focus on distribution.`)
  const topGap = competitive?.comps?.[0]?.positioningGap
  if (topGap) m.channels.push(`Top competitor gap: "${topGap}" — at least one channel's firstAction must exploit this positioning.`)
  if (competitive?.winCond) m.playbook.push(`Win condition: "${competitive.winCond}" — the eternal principles should reference it.`)
  const topOpp = swot?.opportunities?.[0]
  const opp = topOpp?.title ?? (typeof topOpp === 'string' ? topOpp : '')
  if (opp) m.playbook.push(`Top SWOT opportunity: "${opp}" — the formula should exploit it early.`)
  return m
}

// ── Prompts ──────────────────────────────────────────────────────────────────
export interface GtmPromptCtx {
  appName: string
  category: string
  context: string          // buildGTMContext() output
  targetUser: string
  currencyRule: string     // CURRENCY_RULE (passed in to keep this module free of runtime imports)
  mandatory: string[]      // this part's findings from gtmMandatory()
  budget?: number          // the Budget Planner's monthly budget in ₹ (0 = free only)
}

// ── Budget ───────────────────────────────────────────────────────────────────
export const budgetLabel = (budget: number): string =>
  budget <= 0 ? '₹0 — free only' : `₹${budget.toLocaleString('en-IN')}${budget >= 50000 ? '+' : ''} / month`

export function budgetRule(budget: number | undefined): string {
  if (budget === undefined) return ''
  if (budget <= 0) return `BUDGET RULE: The founder's monthly marketing budget is ₹0 (free only). Recommend only free channels and actions — no paid ads, boosted posts, sponsorships, paid influencers or paid tools, and no ad spend. Every cost is ₹0/mo. A paid option may be mentioned only as "later, when you have budget".`
  return `BUDGET RULE: The founder's monthly marketing budget is ${budgetLabel(budget)}. Any paid channel or step must fit within it; never suggest spending more.`
}

// A channel that spends money now: paid wording in its name, or a non-zero cost
const PAID = /\b(ads?|advertis\w*|paid|sponsor\w*|boost\w*|promoted|ppc|cpc|cpm|influencer marketing)\b/i
export function isPaidChannel(ch: any): boolean {
  const cost = typeof ch?.cost === 'string' ? ch.cost : ''
  const costsMoney = /[1-9]/.test(cost.replace(/\b(\d+\s*-\s*)?\d+\s*(weeks?|days?|months?|hrs?|hours?)\b/gi, ''))   // ignore time spans ("2-4 weeks")
  return PAID.test(typeof ch?.name === 'string' ? ch.name : '') || costsMoney
}

const head = (c: GtmPromptCtx, task: string) => `You are a go-to-market strategist. Using the CONTEXT below (from this app's actual stored analyses), ${task} Reference specific scores, gaps and findings from the context — not generic advice.

CONTEXT:
${c.context}
${c.mandatory.length ? '\nMANDATORY — weave these specific findings into your output:\n' + c.mandatory.map(m => `- ${m}`).join('\n') + '\n' : ''}
Target user: ${c.targetUser}`

// Never name a specific community from memory — real ones come from "Where your first 100 users are"
const COMMUNITY_RULE = `COMMUNITY RULE: Never name a specific subreddit, group, forum, Discord/Slack or newsletter. Say "a relevant community" instead — real, checked communities are listed separately in "Where your first 100 users are".`
// Category guidance is general patterns, not case studies recalled from memory
export const PATTERNS_RULE = `PATTERNS RULE: Do not name companies, people or products, and do not give numbers, dates, growth figures or case studies — unless they appear in the CONTEXT above. Describe general patterns for the category instead.`

export function channelsPrompt(c: GtmPromptCtx): string {
  return `${head(c, 'recommend the 3 best marketing channels for this app.')}

Rules:
- "why" must cite a specific finding from the context (a score, competitor gap or SWOT opportunity).
- "firstAction" must be a concrete, specific first step (what to post, where in general terms, what to measure).
- One Low, one Medium and one High effort channel.
${budgetRule(c.budget)}
${COMMUNITY_RULE}
${c.currencyRule}

Return JSON only, no markdown:
{"channels":[{"name":"channel name","why":"cite a specific finding","timeline":"e.g. 2-4 weeks","cost":"e.g. ₹0/mo","effort":"Low","firstAction":"specific first step"},{"name":"...","why":"...","timeline":"...","cost":"...","effort":"Medium","firstAction":"..."},{"name":"...","why":"...","timeline":"...","cost":"...","effort":"High","firstAction":"..."}]}`
}

export function templatesPrompt(c: GtmPromptCtx): string {
  return `${head(c, 'write three outreach templates the founder can adapt.')}

Rules:
- Placeholders: [Name], [Your Name], [App Name]. Cold DM under 150 words.
- Community post: value-first, genuinely helpful, [App Name] mentioned naturally — not an ad.
- Product Hunt tagline under 60 characters; description under 260 characters (what, who, differentiator).
- Never invent numbers, user counts, quotes or results.
${COMMUNITY_RULE}
${c.currencyRule}

Return JSON only, no markdown:
{"templates":{"coldDM":"Hey [Name],\\n\\n[specific observation].\\n\\n[Pain point]. [App Name] helps [target user] [specific outcome].\\n\\nHappy to give you free access.\\n\\n[Your Name]","redditPost":{"title":"genuine helpful title — not an ad","body":"3-4 short paragraphs, value first, [App Name] mentioned naturally"},"productHunt":{"tagline":"under 60 chars","description":"under 260 chars"}}}`
}

export function playbookPrompt(c: GtmPromptCtx): string {
  return `${head(c, `write a category playbook for ${c.category} apps and a step-by-step marketing formula for ${c.appName}.`)}

Rules:
- "categoryPlaybook": 3 patterns that tend to work for ${c.category} apps at this stage.
- "whatNotToDo": 3 common failure patterns and why they waste time or money.
- "marketingFormula": 6 ordered steps — page fixes before paid scale.
- "eternalPrinciples": the 5 principles below, each with a specific action for ${c.appName} from the context.
${budgetRule(c.budget)}
${PATTERNS_RULE}
${COMMUNITY_RULE}
${c.currencyRule}

Return JSON only, no markdown:
{"categoryPlaybook":[{"pattern":"short name of the pattern","what":"what founders do","when":"stage it fits","why":"why it tends to work"},{"pattern":"...","what":"...","when":"...","why":"..."},{"pattern":"...","what":"...","when":"...","why":"..."}],"whatNotToDo":[{"pattern":"short name","approach":"what is tried","why":"why it fails or wastes money"},{"pattern":"...","approach":"...","why":"..."},{"pattern":"...","approach":"...","why":"..."}],"marketingFormula":[{"step":1,"action":"specific action","detail":"why first — reference the bottleneck if relevant"},{"step":2,"action":"...","detail":"..."},{"step":3,"action":"...","detail":"..."},{"step":4,"action":"...","detail":"..."},{"step":5,"action":"...","detail":"..."},{"step":6,"action":"...","detail":"..."}],"eternalPrinciples":[{"principle":"Find where users already gather","action":"specific step for ${c.appName}"},{"principle":"Make first users successful before scaling","action":"..."},{"principle":"Word of mouth is the best channel","action":"..."},{"principle":"Content before ads","action":"..."},{"principle":"Positioning before promotion","action":"..."}]}`
}

export const GTM_PROMPTS: Record<GtmPart, (c: GtmPromptCtx) => string> = {
  channels: channelsPrompt, templates: templatesPrompt, playbook: playbookPrompt,
}

// ── Parse + clean each part's response ───────────────────────────────────────
// Figures that aren't in the context (outcomes, money, counts, years) → the sentence is dropped
const FIGURE = /[$₹€£]\s?\d[\d,.]*\s?[kmb]?|\d[\d,.]*\s?(?:%|x\b|k\b|m\b|b\b|lakh|crore)|\b(?:19|20)\d{2}\b|\d[\d,.]*\s*(?:users|downloads|installs|customers|signups|sign-ups|subscribers|members|followers|reviews)\b/gi
const normFig = (s: string) => s.toLowerCase().replace(/[\s,]/g, '')

export function stripUnsourcedFigures(text: string, context: string): { text: string; removed: number } {
  const ctx = normFig(context)
  let removed = 0
  const sentences = text.split(/(?<=[.!?])\s+/)
  const kept = sentences.filter(s => {
    const figs = s.match(FIGURE) ?? []
    const bad = figs.some(f => !ctx.includes(normFig(f)))
    if (bad) removed++
    return !bad
  })
  return { text: kept.join(' ').trim(), removed }
}

// Communities named from memory → generic wording
export function stripNamedCommunities(text: string): string {
  return text
    .replace(/(^|[\s(])\/?r\/[A-Za-z0-9_]{2,}/g, '$1a relevant subreddit')
    .replace(/a relevant subreddit(,\s*a relevant subreddit)+/g, 'relevant subreddits')
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const deep = (v: any, f: (x: string) => string): any =>
  typeof v === 'string' ? f(v) : Array.isArray(v) ? v.map(x => deep(x, f)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x, f)])) : v

// Validate one part's JSON and return the data to store, or throw with a readable reason
export function parseGtmPart(part: GtmPart, json: any, context: string, opts: { budget?: number } = {}): { data: any; removedFigures: number } {
  if (part === 'channels') {
    if (!Array.isArray(json?.channels) || !json.channels.length) throw new Error('the response had no channels')
    // Free-only budget: paid channels are never shown, whatever the model returned
    const chans = opts.budget !== undefined && opts.budget <= 0 ? json.channels.filter((c: any) => !isPaidChannel(c)) : json.channels
    if (!chans.length) throw new Error('the response only had paid channels for a free-only budget')
    return { data: deep(chans.slice(0, 3), stripNamedCommunities), removedFigures: 0 }
  }
  if (part === 'templates') {
    const t = json?.templates
    if (!t || typeof t !== 'object' || !s(t.coldDM)) throw new Error('the response had no templates')
    const { subreddit: _drop, ...post } = t.redditPost ?? {}   // no community named from memory
    return { data: deep({ ...t, redditPost: t.redditPost ? post : undefined }, stripNamedCommunities), removedFigures: 0 }
  }
  const pb = json?.categoryPlaybook ? json : json?.playbook
  if (!pb || !Array.isArray(pb.categoryPlaybook) || !Array.isArray(pb.marketingFormula)) throw new Error('the response had no playbook')
  let removedFigures = 0
  const clean = (x: string) => { const r = stripUnsourcedFigures(stripNamedCommunities(x), context); removedFigures += r.removed; return r.text }
  const data = {
    categoryPlaybook:  deep(pb.categoryPlaybook.slice(0, 3), clean),
    whatNotToDo:       deep((pb.whatNotToDo ?? []).slice(0, 3), clean),
    marketingFormula:  deep(pb.marketingFormula.slice(0, 6), stripNamedCommunities),
    eternalPrinciples: deep((pb.eternalPrinciples ?? []).slice(0, 5), stripNamedCommunities),
  }
  return { data, removedFigures }
}

// Saved before this change: named "real companies" with results recalled from memory
export function isLegacyPlaybook(pb: any): boolean {
  return Array.isArray(pb?.categoryPlaybook) && pb.categoryPlaybook.some((x: any) => x && ('company' in x || 'results' in x))
}

// ── Run bookkeeping inside the saved GTM JSON ────────────────────────────────
export function readGtm(raw: string | null | undefined): any {
  try { const o = raw ? JSON.parse(raw) : null; return o && typeof o === 'object' && !Array.isArray(o) ? o : {} } catch { return {} }
}

// Start a run over `parts`. Everything already saved stays (first100, the other parts, older values).
export function startRun(prevRaw: string | null | undefined, parts: GtmPart[], id: string, now = new Date().toISOString(), extra: object = {}): any {
  const prev = readGtm(prevRaw)
  return { ...prev, ...extra, _gtm_run: { id, started_at: now, parts: Object.fromEntries(parts.map(p => [p, 'pending'])) } as GtmRun }
}

export function applyPart(obj: any, part: GtmPart, data: any): any {
  const run: GtmRun | undefined = obj._gtm_run
  const out = { ...obj }
  if (part === 'channels') out.channels = data
  else if (part === 'templates') out.templates = data
  else out.playbook = data
  if (run) {
    const errors = { ...(run.errors ?? {}) }; delete errors[part]
    out._gtm_run = { ...run, parts: { ...run.parts, [part]: 'done' }, errors }
  }
  return out
}

export function failPart(obj: any, part: GtmPart, message: string): any {
  const run: GtmRun | undefined = obj._gtm_run
  if (!run) return obj
  return { ...obj, _gtm_run: { ...run, parts: { ...run.parts, [part]: 'failed' }, errors: { ...(run.errors ?? {}), [part]: message } } }
}

// Parts of the current run that did not complete (failed, or still pending after an interrupted run)
export function missingParts(obj: any): GtmPart[] {
  const run: GtmRun | undefined = obj?._gtm_run
  if (!run) return []
  return GTM_PARTS.filter(p => run.parts[p] && run.parts[p] !== 'done')
}

// Every part of the current run is done → the plan is complete (gtm_analyzed_at may move)
export const isRunComplete = (obj: any): boolean => !!obj?._gtm_run && missingParts(obj).length === 0
