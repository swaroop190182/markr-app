// Shared helpers for competitor data stored in competitive_analysis.

export interface SourcedFact { value: string; source_url: string }
export interface CompetitorFacts {
  website:   SourcedFact | null
  pricing:   SourcedFact | null
  funding:   SourcedFact | null
  team_size: SourcedFact | null
  hq_country?: SourcedFact | null   // where the company is headquartered — drives the local/global label
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// iTunes search is by name and returns the first hit, which can be a different app.
// Trust it only when the app title or seller starts with the competitor's name (or vice versa).
export function itunesNameMatches(compName: string, hit: { trackName?: string; sellerName?: string }): boolean {
  const n = norm(compName)
  if (n.length < 3) return false
  return [hit.trackName, hit.sellerName].some(x => {
    const h = norm(x ?? '')
    return h.length >= 3 && (h === n || h.startsWith(n) || n.startsWith(h))
  })
}

const isHttp = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v)
const siteHost = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const sameSiteHost = (a: string, b: string) => !!a && !!b && (a === b || a.endsWith('.' + b) || b.endsWith('.' + a))

// How a competitor's website is confirmed, in priority order:
//  - 'brief':     the founder gave it as a focus competitor URL ("from your brief", always wins)
//  - 'app_store': the developer site from the name-matched App Store lookup ("✓ verified")
//  - 'search':    a website fact whose source is a search result on that same domain ("✓ verified")
// A website that only came from the model (pass 1's url, or a fact citing another site) is not confirmed.
// Re-checked here so older saved results with mismatched domains lose the tick too.
export function confirmedWebsite(c: any): { url: string; via: 'brief' | 'app_store' | 'search'; source_url?: string } | null {
  if (isHttp(c?.brief_url)) return { url: c.brief_url, via: 'brief' }
  if (isHttp(c?.appStore?.sellerUrl)) return { url: c.appStore.sellerUrl, via: 'app_store' }
  const w = c?.facts?.website
  if (w && isHttp(w.value) && isHttp(w.source_url) && sameSiteHost(siteHost(w.value), siteHost(w.source_url))) {
    return { url: w.value, via: 'search', source_url: w.source_url }
  }
  return null
}

// Website to show and use: confirmed site first, otherwise the model's (unconfirmed) URL
export function competitorWebsite(c: any): string | null {
  return confirmedWebsite(c)?.url ?? (isHttp(c?.url) ? c.url : null)
}

export function sourceDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// ── Source confidence ───────────────────────────────────────────────────────
// A fact is "preferred" when its source is the company's own domain, an app store,
// a company database, or a recognised business/tech news outlet. Anything else is
// still shown, with a "low-confidence source" tag. Edit these lists to tune it.
const APP_STORE_HOSTS = ['apps.apple.com', 'itunes.apple.com', 'play.google.com']
const DATABASE_HOSTS  = ['crunchbase.com', 'tracxn.com', 'pitchbook.com', 'linkedin.com']
const NEWS_HOSTS = [
  'techcrunch.com', 'reuters.com', 'bloomberg.com', 'forbes.com', 'wsj.com', 'ft.com', 'cnbc.com',
  'businessinsider.com', 'theverge.com', 'venturebeat.com', 'axios.com', 'fortune.com',
  'economictimes.indiatimes.com', 'livemint.com', 'moneycontrol.com', 'business-standard.com',
  'thehindubusinessline.com', 'inc42.com', 'yourstory.com', 'entrackr.com', 'vccircle.com', 'the-ken.com',
]

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const sameOrSub = (host: string, base: string) => host === base || host.endsWith('.' + base)

export function isPreferredSource(comp: any, sourceUrl: string): boolean {
  const h = hostOf(sourceUrl)
  if (!h) return false
  if ([...APP_STORE_HOSTS, ...DATABASE_HOSTS, ...NEWS_HOSTS].some(b => sameOrSub(h, b))) return true
  // Company's own domain: any known website for it (App Store developer site, verified site, model URL)
  const own = [comp?.appStore?.sellerUrl, comp?.facts?.website?.value, comp?.url]
    .map(v => (typeof v === 'string' ? hostOf(v) : ''))
    .filter(Boolean)
  if (own.some(o => sameOrSub(h, o) || sameOrSub(o, h))) return true
  // No website known: accept a domain named exactly after the company (e.g. calm.com for "Calm")
  const n = norm(comp?.name ?? '')
  return n.length >= 3 && norm(h.split('.')[0]) === n
}

// Attach one competitor's pass-2 result. Only {value, source_url} pairs that survived
// the server-side source check get through; everything else becomes null ("Not found").
const pickFact = (f: any): SourcedFact | null =>
  f && (typeof f.value === 'string' || typeof f.value === 'number') && typeof f.source_url === 'string'
    ? { value: String(f.value), source_url: f.source_url } : null

// A search-confirmed website on a different domain replaces pass 1's guess everywhere c.url is used.
// A founder-given brief_url is never replaced (confirmedWebsite reports it as 'brief', not 'search').
function adoptSearchWebsite(out: any, prevUrl: string | undefined): any {
  const confirmed = confirmedWebsite(out)
  if (confirmed?.via === 'search' && !sameSiteHost(siteHost(confirmed.url), siteHost(prevUrl ?? ''))) {
    out.url_guess = prevUrl ?? null
    out.url = confirmed.url
  }
  return out
}

export function applyFacts(comp: any, entry: any, checkedAt: string): any {
  const facts: CompetitorFacts = {
    website: pickFact(entry?.website), pricing: pickFact(entry?.pricing),
    funding: pickFact(entry?.funding), team_size: pickFact(entry?.team_size),
    hq_country: pickFact(entry?.hq_country),
  }
  return adoptSearchWebsite({ ...comp, facts, facts_checked_at: checkedAt }, comp?.url)
}

// Pass 2 ran for this competitor but its website is still unconfirmed → worth one targeted search
export function needsWebsiteSearch(c: any): boolean {
  return typeof c?.facts_checked_at === 'string' && !confirmedWebsite(c)
}

// Merge the result of the targeted "<name> official website" search (website only)
export function applyWebsiteFact(comp: any, entry: any, checkedAt: string): any {
  const website = pickFact(entry?.website)
  if (!website) return comp
  const facts: CompetitorFacts = { pricing: null, funding: null, team_size: null, ...(comp?.facts ?? {}), website }
  return adoptSearchWebsite({ ...comp, facts, facts_checked_at: comp?.facts_checked_at ?? checkedAt }, comp?.url)
}

// Match pass-2 entries back to competitors by name, falling back to position within the batch
export function findFactsEntry(entries: any[], comp: any, indexInBatch: number): any {
  const n = norm(comp?.name ?? '')
  return entries.find(e => norm(e?.name ?? '') === n) ?? entries[indexInBatch]
}

// ── Sourced competitor facts for prompts ─────────────────────────────────────
// Only values a live web search confirmed (pass 2, with a source) or the name-matched App Store
// lookup returned. AI estimates (pass 1's price/funding/employees) are never included, so the
// other analyses can quote competitor facts accurately or leave them out.
const factText = (v: unknown) => String(v).replace(/\s+/g, ' ').trim().slice(0, 80)

export function sourcedCompetitorFacts(comps: any[] | null | undefined): string {
  const lines: string[] = []
  for (const c of comps ?? []) {
    if (!c?.name) continue
    const f = c.facts ?? {}
    const parts: string[] = []
    if (f.pricing?.value)   parts.push(`pricing ${factText(f.pricing.value)}`)
    if (f.funding?.value)   parts.push(`funding ${factText(f.funding.value)}`)
    if (f.team_size?.value) parts.push(`team size ${factText(f.team_size.value)}`)
    if (typeof c.appStore?.price === 'string') parts.push(`App Store price ${factText(c.appStore.price)}`)
    if (typeof c.appStore?.rating === 'number') {
      parts.push(`App Store rating ${c.appStore.rating}/5${typeof c.appStore.ratingCount === 'number' ? ` (${c.appStore.ratingCount} ratings)` : ''}`)
    }
    if (parts.length) lines.push(`- ${factText(c.name)}: ${parts.join('; ')}`)
  }
  return lines.length
    ? `SOURCED COMPETITOR FACTS (verified by live search or the App Store — the only competitor facts you may state, quoted exactly):\n${lines.join('\n')}`
    : ''
}

// ── Local / global label ─────────────────────────────────────────────────────
// Countries in each primary market (the names used by the market setting and detectMarket)
const US = ['united states', 'united states of america', 'usa', 'us']
const UK = ['united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland']
const MARKET_COUNTRIES: Record<string, string[]> = {
  'India': ['india'], 'United States': US, 'US': US, 'United Kingdom': UK, 'UK': UK, 'Australia': ['australia'],
  'Europe': [...UK, 'germany', 'france', 'spain', 'italy', 'netherlands', 'ireland', 'sweden', 'denmark', 'finland', 'norway',
             'belgium', 'austria', 'switzerland', 'poland', 'portugal', 'czech republic', 'greece', 'estonia', 'latvia', 'lithuania'],
  'Southeast Asia': ['singapore', 'indonesia', 'malaysia', 'thailand', 'vietnam', 'philippines'],
  'Middle East': ['united arab emirates', 'uae', 'saudi arabia', 'qatar', 'kuwait', 'bahrain', 'oman', 'israel', 'jordan'],
}
// Fallback when no HQ country was sourced: a confirmed website on the market's country domain → local
const MARKET_DOMAINS: Record<string, string[]> = {
  'India': ['.in'], 'United Kingdom': ['.uk'], 'UK': ['.uk'], 'Australia': ['.au'], 'United States': ['.us'], 'US': ['.us'],
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Local = headquartered in the app's primary market. A sourced HQ country decides it either way;
// otherwise a confirmed website on the market's country domain can make it local (never global).
// Global / Auto-detect / unknown markets: no change. Keeps pass 1's label as type_pass1.
export function correctMarketType(comp: any, market: string | null | undefined): any {
  const countries = market ? MARKET_COUNTRIES[market] : undefined
  if (!countries) return comp
  const hq = comp?.facts?.hq_country?.value
  let type: 'local' | 'global' | null = null
  let via: 'hq' | 'domain' | null = null
  if (typeof hq === 'string' && hq.trim()) {
    type = countries.some(c => new RegExp('\\b' + escapeRe(c) + '\\b', 'i').test(hq)) ? 'local' : 'global'
    via = 'hq'
  } else {
    const site = confirmedWebsite(comp)?.url
    const host = site ? siteHost(site) : ''
    if (host && (MARKET_DOMAINS[market!] ?? []).some(d => host.endsWith(d))) { type = 'local'; via = 'domain' }
  }
  if (!type) return comp
  return type === comp.type ? { ...comp, type_source: via } : { ...comp, type, type_pass1: comp.type ?? null, type_source: via }
}

// ── Competitor profiles for the other analyses ──────────────────────────────
// Name + top strengths/weaknesses from the Competitive analysis — the only competitor features
// BMC, SWOT, Growth and Pricing may mention.
export function competitorProfiles(comps: any[] | null | undefined): string {
  const list = (xs: unknown) => (Array.isArray(xs) ? xs : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 3).map(factText)
  const lines = (comps ?? []).filter(c => c?.name).map(c => {
    const s = list(c.strengths), w = list(c.weaknesses)
    return '- ' + factText(c.name) + ': ' + (s.length ? 'strengths: ' + s.join('; ') : 'strengths: none listed')
      + ' | ' + (w.length ? 'weaknesses: ' + w.join('; ') : 'weaknesses: none listed')
  })
  return lines.length ? 'COMPETITOR PROFILES (from the Competitive analysis — the only competitor features you may mention):\n' + lines.join('\n') : ''
}

// ── No figures in Competitive's free text ───────────────────────────────────
// Bracketed figures — "(₹999/mo)", "(~2M downloads)", "(50K users)". Figures belong only in the
// sourced facts. Returns how many were removed.
const FIGURE_IN_BRACKETS = /\s*\((?=[^()]*(?:[$₹€£]\s?\d|\d[\d,.]*\s*(?:k|m|b|%|\+|lakh|crore)?\s*(?:users|downloads|installs|reviews|ratings|employees|customers|subscribers)\b|\d[\d,.]*\s*(?:k|m|b)\b))[^()]*\)/gi
const FREE_TEXT_FIELDS = ['strengths', 'weaknesses', 'userLoves', 'userHates', 'diff', 'reason', 'positioningGap']

export function stripFiguresFromFreeText(comp: any): { comp: any; removed: number } {
  let removed = 0
  const clean = (s: string) => s.replace(FIGURE_IN_BRACKETS, () => { removed++; return '' }).replace(/\s{2,}/g, ' ').trim()
  const out = { ...comp }
  for (const k of FREE_TEXT_FIELDS) {
    if (typeof out[k] === 'string') out[k] = clean(out[k])
    else if (Array.isArray(out[k])) out[k] = out[k].map((x: unknown) => typeof x === 'string' ? clean(x) : x)
  }
  return { comp: out, removed }
}
