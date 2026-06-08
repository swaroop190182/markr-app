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

  // Extract noscript content separately — contains static content for scrapers
  const noscriptContent = (html.match(/<noscript[^>]*>([\s\S]*?)<\/noscript>/i)?.[1] ?? '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  // Visible body (strips scripts, styles, noscript)
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  const bestTitle = title || ogT || twT || ''
  const bestDesc  = metaD || ogD || twD || jldText || ''
  const bestH1    = h1s[0] || ogT || title || ''
  const allText   = [bestTitle, bestDesc, bestH1, h2s.join(' '), h3s.join(' '), paras.join(' '), lis.join(' '), jldText, noscriptContent, body.slice(0, 2000)].join(' ')

  return {
    title, metaD, ogT, ogD, twT, twD, jldText,
    h1s, h2s, h3s, paras, lis, btns,
    body: body.slice(0, 3000),
    noscript: noscriptContent.slice(0, 2000),
    bestTitle, bestDesc, bestH1,
    allText: allText.slice(0, 5000),
      noscriptBtns: (noscriptContent.match(/>([^<]{3,60})</g) ?? [])
        .map(m => m.replace(/^>|<$/g,'').trim())
        .filter(t => /start|try|get|sign|join|analyze|free|demo|begin|access/i.test(t))
        .slice(0,5),
    wordCount: (body + ' ' + noscriptContent).split(' ').filter(w => w.length > 2).length,
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

// ── Parse nav links for about/team/story/founders pages ──────────────────────
function parseNavLinks(html: string, base: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const re = /href=["']([^"'#?\s][^"'\s]{0,300})["']/gi
  let m
  while ((m = re.exec(html)) !== null && out.length < 4) {
    try {
      const raw = m[1].trim()
      const abs = /^https?:\/\//i.test(raw) ? raw : new URL(raw, base).href
      const parsed = new URL(abs)
      if (parsed.origin !== base) continue
      if (!/about|team|story|founders?/i.test(parsed.pathname)) continue
      if (seen.has(abs)) continue
      seen.add(abs)
      out.push(abs)
    } catch {}
  }
  return out
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
  let mainHtml = await fetchSafe(url)
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

  // ── Nav-discovered about / team / founders pages ──────────────────────────
  const navAboutLinks = parseNavLinks(mainHtml, base)
  if (navAboutLinks.length > 0) {
    const navFetches = await Promise.allSettled(
      navAboutLinks.slice(0, 3).map(async u => {
        const html = await fetchSafe(u, 4000)
        if (!html) return null
        const data = extract(html)
        if (data.wordCount < 20) return null
        const seg = new URL(u).pathname.replace(/^\/|\/$/g, '').split('/')[0].replace(/-/g, '_') || 'about'
        return { key: seg, data }
      })
    )
    for (const r of navFetches) {
      if (r.status === 'fulfilled' && r.value) {
        const { key, data } = r.value
        if (!pages[key]) pages[key] = data
      }
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

  // Pages crawled label — used in issue strings
  const crawledPages = Object.keys(pages).join(', ')

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
  // Rule: clarity cannot exceed 7 if the features page exists but has 0 sections detected
  if (features && features.h2s.length === 0) clarity = Math.min(7, clarity)
  // Rule: 10/10 requires both features page with sections AND how-it-works page
  if (clarity === 10 && !(features && features.h2s.length > 0 && how)) clarity = 9

  const clarityIssue = !features && !how
    ? `Headline: "${headline.slice(0,55)}" — no features or how-it-works page found in pages analyzed: ${crawledPages}`
    : desc.length < 40
      ? 'Meta description is too short — expand it to explain the outcome clearly'
      : features
        ? `Clear — features page found with ${features.h2s.length} sections`
        : `Headline communicates value but no dedicated features page in pages analyzed: ${crawledPages}`

  // ── 2. User Journey (0–10) ──────────────────────────────────────────────────
  let journey = 3
  const primaryCta = allBtns.find(b => /start|try|get|sign|join|analyze|free|demo|launch|begin|access/i.test(b))
  if (primaryCta)                                                journey += 2
  if (primaryCta && !/^sign up$|^register$|^submit$|^click$/i.test(primaryCta)) journey += 2
  if (how)                                                       journey += 2  // has how-it-works
  if (home.hasViewport)                                          journey += 1
  journey = Math.min(10, journey)
  // Rule: 10/10 requires both an action CTA and a how-it-works page
  if (journey === 10 && !(primaryCta && how)) journey = 9

  const journeyIssue = !primaryCta
    ? `No action-oriented CTA found in pages analyzed: ${crawledPages} — users don't know what to do`
    : !how
      ? `CTA "${primaryCta.slice(0,40)}" exists but no how-it-works page in pages analyzed: ${crawledPages}`
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
  // Rule: 10/10 requires all three positive signals (you-focused, numbers, urgency)
  if (emotion === 10 && !(youCount >= 5 && hasNums && hasUrg)) emotion = 9

  const isJSOnlyApp = home.wordCount < 100
  const emotionIssue = (weCount > 0 && youCount < weCount)
    ? `Across all pages: "we/our" ${weCount}× vs "you/your" ${youCount}× — flip this to speak to users`
    : (youCount === 0 && weCount === 0 && isJSOnlyApp)
      ? 'JavaScript app — copy analysis limited to meta tags. Ensure og:description uses "you/your" language for accurate scoring'
      : !hasNums
        ? `No specific numbers found in pages analyzed: ${crawledPages} — add user counts, time saved, or results`
        : !hasUrg
          ? `Good user focus but missing urgency language in pages analyzed: ${crawledPages}`
          : `Strong — ${youCount} user-focused phrases, specific numbers present`

  // ── 4. Trust (0–10) ─────────────────────────────────────────────────────────
  const hasSP      = social || /testimonial|review|rating|stars|trusted|said|quote|blockquote|discord|community|feedback|users say|founders say/i.test(allPagesText)
  // Check every crawled page whose key contains about/team/founder/story —
  // nav-discovered pages land under keys like "team", "about_us", "founders"
  const aboutTeamPages = Object.entries(pages)
    .filter(([k]) => /about|team|founder|story/i.test(k))
    .map(([, p]) => p)
  const hasTeam    = aboutTeamPages.length > 0
                  || /founder|built by|created by|my story|why i built|about the founder/i.test(allPagesText)
  const hasLogos   = /trusted by|used by|as seen|featured in|partner/i.test(allPagesText)
  const hasNumbers = /\d+[k+]?\s*(?:users|customers|apps|founders|teams|reviews|clients)/i.test(allPagesText)

  // Detect early-stage signals
  const isEarlyStage = /beta|early.?access|coming.soon|launch|new|just.launched|v1|0\.1/i.test(allPagesText)
  const hasFounderStory = /built by|founded by|i built|we built|our story|started when|founder|my story|why i built/i.test(allPagesText)
  const hasQuotes = /blockquote|testimonial|said|quote|review|discord|community member|early user|beta/i.test(allPagesText)

  let trust = 2
  if (hasSP || hasQuotes)  trust += 3
  if (hasTeam)             trust += 2
  if (hasLogos)            trust += 2
  if (hasNumbers)          trust += 1
  if (hasFounderStory)     trust += 1
  // For JS apps with low content — don't penalise for what we can't detect
  // Give benefit of doubt if meta description is rich (suggests real content exists)
  if (isJSOnlyApp && home.bestDesc.length > 100) trust = Math.max(trust, 4)
  trust = Math.min(10, trust)
  // Rule: 10/10 requires both social proof and a team/about page
  if (trust === 10 && !(hasSP && hasTeam)) trust = 9

  const trustIssue = isJSOnlyApp && trust <= 4
    ? `JavaScript app — trust signals may exist but can't be read by crawler. Add og:description and structured data (JSON-LD) for accurate scoring`
    : !hasSP && !hasFounderStory
      ? `No social proof or founder story found in pages analyzed: ${crawledPages} — even 1 testimonial or "why I built this" story doubles trust`
      : !hasSP && hasFounderStory
        ? `Founder story detected but no user testimonials in pages analyzed: ${crawledPages} — add 1-2 early user quotes`
        : !hasTeam
          ? `Social proof exists but no about/team page in pages analyzed: ${crawledPages} — show who built this`
          : `Trust signals present: social proof ${hasTeam ? '+ team' : ''} ${hasLogos ? '+ logos' : ''}`

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
  // Rule: 10/10 requires pricing, free option, and multiple CTAs all present
  if (conversion === 10 && !(hasPricing && hasFreeOpt && hasMultiCTA)) conversion = 9

  const conversionIssue = !hasPricing
    ? `No pricing page found in pages analyzed: ${crawledPages} — visitors can't make a buying decision without knowing the cost`
    : !hasFreeOpt
      ? 'Pricing page exists but no free trial or freemium option — add a low-risk entry point'
      : hasFreeOpt && !hasMultiCTA
        ? 'Free option exists but CTA only appears once — repeat it at key decision points'
        : `Strong — pricing page, free option, and multiple CTAs present`

  // ── Overall — pure average of 5 dimensions, no inflation ────────────────────
  const overall = Math.round((clarity + journey + emotion + trust + conversion) / 5 * 10) / 10

  const dimensions = [
    { label:'Clarity',              score:clarity,    issue:clarityIssue    },
    { label:'User Journey',         score:journey,    issue:journeyIssue    },
    { label:'Emotional Pull',       score:emotion,    issue:emotionIssue    },
    { label:'Trust',                score:trust,      issue:trustIssue      },
    { label:'Conversion Readiness', score:conversion, issue:conversionIssue },
  ]

  // Rule: bottleneck must be a dimension whose issue describes something negative/missing.
  // Never pick one whose issue starts with a positive phrase.
  const sortedDims = [...dimensions].sort((a, b) => a.score - b.score)

  const isNegativeIssue = (issue: string) =>
    /^(no |missing |not found|lacks|without|headline:|meta description|good user focus but|founder story detected but|social proof exists but|free option exists but|across all pages:|javascript app)/i.test(issue)

  const isPositiveIssue = (issue: string) =>
    /^(clear|strong|cta|pricing page exists|trust signals present)/i.test(issue)

  const couldBeStronger: Record<string, string> = {
    'Clarity':              'Could be stronger — add a dedicated features page with clearly labelled sections',
    'User Journey':         'Could be stronger — add a how-it-works page to guide first-time visitors',
    'Emotional Pull':       'Could be stronger — add specific numbers (users helped, results achieved, time saved)',
    'Trust':                'Could be stronger — add a team/about page or 1–2 early user testimonials',
    'Conversion Readiness': 'Could be stronger — add a pricing page or a free trial entry point',
  }

  // Pick the lowest-scored dimension that has a genuinely negative issue
  const negBottleneck = sortedDims.find(d => isNegativeIssue(d.issue) && !isPositiveIssue(d.issue))
  // If all dimensions have positive issue text, rewrite the lowest-scored one
  const bottleneck = negBottleneck
    ?? { ...sortedDims[0], issue: couldBeStronger[sortedDims[0].label] ?? `Could be stronger — review your ${sortedDims[0].label.toLowerCase()}` }

  // ── Category ─────────────────────────────────────────────────────────────────
  const allForCat = (url + home.bestTitle + home.bestH1 + home.bestDesc + allH2s.join(' ') + allParas.join(' ')).toLowerCase()
  let category = 'App'
  // Rule: Health & Wellness requires 2+ distinct health-related terms to avoid
  // misclassifying SaaS/productivity apps that mention "mental models" or "team health"
  const healthTerms = (allForCat.match(/\b(health|wellness|fitness|nutrition|mental health|medical|diet|baby|parenting|toddler|infant|pregnant|pregnancy|tummy|tummies|mother)\b/gi) ?? []).length
  const foodTerms   = (allForCat.match(/\b(food|recipe|cook|meal|restaurant|calorie|nutrition|eat)\b/gi) ?? []).length
  if (healthTerms >= 2 || foodTerms >= 2)                                                              category = 'Health & Wellness'
  else if (/legal|lawyer|law|attorney|court|contract|compliance|lawsuit|litigation/.test(allForCat))  category = 'Legal'
  else if (/finance|invest|money|bank|payment|fintech|budget|tax|accounting|invoice/.test(allForCat)) category = 'Finance'
  else if (/education|learn|course|school|teach|tutor|study|quiz|lesson|curriculum/.test(allForCat))  category = 'Education'
  else if (/ecommerce|shop|store|product|buy|sell|cart|checkout|order|delivery/.test(allForCat))      category = 'E-commerce'
  else if (/saas|software|platform|dashboard|workflow|api|developer|integration|b2b/.test(allForCat)) category = 'SaaS'
  else if (/marketing|social|content|brand|seo|ads|campaign|instagram|twitter|tiktok/.test(allForCat)) category = 'Marketing'
  else if (/productivity|task|project|manage|organise|team|collaborate|kanban|sprint/.test(allForCat)) category = 'Productivity'
  else if (/travel|trip|hotel|flight|booking|itinerary|destination/.test(allForCat))                  category = 'Travel'
  else if (/real.?estate|property|rent|mortgage|home|apartment|housing/.test(allForCat))              category = 'Real Estate'

  const teasers: Record<string,string> = {
    'Health & Wellness': `"Before & after" content showing real user transformations gets 3× more saves than product demos in health. For ${home.bestH1 ? `an app like "${home.bestH1.slice(0,40)}"` : 'your niche'}, a weekly win series builds trust fast. Sign up — Markr will generate this content for your app specifically.`,
    'Legal':             `Weekly "myth vs fact" posts demystifying ${home.bestH1 ? `"${home.bestH1.slice(0,40)}"` : 'legal topics'} build authority faster than ads — professionals share them. Sign up — Markr generates posts like these for your app daily.`,
    'Finance':           `"Money mistake" reels showing the problems your app solves consistently outperform product demos. Sign up — Markr generates content tailored to ${home.bestH1 ? `"${home.bestH1.slice(0,35)}"` : 'your app'} every morning.`,
    'Education':         `"Before/after learning" posts with specific skill outcomes convert cold audiences 5× faster than feature demos. Sign up — Markr generates posts like these for ${home.bestH1 ? `"${home.bestH1.slice(0,35)}"` : 'your app'} automatically.`,
    'SaaS':              `Founder-led "how I solved X" content drives more inbound than product demos for B2B. For ${home.bestH1 ? `"${home.bestH1.slice(0,40)}"` : 'your app'}, a weekly problem-solving series builds pipeline. Sign up — Markr generates this for your app.`,
    'Marketing':         `Weekly teardowns showing how ${home.bestH1 ? `"${home.bestH1.slice(0,35)}"` : 'your app'} outperforms competitors build authority fast. Sign up — Markr generates content like this for your specific app every day.`,
    'Productivity':      `"My exact workflow using ${home.bestTitle.split('—')[0].trim() || 'this app'}" posts are the highest-saved format in productivity. Sign up — Markr generates posts like these built around your app's actual features.`,
    'E-commerce':        `Customer story reels with specific numbers ("saved ₹2,000 this month") convert 8× better than product showcases. Sign up — Markr generates content tailored to ${home.bestH1 ? `"${home.bestH1.slice(0,35)}"` : 'your store'} automatically.`,
    'Travel':            `"Hidden gem" and "mistake I made" travel content consistently outperforms destination guides. Sign up — Markr generates posts like these for your specific app every morning.`,
    'Real Estate':       `"What ₹X buys in [city]" content drives massive engagement in real estate. Sign up — Markr generates posts like these built around your specific market and app.`,
    'App':               `"Problem → solution" posts showing the exact moment ${home.bestTitle.split('—')[0].trim() || 'your app'} saves the day is the highest-converting format. Sign up — Markr generates content like this for your app every single day.`,
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

  const isInternal = req.headers['x-internal-call'] === 'markr_internal'
  const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || 'unknown'
  if (!isInternal && !checkIpLimit(ip)) {
    return res.status(429).json({ error: 'You\'ve analyzed 3 URLs today — come back tomorrow or sign up for unlimited access.' })
  }

  try {
    const pages = await fullScrape(url)

    // Confidence check — total words scraped across all pages
    const totalWords = Object.values(pages).reduce((sum, p) => sum + p.wordCount, 0)
    const totalPages = Object.keys(pages).length
    const hasRichContent = totalWords > 200 || (pages.home.bestTitle && pages.home.bestDesc)

    if (!hasRichContent) {
      return res.status(200).json({
        blocked: true,
        url,
        message: "We couldn't read enough content from this site to give an accurate score.",
        reason: totalWords < 50
          ? "This site appears to have bot protection (Cloudflare, etc.) or serves content only to browsers."
          : "This site uses heavy JavaScript rendering with no meta tags — not enough content to analyze.",
        suggestion: "Try analyzing your own app's landing page URL for the most accurate results."
      })
    }

    // Confidence level — factor in meta tag richness for JS apps
    const hasRichMeta = pages.home.bestDesc.length > 80 && pages.home.bestTitle.length > 10
    const confidence = totalWords > 1000 || totalPages >= 4 ? 'high'
                     : totalWords > 300  || totalPages >= 2 ? 'medium'
                     : hasRichMeta ? 'medium'
                     : totalWords < 100 && hasRichMeta ? 'js-app'
                     : 'low'

    const result = score(pages, url)
    ;(result as any).confidence = confidence
    ;(result as any).totalWords = totalWords

    // Save lead
    try {
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      )
      const { error } = await supabase.from('markr_url_leads').insert({
        url,
        score: result.overall ?? null,
        headline: result.headline ?? null,
        created_at: new Date().toISOString(),
        converted: false
      })
      if (error) console.error('Lead insert error:', error.message)
    } catch(e) { console.error('Lead save failed:', e) }

    
    res.status(200).json(result)
  } catch (e) {
    const err = e as Error
    console.error('analyze-url error:', err.message, err.stack)
    res.status(422).json({ 
      error: err.message,
      detail: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    })
  }
}
