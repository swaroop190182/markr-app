// Source checking for the server-side web-search pass (used by api/claude.ts).
// Pure functions, no I/O, so they can be unit-tested (tests/sources.test.ts).
// Lives in api/_lib so Vercel does not expose it as a route.

// Comparable form of a URL: host without www, no trailing slash, no #fragment, no utm_* params
export function normalizeSourceUrl(u: string): string | null {
  try {
    const url = new URL(u.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    for (const k of [...url.searchParams.keys()]) if (k.toLowerCase().startsWith('utm_')) url.searchParams.delete(k)
    const q = url.searchParams.toString()
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${q ? '?' + q : ''}`
  } catch { return null }
}

export type FactStats = { kept: number; dropped: number; derived: number }

const hostOfNorm = (n: string) => n.split(/[/?]/)[0]   // host part of a normalizeSourceUrl() result
const sameSite   = (a: string, b: string) => a === b || a.endsWith('.' + b) || b.endsWith('.' + a)

// A website is confirmed only by a search result that was actually returned on that same domain.
// Returns that result's original URL (used as the website's source), or null.
function findResultOnSite(siteUrl: string, allowed: Map<string, string>): string | null {
  const n = normalizeSourceUrl(siteUrl)
  if (!n) return null
  const host = hostOfNorm(n)
  for (const [norm, original] of allowed) if (sameSite(hostOfNorm(norm), host)) return original
  return null
}

// Walk the model's JSON; keep a {value, source_url} only if its source was a real search result.
// "website" is stricter: its own domain must appear among the returned results (the cited
// source_url is ignored and replaced with that result), so a guessed domain can't be "verified".
export function keepSourcedFacts(node: any, allowed: Map<string, string>, stats: FactStats, key?: string): any {
  if (Array.isArray(node)) return node.map(n => keepSourcedFacts(n, allowed, stats))
  if (node && typeof node === 'object') {
    if ('value' in node && 'source_url' in node) {
      const val = node.value == null ? '' : String(node.value).trim()
      if (key === 'website') {
        const onSite = val ? findResultOnSite(val, allowed) : null
        if (onSite) { stats.kept++; return { value: node.value, source_url: onSite } }
        stats.dropped++
        return null
      }
      const src = typeof node.source_url === 'string' ? normalizeSourceUrl(node.source_url) : null
      if (src && allowed.has(src) && val) { stats.kept++; return { value: node.value, source_url: node.source_url } }
      stats.dropped++
      return null
    }
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(node)) out[k] = keepSourcedFacts(v, allowed, stats, k)
    return out
  }
  return node
}

// When the model's website wasn't confirmed, take a returned result whose domain is named
// after the company: the name itself, or the name plus a common affix (amaha + health).
// Third-party platforms never count as a company's own site.
// Keep in sync with SITE_AFFIXES in src/lib/founder.ts (tests/competitors.test.ts checks they match)
export const SITE_AFFIXES = ['app', 'apps', 'hq', 'inc', 'labs', 'ai', 'io', 'health', 'care', 'online', 'official', 'global', 'india', 'tech', 'co', 'in', 'get', 'try', 'join', 'use', 'go', 'my']
const THIRD_PARTY_HOSTS = ['apple.com', 'google.com', 'crunchbase.com', 'tracxn.com', 'pitchbook.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com', 'wikipedia.org', 'medium.com', 'reddit.com', 'g2.com', 'capterra.com', 'producthunt.com']

// Registrable label: "amahahealth" for www.amahahealth.com and amahahealth.co.in; "medium" for amaha.medium.com
function siteLabel(host: string): string {
  const p = host.split('.')
  const i = p.length >= 3 && p[p.length - 1].length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov'].includes(p[p.length - 2]) ? p.length - 3 : p.length - 2
  return (p[Math.max(0, i)] ?? '').replace(/[^a-z0-9]/g, '')
}

function hostNamedAfter(host: string, name: string): boolean {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (n.length < 3) return false
  const label = siteLabel(host)
  return label === n || SITE_AFFIXES.some(a => label === n + a || label === a + n)
}

export function fillWebsitesFromResults(json: any, allowed: Map<string, string>, stats: FactStats): void {
  if (!Array.isArray(json?.competitors)) return
  for (const c of json.competitors) {
    if (!c || typeof c.name !== 'string' || c.website) continue
    for (const [norm, original] of allowed) {
      const host = hostOfNorm(norm)
      if (THIRD_PARTY_HOSTS.some(t => sameSite(host, t)) || !hostNamedAfter(host, c.name)) continue
      try { c.website = { value: new URL(original).origin, source_url: original }; stats.derived++; break } catch { /* skip */ }
    }
  }
}

// ── "Where your first 100 users are": places confirmed by returned search results ──────────────
// A community is identified by host + the path segments that name it. On multi-tenant platforms a
// page elsewhere on the host (reddit.com/search, facebook.com/someone) confirms nothing.
type RootRule = { hosts: RegExp; segments: (p: string[]) => number }   // how many leading path segments name the community
const ROOT_RULES: RootRule[] = [
  { hosts: /(^|\.)reddit\.com$/,            segments: p => (p[0] === 'r' && p[1]) ? 2 : 0 },                    // /r/SaaS
  { hosts: /(^|\.)facebook\.com$/,          segments: p => (p[0] === 'groups' && p[1]) ? 2 : 0 },               // /groups/123
  { hosts: /(^|\.)linkedin\.com$/,          segments: p => (['groups', 'company', 'in'].includes(p[0]) && p[1]) ? 2 : 0 },
  { hosts: /(^|\.)youtube\.com$/,           segments: p => p[0]?.startsWith('@') ? 1 : (['c', 'channel', 'user'].includes(p[0]) && p[1]) ? 2 : 0 },
  { hosts: /(^|\.)(x|twitter|instagram|threads)\.(com|net)$/, segments: p => (p[0] && !['i', 'search', 'explore', 'hashtag', 'p', 'reel', 'status'].includes(p[0])) ? 1 : 0 },
  { hosts: /(^|\.)tiktok\.com$/,            segments: p => p[0]?.startsWith('@') ? 1 : 0 },
  { hosts: /^discord\.com$/,                segments: p => (p[0] === 'invite' && p[1]) ? 2 : 0 },
  { hosts: /^discord\.gg$/,                 segments: p => p[0] ? 1 : 0 },
  { hosts: /^join\.slack\.com$/,            segments: p => (p[0] === 't' && p[1]) ? 2 : 0 },
  { hosts: /^t\.me$/,                       segments: p => p[0] ? 1 : 0 },
  { hosts: /^groups\.google\.com$/,         segments: p => (p[0] === 'g' && p[1]) ? 2 : 0 },
  { hosts: /(^|\.)indiehackers\.com$/,      segments: p => (p[0] === 'group' && p[1]) ? 2 : 0 },
  { hosts: /^(substack|medium)\.com$/,      segments: p => (p[0] && p[0] !== 'p') ? 1 : 0 },   // substack.com/@x, medium.com/pub
]
// Anything else (own-domain forums, newsletters, X.substack.com, X.beehiiv.com, X.slack.com): the host is the community

// Canonical community root of a URL — e.g. https://www.reddit.com/r/SaaS/comments/abc → { key: "reddit.com/r/saas", url: "https://www.reddit.com/r/SaaS" }
export function communityRoot(u: string): { key: string; url: string } | null {
  let url: URL
  try { url = new URL(u.trim()) } catch { return null }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase().replace(/^(www|old|new|np|m)\./, '')
  const path = url.pathname.split('/').filter(Boolean)
  const rule = ROOT_RULES.find(r => r.hosts.test(host))
  const n = rule ? rule.segments(path) : 0
  if (rule && n === 0) return null                                   // multi-tenant host, but not a community page
  const seg = path.slice(0, n)
  return { key: [host, ...seg.map(s => s.toLowerCase())].join('/'), url: 'https://' + url.hostname + (seg.length ? '/' + seg.join('/') : '') }
}

// Search results give page_age as e.g. "April 30, 2025", "2025-04-30" or "3 weeks ago". → ms timestamp or null
export function parsePageAge(age: unknown, now = Date.now()): number | null {
  if (typeof age !== 'string' || !age.trim()) return null
  const rel = age.trim().match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i)
  if (rel) {
    const units: Record<string, number> = { minute: 6e4, hour: 3.6e6, day: 8.64e7, week: 6.048e8, month: 2.63e9, year: 3.156e10 }
    return now - Number(rel[1]) * units[rel[2].toLowerCase()]
  }
  const t = Date.parse(age)
  return Number.isFinite(t) ? t : null
}

export type ReturnedResult = { url: string; page_age?: string }
const STALE_MS = 730 * 24 * 3600 * 1000   // ~2 years

export type DropReason = 'no name' | 'no url' | 'not a community page' | 'no returned result in this community'
export interface PlaceReport {
  proposed: number                     // places the model listed
  confirmed: number                    // kept after the check
  dropped: Array<{ name: string; url: string; reason: DropReason; same_host_results: number }>
}

const hostKey = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^(www|old|new|np|m)\./, '') } catch { return '' } }

// Keep a place only if a returned search result is that community's page or a page inside it.
// The shown URL is the community root rebuilt from that result (never the model's URL). Freshness comes
// from the newest matching result's page_age: older than ~2 years → possibly_inactive, sorted last.
// Returns a per-place report (separate from fact counts) for logging and for the client's message.
export function keepReturnedPlaces(json: any, results: ReturnedResult[], now = Date.now()): PlaceReport {
  const report: PlaceReport = { proposed: 0, confirmed: 0, dropped: [] }
  if (!Array.isArray(json?.places)) { if (json && typeof json === 'object') json.places = []; return report }
  report.proposed = json.places.length
  const kept: any[] = []
  for (const p of json.places) {
    const name = typeof p?.name === 'string' ? p.name.trim() : ''
    const url = typeof p?.url === 'string' ? p.url.trim() : ''
    const want = url ? communityRoot(url) : null
    const matches = want ? results.filter(r => communityRoot(r.url)?.key === want.key) : []
    const reason: DropReason | null = !name ? 'no name' : !url ? 'no url' : !want ? 'not a community page'
      : !matches.length ? 'no returned result in this community' : null
    if (reason) {
      const h = hostKey(url)
      report.dropped.push({ name: name.slice(0, 80), url: url.slice(0, 200), reason, same_host_results: h ? results.filter(r => hostKey(r.url) === h).length : 0 })
      continue
    }
    const ages = matches.map(m => parsePageAge(m.page_age, now)).filter((t): t is number => t !== null)
    const newest = ages.length ? Math.max(...ages) : null
    report.confirmed++
    kept.push({
      ...p,
      url: communityRoot(matches[0].url)!.url,              // derived from the returned result
      evidence_url: matches[0].url,
      last_seen: newest !== null ? new Date(newest).toISOString() : null,
      possibly_inactive: newest !== null && now - newest > STALE_MS,
    })
  }
  // Keep the model's market-first order, but anything that may be inactive goes last
  json.places = [...kept.filter(p => !p.possibly_inactive), ...kept.filter(p => p.possibly_inactive)]
  return report
}
