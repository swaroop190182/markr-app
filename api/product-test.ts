import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ── Fetch safely ──────────────────────────────────────────────────────────────
async function fetchSafe(url: string, timeout = 6000): Promise<{ html: string; time: number; status: number } | null> {
  const start = Date.now()
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(timeout),
    })
    const html = await res.text()
    return { html, time: Date.now() - start, status: res.status }
  } catch { return null }
}

async function checkUrl(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) })
    return res.status
  } catch { return 0 }
}

// ── Rule engine ───────────────────────────────────────────────────────────────
async function runRules(url: string, appName: string, desc: string, features: string[]) {
  const base   = new URL(url).origin
  const result = await fetchSafe(url)

  if (!result) return { error: `Could not reach ${url}` }

  const { html, time, status } = result

  // Parse helpers
  const has    = (re: RegExp) => re.test(html)
  const count  = (re: RegExp) => (html.match(new RegExp(re.source, 'gi')) ?? []).length
  const get    = (re: RegExp) => (html.match(re)?.[1] ?? '').replace(/<[^>]+>/g,'').trim()

  const title       = get(/<title[^>]*>([^<]{1,120})<\/title>/i)
  const metaDesc    = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
                   || get(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i)
  const h1Count     = count(/<h1[b>]/i)
  const imgCount    = count(/<img[^>]+>/gi)
  const imgAltCount = count(/<img[^>]+alt=["'][^"']{1,}["'][^>]*>/gi)
  const inputCount  = count(/<input[^>]+>/gi)
  const labelCount  = count(/<label[^>]+>/gi)
  const hasViewport = has(/<meta[^>]+name=["']viewport["']/i)
  const hasOG       = has(/property=["']og:title["']/i)
  const hasTwitter  = has(/name=["']twitter:card["']/i)
  const hasFavicon  = has(/rel=["']icon["']/i) || has(/rel=["']shortcut icon["']/i)
  const hasHTTPS    = url.startsWith('https')
  const titleLen    = title.length
  const metaLen     = metaDesc.length
  const hasPrice    = /price|pricing|₹|\$|free|trial|plan|subscribe/i.test(html)
  const hasSP       = /testimonial|review|rating|trusted|customers|blockquote/i.test(html)
  const hasContact  = /contact|support|help|faq/i.test(html)
  const hasCTA      = /<(?:button|a)[^>]*>(?:[^<]{2,60})<\/(?:button|a)>/i.test(html)

  // Check sitemap + robots
  const [sitemapStatus, robotsStatus] = await Promise.all([
    checkUrl(`${base}/sitemap.xml`),
    checkUrl(`${base}/robots.txt`),
  ])

  // Check 404 on common paths
  const commonPaths = ['/about', '/privacy', '/terms']
  const pathChecks  = await Promise.all(commonPaths.map(p => checkUrl(`${base}${p}`)))
  const has404      = pathChecks.some(s => s === 404)

  // Build checks
  type Severity = 'pass' | 'warn' | 'fail'
  interface Check {
    id: string
    category: string
    label: string
    status: Severity
    detail: string
    impact: 'High' | 'Medium' | 'Low'
  }

  const checks: Check[] = [
    // ── Technical ──────────────────────────────────────────────────────────────
    {
      id: 'https', category: 'Technical',
      label: 'HTTPS enabled',
      status: hasHTTPS ? 'pass' : 'fail',
      detail: hasHTTPS ? 'Site is served over HTTPS' : 'Site is not using HTTPS — browsers will show security warning',
      impact: 'High',
    },
    {
      id: 'loadtime', category: 'Technical',
      label: 'Page load time',
      status: time < 2000 ? 'pass' : time < 4000 ? 'warn' : 'fail',
      detail: `Page loaded in ${(time/1000).toFixed(1)}s — ${time < 2000 ? 'excellent' : time < 4000 ? 'acceptable but could be faster' : 'too slow, users will bounce after 3s'}`,
      impact: 'High',
    },
    {
      id: 'status', category: 'Technical',
      label: 'Page returns 200',
      status: status === 200 ? 'pass' : 'fail',
      detail: status === 200 ? 'Page loads successfully' : `Page returned HTTP ${status}`,
      impact: 'High',
    },
    {
      id: 'sitemap', category: 'Technical',
      label: 'Sitemap exists',
      status: sitemapStatus === 200 ? 'pass' : 'warn',
      detail: sitemapStatus === 200 ? 'sitemap.xml found — good for SEO' : 'No sitemap.xml found — search engines will struggle to index all pages',
      impact: 'Medium',
    },
    {
      id: 'robots', category: 'Technical',
      label: 'Robots.txt exists',
      status: robotsStatus === 200 ? 'pass' : 'warn',
      detail: robotsStatus === 200 ? 'robots.txt found' : 'No robots.txt — add one to control how search engines crawl your site',
      impact: 'Low',
    },

    // ── SEO ────────────────────────────────────────────────────────────────────
    {
      id: 'title', category: 'SEO',
      label: 'Page title',
      status: titleLen === 0 ? 'fail' : titleLen > 60 ? 'warn' : 'pass',
      detail: titleLen === 0 ? 'No page title found' : titleLen > 60 ? `Title is ${titleLen} chars — truncated in Google (keep under 60). Current: "${title.slice(0,60)}…"` : `Good — "${title}"`,
      impact: 'High',
    },
    {
      id: 'metadesc', category: 'SEO',
      label: 'Meta description',
      status: metaLen === 0 ? 'fail' : metaLen < 80 ? 'warn' : metaLen > 160 ? 'warn' : 'pass',
      detail: metaLen === 0 ? 'No meta description — Google will auto-generate one, often poorly' : metaLen < 80 ? `Meta description too short (${metaLen} chars) — aim for 120-160` : metaLen > 160 ? `Meta description too long (${metaLen} chars) — will be truncated` : `Good length (${metaLen} chars)`,
      impact: 'High',
    },
    {
      id: 'h1', category: 'SEO',
      label: 'H1 tag usage',
      status: h1Count === 0 ? 'fail' : h1Count === 1 ? 'pass' : 'warn',
      detail: h1Count === 0 ? 'No H1 tag found — critical for SEO and clarity' : h1Count === 1 ? '1 H1 tag — correct' : `${h1Count} H1 tags found — should have exactly 1`,
      impact: 'Medium',
    },
    {
      id: 'ogtags', category: 'SEO',
      label: 'Social sharing (OG) tags',
      status: hasOG ? 'pass' : 'fail',
      detail: hasOG ? 'Open Graph tags present — will look good when shared on WhatsApp/LinkedIn' : 'No Open Graph tags — links will look plain when shared on social media',
      impact: 'Medium',
    },
    {
      id: 'twitter', category: 'SEO',
      label: 'Twitter card tags',
      status: hasTwitter ? 'pass' : 'warn',
      detail: hasTwitter ? 'Twitter card tags present' : 'No Twitter card — add for better sharing on X/Twitter',
      impact: 'Low',
    },

    // ── Accessibility ──────────────────────────────────────────────────────────
    {
      id: 'alttext', category: 'Accessibility',
      label: 'Image alt text',
      status: imgCount === 0 ? 'pass' : imgAltCount >= imgCount ? 'pass' : imgAltCount >= imgCount * 0.8 ? 'warn' : 'fail',
      detail: imgCount === 0 ? 'No images found' : imgAltCount >= imgCount ? `All ${imgCount} images have alt text` : `${imgCount - imgAltCount} of ${imgCount} images missing alt text — hurts accessibility and SEO`,
      impact: 'Medium',
    },
    {
      id: 'formlabels', category: 'Accessibility',
      label: 'Form field labels',
      status: inputCount === 0 ? 'pass' : labelCount >= inputCount ? 'pass' : 'warn',
      detail: inputCount === 0 ? 'No form inputs found' : labelCount >= inputCount ? 'All form fields have labels' : `${inputCount - labelCount} inputs may be missing labels — confusing for screen readers and users`,
      impact: 'Medium',
    },
    {
      id: 'viewport', category: 'Accessibility',
      label: 'Mobile viewport',
      status: hasViewport ? 'pass' : 'fail',
      detail: hasViewport ? 'Mobile viewport meta tag present' : 'Missing mobile viewport tag — site will look broken on phones',
      impact: 'High',
    },

    // ── UX / Conversion ────────────────────────────────────────────────────────
    {
      id: 'favicon', category: 'UX',
      label: 'Favicon',
      status: hasFavicon ? 'pass' : 'warn',
      detail: hasFavicon ? 'Favicon present — professional browser tab appearance' : 'No favicon — browser tab shows blank icon, looks unfinished',
      impact: 'Low',
    },
    {
      id: 'cta', category: 'UX',
      label: 'Call to action present',
      status: hasCTA ? 'pass' : 'fail',
      detail: hasCTA ? 'CTA buttons/links found on the page' : 'No clear CTA found — users have no obvious next step',
      impact: 'High',
    },
    {
      id: 'pricing', category: 'UX',
      label: 'Pricing info accessible',
      status: hasPrice ? 'pass' : 'warn',
      detail: hasPrice ? 'Pricing information found on page' : 'No pricing information found — visitors can\'t make a buying decision',
      impact: 'High',
    },
    {
      id: 'socialproof', category: 'UX',
      label: 'Social proof present',
      status: hasSP ? 'pass' : 'warn',
      detail: hasSP ? 'Testimonials or social proof detected' : 'No testimonials or social proof found — visitors have no reason to trust you',
      impact: 'High',
    },
    {
      id: 'contact', category: 'UX',
      label: 'Support / contact',
      status: hasContact ? 'pass' : 'warn',
      detail: hasContact ? 'Support or contact information found' : 'No contact/support information — users can\'t get help when stuck',
      impact: 'Medium',
    },
    {
      id: '404check', category: 'UX',
      label: 'Common pages accessible',
      status: has404 ? 'warn' : 'pass',
      detail: has404 ? 'Some common pages (/about, /privacy, /terms) return 404 — check if these should exist' : 'Standard pages checked — no unexpected 404s',
      impact: 'Low',
    },
  ]

  // Score calculation
  const passCount = checks.filter(c => c.status === 'pass').length
  const failCount = checks.filter(c => c.status === 'fail').length
  const warnCount = checks.filter(c => c.status === 'warn').length
  const highFails = checks.filter(c => c.status === 'fail' && c.impact === 'High').length

  // Weighted score: each check worth points based on impact
  const maxPoints = checks.reduce((sum, c) => sum + (c.impact === 'High' ? 6 : c.impact === 'Medium' ? 4 : 2), 0)
  const earned    = checks.reduce((sum, c) => {
    const pts = c.impact === 'High' ? 6 : c.impact === 'Medium' ? 4 : 2
    if (c.status === 'pass') return sum + pts
    if (c.status === 'warn') return sum + Math.floor(pts / 2)
    return sum
  }, 0)
  const score = Math.min(100, Math.max(0, Math.round((earned / maxPoints) * 100)))

  const categories = ['Technical', 'SEO', 'Accessibility', 'UX'] as const
  const byCategory = Object.fromEntries(
    categories.map(cat => [cat, checks.filter(c => c.category === cat)])
  )

  return {
    url, appName, score,
    summary: { pass: passCount, warn: warnCount, fail: failCount, total: checks.length, highFails },
    checks, byCategory,
    loadTime: time,
    runAt: new Date().toISOString(),
  }
}

// ── AI verdict — tiny, focused, cheap ─────────────────────────────────────────
async function getAiVerdict(findings: any, appName: string, desc: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return ''

  const fails = findings.checks.filter((c: any) => c.status === 'fail').map((c: any) => c.detail).join('\n')
  const warns = findings.checks.filter((c: any) => c.status === 'warn').map((c: any) => c.detail).join('\n')

  const prompt = `App: "${appName}". ${desc ? desc.slice(0,200) : ''}

Technical audit found:
FAILS: ${fails || 'none'}
WARNINGS: ${warns || 'none'}
Score: ${findings.score}/100

Write a 3-sentence verdict: (1) overall assessment, (2) the single most important fix, (3) one specific growth opportunity this reveals. Be direct and specific to this app. No preamble.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:200, messages:[{ role:'user', content:prompt }] })
    })
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  } catch { return '' }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.slice(7)
  if (!token) return res.status(401).json({ error: 'No token' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid session' })

  const { url, appName, desc, features, wantVerdict } = req.body
  if (!url) return res.status(400).json({ error: 'URL required' })

  try {
    const findings = await runRules(url, appName || '', desc || '', features || [])
    if ('error' in findings) return res.status(422).json(findings)

    // AI verdict only if requested and Pro user
    let verdict = ''
    if (wantVerdict) {
      verdict = await getAiVerdict(findings, appName || '', desc || '')
    }

    res.status(200).json({ ...findings, verdict })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
}
