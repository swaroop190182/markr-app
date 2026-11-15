import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader, Banner, LoadingCard, ErrorCard, CopyButton } from '../components/ui'
import { callClaude, AiLimitError, getAiUsage, getTestContext, getVisionContext, getFounderContext, getInstagramContext, safeParseJSON, extractJSON, looksTruncated } from '../lib/claude'
import { readCompetitive, filterExcluded, orderFocusFirst, applyBriefWebsites, hasFounderBrief } from '../lib/founder'
import { ANALYSES, isOutdated, outdatedReason, outdatedKeys, callCost, canBypassLock, isOneTimeUsed, markGenerated, type AnalysisKey } from '../lib/outdated'
import OutdatedNotice from '../components/OutdatedNotice'

// What one analysis run achieved — lets "Refresh all outdated" stop cleanly at the daily limit
type RunStatus = 'ok' | 'failed' | 'locked' | 'limit' | 'saved_then_limit'
type StepState = 'pending' | 'active' | 'done' | 'failed' | 'skipped'
import { itunesNameMatches, applyFacts, applyWebsiteFact, needsWebsiteSearch, findFactsEntry, competitorWebsite, confirmedWebsite, sourceDomain, isPreferredSource } from '../lib/competitors'

// Pass 2 (live sources) runs competitors in batches to stay inside the 60s API limit.
// Measured on the Vercel preview: 3 + 2 batches took ~9.8s / ~9.5s (8 searches, no pauses),
// so all 5 competitors now go in one call. Lower this if [web_search] ms approaches ~40s.
const FACTS_BATCH = 5
const FACTS_MAX_USES = 10

// Same rule Competitive follows: no unsourced facts about competitors in the other analyses
const COMPETITOR_FACTS_RULE = `COMPETITOR FACTS RULE: Don't state facts about competitors — downloads, user counts, funding, investors, affiliations, ratings or review counts — unless they appear in the sourced competitive data provided above. If they don't, leave them out and describe competitors only by what they offer.`

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

// ── Market detection ──────────────────────────────────────────────────────────
// url_analysis doesn't store the raw scraped page — only headline/category/
// bottleneck/dimension issues/growth_teaser — so those plus the app description
// stand in for "landing page text" below.
function detectMarket(desc: string, url: string, ua?: {
  headline?: string; category?: string
  bottleneck?: { issue?: string }
  dimensions?: Array<{ issue?: string }>
  growth_teaser?: string
} | null): string {
  const text = [
    desc, ua?.headline, ua?.growth_teaser, ua?.bottleneck?.issue,
    ...(ua?.dimensions ?? []).map(d => d.issue),
  ].filter(Boolean).join(' ')

  // 1. Explicit country/city named in the description or landing page text
  const places: Array<[RegExp, string]> = [
    [/\bindia\b|\bindian\b|\bbengaluru\b|\bbangalore\b|\bmumbai\b|\bdelhi\b|\bhyderabad\b|\bpune\b|\bchennai\b|\bkolkata\b|\bgurgaon\b|\bgurugram\b|\bnoida\b/i, 'India'],
    [/\bunited kingdom\b|\b(?<![a-z])uk(?![a-z])\b|\bbritain\b|\blondon\b|\bmanchester\b/i, 'UK'],
    [/\bunited states\b|\b(?<![a-z])usa(?![a-z])\b|\bamerica\b|\bnew york\b|\bsan francisco\b|\bsilicon valley\b|\baustin\b|\bseattle\b/i, 'US'],
    [/\bsingapore\b/i, 'Singapore'],
    [/\baustralia\b|\bsydney\b|\bmelbourne\b/i, 'Australia'],
    [/\bcanada\b|\btoronto\b|\bvancouver\b/i, 'Canada'],
    [/\bdubai\b|\b(?<![a-z])uae(?![a-z])\b|\bunited arab emirates\b/i, 'UAE'],
  ]
  for (const [re, market] of places) if (re.test(text)) return market

  // 2. Currency symbols
  if (/₹/.test(text)) return 'India'
  if (/£/.test(text)) return 'UK'
  if (/€/.test(text)) return 'Europe'
  if (/\$/.test(text)) return 'US'

  // 3. TLD
  try {
    const host = new URL(url).hostname
    if (/\.in$/.test(host)) return 'India'
    if (/\.co\.uk$/.test(host)) return 'UK'
    if (/\.ca$/.test(host)) return 'Canada'
    if (/\.com\.au$/.test(host)) return 'Australia'
    if (/\.sg$/.test(host)) return 'Singapore'
    if (/\.ae$/.test(host)) return 'UAE'
  } catch { /* invalid URL — skip TLD check */ }

  // 4. Phone number format
  if (/\+91[\s-]?\d{4,5}/.test(text)) return 'India'
  if (/\+44[\s-]?\d/.test(text)) return 'UK'
  if (/\+1[\s-]?\(?\d{3}\)?/.test(text)) return 'US'

  return 'Global'
}

type Tab = 'competitive' | 'bmc' | 'swot' | 'growth' | 'pricing' | 'product'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id:'competitive', label:'Competitive',           emoji:'🔍' },
  { id:'bmc',         label:'Business Model Canvas', emoji:'🗂' },
  { id:'swot',        label:'SWOT',                  emoji:'⚡' },
  { id:'growth',      label:'Growth Strategies',     emoji:'🚀' },
  { id:'pricing',     label:'Pricing',               emoji:'💰' },
  { id:'product',     label:'AI Readiness Assessment', emoji:'🧪' },
]

export default function Insights({ onUpgrade, onEditApp }: { onUpgrade?: () => void; onEditApp?: (id: number) => void }) {
  const { currentApp, updateApp, userEmail, plan } = useStore()
  const canUseAnalysis = plan === 'analysis' || plan === 'pro' || plan === 'guest_pro'
  const [activeTab, setActiveTab] = useState<Tab>('competitive')
  const [cache, setCache] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [factsChecking, setFactsChecking] = useState(false)   // competitive pass 2 (live sources) in progress
  const [runningFull, setRunningFull] = useState(false)
  const [fullSteps, setFullSteps] = useState<Record<string,string>>({})
  // "Refresh all outdated": confirm panel, then a progress list
  const [refreshPlan, setRefreshPlan] = useState<{ keys: AnalysisKey[]; cost: number; remaining: number | null; others: AnalysisKey[] } | null>(null)
  const [refreshSteps, setRefreshSteps] = useState<Partial<Record<AnalysisKey, StepState>> | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)
  const [refreshReasons, setRefreshReasons] = useState<Partial<Record<AnalysisKey, string>>>({})   // why a step failed or was skipped
  const [briefPrompt, setBriefPrompt] = useState(false)   // one-time run with an empty founder brief

  // Load persisted analysis from app on mount / app change
  useEffect(() => {
    const saved: Record<string,string> = {}
    if (currentApp.competitive_analysis) {
      const c = readCompetitive(currentApp)   // exclusions applied
      saved['competitive'] = c ? JSON.stringify(c) : currentApp.competitive_analysis
    }
    if (currentApp.bmc_analysis)         saved['bmc']         = currentApp.bmc_analysis
    if (currentApp.swot_analysis)        saved['swot']        = currentApp.swot_analysis
    if (currentApp.growth_analysis)      saved['growth']      = currentApp.growth_analysis
    if (currentApp.pricing_analysis)     saved['pricing']     = currentApp.pricing_analysis
    setCache(saved)
  }, [currentApp.id, currentApp.founder_brief])

  const setLoad = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))
  const setFStep = (k: string, s: string) => setFullSteps(p => ({ ...p, [k]: s }))
  const setTabCache = (k: string, rawData: string, opts?: { skipCompetitorUrlAnalysis?: boolean }) => {
    // Stamp every saved analysis as built with the current context rules (no simulated test data)
    const data = markGenerated(rawData)
    setCache(p => ({ ...p, [k]: data }))
    const fieldMap: Record<string, string> = {
      competitive: 'competitive_analysis',
      bmc:         'bmc_analysis',
      swot:        'swot_analysis',
      growth:      'growth_analysis',
      pricing:     'pricing_analysis',
    }
    const tsMap: Record<string, string> = {
      competitive: 'competitive_analyzed_at',
      bmc:         'bmc_analyzed_at',
      swot:        'swot_analyzed_at',
      growth:      'growth_analyzed_at',
      pricing:     'pricing_analyzed_at',
    }
    const field = fieldMap[k]
    const tsField = tsMap[k]
    const now = new Date().toISOString()
        if (field) updateApp(currentApp.id, { [field]: data, ...(tsField ? { [tsField]: now } : {}) } as any)

    // After competitive analysis saves — run URL analysis on top competitor
    if (k === 'competitive' && !opts?.skipCompetitorUrlAnalysis) {
      try {
        const parsed  = JSON.parse(data)
        const topComp = parsed.comps?.[0]
        const topUrl  = topComp ? competitorWebsite(topComp) : null   // App Store site → verified site → model URL
        if (topUrl) {
          // Run in background — non-blocking
          fetch('/api/analyze-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-call': 'markr_internal' },
            body: JSON.stringify({ url: topUrl })
          }).then(r => r.ok ? r.json() : null).then(compAnalysis => {
            if (compAnalysis && !compAnalysis.error) {
              updateApp(currentApp.id, {
                competitor_url_analysis: {
                  name: topComp.name,
                  url: topUrl,
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

  // Sanitize, verify the payload actually parses, and only then persist.
  // Writing an unparseable string would survive reloads and guarantee the same
  // render failure on every subsequent load — the tab would be stuck showing an
  // error until the user happened to regenerate. Returns false if nothing was
  // written, leaving any previous good analysis intact.
  // Why the last run of each analysis didn't save — shown in the "Refresh finished" panel.
  // A failed run never writes the result or its timestamp (only cacheJSON → setTabCache does).
  const runErrors = useRef<Partial<Record<string, string>>>({})
  const noteRunError = (k: string, reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    runErrors.current[k] = msg
    console.error(`[insights] ${k} did not save:`, reason)
  }

  const cacheJSON = (k: string, raw: string, label: string): boolean => {
    const cleaned = extractJSON(raw)
    try {
      JSON.parse(cleaned)
    } catch (e) {
      // Truncation (hit the token cap) vs. genuinely malformed output are
      // different problems with different fixes — report them separately.
      if (looksTruncated(raw, e)) {
        console.error(`[${k}] response was cut off at the token cap — not persisting.`, e, `length: ${raw.length}`)
        toast(`${label} response was cut off — try again.`)
        noteRunError(k, `The AI response was cut off before it finished (${raw.length} characters) — nothing was saved.`)
      } else {
        console.error(`[${k}] model returned malformed JSON — not persisting.`, e, 'raw:', raw.slice(0, 300))
        toast(`${label} generation returned malformed output — please try again.`)
        noteRunError(k, `The AI returned output that isn't valid JSON (${(e as Error).message}) — nothing was saved.`)
      }
      return false
    }
    setTabCache(k, cleaned)
    return true
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
  async function genCompetitive(): Promise<RunStatus> {
    // 7-day refresh for competitive (shorter window than other tabs); outdated analyses skip it
    const daysOld = daysSince(currentApp.competitive_analyzed_at)
    if (!isAdmin(userEmail) && daysOld !== null && daysOld < 7 && !canBypassLock(currentApp, plan, 'competitive')) {
      toast(`Competitive analysis was last run ${lastUpdatedLabel(currentApp.competitive_analyzed_at).toLowerCase()}. Refreshes after 7 days.`)
      noteRunError('competitive', 'Not re-run: the refresh lock applies (it is no longer outdated, or this plan keeps the lock).')
      return 'locked'
    }
    let status: RunStatus = 'failed'
    setLoad('competitive', true)
    const rcCtx = getRecentContext()
    const vCtx  = getVisionContext(currentApp)
    const fCtx     = getFounderContext(currentApp)
    const focus    = currentApp.founder_brief?.focus_competitors ?? []
    const excluded = currentApp.founder_brief?.excluded_competitors ?? []
    const focusBlock = focus.length ? `

FOUNDER-SPECIFIED COMPETITORS — analyze these FIRST, in this order, as the first ${focus.length} entries in "comps". This overrides the LOCAL/GLOBAL quota below:
${focus.map((f, i) => `${i + 1}. ${f}`).join('\n')}
- Give each its honest type ("local" or "global").
- If you don't recognize the product behind a URL, use the domain as its name, mark details as unverified, and never invent features, pricing or positioning for it. For such entries set "unverified": true and use null for any field you cannot support.
${focus.length < 5 ? `- Then fill the remaining ${5 - focus.length} slot(s) using the discovery rules below.` : '- All 5 slots are founder-specified — do NOT auto-discover any others.'}` : ''
    const excludeBlock = excluded.length ? `

NEVER include these as competitors, or their rebrands/sub-products: ${excluded.join(', ')}` : ''
    const hasBrief = hasFounderBrief(currentApp.founder_brief)   // a cleared { updated_at } brief doesn't count
    const intentGapsRule = hasBrief ? `

INTENT GAPS (required): "intentGaps" = 1–3 short sentences naming specific gaps between the FOUNDER INTENT above and what the landing page/screenshots show, or [] if there are none.` : ''
    const priorityLine = focus.length
      ? `PRIORITY for the ${5 - focus.length} auto-discovered slot(s): local competitors first (type:"local"), then global (type:"global").`
      : `PRIORITY: list 2-3 LOCAL competitors first (type:"local"), then 2-3 GLOBAL ones (type:"global"). Total must be exactly 5 unless you explicitly noted in mktPos that genuine local competitors don't exist.`
    try {
      const ua = (currentApp as any).url_analysis
      const userMarket = currentApp.primary_market
      const detectedMarket = (userMarket && userMarket !== 'Auto-detect')
        ? userMarket
        : detectMarket(currentApp.desc || '', currentApp.url, ua)
      const appContext = `PRODUCT DETAILS:
Name: ${currentApp.name}
Description: ${currentApp.desc || ''}
URL: ${currentApp.url}
Landing page headline: ${ua?.headline || ''}
Category: ${ua?.category || currentApp.category || ''}
MARKET: ${detectedMarket}

CRITICAL: Base your competitor selection on what this product ACTUALLY DOES based on the description, headline and URL above — NOT just the product name. Only return products that directly compete with the core function described above. If unsure, rely on the description, headline and URL above.`

      const prompt = `Find 5 real direct competitors for this specific product. Prioritise local/regional competitors first.

${appContext}${rcCtx}${fCtx}${vCtx ? '\n'+vCtx+'\nUse the visible features and pricing above to judge which products truly compete on the same core function and price point.' : ''}${focusBlock}${excludeBlock}

CRITICAL — MARKET RELEVANCE:
This product operates primarily in: ${detectedMarket}
- The 2-3 LOCAL competitors MUST be companies actually operating in ${detectedMarket}. Not international brands with a presence there — companies headquartered and operating in that market.
- If you cannot name real competitors in ${detectedMarket}, say so explicitly rather than substituting global ones.
- Only after local competitors should you list global players, clearly labelled as global.

${priorityLine}

FACTS RULE: "funding", "employees", "reviews.rating", "reviews.ratingCount" and "reviews.traction" must be null unless you are certain of the exact value. Never estimate, round, or guess — null is the expected answer for most small or local companies.

CURRENCY RULE: State every price — each competitor's and ${currentApp.name}'s own — in its own currency exactly as given (e.g. "₹49/mo"). Never convert it or restate it in another currency.${intentGapsRule}

JSON only, no markdown:
{"comps":[{"name":"X","url":"https://example.com","type":"local","cat":"direct","price":"price as listed, in its own currency","strengths":["s1","s2"],"weaknesses":["w1","w2"],"threat":"High","score":8,"diff":"how ${currentApp.name} wins in one line","reason":"why this is a competitor","reviews":{"rating":null,"ratingCount":null,"traction":null},"funding":null,"employees":null,"userLoves":["specific strength users praise 1","specific strength 2","specific strength 3"],"userHates":["specific complaint users raise 1","complaint 2","complaint 3"],"positioningGap":"one specific sentence on what they genuinely cannot do that ${currentApp.name} can"}],"mktPos":"2 sentence market position","wspace":"whitespace opportunity","winCond":"win condition"${hasBrief ? ',"intentGaps":["gap 1"]' : ''}}`

      // 5 competitors, each with strengths/weaknesses/userLoves/userHates and
      // positioning fields — the largest payload in the app.
      const raw = await callClaude(prompt, 'Output ONLY valid JSON. No markdown.', 8000, undefined, 'sonnet', 'competitive')
      const cleaned = extractJSON(raw)
      if (!cleaned) throw new Error('Empty response')
      const parsed = JSON.parse(cleaned)
      if (!parsed.comps || !Array.isArray(parsed.comps) || parsed.comps.length === 0) {
        throw new Error('No competitors — keys: ' + Object.keys(parsed).join(', '))
      }

      // Founder brief is enforced in code, not just in the prompt
      // Brief URLs are pinned before ordering, so a focus competitor given as a URL
      // (e.g. amahahealth.com) also sorts first once it is this competitor's url
      parsed.comps = orderFocusFirst(applyBriefWebsites(filterExcluded(parsed.comps, currentApp), currentApp), currentApp)
      if (parsed.comps.length === 0) throw new Error('Every competitor returned was on your excluded list — try again')

      parsed.intentGaps = hasBrief && Array.isArray(parsed.intentGaps)
        ? parsed.intentGaps.filter((g: unknown) => typeof g === 'string' && g.trim()).slice(0, 3)
        : undefined

      // Enrich each competitor with live App Store data via iTunes Search API (parallel).
      // Use the storefront of this app's primary market so prices come in its currency (India → ₹),
      // falling back to the US store when the app isn't found there.
      const STOREFRONTS: Record<string, string> = { 'India': 'in', 'United States': 'us', 'US': 'us', 'United Kingdom': 'gb', 'UK': 'gb', 'Australia': 'au' }
      const storefront = STOREFRONTS[detectedMarket] ?? 'us'
      parsed.comps = await Promise.all(parsed.comps.map(async (comp: any) => {
        try {
          // Name search can return an unrelated app — only trust a hit whose title/seller matches
          const lookup = async (country: string) => {
            const res = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(comp.name)}&entity=software&limit=3&country=${country}`,
              { signal: AbortSignal.timeout(4000) }
            )
            if (!res.ok) return null
            const data = await res.json()
            return (data.results ?? []).find((h: any) => itunesNameMatches(comp.name, h)) ?? null
          }
          let store = storefront
          let hit = await lookup(store)
          if (!hit && store !== 'us') { store = 'us'; hit = await lookup(store) }
          if (!hit) return comp
          const monthsAgo = hit.currentVersionReleaseDate
            ? Math.max(0, Math.floor((Date.now() - new Date(hit.currentVersionReleaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30.5)))
            : null
          return {
            ...comp,
            appStore: {
              rating:       hit.averageUserRating != null ? Math.round(hit.averageUserRating * 10) / 10 : null,
              ratingCount:  hit.userRatingCount ?? null,
              // iTunes' own formatted price is in the storefront's currency (e.g. "₹99.00")
              price:        hit.price === 0 ? 'Free' : typeof hit.formattedPrice === 'string' ? hit.formattedPrice : null,
              storefront:   store,
              updatedMonths: monthsAgo,
              sellerUrl:    typeof hit.sellerUrl === 'string' ? hit.sellerUrl : null,
              trackViewUrl: typeof hit.trackViewUrl === 'string' ? hit.trackViewUrl : null,
            },
          }
        } catch {
          return comp
        }
      }))

      // Pass 1 is saved immediately — pass 2 can never lose it
      setTabCache('competitive', JSON.stringify(parsed), { skipCompetitorUrlAnalysis: true })
      setLoad('competitive', false)
      toast('Competitive intelligence ready — checking live sources…')

      // Pass 2: sourced facts via server-side web search
      status = 'ok'   // pass 1 is saved from here on

      setFactsChecking(true)
      let limitHit = false
      try {
        const { comps, note, searchesUsed, budget, limitHit: factsLimit } = await addLiveFacts(parsed.comps)
        parsed.comps = comps
        limitHit = factsLimit
        if (note) parsed.facts_note = note; else delete parsed.facts_note
        // Websites still unconfirmed after pass 2 get one targeted search each, if budget remains
        const remaining = budget - searchesUsed
        if (!limitHit && remaining > 0 && parsed.comps.some(needsWebsiteSearch)) {
          const found = await findMissingWebsites(parsed.comps, remaining)
          parsed.comps = found.comps
          limitHit = found.limitHit
        }
      } finally {
        setFactsChecking(false)
      }
      setTabCache('competitive', JSON.stringify(parsed))   // final save + URL analysis on verified site
      toast(parsed.facts_note ? 'Live source check incomplete — see note' : 'Live sources checked ✓')
      if (limitHit) {
        status = 'saved_then_limit'
        noteRunError('competitive', 'Competitors saved, but the live source check stopped at the daily AI limit.')
      }
    } catch(e) {
      toast('Error: '+(e as Error).message)
      noteRunError('competitive', e)
      if (e instanceof AiLimitError) status = status === 'ok' ? 'saved_then_limit' : 'limit'
    }
    setLoad('competitive', false)
    return status
  }

  // ── COMPETITIVE pass 2: sourced facts ──────────────────────────────────────
  const FACTS_SYSTEM = 'You are a careful researcher. Use web search. Output ONLY valid JSON, no markdown.'
  const factsPrompt = (batch: any[]) => `For each competitor below, use web search to find: official website, current pricing, total funding raised, team size.

${batch.map((c, i) => `${i + 1}. ${c.name}${
    c.brief_url ? ` (website given by the founder: ${c.brief_url} — use it as the website, don't search for one)`
    : c.url ? ` (guessed URL, may be wrong: ${c.url})` : ''}`).join('\n')}

- website: the company's real official site, found in your search results. Don't repeat a guessed URL unless a search result confirms it.

RULES:
- Only include a value that a search result you retrieved directly states. Put that result's exact URL in source_url.
- If no result directly supports a value, use null. Never estimate, infer, round, or combine figures.
- Use the competitor names exactly as written above, in the same order.

SOURCE PREFERENCE (use other sites only if none of these have it):
- pricing: the company's own website, or its App Store / Google Play listing.
- funding and team_size: Crunchbase, Tracxn, PitchBook, LinkedIn, or a named news outlet.

PRICING:
- pricing must be the product's own subscription or plan price (e.g. "₹49/month Premium", "$69.99/year").
- If you only find a different kind of price (e.g. per therapy session, per seat setup fee), keep it but say what it is in the value, e.g. "₹1,500 per therapy session (no subscription price found)".
- Write every price in its own currency exactly as the source shows it. Never convert currencies.

Output ONLY JSON (website, pricing, funding and team_size may each be null):
{"competitors":[{"name":"…","website":{"value":"https://…","source_url":"https://…"},"pricing":{"value":"…","source_url":"https://…"},"funding":{"value":"…","source_url":"https://…"},"team_size":{"value":"…","source_url":"https://…"}}]}`

  // Sequential batches: each call counts against the daily limit, and the
  // rate-limit counter is read-then-write, so parallel calls could undercount.
  async function addLiveFacts(comps: any[]): Promise<{ comps: any[]; note: string | null; searchesUsed: number; budget: number; limitHit: boolean }> {
    const out = [...comps]
    const failures: string[] = []
    let limitHit = false
    const batches = Math.ceil(comps.length / FACTS_BATCH)
    let searchesUsed = 0
    for (let i = 0; i < comps.length; i += FACTS_BATCH) {
      const batch = comps.slice(i, i + FACTS_BATCH)
      try {
        const raw = await callClaude(factsPrompt(batch), FACTS_SYSTEM, 4000, undefined, 'haiku', 'competitive_facts', undefined, { webSearch: { maxUses: FACTS_MAX_USES } })
        const result  = JSON.parse(raw)   // already source-checked on the server
        const entries = Array.isArray(result.competitors) ? result.competitors : []
        const checkedAt = typeof result.checked_at === 'string' ? result.checked_at : new Date().toISOString()
        // Unknown count (older server) counts as the full allowance, so no extra searches run
        searchesUsed += Number.isFinite(result.search_requests) ? Number(result.search_requests) : FACTS_MAX_USES
        batch.forEach((c, j) => { out[i + j] = applyFacts(c, findFactsEntry(entries, c, j), checkedAt) })
      } catch (e) {
        failures.push((e as Error).message)
        searchesUsed += FACTS_MAX_USES   // don't spend more after a failure
        if (e instanceof AiLimitError) { limitHit = true; break }
      }
    }
    return {
      comps: out,
      budget: batches * FACTS_MAX_USES,
      searchesUsed,
      limitHit,
      note: failures.length
        ? `Live source check skipped for ${failures.length === batches ? 'all' : 'some'} competitors — ${failures[0]}`
        : null,
    }
  }

  // Targeted website search for competitors pass 2 checked but couldn't confirm a website for.
  // One search per competitor, within the remaining budget. The server applies the same rules:
  // a website is kept only if a returned result is on that domain, or is named after the company.
  const websitePrompt = (names: string[]) => `Find the official website of each company below. For each one, run one web search for "<company name> official website" and take the company's own site from the results.

${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

RULES:
- The website must be a URL from your search results, on the company's own domain — not a directory, app store, social network or news site.
- If the results don't show the company's own site, use null. Never guess a domain.
- Use the names exactly as written above, in the same order.

Output ONLY JSON:
{"competitors":[{"name":"…","website":{"value":"https://…","source_url":"https://…"}}]}`

  async function findMissingWebsites(comps: any[], maxSearches: number): Promise<{ comps: any[]; limitHit: boolean }> {
    const targets = comps.filter(needsWebsiteSearch).slice(0, maxSearches)
    if (!targets.length) return { comps, limitHit: false }
    try {
      const raw = await callClaude(websitePrompt(targets.map(c => c.name)), FACTS_SYSTEM, 1500, undefined, 'haiku', 'competitive_facts', undefined, { webSearch: { maxUses: targets.length } })
      const result  = JSON.parse(raw)
      const entries = Array.isArray(result.competitors) ? result.competitors : []
      const checkedAt = typeof result.checked_at === 'string' ? result.checked_at : new Date().toISOString()
      return {
        comps: comps.map(c => {
          const j = targets.indexOf(c)
          return j === -1 ? c : applyWebsiteFact(c, findFactsEntry(entries, c, j), checkedAt)
        }),
        limitHit: false,
      }
    } catch (e) {
      // Not worth a user-facing note: pass 2's facts are already saved; these stay unconfirmed
      console.warn('[competitive] targeted website search skipped:', (e as Error).message)
      return { comps, limitHit: e instanceof AiLimitError }
    }
  }

  // ── BMC ──────────────────────────────────────────────────────────────────────
  async function genBMC(): Promise<RunStatus> {
    // Monthly limit check — skip for admin; outdated analyses skip it too
    if (!canRefresh(currentApp.bmc_analyzed_at, userEmail) && !canBypassLock(currentApp, plan, 'bmc')) {
      toast(`Analysis was last run ${lastUpdatedLabel(currentApp.bmc_analyzed_at).toLowerCase()}. Refreshes once per month to avoid redundant AI calls.`)
      noteRunError('bmc', 'Not re-run: the refresh lock applies (it is no longer outdated, or this plan keeps the lock).')
      return 'locked'
    }
    let status: RunStatus = 'failed'
    setLoad('bmc', true)
    const ptCtx = getTestContext(currentApp)
    const vCtx  = getVisionContext(currentApp)
    const fCtx  = getFounderContext(currentApp)
    const igCtx = getInstagramContext(currentApp)
    try {
      const prompt = `Build a complete Business Model Canvas for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${ptCtx ? '\n'+ptCtx+'\nValue propositions must reflect REAL features from product testing.' : ''}${fCtx}${vCtx ? '\n'+vCtx+'\nValue propositions and revenue streams must match features and pricing visible in the screenshots.' : ''}

${igCtx}
${COMPETITOR_FACTS_RULE}
Output ONLY valid JSON:
{"key_partners":["3-4 real partner types"],"key_activities":["3-4 core activities"],"key_resources":["3-4 key assets"],"value_propositions":["3-4 specific value props"],"customer_relationships":["2-3 relationship modes"],"channels":["3-4 channels"],"customer_segments":["2-3 specific segments"],"cost_structure":["3-4 major costs"],"revenue_streams":["2-3 revenue streams"],"unfair_advantage":"1 sentence"}`

      const raw = await callClaude(prompt, 'Output ONLY valid JSON. No markdown.', 2500, undefined, 'haiku', 'bmc')
      if (cacheJSON('bmc', raw, 'Business Model Canvas')) { toast('Business Model Canvas ready!'); status = 'ok' }
    } catch(e) { toast('Error: '+(e as Error).message); noteRunError('bmc', e); if (e instanceof AiLimitError) status = 'limit' }
    setLoad('bmc', false)
    return status
  }

  // ── SWOT ─────────────────────────────────────────────────────────────────────
  async function genSWOT(): Promise<RunStatus> {
    // Monthly limit check — skip for admin; outdated analyses skip it too
    if (!canRefresh(currentApp.swot_analyzed_at, userEmail) && !canBypassLock(currentApp, plan, 'swot')) {
      toast(`Analysis was last run ${lastUpdatedLabel(currentApp.swot_analyzed_at).toLowerCase()}. Refreshes once per month to avoid redundant AI calls.`)
      noteRunError('swot', 'Not re-run: the refresh lock applies (it is no longer outdated, or this plan keeps the lock).')
      return 'locked'
    }
    let status: RunStatus = 'failed'
    setLoad('swot', true)
    const ptCtx = getTestContext(currentApp)
    const vCtx  = getVisionContext(currentApp)
    const fCtx  = getFounderContext(currentApp)
    const rcCtx = getRecentContext()
    const igCtx = getInstagramContext(currentApp, 'Treat a large following as a Strength and a small one relative to post count as a Weakness — reference the actual numbers.')
    try {
      const prompt = `You are a sharp strategic advisor. Create an intelligent, actionable SWOT for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${ptCtx ? '\n'+ptCtx+'\nStrengths and Weaknesses MUST reference specific features from product test.' : ''}${fCtx}${vCtx ? '\n'+vCtx+'\nUse visible trust signals as Strength evidence and visible friction points / UI issues as Weakness evidence — cite them.' : ''}${rcCtx}

${igCtx}

${COMPETITOR_FACTS_RULE}

SCORING RULES — you MUST calculate each component score honestly based on actual evidence:
- strength_score (0-25): High strength = +8pts, Medium = +5pts, Low = +3pts. Cap at 25.
- weakness_score (0-25): Start at 25. High weakness = -8pts, Medium = -4pts, Low = -1pt. Floor at 0.
- opportunity_score (0-25): High opportunity = +8pts, Medium = +5pts. Cap at 25.
- threat_score (0-25): Start at 25. High threat = -8pts, Medium = -4pts. Floor at 0.
- overall_score = sum of all four components (0-100)

HONEST BENCHMARKS — do NOT default to 70-75:
- 20-40: struggling, unvalidated, high risk
- 41-55: early with real problems to fix
- 56-68: solid foundation but gaps remain
- 69-79: strong with clear path forward
- 80+: proven traction (rare — only if strong evidence)

Exactly 3 points per quadrant. For EVERY point: rating (High/Medium/Low), specific evidence (not generic), specific action, owner, timeframe.
Keep it tight: point ≤ 12 words, evidence ≤ 20 words, action ≤ 15 words, verdict one sentence.

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
    { "point": "specific strength", "rating": "High", "evidence": "concrete reason", "action": "specific leverage tactic", "owner": "product" }
  ],
  "weaknesses": [
    { "point": "specific weakness unique to this app", "rating": "High", "evidence": "concrete reason this hurts growth", "action": "specific fix step", "owner": "product", "timeframe": "Week 1-2" },
    { "point": "specific weakness", "rating": "Medium", "evidence": "concrete reason", "action": "specific fix", "owner": "dev", "timeframe": "Month 1" },
    { "point": "specific weakness", "rating": "High", "evidence": "concrete reason", "action": "specific fix", "owner": "founder", "timeframe": "Week 1" }
  ],
  "opportunities": [
    { "point": "specific opportunity for this app", "rating": "High", "evidence": "concrete reason this is real and addressable now", "action": "specific capture step", "owner": "founder", "timeframe": "Month 1" },
    { "point": "specific opportunity", "rating": "High", "evidence": "concrete reason", "action": "specific capture step", "owner": "marketing", "timeframe": "Month 2" },
    { "point": "specific opportunity", "rating": "Medium", "evidence": "concrete reason", "action": "specific capture step", "owner": "product", "timeframe": "Quarter 2" }
  ],
  "threats": [
    { "point": "specific threat to this app", "rating": "High", "evidence": "concrete reason this is dangerous", "action": "specific defence step", "owner": "founder", "timeframe": "Immediate" },
    { "point": "specific threat", "rating": "Medium", "evidence": "concrete reason", "action": "specific defence", "owner": "product", "timeframe": "Month 1" },
    { "point": "specific threat", "rating": "High", "evidence": "concrete reason", "action": "specific defence", "owner": "marketing", "timeframe": "Month 1" }
  ],
  "top_actions": [
    { "priority": 1, "action": "Most important action NOW — specific to this app only", "category": "weakness", "impact": "High", "timeframe": "This week" },
    { "priority": 2, "action": "Second most important action — specific", "category": "opportunity", "impact": "High", "timeframe": "Month 1" },
    { "priority": 3, "action": "Third action — specific", "category": "strength", "impact": "Medium", "timeframe": "Month 2" }
  ]
}`

      // 12 rated items (3 per quadrant) + top_actions + scores, with word limits — sized to finish well
      // inside the 60s function limit (16 unbounded items used to run past 3,000 output tokens).
      const raw = await callClaude(prompt, 'Output ONLY valid JSON. Be specific and honest — no generic consulting filler.', 4000, undefined, 'haiku', 'swot')
      if (cacheJSON('swot', raw, 'SWOT')) { toast('SWOT analysis ready!'); status = 'ok' }
    } catch(e) { toast('Error: '+(e as Error).message); noteRunError('swot', e); if (e instanceof AiLimitError) status = 'limit' }
    setLoad('swot', false)
    return status
  }

  // ── GROWTH ───────────────────────────────────────────────────────────────────
  async function genGrowth(): Promise<RunStatus> {
    // Monthly limit check — skip for admin; outdated analyses skip it too
    if (!canRefresh(currentApp.growth_analyzed_at, userEmail) && !canBypassLock(currentApp, plan, 'growth')) {
      toast(`Analysis was last run ${lastUpdatedLabel(currentApp.growth_analyzed_at).toLowerCase()}. Refreshes once per month to avoid redundant AI calls.`)
      noteRunError('growth', 'Not re-run: the refresh lock applies (it is no longer outdated, or this plan keeps the lock).')
      return 'locked'
    }
    let status: RunStatus = 'failed'
    setLoad('growth', true)
    const ptCtx  = getTestContext(currentApp)
    const vCtx   = getVisionContext(currentApp)
    const fCtx   = getFounderContext(currentApp)
    const rcCtx  = getRecentContext()
    const igCtx  = getInstagramContext(currentApp, 'Treat an existing audience as a distribution asset that changes which tactics apply.')

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
${ptCtx}${fCtx}${vCtx}${rcCtx}${existingCtx}

${igCtx}

${COMPETITOR_FACTS_RULE}

RULES — this must NOT be generic:
1. Every tactic MUST reference specific features, competitor weaknesses, or SWOT findings above
2. Acquisition tactics must name specific channels relevant to this app's audience (not just "social ads")
3. Activation tactics must reference the actual app features users need to reach
4. Retention tactics must be specific to this app's category and user behaviour
5. Revenue tactics must align with the pricing model and customer segments
6. Each title should be a specific action (e.g. "Partner with Indian pediatricians for Tiny Tummies" not "Influencer Marketing")
7. NO generic tactics — if it could apply to any app, rewrite it
8. If PRODUCT UI is provided, activation and revenue tactics must address the specific onboarding/paywall friction points listed there

2 tactics per lane. Each description max 25 words.
Output ONLY valid JSON:
{"top_priority":"single most impactful specific 30-day action for THIS app","acquisition":[{"title":"specific tactic name","description":"specific 1 sentence action referencing app features or competitors","impact":"High","effort":"Low","timeframe":"Week 1-2"},{"title":"specific tactic","description":"specific action","impact":"Medium","effort":"Medium","timeframe":"Week 2-4"}],"activation":[{"title":"specific tactic","description":"specific action referencing actual app feature","impact":"High","effort":"Low","timeframe":"Week 1"},{"title":"specific tactic","description":"specific action","impact":"High","effort":"Medium","timeframe":"Week 2-3"}],"retention":[{"title":"specific tactic","description":"specific action unique to this app category","impact":"High","effort":"Low","timeframe":"Ongoing"},{"title":"specific tactic","description":"specific action","impact":"Medium","effort":"Medium","timeframe":"Month 2"}],"revenue":[{"title":"specific tactic","description":"specific monetisation action for this app","impact":"High","effort":"Medium","timeframe":"Month 1"},{"title":"specific tactic","description":"specific action","impact":"Medium","effort":"Low","timeframe":"Month 2"}],"referral":[{"title":"specific tactic","description":"specific referral mechanic for this app's users","impact":"Medium","effort":"Low","timeframe":"Month 2"},{"title":"specific tactic","description":"specific action","impact":"High","effort":"Medium","timeframe":"Month 3"}]}`

      // 5 lanes x 2 tactics x 5 fields, plus top_priority.
      const raw = await callClaude(prompt, 'Output ONLY valid JSON. Every tactic must be specific to this exact app — no generic advice. No trailing commas.', 5000, undefined, 'haiku', 'growth')
      if (cacheJSON('growth', raw, 'Growth playbook')) { toast('Growth playbook ready!'); status = 'ok' }
    } catch(e) { toast('Error: '+(e as Error).message); noteRunError('growth', e); if (e instanceof AiLimitError) status = 'limit' }
    setLoad('growth', false)
    return status
  }

  // ── PRICING ──────────────────────────────────────────────────────────────────
  async function genPricing(): Promise<RunStatus> {
    // Monthly limit check — skip for admin; outdated analyses skip it too
    if (!canRefresh(currentApp.pricing_analyzed_at, userEmail) && !canBypassLock(currentApp, plan, 'pricing')) {
      toast(`Analysis was last run ${lastUpdatedLabel(currentApp.pricing_analyzed_at).toLowerCase()}. Refreshes once per month to avoid redundant AI calls.`)
      noteRunError('pricing', 'Not re-run: the refresh lock applies (it is no longer outdated, or this plan keeps the lock).')
      return 'locked'
    }
    let status: RunStatus = 'failed'
    setLoad('pricing', true)
    const ptCtx = getTestContext(currentApp)
    const vCtx  = getVisionContext(currentApp)
    const fCtx  = getFounderContext(currentApp)
    const rcCtx = getRecentContext()
    const igCtx = getInstagramContext(currentApp)
    try {
      const prompt = `Complete pricing strategy for "${currentApp.name}" — ${currentApp.category} (${currentApp.stage}, ${currentApp.platform}).${currentApp.desc ? ' '+currentApp.desc : ''}${ptCtx ? '\n'+ptCtx+'\nPricing must reflect real product quality from testing.' : ''}${fCtx}${vCtx ? '\n'+vCtx+'\nIf current prices or trial terms are visible above, treat them as the CURRENT pricing — critique and build on them rather than inventing from scratch. Mention them in benchmark_note.' : ''}

${igCtx}
${COMPETITOR_FACTS_RULE}
Output ONLY valid JSON:
{"strategy_type":"Freemium/Usage-based/Flat-rate/Tiered","strategy_rationale":"2 sentence explanation","tiers":[{"name":"tier","price":"$X/mo","target":"5 words","features":["3-4 features"],"recommended":true,"conversion_note":"1 sentence"},{"name":"tier","price":"$X/mo","target":"5 words","features":["3-4 features"],"recommended":false,"conversion_note":"1 sentence"},{"name":"tier","price":"$X/mo","target":"5 words","features":["3-4 features"],"recommended":false,"conversion_note":"1 sentence"}],"monetization_angles":[{"angle":"name","description":"1 sentence","revenue_potential":"High"},{"angle":"name","description":"1 sentence","revenue_potential":"Medium"},{"angle":"name","description":"1 sentence","revenue_potential":"Medium"},{"angle":"name","description":"1 sentence","revenue_potential":"Low"}],"pricing_risks":["risk 1","risk 2","risk 3"],"benchmark_note":"1 sentence"}`

      // 3 tiers with nested feature lists, 4 monetization angles, risks.
      const raw = await callClaude(prompt, 'Output ONLY valid JSON.', 3000, undefined, 'haiku', 'pricing')
      if (cacheJSON('pricing', raw, 'Pricing plan')) { toast('Pricing plan ready!'); status = 'ok' }
    } catch(e) { toast('Error: '+(e as Error).message); noteRunError('pricing', e); if (e instanceof AiLimitError) status = 'limit' }
    setLoad('pricing', false)
    return status
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

  // One-time (Analysis Pack) runs can't be redone for free — nudge for the founder brief first
  function requestRunFull() {
    if (plan === 'analysis' && !currentApp.analysis_used_at && !hasFounderBrief(currentApp.founder_brief)) {
      setBriefPrompt(true)
      return
    }
    runFullAnalysis()
  }

  // ── Re-run one analysis / refresh all outdated ─────────────────────────────
  // Generators are read from a ref updated every render, so a later step in
  // "Refresh all" sees the results an earlier step just saved (e.g. Growth
  // cross-references the freshly re-run Competitive and SWOT).
  const genRef = useRef<Partial<Record<AnalysisKey, () => Promise<RunStatus>>>>({})
  genRef.current = { competitive: genCompetitive, bmc: genBMC, swot: genSWOT, growth: genGrowth, pricing: genPricing }
  const runAnalysis = (key: AnalysisKey): Promise<RunStatus> => {
    delete runErrors.current[key]   // so a reason shown afterwards always belongs to this run
    return genRef.current[key]?.() ?? Promise.resolve<RunStatus>('failed')
  }

  // Map a run's status to a progress state + the reason the generator recorded
  const applyRunResult = (k: AnalysisKey, status: RunStatus, steps: Partial<Record<AnalysisKey, StepState>>, reasons: Partial<Record<AnalysisKey, string>>) => {
    const saved = status === 'ok' || status === 'saved_then_limit'
    steps[k] = saved ? 'done' : status === 'locked' ? 'skipped' : 'failed'
    if (saved && status === 'ok') delete reasons[k]
    else reasons[k] = runErrors.current[k] ?? (status === 'limit' ? 'Daily AI limit reached.' : 'It did not save — no error details were recorded.')
    console.info(`[insights] refresh ${k}: ${status}${reasons[k] ? ` — ${reasons[k]}` : ''}`)
    return saved
  }

  async function retryRefreshStep(k: AnalysisKey) {
    if (refreshing) return
    setRefreshing(true)
    const steps = { ...(refreshSteps ?? {}), [k]: 'active' as StepState }
    const reasons = { ...refreshReasons }
    delete reasons[k]
    setRefreshSteps({ ...steps }); setRefreshReasons({ ...reasons })
    setActiveTab(k as Tab)
    const status = await runAnalysis(k)
    applyRunResult(k, status, steps, reasons)
    setRefreshSteps({ ...steps }); setRefreshReasons({ ...reasons })
    setRefreshing(false)
  }

  async function openRefreshAll() {
    const keys = outdatedKeys(currentApp)
    if (!keys.length) return
    setRefreshNote(null)
    setRefreshSteps(null)
    const usage = await getAiUsage()
    setRefreshPlan({
      keys,
      cost: callCost(keys),
      remaining: usage ? usage.remaining : null,
      others: outdatedKeys(currentApp, ['positioning', 'gtm']).filter(k => k === 'positioning' ? !!currentApp.positioning_analysis : !!currentApp.gtm_analysis),
    })
  }

  async function startRefreshAll() {
    if (!refreshPlan) return
    const keys = refreshPlan.keys
    setRefreshPlan(null)
    setRefreshing(true)
    const steps: Partial<Record<AnalysisKey, StepState>> = Object.fromEntries(keys.map(k => [k, 'pending' as StepState]))
    const reasons: Partial<Record<AnalysisKey, string>> = {}
    setRefreshSteps({ ...steps }); setRefreshReasons({})
    let done = 0
    let stoppedAt: number | null = null
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      steps[k] = 'active'; setRefreshSteps({ ...steps })
      setActiveTab(k as Tab)
      const status = await runAnalysis(k)
      if (applyRunResult(k, status, steps, reasons)) done++
      setRefreshSteps({ ...steps }); setRefreshReasons({ ...reasons })
      if (status === 'limit' || status === 'saved_then_limit') { stoppedAt = i + 1; break }
      await new Promise(r => setTimeout(r, 0))   // let React re-render so the next step sees fresh results
    }
    if (stoppedAt !== null) {
      const notRun = keys.slice(stoppedAt)
      notRun.forEach(k => { steps[k] = 'skipped' })
      setRefreshSteps({ ...steps })
      setRefreshNote(`Daily AI limit reached — ${notRun.length} ${notRun.length === 1 ? 'analysis' : 'analyses'} not run. Completed ones are saved.`)
    }
    setRefreshing(false)
    toast(stoppedAt !== null ? `Refreshed ${done} of ${keys.length} — daily limit reached` : `Refreshed ${done} of ${keys.length} outdated analyses ✓`, 5000)
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
            onClick={requestRunFull}
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

        {/* One-time run with an empty founder brief */}
        {briefPrompt && !runningFull && (
          <div style={{ marginTop:14, padding:'14px 16px', borderRadius:'var(--r)', background:'rgba(124,111,247,.06)', border:'1px solid rgba(124,111,247,.3)' }}>
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, marginBottom:10 }}>
              <strong>Add your founder brief first</strong> — this analysis will use it, and one-time runs can't be redone for free.
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
              <button className="gen-btn" style={{ fontSize:12, padding:'7px 16px' }}
                onClick={() => { setBriefPrompt(false); onEditApp?.(currentApp.id) }}>
                Add brief
              </button>
              <button className="vbtn" onClick={() => { setBriefPrompt(false); runFullAnalysis() }}>Run anyway</button>
            </div>
          </div>
        )}

        {/* Refresh all outdated — subscribers only; a used one-time run re-runs via "Buy another analysis" */}
        {canUseAnalysis && !isOneTimeUsed(currentApp, plan) && !runningFull && (() => {
          const outdated = outdatedKeys(currentApp)
          const showButton = outdated.length > 0 && !refreshPlan && !refreshing
          if (!showButton && !refreshPlan && !refreshSteps) return null
          return (
            <div style={{ marginTop:14 }}>
              {showButton && (
                <button className="vbtn" onClick={openRefreshAll}
                  style={{ fontSize:12, color:'var(--amber)', borderColor:'rgba(245,166,35,.4)' }}>
                  ⚠️ Refresh all outdated ({outdated.length})
                </button>
              )}

              {refreshPlan && (
                <div style={{ padding:'14px 16px', borderRadius:'var(--r)', background:'rgba(245,166,35,.06)', border:'1px solid rgba(245,166,35,.3)' }}>
                  <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }}>
                    Re-runs <strong>{refreshPlan.keys.length} {refreshPlan.keys.length === 1 ? 'analysis' : 'analyses'}</strong>: {refreshPlan.keys.map(k => ANALYSES[k].label).join(', ')}
                    {' · '}uses up to <strong>{refreshPlan.cost} AI calls</strong>{refreshPlan.keys.includes('competitive') && ' (Competitive counts as up to 3)'}
                    {' · '}{refreshPlan.remaining !== null
                      ? <><strong>{refreshPlan.remaining} left today</strong></>
                      : <>couldn't check how many calls you have left today</>}
                  </div>
                  {refreshPlan.remaining !== null && refreshPlan.cost > refreshPlan.remaining && (
                    <div style={{ fontSize:12, color:'var(--amber)', marginTop:6 }}>
                      May stop partway at the daily limit — completed analyses stay saved.
                    </div>
                  )}
                  {refreshPlan.others.length > 0 && (
                    <div style={{ fontSize:12, color:'var(--text3)', marginTop:6 }}>
                      Also outdated: {refreshPlan.others.map(k => ANALYSES[k].label).join(', ')} — re-run {refreshPlan.others.length === 1 ? 'it' : 'them'} from {refreshPlan.others.length === 1 ? 'its' : 'their'} own tab.
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, marginTop:10 }}>
                    <button className="gen-btn" style={{ fontSize:12, padding:'7px 16px' }} onClick={startRefreshAll}>Start</button>
                    <button className="vbtn" onClick={() => setRefreshPlan(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {refreshSteps && (
                <div style={{ marginTop: refreshPlan || showButton ? 10 : 0, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'12px 16px', display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', letterSpacing:'.06em', textTransform:'uppercase' as const, marginBottom:4 }}>
                    {refreshing ? 'Refreshing outdated analyses…' : 'Refresh finished'}
                  </div>
                  {(Object.entries(refreshSteps) as [AnalysisKey, StepState][]).map(([k, s]) => (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:10, fontSize:12,
                      color: s==='done' ? 'var(--green)' : s==='active' ? 'var(--accent2)' : s==='failed' ? 'var(--red)' : 'var(--text3)' }}>
                      <span style={{ fontSize:13, width:16, textAlign:'center' as const, flexShrink:0 }}>
                        {s==='done' ? '✓' : s==='active' ? '◉' : s==='failed' ? '✗' : s==='skipped' ? '⏸' : '○'}
                      </span>
                      <span style={{ flex:'0 0 auto', minWidth:110 }}>{ANALYSES[k].label}</span>
                      <span style={{ flex:1, fontSize:11, color: s==='failed' ? 'var(--red)' : 'var(--text3)', lineHeight:1.45 }}>
                        {s==='active' && 'Re-running…'}
                        {s==='done' && refreshReasons[k] && refreshReasons[k]}
                        {s==='failed' && (refreshReasons[k] ?? 'Failed')}
                        {s==='skipped' && (refreshReasons[k] ?? 'Not run')}
                      </span>
                      {s==='failed' && !refreshing && (
                        <button className="vbtn" style={{ fontSize:10, padding:'2px 8px', flexShrink:0 }} onClick={() => { void retryRefreshStep(k) }}>Retry</button>
                      )}
                    </div>
                  ))}
                  {refreshNote && <div style={{ fontSize:12, color:'var(--amber)', marginTop:4 }}>{refreshNote}</div>}
                  {!refreshing && (
                    <button className="vbtn" style={{ alignSelf:'flex-start', marginTop:4, fontSize:11 }} onClick={() => { setRefreshSteps(null); setRefreshNote(null) }}>Dismiss</button>
                  )}
                </div>
              )}
            </div>
          )
        })()}
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
              // An outdated analysis can be re-run now, so don't show the lock countdown for it
              const locked = !canRefresh(ts, userEmail) && !canBypassLock(currentApp, plan, activeTab as AnalysisKey)
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
            {activeTab !== 'product' && cache[activeTab] && isOutdated(currentApp, activeTab as AnalysisKey) && (
              <OutdatedNotice
                reason={outdatedReason(currentApp, activeTab as AnalysisKey) ?? 'inputs'}
                onRerun={() => { void runAnalysis(activeTab as AnalysisKey) }}
                busy={!!loading[activeTab] || refreshing}
                oneTimeUsed={isOneTimeUsed(currentApp, plan)}
                onUpgrade={onUpgrade}
              />
            )}
            {activeTab === 'competitive' && (
              <CompetitiveTab data={cache.competitive} loading={loading.competitive} checking={factsChecking} onGenerate={genCompetitive} appName={currentApp.name} />
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
          </>
        )}
      </div>
    </div>
  )
}

// ── COMPETITIVE TAB ──────────────────────────────────────────────────────────
// Shown on founder-specified competitors the model couldn't identify from their URL
function UnverifiedBadge() {
  return (
    <span title="Markr couldn't verify details for this URL." style={{ fontSize:9, padding:'2px 6px', borderRadius:20, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'.04em', background:'rgba(245,166,35,.12)', color:'var(--amber)', cursor:'help' }}>
      Unverified
    </span>
  )
}

// AI-recalled facts (funding, team size, ratings) often come back as filler strings instead of null
const MISSING_ESTIMATE = /^(null|none|unknown|n\/?a|-|—|unverified|undisclosed|not (available|known|verified))$/i
function cleanEstimate(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return !s || MISSING_ESTIMATE.test(s) ? null : s
}

function AiEstimateTag() {
  return (
    <span title="Recalled by AI, not checked against a live source." style={{ display:'inline-block', fontSize:9, padding:'1px 5px', borderRadius:20, fontWeight:700, letterSpacing:'.04em', marginLeft:4, background:'var(--surface3)', color:'var(--text3)', cursor:'help', whiteSpace:'nowrap' as const }}>
      AI estimate
    </span>
  )
}

function NotVerified() {
  return <span style={{ fontSize:11, color:'var(--text3)' }}>Not verified</span>
}

const fmtChecked = (iso: string) => {
  try { return new Date(iso).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' }) } catch { return '' }
}

function NotFound() {
  return <span style={{ fontSize:11, color:'var(--text3)' }}>Not found</span>
}

// Clickable source domain + "checked <date>"
function SourceLink({ url, checkedAt }: { url: string; checkedAt?: string }) {
  return (
    <>
      <a href={url} target="_blank" rel="noopener noreferrer" title={url}
        style={{ fontSize:10, color:'var(--accent2)', marginLeft:5, textDecoration:'none', whiteSpace:'nowrap' as const }}>
        {sourceDomain(url)} ↗
      </a>
      {checkedAt && <span style={{ fontSize:10, color:'var(--text3)', marginLeft:4, whiteSpace:'nowrap' as const }}>checked {fmtChecked(checkedAt)}</span>}
    </>
  )
}

// Competitor website: the founder's own URL is labelled "from your brief"; a confirmed site
// (App Store lookup or same-domain search result) gets "✓ verified"; an unconfirmed model URL
// is shown plain, with no label.
function WebsiteLink({ c }: { c: any }) {
  const site = competitorWebsite(c)
  if (!site) return null
  const conf = confirmedWebsite(c)
  const checked = typeof c.facts_checked_at === 'string' ? `, checked ${fmtChecked(c.facts_checked_at)}` : ''
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:2 }}>
      <a href={site} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:'var(--text3)', textDecoration:'none' }}>{sourceDomain(site)}</a>
      {conf?.via === 'brief' && (
        <span title="Website given in your founder brief — not replaced by analysis or search" style={{ fontSize:9, color:'var(--accent2)', marginLeft:3, cursor:'help', whiteSpace:'nowrap' as const }}>from your brief</span>
      )}
      {conf?.via === 'app_store' && <>
        <SrcBadgeStatic text="Live" />
        <span title="Developer website from the App Store listing" style={{ fontSize:9, color:'var(--green)', marginLeft:3, cursor:'help' }}>✓ verified</span>
      </>}
      {conf?.via === 'search' && conf.source_url && (
        <a href={conf.source_url} target="_blank" rel="noopener noreferrer"
          title={`Confirmed by a search result on this domain: ${conf.source_url}${checked}`}
          style={{ fontSize:9, color:'var(--green)', textDecoration:'none', marginLeft:3 }}>✓ verified</a>
      )}
    </span>
  )
}

// Same look as CompetitiveTab's live SrcBadge, usable outside it
function SrcBadgeStatic({ text }: { text: string }) {
  return (
    <span style={{ display:'inline-block', fontSize:9, padding:'1px 5px', borderRadius:20, fontWeight:700, letterSpacing:'.04em', marginLeft:4, background:'rgba(245,166,35,.15)', color:'var(--amber)' }}>{text}</span>
  )
}

function LowConfidenceTag() {
  return (
    <span title="Source isn't the company's own site, an app store, or a recognised database or news outlet — double-check it." style={{ display:'inline-block', fontSize:9, padding:'1px 5px', borderRadius:20, fontWeight:700, letterSpacing:'.04em', marginLeft:4, background:'rgba(245,166,35,.12)', color:'var(--amber)', cursor:'help', whiteSpace:'nowrap' as const }}>
      low-confidence source
    </span>
  )
}

// Sourced fact → value + source + date (+ low-confidence tag if the source isn't preferred);
// else AI value (old results / pass-1 price) → AI estimate;
// else "Not found" if a live check ran for this competitor, "Not verified" if none did.
function FactValue({ comp, fact, fallback, checkedAt, prefix }: { comp: any; fact?: { value: string; source_url: string } | null; fallback?: string | null; checkedAt?: string; prefix?: string }) {
  if (fact) return (
    <span>
      {prefix}{fact.value}<SourceLink url={fact.source_url} checkedAt={checkedAt} />
      {!isPreferredSource(comp, fact.source_url) && <LowConfidenceTag />}
    </span>
  )
  if (fallback) return <span>{prefix}{fallback}<AiEstimateTag /></span>
  return checkedAt ? <NotFound /> : <NotVerified />
}

function CompetitiveTab({ data, loading, checking, onGenerate, appName }: { data?:string; loading?:boolean; checking?:boolean; onGenerate:()=>void; appName:string }) {
  const [view, setView] = useState<'cards'|'table'>(() => {
    try { return (localStorage.getItem('markr_compView') as 'cards'|'table') ?? 'cards' } catch { return 'cards' }
  })
  const switchView = (v: 'cards'|'table') => { setView(v); try { localStorage.setItem('markr_compView', v) } catch {} }

  if (loading) return <LoadingCard text="Analyzing competitors…" />
  if (!data) return <EmptyTab emoji="🔍" title="Competitive Intelligence" desc="Deep analysis of your top 5 competitors — strengths, gaps, positioning and how you win." onGenerate={onGenerate} btnLabel="Run Competitive Intelligence" />
  try {
    const { comps, mktPos, wspace, winCond, intentGaps, facts_note } = JSON.parse(data)
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
          {Array.isArray(intentGaps) && intentGaps.length > 0 && (
            <>
              <br/><br/>
              <strong style={{ color:'var(--red)' }}>Gaps vs your intent:</strong>
              <ul style={{ margin:'4px 0 0', paddingLeft:18 }}>
                {intentGaps.map((g: string, i: number) => <li key={i}>{g}</li>)}
              </ul>
            </>
          )}
        </Banner>
        {checking && <div style={{ fontSize:12, color:'var(--accent2)', margin:'-4px 0 12px' }}>🔎 Checking live sources for website, pricing, funding and team size…</div>}
        {!checking && facts_note && <div style={{ fontSize:12, color:'var(--amber)', margin:'-4px 0 12px' }}>⚠️ {facts_note}</div>}

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
          <button className="vbtn" onClick={onGenerate} disabled={checking}>🔄 Refresh</button>
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
                    const ratingFallback = cleanEstimate(c.reviews?.rating)
                    const funding = cleanEstimate(c.funding)
                    const team    = cleanEstimate(c.employees)
                    const checkedAt = typeof c.facts_checked_at === 'string' ? c.facts_checked_at : undefined
                    const topGap = c.positioningGap ?? c.userHates?.[0] ?? c.weaknesses?.[0] ?? '—'
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'10px 12px', fontWeight:600 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            {c.name}
                            {c.type && <span style={{ fontSize:9, padding:'2px 6px', borderRadius:20, fontWeight:700, textTransform:'uppercase' as const, background: c.type==='local' ? 'rgba(52,201,138,.15)' : 'rgba(124,111,247,.15)', color: c.type==='local' ? 'var(--green)' : 'var(--accent)' }}>{c.type==='local' ? 'Local' : 'Global'}</span>}
                            {c.unverified === true && <UnverifiedBadge />}
                          </div>
                          <div style={{ marginTop:2, fontWeight:400 }}><WebsiteLink c={c} /></div>
                          <div style={{ fontSize:10, color:'var(--text3)', marginTop:2, fontWeight:400 }}><FactValue comp={c} fact={c.facts?.pricing} fallback={cleanEstimate(c.price)} checkedAt={checkedAt} /></div>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          <span style={{ fontSize:12, fontWeight:700, padding:'3px 8px', borderRadius:6, background:sBg, color:sColor }}>{score}/10</span>
                        </td>
                        <td style={{ padding:'10px 12px' }}>
                          {rating != null ? (
                            <span style={{ color:'var(--amber)', fontWeight:600 }}>⭐ {rating}/5 <span style={{ fontSize:9, color:'var(--text3)', fontWeight:400 }}>(live)</span></span>
                          ) : ratingFallback ? (
                            <span style={{ color:'var(--amber)', fontWeight:600 }}>⭐ {ratingFallback}<AiEstimateTag /></span>
                          ) : <NotVerified />}
                        </td>
                        <td style={{ padding:'10px 12px', color:'var(--text2)' }}><FactValue comp={c} fact={c.facts?.funding} fallback={funding} checkedAt={checkedAt} /></td>
                        <td style={{ padding:'10px 12px', color:'var(--text2)' }}><FactValue comp={c} fact={c.facts?.team_size} fallback={team} checkedAt={checkedAt} /></td>
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
                  {c.unverified === true && <UnverifiedBadge />}
                  {c.cat &&<span style={{ fontSize:9, padding:'2px 6px', borderRadius:20, background:'var(--surface3)', color:'var(--text3)' }}>{c.cat}</span>}
                  <WebsiteLink c={c} />
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--green)' }}>
                    <FactValue comp={c} fact={c.facts?.pricing} fallback={cleanEstimate(c.price)} checkedAt={typeof c.facts_checked_at === 'string' ? c.facts_checked_at : undefined} />
                  </span>
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
                      {c.appStore.price && <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>{c.appStore.price}{typeof c.appStore.storefront === 'string' ? ` · ${c.appStore.storefront.toUpperCase()} store` : ''}{c.appStore.updatedMonths != null ? ` · ${c.appStore.updatedMonths === 0 ? 'updated this month' : `updated ${c.appStore.updatedMonths}mo ago`}` : ''}</div>}
                    </>
                  ) : (() => {
                    // No live App Store data — fall back to AI-recalled values, clearly marked
                    const r = cleanEstimate(c.reviews?.rating), n = cleanEstimate(c.reviews?.ratingCount), t = cleanEstimate(c.reviews?.traction)
                    if (!r && !t) return <NotVerified />
                    return (
                      <div>
                        {r && <div>
                          <span style={{ color:'var(--amber)', fontWeight:700 }}>⭐ {r}</span>
                          {n && <span style={{ fontSize:11, color:'var(--text3)' }}> ({n})</span>}
                          <AiEstimateTag />
                        </div>}
                        {t && <div style={{ fontSize:11, color:'var(--green)', marginTop:2 }}>📈 {t}<AiEstimateTag /></div>}
                      </div>
                    )
                  })()}
                </div>
                {/* Funding */}
                <div style={{ padding:'10px 14px', borderRight:'1px solid var(--border)' }}>
                  <SecLabel>Funding</SecLabel>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
                    <FactValue comp={c} fact={c.facts?.funding} fallback={cleanEstimate(c.funding)} checkedAt={typeof c.facts_checked_at === 'string' ? c.facts_checked_at : undefined} />
                  </div>
                </div>
                {/* Team size */}
                <div style={{ padding:'10px 14px' }}>
                  <SecLabel>Team Size</SecLabel>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
                    <FactValue comp={c} fact={c.facts?.team_size} fallback={cleanEstimate(c.employees)} checkedAt={typeof c.facts_checked_at === 'string' ? c.facts_checked_at : undefined} prefix="👥 " />
                  </div>
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
  // Three distinct failure modes, previously collapsed into a single misleading
  // "older format" message: unparseable output, a genuinely legacy-shaped
  // payload, and an unexpected render error.
  let d: any
  try {
    d = JSON.parse(data)
  } catch (e) {
    console.error('[swot] cached analysis is not valid JSON:', e, 'data:', data.slice(0, 300))
    return (
      <div style={{ textAlign:'center', padding:'32px 16px' }}>
        <div style={{ fontSize:13, color:'var(--amber)', marginBottom:16 }}>
          ⚠️ This analysis couldn't be read — the model returned malformed output. Regenerating should fix it.
        </div>
        <button className="gen-btn" style={{ margin:'0 auto' }} onClick={onGenerate}>
          🔄 Regenerate SWOT
        </button>
      </div>
    )
  }

  // Legacy payloads stored each quadrant as plain strings; the current format
  // stores objects with point/rating/evidence/action.
  const isLegacySwot = ['strengths','weaknesses','opportunities','threats'].some(
    k => Array.isArray(d[k]) && d[k].length > 0 && typeof d[k][0] !== 'object'
  )
  if (isLegacySwot) {
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

  try {
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
  } catch (e) {
    // Parse and legacy-shape are both handled above, so reaching here means the
    // payload parsed and looks current but still broke the render.
    console.error('[swot] render failed on a parseable, current-format payload:', e)
    return (
      <div style={{ textAlign:'center', padding:'32px 16px' }}>
        <div style={{ fontSize:13, color:'var(--amber)', marginBottom:16 }}>
          ⚠️ Something went wrong displaying this analysis. Regenerating may fix it.
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
