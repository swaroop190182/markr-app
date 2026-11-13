import type { AppData, FounderBrief } from '../types'

const MAX_TEXT = 200, MAX_FOCUS = 5, MAX_EXCLUDED = 10

const clip = (s: unknown, max: number) =>
  typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, max) : ''

// "a, b\nc" → ['a','b','c'] — trimmed, deduped by competitorKey, capped
export function splitCompetitorList(raw: string | string[] | undefined, max: number): string[] {
  const items = (Array.isArray(raw) ? raw : (raw ?? '').split(/[,\n]/))
    .map(s => clip(s, 120)).filter(Boolean)
  const seen = new Set<string>()
  return items
    .filter(s => { const k = competitorKey(s); if (!k || seen.has(k)) return false; seen.add(k); return true })
    .slice(0, max)
}

export function normalizeFounderBrief(input: {
  intended_audience?: string; focus_competitors?: string | string[]
  excluded_competitors?: string | string[]; vision?: string; mission?: string
}): FounderBrief | null {
  const b: FounderBrief = {}
  const aud = clip(input.intended_audience, MAX_TEXT); if (aud) b.intended_audience = aud
  const vis = clip(input.vision, MAX_TEXT);            if (vis) b.vision = vis
  const mis = clip(input.mission, MAX_TEXT);           if (mis) b.mission = mis
  const foc = splitCompetitorList(input.focus_competitors, MAX_FOCUS)
  const exc = splitCompetitorList(input.excluded_competitors, MAX_EXCLUDED)
    .filter(e => !foc.some(f => competitorKey(f) === competitorKey(e)))   // focus wins over exclude
  if (foc.length) b.focus_competitors = foc
  if (exc.length) b.excluded_competitors = exc
  return Object.keys(b).length ? b : null
}

// ── Competitor matching: names and URLs ─────────────────────────────────────
const looksLikeDomain = (s: string) => /^(https?:\/\/)?[^\s/]+\.[a-z]{2,}(\/|$)/i.test(s.trim())
export const domainOf = (s: string) =>
  s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// URL → bare domain; name → lowercase alphanumerics
export function competitorKey(s: string): string {
  return looksLikeDomain(s) ? domainOf(s) : nameKey(s)
}

// Does a competitor result {name, url} match a founder-entered name or URL?
export function matchesCompetitor(comp: { name?: string; url?: string }, entry: string): boolean {
  const name = nameKey(comp.name ?? '')
  const url  = comp.url ? domainOf(comp.url) : ''
  if (looksLikeDomain(entry)) {
    const d = domainOf(entry)
    return (!!url && (url === d || url.endsWith('.' + d))) || (!!name && name === nameKey(d.split('.')[0]))
  }
  const k = nameKey(entry)
  return !!k && (name === k || (!!url && nameKey(url.split('.')[0]) === k))
}

export function filterExcluded<T extends { name?: string; url?: string }>(comps: T[], app: AppData): T[] {
  const ex = app.founder_brief?.excluded_competitors ?? []
  return ex.length ? comps.filter(c => !ex.some(e => matchesCompetitor(c, e))) : comps
}

// Focus competitors first, in the founder's order; everything else keeps its order
export function orderFocusFirst<T extends { name?: string; url?: string }>(comps: T[], app: AppData): T[] {
  const focus = app.founder_brief?.focus_competitors ?? []
  if (!focus.length) return comps
  const rank = (c: T) => { const i = focus.findIndex(f => matchesCompetitor(c, f)); return i === -1 ? focus.length : i }
  return [...comps].sort((a, b) => rank(a) - rank(b))   // stable sort
}

// Saved competitive JSON with exclusions applied — for every reader of cached results
export function readCompetitive(app: AppData, raw?: string | null): any | null {
  try {
    const c = JSON.parse(raw ?? app.competitive_analysis ?? '')
    if (c?.comps && Array.isArray(c.comps)) c.comps = filterExcluded(c.comps, app)
    return c
  } catch { return null }
}

// Did focus/excluded lists change? (order-insensitive, by competitorKey)
export function competitorListsChanged(a: FounderBrief | null | undefined, b: FounderBrief | null | undefined): boolean {
  const sig = (xs?: string[]) => (xs ?? []).map(competitorKey).sort().join('|')
  return sig(a?.focus_competitors) !== sig(b?.focus_competitors)
      || sig(a?.excluded_competitors) !== sig(b?.excluded_competitors)
}
