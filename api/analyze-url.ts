import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ── IP rate limit ─────────────────────────────────────────────────────────────
const ipMap = new Map<string, { count: number; date: string }>()
function checkIpLimit(ip: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  const cur   = ipMap.get(ip)
  const count = cur?.date === today ? cur.count : 0
  if (count >= 3) return false
  ipMap.set(ip, { count: count + 1, date: today })
  return true
}

// ── Fetch safely ──────────────────────────────────────────────────────────────
async function fetchSafe(url: string, timeout = 6000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('html') && !ct.includes('xml') && !ct.includes('text')) return null
    return await res.text()
  } catch { return null }
}

// ── Extract content from HTML ─────────────────────────────────────────────────
function extract(html: string) {
  const clean = (s: string) => s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()
  const get   = (re: RegExp) => clean(html.match(re)?.[1] ?? '')
  const getAll = (tag: string, n = 6) => {
    const out: string[] = []; const re = new RegExp(`<${tag}[^>]*>([\\s\\S]{1,200}?)<\\/${tag}>`, 'gi'); let m
    while ((m = re.exec(html)) && out.length < n) { const t = clean(m[1]); if (t.length > 2) out.push(t) }
    return out
  }

  const title   = get(/<title[^>]*>([^<]{1,120})<\/title>/i)
  const metaD   = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
                || get(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i)
  const ogT     = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,120})["']/i)
                || get(/<meta[^>]+content=["']([^"']{1,120})["'][^>]+property=["']og:title["']/i)
  const ogD     = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,300})["']/i)
                || get(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+property=["']og:description["']/i)
  const twT     = get(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']{1,120})["']/i)
  const twD     = get(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']{1,300})["']/i)
                || get(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']twitter:description["']/i)
  const h1s     = getAll('h1', 3)
  const h2s     = getAll('h2', 8)
  const h3s     = getAll('h3', 8)
  const paras   = getAll('p', 12)
  const lis     = getAll('li', 12)

  // JSON-LD
  let jldText = ''
  try {
    const jldRaw = get(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]{1,3000}?)<\/script>/i)
    const jld = JSON.parse(jldRaw)
    jldText = [jld.name, jld.description, jld.headline, jld.alternateName, jld.slogan].filter(Boolean).join(' ')
  } catch {}

  // Buttons & CTAs
  const btns: string[] = []
  const btnRe = /<(?:button|a)[^>]*>([^<]{3,80})<\/(?:button|a)>/gi; let bm
  while ((bm = btnRe.exec(html)) && btns.length < 15) { const t = clean(bm[1]); if (t) btns.push(t) }

  // Visible body
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  const bestTitle = title || ogT || twT || ''
  const bestDesc  = metaD || ogD || twD || jldText || ''
  const bestH1    = h1s[0] || ogT || title || ''
  const allText   = [bestTitle, bestDesc, bestH1, h2s.join(' '), h3s.join(' '), paras.join(' '), lis.join(' '), jldText, body.slice(0, 2000)].join(' ')

  return {
    title, metaD, ogT, ogD, twT, twD, jldText,
    h1s, h2s, h3s, paras, lis, btns,
    body: body.slice(0, 3000),
    bestTitle, bestDesc, bestH1,
    allText: allText.slice(0, 5000),
    wordCount: body.split(' ').filter(w => w.length > 2).length,
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
  }
}

// ── Parse sitemap ─────────────────────────────────────────────────────────────
function parseSitemap(xml: string, base: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => m[1].trim())
    .filter(u => {
      try { return new URL(u).origin === new URL(base).origin } catch { return false }
    })
}

// ── Categorise URL ────────────────────────────────────────────────────────────
function categorise(url: string): string {
  const p = url.toLowerCase()
  if (/pricing|plans|price|cost|subscribe|billing/.test(p))       return 'pricing'
  if (/feature|product|what|capability|function|tool/.test(p))    return 'features'
  if (/about|team|story|founder|mission|who|company/.test(p))     return 'about'
  if (/testimonial|review|case.?study|customer|trust/.test(p))    return 'social'
  if (/how.?it.?works|how|guide|tour|walkthrough|demo/.test(p))   return 'how'
  if (/blog|article|post|resource|learn|insight/.test(p))         return 'blog'
  if (/contact|support|help|faq/.test(p))                         return 'support'
  return 'other'
}

// ── Full multi-page scrape ────────────────────────────────────────────────────
async function fullScrape(url: string) {
  const base = new URL(url).origin

  // Always fetch main page
  const mainHtml = await fetchSafe(url)
  if (!mainHtml) throw new Error('Could not reach this URL — make sure it is public and accessible.')
  const main = extract(mainHtml)

  const pages: Record<string, ReturnType<typeof extract>> = { home: main }

  // Get all URLs from sitemap
  let allUrls: string[] = []
  const sitemapXml = await fetchSafe(`${base}/sitemap.xml`, 4000)
               ?? await fetchSafe(`${base}/sitemap_index.xml`, 3000)
  if (sitemapXml) {
    allUrls = parseSitemap(sitemapXml, base)
  }

  // Also try robots.txt for sitemap location
  if (allUrls.length === 0) {
    const robots = await fetchSafe(`${base}/robots.txt`, 2000)
    if (robots) {
      const sm = robots.match(/Sitemap:\s*(\S+)/i)?.[1]
      if (sm) {
        const smXml = await fetchSafe(sm, 3000)
        if (smXml) allUrls = parseSitemap(smXml, base)
      }
    }
  }

  // Add common paths to try even without sitemap
  const commonPaths = ['/pricing', '/features', '/about', '/how-it-works', '/product', '/testimonials', '/customers', '/blog']
  const toTry = new Set<string>()

  // From sitemap — pick best URL per category
  const categories = ['pricing', 'features', 'about', 'social', 'how']
  const picked = new Map<string, string>()
  for (const u of allUrls) {
    const cat = categorise(u)
    if (categories.includes(cat) && !picked.has(cat)) picked.set(cat, u)
  }

  // Add common paths for categories not found in sitemap
  for (const cat of categories) {
    if (!picked.has(cat)) {
      const pathMap: Record<string, string[]> = {
        pricing:  ['/pricing', '/plans', '/price'],
        features: ['/features', '/product', '/what-we-do'],
        about:    ['/about', '/about-us', '/story', '/team'],
        social:   ['/testimonials', '/customers', '/reviews', '/case-studies'],
        how:      ['/how-it-works', '/how', '/demo', '/tour'],
      }
      for (const p of (pathMap[cat] ?? [])) toTry.add(base + p)
    } else {
      toTry.add(picked.get(cat)!)
    }
  }

  // Fetch all category pages in parallel (max 5)
  const fetchQueue = [...toTry].slice(0, 5)
  const results = await Promise.allSettled(
    fetchQueue.map(async u => {
      const html = await fetchSafe(u, 4000)
      if (html) {
        const data = extract(html)
        if (data.wordCount > 30) return { url: u, cat: categorise(u), data }
      }
      return null
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      pages[r.value.cat] = r.value.data
    }
  }

  return pages
}

// ── Score the app ─────────────────────────────────────────────────────────────
function score(pages: Record<string, ReturnType<typeof extract>>, url: string) {
  const home     = pages.home
  const pricing  = pages.pricing
  const features = pages.features
  const about    = pages.about
  const social   = pages.social
  const how      = pages.how

  // Combine ALL text from ALL pages
  const allPagesText = Object.values(pages).map(p => p.allText).join(' ')
  const allH2s       = Object.values(pages).flatMap(p => p.h2s)
  const allParas     = Object.values(pages).flatMap(p => p.paras)
  const allBtns      = Object.values(pages).flatMap(p => p.btns)

  const headline = home.bestH1 || home.bestTitle
  const desc     = home.bestDesc

  // ── 1. Clarity (0–10) ───────────────────────────────────────────────────────
  let clarity = 2
  if (headline.length > 8)                                       clarity += 2
  if (headline.split(' ').length >= 3 && headline.split(' ').length <= 14) clarity += 1
  if (desc.length > 40)                                          clarity += 2
  if (features)                                                  clarity += 2  // has features page
  if (how)                                                       clarity += 1  // explains how it works
  clarity = Math.min(10, clarity)

  const clarityIssue = !features && !how
    ? `Headline: "${headline.slice(0,55)}" — no features or how-it-works page found`
    : desc.length < 40
      ? 'Meta description is too short — expand it to explain the outcome clearly'
      : features
        ? `Clear — features page found with ${features.h2s.length} sections`
        : `Headline communicates value but no dedicated features page`

  // ── 2. User Journey (0–10) ──────────────────────────────────────────────────
  let journey = 3
  const primaryCta = allBtns.find(b => /start|try|get|sign|join|analyze|free|demo|launch|begin|access/i.test(b))
  if (primaryCta)                                                journey += 2
  if (primaryCta && !/^sign up$|^register$|^submit$|^click$/i.test(primaryCta)) journey += 2
  if (how)                                                       journey += 2  // has how-it-works
  if (home.hasViewport)                                          journey += 1
  journey = Math.min(10, journey)

  const journeyIssue = !primaryCta
    ? 'No action-oriented CTA found across all pages — users don\'t know what to do'
    : !how
      ? `CTA "${primaryCta.slice(0,40)}" exists but no how-it-works page — users may not understand the product`
      : `Clear journey: "${primaryCta.slice(0,40)}" CTA with how-it-works page`

  // ── 3. Emotional Pull (0–10) ────────────────────────────────────────────────
  const youCount = (allPagesText.match(/\byou\b|\byour\b/gi) ?? []).length
  const weCount  = (allPagesText.match(/\bwe\b|\bour\b|\bwe've\b/gi) ?? []).length
  const hasUrg   = /free|now|today|start|instantly|minutes|fast|quick/i.test(allPagesText)
  const hasNums  = /\d+[k+%x]?\s*(?:users|customers|apps|founders|teams|reviews|faster|more|less|saved)/i.test(allPagesText)

  let emotion = 2
  if (youCount > weCount * 1.2 || youCount >= 5)                emotion += 3
  if (hasNums)                                                   emotion += 3
  if (hasUrg)                                                    emotion += 2
  emotion = Math.min(10, emotion)

  const emotionIssue = (weCount > 0 && youCount < weCount)
    ? `Across all pages: "we/our" ${weCount}× vs "you/your" ${youCount}× — flip this to speak to users`
    : !hasNums
      ? 'No specific numbers found across all pages — add user counts, time saved, or results'
      : !hasUrg
        ? 'Good user focus but missing urgency language anywhere on the site'
        : `Strong — ${youCount} user-focused phrases, specific numbers present`

  // ── 4. Trust (0–10) ─────────────────────────────────────────────────────────
  const hasSP      = social || /testimonial|review|rating|stars|trusted|said|quote/i.test(allPagesText)
  const hasTeam    = about && /founder|team|ceo|built by|created by/i.test(about.allText)
  const hasLogos   = /trusted by|used by|as seen|featured in|partner/i.test(allPagesText)
  const hasNumbers = /\d+[k+]?\s*(?:users|customers|apps|founders|teams|reviews|clients)/i.test(allPagesText)

  let trust = 2
  if (hasSP)      trust += 3
  if (hasTeam)    trust += 2
  if (hasLogos)   trust += 2
  if (hasNumbers) trust += 1
  trust = Math.min(10, trust)

  const trustIssue = !hasSP
    ? 'No testimonials or reviews found anywhere on the site — add social proof'
    : !hasTeam
      ? 'Social proof exists but no founder/team page — who built this?'
      : `Trust signals present: social proof ${hasTeam ? '+ team page' : ''} ${hasLogos ? '+ logos' : ''}`

  // ── 5. Conversion Readiness (0–10) ──────────────────────────────────────────
  const hasPricing  = !!pricing
  const hasFreeOpt  = /free|trial|demo|freemium|no credit|cancel/i.test(allPagesText)
  const hasMultiCTA = allBtns.filter(b => /start|try|get|sign|join|free|demo/i.test(b)).length >= 2

  let conversion = 2
  if (primaryCta)   conversion += 2
  if (hasPricing)   conversion += 2
  if (hasFreeOpt)   conversion += 2
  if (hasMultiCTA)  conversion += 2
  conversion = Math.min(10, conversion)

  const conversionIssue = !hasPricing
    ? 'No pricing page found — visitors can\'t make a buying decision without knowing the cost'
    : !hasFreeOpt
      ? 'Pricing page exists but no free trial or freemium option — add a low-risk entry point'
      : hasFreeOpt && !hasMultiCTA
        ? 'Free option exists but CTA only appears once — repeat it at key decision points'
        : `Strong — pricing page, free option, and multiple CTAs present`

  // ── Overall ──────────────────────────────────────────────────────────────────
  const overall = Math.round((clarity + journey + emotion + trust + conversion) / 5 * 10) / 10

  const dimensions = [
    { label:'Clarity',              score:clarity,    issue:clarityIssue    },
    { label:'User Journey',         score:journey,    issue:journeyIssue    },
    { label:'Emotional Pull',       score:emotion,    issue:emotionIssue    },
    { label:'Trust',                score:trust,      issue:trustIssue      },
    { label:'Conversion Readiness', score:conversion, issue:conversionIssue },
  ]
  const bottleneck = [...dimensions].sort((a,b) => a.score - b.score)[0]

  // ── Category ─────────────────────────────────────────────────────────────────
  const allForCat = (url + home.bestTitle + home.bestH1 + home.bestDesc + allH2s.join(' ')).toLowerCase()
  let category = 'App'
  if (/health|wellness|fitness|nutrition|mental|medical|diet|baby|mother|parenting/.test(allForCat)) category = 'Health & Wellness'
  else if (/legal|lawyer|law|attorney|court|contract|compliance/.test(allForCat))                    category = 'Legal'
  else if (/finance|invest|money|bank|payment|fintech|budget|tax/.test(allForCat))                   category = 'Finance'
  else if (/education|learn|course|school|teach|tutor|study/.test(allForCat))                        category = 'Education'
  else if (/ecommerce|shop|store|product|buy|sell|cart/.test(allForCat))                             category = 'E-commerce'
  else if (/saas|software|platform|dashboard|workflow|api|developer/.test(allForCat))                category = 'SaaS'
  else if (/marketing|social|content|brand|seo|ads|campaign/.test(allForCat))                        category = 'Marketing'
  else if (/productivity|task|project|manage|organise|team|collaborate/.test(allForCat))             category = 'Productivity'

  const teasers: Record<string,string> = {
    'Health & Wellness': 'A "day in the life" transformation series gets 3× more saves than product demos in your niche. Sign up to get the exact 7-post sequence built for your app.',
    'Legal':             'Weekly "myth vs fact" posts build authority faster than ads — lawyers and founders share them. Sign up for the exact post templates.',
    'Finance':           '"Money mistake Monday" reels consistently outperform product demos in finance. Sign up to get the weekly content calendar tailored to your app.',
    'Education':         '"Before/after learning" posts with specific outcomes convert cold audiences 5× faster than feature-first content. Sign up to get the templates.',
    'SaaS':              'Founder-led "how I built this" content drives more inbound than product demos for B2B apps. Sign up to get the 30-day content plan for your app.',
    'Marketing':         'Weekly teardowns of competitor campaigns build authority fast — your audience will tag you in every one. Sign up to get the format built for your niche.',
    'Productivity':      '"My exact workflow" posts are the highest-saved content format in your category. Sign up to get the weekly templates built around your specific features.',
    'E-commerce':        'Customer story reels with specific numbers convert 8× better than product showcases. Sign up for the templates.',
    'App':               '"Problem → solution" posts showing the exact moment your app saves the day is the highest-converting format for mobile apps. Sign up to get 7 done-for-you templates.',
  }

  // ── Pages analysed summary ───────────────────────────────────────────────────
  const pagesRead = Object.keys(pages).filter(k => k !== 'home')

  return {
    overall,
    headline: headline.slice(0,80) || 'No headline detected',
    category,
    dimensions,
    bottleneck:   { label: bottleneck.label, issue: bottleneck.issue },
    growth_teaser: teasers[category] ?? teasers['App'],
    pagesRead,
    isJSApp: home.wordCount < 100,
    scraped: {
      title:    home.bestTitle.slice(0,80),
      h1:       home.bestH1.slice(0,80),
      metaDesc: home.bestDesc.slice(0,120),
    },
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL required' })

  url = url.trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || 'unknown'
  if (!checkIpLimit(ip)) {
    return res.status(429).json({ error: 'You\'ve analyzed 3 URLs today — come back tomorrow or sign up for unlimited access.' })
  }

  try {
    const pages = await fullScrape(url)
    const result = score(pages, url)

    // Save lead
    try {
      const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
      supabase.from('markr_url_leads').insert({ url }).catch(() => {})
    } catch {}

    res.status(200).json(result)
  } catch (e) {
    res.status(422).json({ error: (e as Error).message })
  }
}
