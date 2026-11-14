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

// Website priority: App Store developer site (Live) → search-verified site → the model's URL
export function competitorWebsite(c: any): string | null {
  for (const v of [c?.appStore?.sellerUrl, c?.facts?.website?.value, c?.url]) {
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v
  }
  return null
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
  return { ...comp, facts, facts_checked_at: checkedAt }
}

// Match pass-2 entries back to competitors by name, falling back to position within the batch
export function findFactsEntry(entries: any[], comp: any, indexInBatch: number): any {
  const n = norm(comp?.name ?? '')
  return entries.find(e => norm(e?.name ?? '') === n) ?? entries[indexInBatch]
}
