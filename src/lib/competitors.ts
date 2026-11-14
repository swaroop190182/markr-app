// Shared helpers for competitor data stored in competitive_analysis.

export interface SourcedFact { value: string; source_url: string }
export interface CompetitorFacts {
  website:   SourcedFact | null
  pricing:   SourcedFact | null
  funding:   SourcedFact | null
  team_size: SourcedFact | null
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

// The only two ways a website earns the "✓ verified" tick:
//  - it is the developer site from the name-matched App Store lookup, or
//  - pass 2's website fact, whose source is a search result on that same domain.
// A website that only came from the model (pass 1's url, or a fact citing another site) is not confirmed.
// Re-checked here so older saved results with mismatched domains lose the tick too.
export function confirmedWebsite(c: any): { url: string; via: 'app_store' | 'search'; source_url?: string } | null {
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
export function applyFacts(comp: any, entry: any, checkedAt: string): any {
  const pick = (f: any): SourcedFact | null =>
    f && (typeof f.value === 'string' || typeof f.value === 'number') && typeof f.source_url === 'string'
      ? { value: String(f.value), source_url: f.source_url } : null
  const facts: CompetitorFacts = {
    website: pick(entry?.website), pricing: pick(entry?.pricing),
    funding: pick(entry?.funding), team_size: pick(entry?.team_size),
  }
  const out = { ...comp, facts, facts_checked_at: checkedAt }
  // A search-confirmed website on a different domain replaces pass 1's guess everywhere c.url is used
  const confirmed = confirmedWebsite(out)
  if (confirmed?.via === 'search' && !sameSiteHost(siteHost(confirmed.url), siteHost(comp?.url ?? ''))) {
    out.url_guess = comp?.url ?? null
    out.url = confirmed.url
  }
  return out
}

// Match pass-2 entries back to competitors by name, falling back to position within the batch
export function findFactsEntry(entries: any[], comp: any, indexInBatch: number): any {
  const n = norm(comp?.name ?? '')
  return entries.find(e => norm(e?.name ?? '') === n) ?? entries[indexInBatch]
}
