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
