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

const BRIEF_FIELDS = ['intended_audience', 'focus_competitors', 'excluded_competitors', 'vision', 'mission'] as const

// Does the brief contain anything? A cleared brief ({ updated_at } only) does not count.
export function hasFounderBrief(b: FounderBrief | null | undefined): boolean {
  return !!b && BRIEF_FIELDS.some(k => { const v = b[k]; return Array.isArray(v) ? v.length > 0 : !!v })
}

// Content signature, ignoring updated_at
const briefSignature = (b: FounderBrief | null | undefined) => JSON.stringify(BRIEF_FIELDS.map(k => b?.[k] ?? null))

// The brief to save. updated_at changes only when the content actually changed;
// an unchanged save keeps the old timestamp. Clearing a filled brief keeps { updated_at }.
export function stampFounderBrief(prev: FounderBrief | null | undefined, next: FounderBrief | null, now = new Date().toISOString()): FounderBrief | null {
  if (briefSignature(prev) === briefSignature(next)) return prev ?? null
  if (!next) return hasFounderBrief(prev) ? { updated_at: now } : (prev ?? null)
  return { ...next, updated_at: now }
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

// ── Founder-given competitor websites ────────────────────────────────────────
// Keep in sync with SITE_AFFIXES in api/_lib/sources.ts (tests/competitors.test.ts checks they match)
export const SITE_AFFIXES = ['app', 'apps', 'hq', 'inc', 'labs', 'ai', 'io', 'health', 'care', 'online', 'official', 'global', 'india', 'tech', 'co', 'in', 'get', 'try', 'join', 'use', 'go', 'my']

// Registrable label of a host: "amahahealth" for www.amahahealth.com and amahahealth.co.in
export function siteLabel(host: string): string {
  const p = host.toLowerCase().replace(/^www\./, '').split('.')
  const i = p.length >= 3 && p[p.length - 1].length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov'].includes(p[p.length - 2]) ? p.length - 3 : p.length - 2
  return (p[Math.max(0, i)] ?? '').replace(/[^a-z0-9]/g, '')
}

// Is this domain named after the company? The name itself, or the name plus a common affix (amaha + health)
export function domainNamedAfter(domain: string, name: string): boolean {
  const n = nameKey(name)
  if (n.length < 3) return false
  const label = siteLabel(domainOf(domain))
  return label === n || SITE_AFFIXES.some(a => label === n + a || label === a + n)
}

const toHttps = (s: string) => (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`)

// A focus competitor given as a URL in the founder brief is the founder's word on that
// competitor's website. Pin it as brief_url (and c.url) so neither pass 1's guess nor
// pass 2's search can replace it. Each brief URL attaches to at most one competitor.
export function applyBriefWebsites<T extends { name?: string; url?: string }>(comps: T[], app: AppData): T[] {
  const briefUrls = (app.founder_brief?.focus_competitors ?? []).filter(f => looksLikeDomain(f))
  if (!briefUrls.length) return comps
  const used = new Set<string>()
  return comps.map(c => {
    const hit = briefUrls.find(u => !used.has(u) && (matchesCompetitor(c, u) || domainNamedAfter(u, c.name ?? '')))
    if (!hit) return c
    used.add(hit)
    const url = toHttps(hit)
    const prev = (c as any).url
    return { ...c, brief_url: url, url, ...(prev && prev !== url ? { url_guess: prev } : {}) }
  })
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
