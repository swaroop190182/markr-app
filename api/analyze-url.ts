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
  const getAll = (tag: string, n = 6, maxChars = 200) => {
    const out: string[] = []; const re = new RegExp(`<${tag}[^>]*>([\\s\\S]{1,${maxChars}}?)<\\/${tag}>`, 'gi'); let m
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
  const paras   = getAll('p', 20, 400)
  const lis     = getAll('li', 20, 400)

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
  const allText   = [bestTitle, bestDesc, bestH1, h2s.join(' '), h3s.join(' '), paras.join(' '), lis.join(' '), jldText, noscriptContent, body.slice(0, 8000)].join(' ')

  return {
    title, metaD, ogT, ogD, twT, twD, jldText,
    h1s, h2s, h3s, paras, lis, btns,
    body: body.slice(0, 8000),
    noscript: noscriptContent.slice(0, 2000),
    bestTitle, bestDesc, bestH1,
    allText: allText.slice(0, 15000),
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

  // ── JS SPA detection ──────────────────────────────────────────────────────
  // Raw HTML under 2KB is almost certainly a SPA shell — no legitimate static
  // landing page is ever that small.
  const isJsSpa = (
    mainHtml.includes('__NEXT_DATA__') ||
    mainHtml.includes('__nuxt') ||
    (mainHtml.includes('<div id="root">') && mainHtml.length < 8000) ||
    (mainHtml.includes('<div id="app">') && mainHtml.length < 8000) ||
    mainHtml.includes('window.__') ||
    mainHtml.length < 2000
  )

  // ── Railway renderer — only for JS SPAs ──────────────────────────────────
  let renderedByHeadless = false
  if (isJsSpa && process.env.RENDERER_URL && process.env.RENDERER_SECRET) {
    try {
      const rendered = await Promise.race([
        fetch(`${process.env.RENDERER_URL}/render`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-renderer-secret': process.env.RENDERER_SECRET,
          },
          body: JSON.stringify({ url }),
        }).then(r => r.json()),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 20000)),
      ])
      if (rendered?.html && rendered.html.length > 5000) {
        mainHtml = rendered.html
        renderedByHeadless = true
        console.log('[analyze-url] Used Railway renderer — chars:', rendered.html.length)
      }
    } catch (err) {
      console.error('[analyze-url] Renderer failed, using static HTML:', err)
    }
  }

  // ── Firecrawl fallback — only for JS SPAs ────────────────────────────────
  if (isJsSpa && process.env.FIRECRAWL_API_KEY) {
    try {
      const timeout = new Promise<null>(resolve => {
        const t = setTimeout(() => resolve(null), 8000)
        ;(t as any).unref?.()
      })

      const fcPromise = fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 2000,
        }),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)

      const fcResult = await Promise.race([fcPromise, timeout])

      if (fcResult?.data?.markdown && fcResult.data.markdown.length > 300) {
        const meta    = fcResult.data.metadata ?? {}
        const fcTitle = meta.title ?? meta.ogTitle ?? ''
        const fcDesc  = meta.description ?? meta.ogDescription ?? ''
        const fcBody  = fcResult.data.markdown
          .replace(/^#{1,6}\s+/gm, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/[*_`]/g, '')
          .slice(0, 6000)

        mainHtml = [
          '<html><head>',
          `<title>${fcTitle}</title>`,
          `<meta name="description" content="${fcDesc.replace(/"/g, '').slice(0, 300)}">`,
          `<meta property="og:title" content="${fcTitle.replace(/"/g, '')}">`,
          `<meta property="og:description" content="${fcDesc.replace(/"/g, '').slice(0, 300)}">`,
          '</head><body>',
          `<h1>${fcTitle}</h1>`,
          fcBody.replace(/\n\n+/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>'),
          '</body></html>',
        ].join('\n')

        console.log('[firecrawl] success — content length:', fcBody.length)
      }
    } catch (fcErr) {
      console.error('[firecrawl] error (non-fatal):', (fcErr as Error).message)
    }
  }

  const main = extract(mainHtml)

  // For JS SPAs, OG/Twitter tags are the intended headline and description —
  // h1s are empty before JS renders, and <title> is often the app name, not copy.
  if (isJsSpa) {
    const ogTitle = main.ogT || main.twT || main.title
    const ogDesc  = main.ogD || main.twD || main.metaD
    if (ogTitle) { main.bestTitle = ogTitle; main.bestH1 = ogTitle }
    if (ogDesc)  { main.bestDesc  = ogDesc }
    // Rebuild allText so scoring functions see the updated values
    main.allText = [
      main.bestTitle, main.bestDesc, main.bestH1,
      main.h2s.join(' '), main.h3s.join(' '), main.paras.join(' '),
      main.lis.join(' '), main.jldText, main.noscript, main.body.slice(0, 2000),
    ].join(' ').slice(0, 5000)
  }

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

  return { pages, renderedByHeadless, isJsSpa, htmlLength: mainHtml.length }
}

// ── Dimension weights — reflect business importance, sum to 1.0 ──────────────
const DIMENSION_WEIGHTS: Record<string, number> = {
  'Clarity': 0.20,
  'User Journey': 0.15,
  'Emotional Pull': 0.10,
  'Trust': 0.25,
  'Conversion Readiness': 0.30,
}

// ── Score the app ─────────────────────────────────────────────────────────────
function score(pages: Record<string, ReturnType<typeof extract>>, url: string, renderedByHeadless: boolean, isJsSpa: boolean, htmlLength: number) {
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
  const allH3s       = Object.values(pages).flatMap(p => p.h3s)
  const allParas     = Object.values(pages).flatMap(p => p.paras)
  const allBtns      = Object.values(pages).flatMap(p => p.btns)
  const homeBodyText = home.body + ' ' + home.noscript + ' ' + home.allText
  const hasHow       = !!how
    // "Step N" in any page text (2+ occurrences implies a sequence)
    || (allPagesText.match(/\bstep\s*(?:\d+|one|two|three|four|five)\b/gi) ?? []).length >= 2
    // H2 or H3 heading containing how / works / steps / get started
    || [...allH2s, ...allH3s].some(h => /\bhow\b|\bworks?\b|\bsteps?\b|\bget\s*started\b/i.test(h))
    // Numbered sequence "1. … 2. … 3." in body text
    || /\b1\.\s.+\b2\.\s.+\b3\./s.test(homeBodyText)
    // Ordinal labels "01 … 02 … 03" as used in hero sections
    || /\b0?1\b[\s\S]{3,300}\b0?2\b[\s\S]{3,300}\b0?3\b/.test(homeBodyText)
    // 3+ "N. word" numbered items anywhere in home text
    || (homeBodyText.match(/(?<!\d)\d\.[ \t]+[A-Za-z]/g) ?? []).length >= 3

  // Low word count only means "unverifiable" when static HTML was the only source.
  // Once the Railway renderer has supplied full HTML, a missing signal is a genuine
  // absence, not a rendering limitation — so isJSOnlyApp is suppressed in that case.
  const isJSOnlyApp = home.wordCount < 100 && !renderedByHeadless

  const headline = home.bestH1 || home.bestTitle
  const desc     = home.bestDesc

  // Truncate headline to a word boundary — never mid-word
  const truncH = (s: string, max = 80): string => {
    if (s.length <= max) return s
    const cut = s.slice(0, max)
    const lastSpace = cut.lastIndexOf(' ')
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…'
  }

  // ── 1. Clarity (0–10) ───────────────────────────────────────────────────────
  let clarity = 2
  if (headline.length > 8)                                       clarity += 2
  if (headline.split(' ').length >= 3 && headline.split(' ').length <= 14) clarity += 1
  if (desc.length > 40)                                          clarity += 2
  if (features)                                                  clarity += 2  // has features page
  if (hasHow)                                                    clarity += 1  // explains how it works
  clarity = Math.min(10, clarity)
  // Rule: clarity cannot exceed 7 if the features page exists but has 0 sections detected
  if (features && features.h2s.length === 0) clarity = Math.min(7, clarity)
  // Rule: 10/10 requires both features page with sections AND how-it-works page
  if (clarity === 10 && !(features && features.h2s.length > 0 && hasHow)) clarity = 9
  // Buzzword penalty: -1 per vague jargon word in headline, max -3
  const detectedBuzzwords = headline.match(/\b(platform|solution|ecosystem|leverage|transform|revolutionary|cutting-edge)\b/gi) ?? []
  const buzzwordCount = detectedBuzzwords.length
  clarity -= Math.min(3, buzzwordCount)
  clarity = Math.max(0, clarity)
  // Cap at 8 unless headline has a clear outcome verb
  if (!/\b(get|save|build|fix|track|grow|send|launch|ship)\b/i.test(headline)) clarity = Math.min(8, clarity)

  const hasOutcomeVerb = /\b(get|save|build|fix|track|grow|send|launch|ship)\b/i.test(headline)
  const clarityIssue = !headline || headline.length <= 8
    ? isJSOnlyApp
      ? 'Headline not detected in HTML crawl (JavaScript page — may be incomplete) — ensure og:title meta tag is set'
      : 'No clear headline found — add an H1 that states what users gain'
    : detectedBuzzwords.length > 0
      ? `Headline: "${truncH(headline)}" — buzzwords detected (${detectedBuzzwords.join(', ')}) — replace with specific outcomes`
      : !hasOutcomeVerb
        ? `Headline: "${truncH(headline)}" — no outcome verb detected (get, save, build, fix, track, grow)`
        : !features && !hasHow
          ? `Headline: "${truncH(headline)}" — clear, but no features or how-it-works page in pages analyzed: ${crawledPages}`
          : `Headline: "${truncH(headline)}" — clear with outcome verb`

  // ── 2. User Journey (0–10) ──────────────────────────────────────────────────
  const primaryCta = allBtns.find(b => /start|try|get|sign|join|analyze|free|demo|launch|begin|access|explore|download/i.test(b))
  const hasWeakCtaOnly = !primaryCta
    && allBtns.length > 0
    && allBtns.some(b => /\b(learn more|contact(?: us)?|submit)\b/i.test(b))
  let journey = 3
  journey += primaryCta ? 2 : isJSOnlyApp ? 1 : 0  // half penalty — buttons may not load in static HTML
  if (primaryCta && !/^sign up$|^register$|^submit$|^click$/i.test(primaryCta)) journey += 2
  if (hasHow)                                                    journey += 2  // has how-it-works
  if (home.hasViewport)                                          journey += 1
  if (hasWeakCtaOnly)                                            journey -= 2  // penalize weak-only CTAs
  journey = Math.min(10, Math.max(0, journey))
  // Rule: 10/10 requires both an action CTA and a how-it-works page
  if (journey === 10 && !(primaryCta && hasHow)) journey = 9

  const ctaButtonList = allBtns.slice(0, 3).map(b => `"${b.slice(0,20)}"`).join(', ')
  const journeyIssue = !primaryCta && allBtns.length === 0
    ? isJSOnlyApp
      ? `No CTA buttons detected in HTML crawl (JavaScript page — buttons may not be reflected) — pages: ${crawledPages}`
      : `No action CTA or buttons found in pages analyzed: ${crawledPages}`
    : !primaryCta
      ? isJSOnlyApp
        ? `Action CTA not detected in HTML crawl (JavaScript page — may be incomplete) — buttons found: ${ctaButtonList || 'none'}`
        : `No action CTA found — buttons detected: ${ctaButtonList || 'none'}`
      : !hasHow
        ? `CTA "${primaryCta.slice(0,40)}" found but no how-it-works page in pages analyzed: ${crawledPages}`
        : `CTA "${primaryCta.slice(0,40)}" found with how-it-works path`

  // ── 3. Emotional Pull (0–10) ────────────────────────────────────────────────
  const youCount = (allPagesText.match(/\byou\b|\byour\b/gi) ?? []).length
  const weCount  = (allPagesText.match(/\bwe\b|\bour\b|\bwe've\b/gi) ?? []).length
  const hasUrg   = /free|now|today|start|instantly|minutes|fast|quick/i.test(allPagesText)
  // Currency-agnostic outcome number detection — signal is context, not currency symbol.
  const hasNums = (
    // Pattern 1: number near earning/income outcome words
    /\d+[k+]?\+?\s*(?:per month|\/month|\/mo|a month|earned|made|income|revenue|profit|salary|in sales|per year|\/year)/i.test(allPagesText)
    // Pattern 2: multiplier outcomes
    || /\d+x\s*(?:more|faster|revenue|growth|return|roi)/i.test(allPagesText)
    // Pattern 3: named testimonial with result (quoted text 15+ chars followed by a name within 100 chars)
    || /["'][^"']{15,300}["'][\s\S]{0,100}[A-Z][a-z]{2,}/.test(allPagesText)
    // Pattern 4: income-size references (language-agnostic)
    || /(?:six|6|seven|7).?figure|(?:double|triple|10x)\s*(?:my|their|revenue|income|salary)/i.test(allPagesText)
  )

  const hasYouFocus = youCount > weCount * 1.2 || youCount >= 5

  let emotion = 2
  if (hasYouFocus)  emotion += 3
  emotion += hasNums ? 3 : isJSOnlyApp ? 1 : 0  // outcome numbers often in JS-rendered content — half penalty
  if (hasUrg)       emotion += 2
  emotion = Math.min(10, emotion)
  // Rule: 10/10 requires all three positive signals (you-focused, numbers, urgency)
  if (emotion === 10 && !(youCount >= 5 && hasNums && hasUrg)) emotion = 9

  const emotionIssue = !hasNums && !hasYouFocus
    ? isJSOnlyApp
      ? `Outcome numbers and you-focused language not detected in HTML crawl (JavaScript page — may be incomplete) — pages: ${crawledPages}`
      : `No specific numbers or user-focused language in pages analyzed: ${crawledPages}`
    : hasYouFocus && !hasNums
      ? `${youCount} "you/your" phrases found but no outcome numbers in pages analyzed: ${crawledPages}`
      : !hasYouFocus && hasNums
        ? `Outcome numbers found but "we/our" (${weCount}×) outnumbers "you/your" (${youCount}×)`
        : `${youCount} "you/your" phrases and outcome numbers found in pages analyzed: ${crawledPages}`

  // ── 4. Trust (0–10) ─────────────────────────────────────────────────────────
  const hasStatPattern       = /\d+[KkMm]?\+?\s*(users|learners|creators|customers|members)/gi.test(allPagesText)
  const hasStarRating        = /\d\.\d\s*★|\d\.\d\/5/.test(allPagesText)
  const hasNamedTestimonials = /["'][^"']{10,200}["']\s*[—–-]\s*[A-Z]/.test(allPagesText)
  const hasSP      = social
    || /testimonial|review|rating|stars|trusted|said|quote|blockquote|discord|community|feedback|users say|founders say|used by|loved by|teams at|powering|backed by/i.test(allPagesText)
    || hasNamedTestimonials
    || hasStatPattern
    || hasStarRating
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

  // Weighted trust: social proof (up to 3), team/about (up to 2), logo wall (up to 2), traction (up to 1)
  // Unverifiable js-app signals get half penalty instead of 0
  const tSP      = (hasSP || hasQuotes)              ? 3
                 : (hasStatPattern || hasStarRating)  ? 2  // partial signal — stat or rating found
                 : isJSOnlyApp                        ? 1  // could not verify — half penalty
                 : 0
  const tTeam    = hasTeam                            ? 2
                 : hasFounderStory                    ? 1
                 : isJSOnlyApp                        ? 1  // could not verify — half penalty
                 : 0
  const tLogo    = hasLogos                           ? 2
                 : isJSOnlyApp                        ? 1  // could not verify — half penalty
                 : 0
  const tTraction = hasNumbers                        ? 1 : 0

  let trust = Math.min(10, 2 + tSP + tTeam + tLogo + tTraction)
  // Rule: 10/10 requires both social proof and a team/about page
  if (trust >= 10 && !(hasSP && hasTeam)) trust = 9

  const jsUnverifiable = (label: string) =>
    isJSOnlyApp ? `${label} — could not verify (JavaScript page)` : `no ${label}`
  const trustParts = [
    (hasSP || hasQuotes)              ? 'social proof found'
    : (hasStatPattern || hasStarRating) ? 'stat/rating signal found'
    : jsUnverifiable('social proof'),
    hasTeam                           ? 'team page found'
    : hasFounderStory                 ? 'founder story found'
    : jsUnverifiable('team page'),
    hasLogos                          ? 'logo wall found' : jsUnverifiable('logo wall'),
  ]
  const trustIssue = `${trustParts.join(', ')} in pages analyzed: ${crawledPages}`

  // ── 5. Conversion Readiness (0–10) ──────────────────────────────────────────
  const hasPricingPage = !!pricing
  // Universal price detection — currency symbol+amount, amount+ISO code, Rs/Rp text prefixes, or amount+billing period
  const PRICE_REGEX = /[\$£€¥₹₩₪₫₴₦₵₲₱฿₭₮₯₰₳₺₼₽﹩＄]\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|INR|JPY|CAD|AUD|CHF|CNY|KRW|BRL|MXN|SGD|HKD|NOK|SEK|DKK|PLN|CZK|HUF|RON|BGN|HRK|RUB|TRY|SAR|AED|MYR|THB|IDR|PHP|VND|PKR|BDT|LKR|NGN|KES|GHS|ZAR)|(?:Rs\.?|Rp\.?)\s*[\d,]+|[\d,]+\s*(?:\/mo|\/month|\/yr|\/year|per month|per year)/gi
  // Explicit Unicode rupee symbol — catches ₹49/mo, ₹49, etc.
  const hasRupeePrice = /₹\s*\d+/.test(allPagesText)
  const hasResetPlus = /reset plus/i.test(allPagesText) // named paid tier
  const hasPriceInText = PRICE_REGEX.test(allPagesText) || hasRupeePrice || hasResetPlus
  const rupeeIdx = allPagesText.indexOf('₹')
  console.log(
    '[pricing] rupee found:', /₹/.test(allPagesText),
    rupeeIdx >= 0 ? `context: "${allPagesText.slice(Math.max(0, rupeeIdx - 30), rupeeIdx + 30)}"` : `not found — allPagesText length: ${allPagesText.length}, sample: "${allPagesText.slice(0, 200)}"`
  )
  const hasPricing  = hasPricingPage || hasPriceInText
  // Universal free-tier phrases — currency-agnostic, boundary-anchored to avoid matching "$10/mo" as "0/mo"
  const FREE_TIER_PHRASES = [
    'free forever', 'free plan', 'free tier', 'free trial',
    'start free', 'try free', 'no credit card', 'always free',
    'free to use', 'free to download', 'free to start',
    '₹0', '$0', '€0', '£0',
  ]
  const hasFreeOpt = FREE_TIER_PHRASES.some(phrase => allPagesText.toLowerCase().includes(phrase))
    || /\b0\/mo\b|\b0\/month\b/i.test(allPagesText)
  const hasMultiCTA = allBtns.filter(b => /start|try|get|sign|join|free|demo|explore|download/i.test(b)).length >= 2

  let conversion = 2
  conversion += primaryCta  ? 2 : isJSOnlyApp ? 1 : 0
  conversion += hasPricing  ? 2 : isJSOnlyApp ? 1 : 0
  conversion += hasFreeOpt  ? 2 : isJSOnlyApp ? 1 : 0
  conversion += hasMultiCTA ? 2 : isJSOnlyApp ? 1 : 0
  conversion = Math.min(10, conversion)
  // Rule: 10/10 requires pricing, free option, and multiple CTAs all present
  if (conversion >= 10 && !(hasPricing && hasFreeOpt && hasMultiCTA)) conversion = 9

  const strongCtaCount = allBtns.filter(b => /start|try|get|sign|join|free|demo|explore|download/i.test(b)).length
  const conversionIssue = [
    hasPricingPage    ? 'pricing page found'
    : hasPriceInText  ? 'pricing found in page content'
    : isJSOnlyApp     ? 'pricing — could not verify (JavaScript page)'
    : 'no pricing page',
    hasFreeOpt        ? 'free option found'
    : isJSOnlyApp     ? 'free option — could not verify (JavaScript page)'
    : 'no free option',
    `${strongCtaCount} strong CTA${strongCtaCount === 1 ? '' : 's'} detected`,
  ].join(', ') + ` in pages analyzed: ${crawledPages}`

  // 'not_found_rendered': the Railway renderer supplied full HTML and the signal
  // still wasn't found — a confident absence, distinct from a static-HTML-only
  // page where JS content could genuinely be hiding the signal (unverifiable_js).
  const vs = (found: boolean): 'verified_present' | 'verified_absent' | 'unverifiable_js' | 'not_found_rendered' =>
    found ? 'verified_present'
    : isJSOnlyApp ? 'unverifiable_js'
    : renderedByHeadless ? 'not_found_rendered'
    : 'verified_absent'

  // Trust and User Journey → 'pending' when unverifiable; other dims → 'na'
  const dsp = (label: string, score: number, vst: string): number | 'pending' | 'na' =>
    vst !== 'unverifiable_js' ? score
    : (label === 'Trust' || label === 'User Journey') ? 'pending' : 'na'

  // Floor for genuinely-absent-after-full-render signals: a live rendered product
  // probably has *some* minimal credibility even where we found no concrete signal.
  const NOT_FOUND_RENDERED_FLOOR: Record<string, number> = { Trust: 2 }
  const applyFloor = (label: string, rawScore: number, vst: string): number =>
    vst === 'not_found_rendered' ? Math.max(rawScore, NOT_FOUND_RENDERED_FLOOR[label] ?? 3) : rawScore

  const _rawDims = [
    { label:'Clarity',              score:clarity,    issue:clarityIssue,    verificationStatus: vs(!!headline && headline.length > 8) },
    { label:'User Journey',         score:journey,    issue:journeyIssue,    verificationStatus: vs(!!primaryCta) },
    { label:'Emotional Pull',       score:emotion,    issue:emotionIssue,    verificationStatus: vs(hasNums || hasYouFocus) },
    { label:'Trust',                score:trust,      issue:trustIssue,      verificationStatus: vs(!!(hasSP || hasTeam)) },
    { label:'Conversion Readiness', score:conversion, issue:conversionIssue, verificationStatus: vs(!!(hasPricing || primaryCta)) },
  ]
  const dimensions = _rawDims.map(d => {
    const flooredScore = applyFloor(d.label, d.score, d.verificationStatus)
    return { ...d, score: flooredScore, displayScore: dsp(d.label, flooredScore, d.verificationStatus) }
  })

  // ── Confidence- and dimension-weighted overall ───────────────────────────────
  // Each dimension counts by its DIMENSION_WEIGHTS share (Conversion Readiness >
  // Trust > Clarity > User Journey > Emotional Pull). unverifiable_js dims count
  // at 70% of their dimension weight, score blended 70% toward actual + 30%
  // toward neutral 5.5 — avoids punishing JS apps as hard as apps that verifiably
  // lack signals.
  const NEUTRAL = 5.5
  let totalW = 0, totalS = 0
  for (const dim of dimensions) {
    const dimWeight = DIMENSION_WEIGHTS[dim.label] ?? 0.20
    if (dim.verificationStatus === 'unverifiable_js') {
      const w = dimWeight * 0.7
      totalS += w * (0.7 * dim.score + 0.3 * NEUTRAL)
      totalW += w
    } else {
      totalS += dimWeight * dim.score
      totalW += dimWeight
    }
  }
  const overall = Math.round(totalS / totalW * 10) / 10

  // Caps only apply when a low score is verified_absent — never for unverifiable JS signals
  let finalOverall = overall
  let cappedBy: string | null = null
  if (clarity < 4 && dimensions[0].verificationStatus !== 'unverifiable_js')    { finalOverall = Math.min(finalOverall, 5); cappedBy = 'Clarity' }
  if (trust < 4 && dimensions[3].verificationStatus !== 'unverifiable_js')      { finalOverall = Math.min(finalOverall, 6); cappedBy = cappedBy ?? 'Trust' }
  if (conversion < 4 && dimensions[4].verificationStatus !== 'unverifiable_js') { finalOverall = Math.min(finalOverall, 6); cappedBy = cappedBy ?? 'Conversion Readiness' }

  // confidencePercent: verified dims count 1.0, unverifiable count 0.5 (we could assess them partially)
  const unverifiableCount = dimensions.filter(d => d.verificationStatus === 'unverifiable_js').length
  const verifiedCount = dimensions.length - unverifiableCount
  const confidencePercent = Math.round((verifiedCount + 0.5 * unverifiableCount) / dimensions.length * 100)

  // ── Verified Score — weighted average of confirmed dims only (null if < 3 verified) ──
  const verifiedDims = dimensions.filter(d => d.verificationStatus !== 'unverifiable_js')
  const verifiedWeightSum = verifiedDims.reduce((s, d) => s + (DIMENSION_WEIGHTS[d.label] ?? 0.20), 0)
  const verifiedScore: number | null = verifiedDims.length >= 3
    ? Math.round(verifiedDims.reduce((s, d) => s + d.score * (DIMENSION_WEIGHTS[d.label] ?? 0.20), 0) / verifiedWeightSum * 10) / 10
    : null
  const coverage = confidencePercent

  // ── What we checked — per-signal verification checklist ─────────────────────
  const checkedSignals = [
    { label: 'Headline',         found: !!(headline && headline.length > 8), js: false },
    { label: 'Meta description', found: home.bestDesc.length > 20,           js: false },
    { label: 'H1 tag',           found: !!home.h1s[0],                        js: false },
    { label: 'How-it-works',     found: hasHow,                                js: !hasHow && isJSOnlyApp },
    { label: 'CTA button',       found: !!primaryCta,                          js: !primaryCta && isJSOnlyApp },
    { label: 'Pricing',          found: hasPricing,                            js: !hasPricing && isJSOnlyApp },
    { label: 'Social proof',     found: !!(hasSP || hasQuotes),                 js: !(hasSP || hasQuotes) && isJSOnlyApp },
    { label: 'Team / About',     found: hasTeam,                                js: !hasTeam && isJSOnlyApp },
  ]

  // ── Bottleneck ───────────────────────────────────────────────────────────────
  const sortedDims = [...dimensions].sort((a, b) => a.score - b.score)

  const isNegativeIssue = (issue: string) =>
    /\bno\b\s|buzzwords? detected|outnumbers/i.test(issue)

  const couldBeStronger: Record<string, string> = {
    'Clarity':              'Could be stronger — add a dedicated features page with clearly labelled sections',
    'User Journey':         'Could be stronger — add a how-it-works page to guide first-time visitors',
    'Emotional Pull':       'Could be stronger — add specific numbers (users helped, results achieved, time saved)',
    'Trust':                'Could be stronger — add a team/about page or 1–2 early user testimonials',
    'Conversion Readiness': 'Could be stronger — add a pricing page or a free trial entry point',
  }

  const negBottleneck = sortedDims.find(d => isNegativeIssue(d.issue))
  const bottleneckSource = negBottleneck ?? sortedDims[0]
  const bottleneckIssue  = negBottleneck
    ? negBottleneck.issue
    : couldBeStronger[sortedDims[0].label] ?? `Could be stronger — review your ${sortedDims[0].label.toLowerCase()}`
  const bottleneck = {
    label:          bottleneckSource.label,
    issue:          bottleneckIssue,
    isUnverifiable: bottleneckSource.verificationStatus === 'unverifiable_js',
  }

  // ── Category ─────────────────────────────────────────────────────────────────
  const allForCat = (url + home.bestTitle + home.bestH1 + home.bestDesc + allH2s.join(' ') + allParas.join(' ')).toLowerCase()
  let category = 'App'
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

  const appName = (() => {
    const h1 = home.bestH1.trim()
    if (h1.length > 0 && h1.length <= 50) return h1
    if (h1.length > 50) return h1.slice(0, 50).replace(/\s\S+$/, '').trim() || h1.split(' ')[0]
    const fromTitle = home.bestTitle.split(/\s*[—\-\/|·]\s*/)[0].trim()
    return fromTitle || 'your app'
  })()

  // ── Growth teaser — grounded in actual detected signals ───────────────────────
  const growth_teaser = (() => {
    const H = truncH(headline, 60)
    const picks: { priority: number; text: string }[] = []

    // Priority 3 — references specific text or pattern found on this page
    if (detectedBuzzwords.length > 0)
      picks.push({ priority: 3, text: `Your headline "${H}" uses "${detectedBuzzwords[0]}" — a buzzword visitors skim past. Swap it for a specific outcome ("Save 3 hours/week", "Ship features 2× faster") to sharpen your value prop immediately.` })
    if (hasStatPattern && !primaryCta && !isJSOnlyApp)
      picks.push({ priority: 3, text: `Traction stats are on the page but no primary CTA was detected — placing a "Start free" or "Get access" button immediately after your user count is the highest-ROI layout change you can make.` })
    if (hasNamedTestimonials && !hasStatPattern && !isJSOnlyApp)
      picks.push({ priority: 3, text: `Named testimonials are present but no user count or outcome stat was found. Adding one concrete number ("Trusted by 800 founders") near your testimonials makes them feel even more credible.` })
    if (hasSP && hasStatPattern && !hasHow && !isJSOnlyApp)
      picks.push({ priority: 3, text: `Social proof and stats are present, but there's no how-it-works section — visitors who see proof but can't visualize the steps still bounce. A 3-step flow in the hero section closes that gap.` })

    // Priority 2 — specific gap with contextual details
    if (primaryCta && !hasPricing && !hasFreeOpt && !isJSOnlyApp)
      picks.push({ priority: 2, text: `CTA "${primaryCta.slice(0,30)}" is visible but no pricing or free-trial info was detected — visitors who can't see a cost or starting point often abandon instead of clicking. A "Free forever" label or "$X/month" near the CTA removes that hesitation.` })
    if (!hasYouFocus && weCount > 2 && !isJSOnlyApp)
      picks.push({ priority: 2, text: `The copy uses "we/our" (${weCount}×) more than "you/your" (${youCount}×). Flipping key sentences to user-centric framing ("You can…" instead of "We help you…") is the fastest copy fix with measurable conversion lift.` })
    if (hasYouFocus && !hasNums && !isJSOnlyApp)
      picks.push({ priority: 2, text: `The copy is user-focused (${youCount} "you/your" phrases) but has no specific outcome numbers. Adding one concrete result ("Save 5 hours/week" or "Trusted by 500 founders") makes the benefit tangible and shareable.` })
    if (!hasSP && !isJSOnlyApp && !isEarlyStage)
      picks.push({ priority: 2, text: `No social proof detected across ${crawledPages} — no testimonials, user counts, or star ratings. Even one result-oriented quote ("This saved me 4 hours/week — [role]") near the hero section builds immediate trust.` })
    if (!hasHow && !isJSOnlyApp)
      picks.push({ priority: 2, text: `No how-it-works section detected across ${crawledPages}. Visitors who can't mentally simulate using the product bounce 2× faster — a 3-step visual flow above the fold is the single most impactful structural addition.` })
    if (isJSOnlyApp)
      picks.push({ priority: 2, text: `This page renders key content via JavaScript — CTAs, pricing, and social proof that exist on your live page may be invisible in Google snippets and social link previews. Adding visible og:title, og:description, and a free-trial message in plain HTML improves both SEO and first-impression click-through.` })

    // Highest-priority candidate wins; tiebreak on text length (more detail = more specific)
    picks.sort((a, b) => b.priority - a.priority || b.text.length - a.text.length)
    if (picks.length > 0) return picks[0].text

    // Category fallback when no specific signal applies
    const fallback: Record<string, string> = {
      'Health & Wellness': `"Before & after" content showing real user transformations gets 3× more saves than product demos. For ${appName}, a weekly win series builds trust fast.`,
      'SaaS':              `Founder-led "how I solved X" content drives more inbound than product demos for B2B. For "${appName}", a weekly problem-solving series builds pipeline.`,
      'Finance':           `"Money mistake" content showing the problems "${appName}" solves consistently outperforms product demos — hook with the pain, reveal the solution.`,
      'Education':         `"Before/after learning" posts with specific skill outcomes convert cold audiences 5× faster than feature demos for an app like "${appName}".`,
      'Marketing':         `Weekly teardowns showing how "${appName}" solves a specific pain point build authority fast — specificity wins in crowded feeds.`,
      'Productivity':      `"My exact workflow using ${appName}" posts are the highest-saved format in productivity — visitors want to see the before/after, not a feature list.`,
      'E-commerce':        `Customer story reels with specific numbers ("saved ₹2,000 this month") convert 8× better than product showcases for "${appName}".`,
    }
    return fallback[category] ?? `"Problem → solution" posts showing the exact moment ${appName} saves the day is the highest-converting landing page addition.`
  })()

  // ── Signal-diversity confidence ──────────────────────────────────────────────
  const signalCount = [!!primaryCta, hasSP, hasPricing, hasTeam].filter(Boolean).length
  const confidence: 'high' | 'medium' | 'low' | 'js-app' = isJSOnlyApp
    ? 'js-app'
    : signalCount >= 4 ? 'high'
    : signalCount >= 2 ? 'medium'
    : 'low'

  const confidenceReason = renderedByHeadless
    ? 'Full JavaScript rendering via headless browser'
    : isJSOnlyApp
    ? `JavaScript-rendered website — ${confidencePercent}% verified`
    : confidence === 'high'   ? 'Full static HTML analysis'
    : confidence === 'medium' ? 'Partial HTML analysis'
    : 'Limited signals detected'

  // ── Pages analysed summary ───────────────────────────────────────────────────
  const pagesRead = Object.keys(pages).filter(k => k !== 'home')

  return {
    overall: finalOverall,
    verifiedScore,
    coverage,
    cappedBy,
    headline: headline || 'No headline detected',
    category,
    dimensions,
    bottleneck,
    growth_teaser,
    confidence,
    confidencePercent,
    confidenceReason,
    checkedSignals,
    pagesRead,
    isJSApp: home.wordCount < 100,
    // TEMP DEBUG — remove after confirming renderer routing behaves as expected
    debug: {
      renderedByHeadless,
      isJsSpa,
      isJSOnlyApp,
      htmlLength,
      rendererUrl: !!process.env.RENDERER_URL,
    },
    scraped: {
      title:    home.bestTitle,
      h1:       home.bestH1,
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
  const clientIp = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || 'unknown'
  const WHITELISTED_IPS = ['127.0.0.1', '::1', '49.207.50.194']
  if (!isInternal && !WHITELISTED_IPS.includes(clientIp) && !checkIpLimit(clientIp)) {
    return res.status(429).json({ error: 'You\'ve analyzed 3 URLs today — come back tomorrow or sign up for unlimited access.' })
  }

  try {
    const { pages, renderedByHeadless, isJsSpa, htmlLength } = await fullScrape(url)

    // Confidence check — total words scraped across all pages
    const totalWords = Object.values(pages).reduce((sum, p) => sum + p.wordCount, 0)
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

    const result = score(pages, url, renderedByHeadless, isJsSpa, htmlLength)
    ;(result as any).totalWords = totalWords
    if (result.confidence === 'js-app') {
      ;(result as any).jsAppMessage = 'This score may be incomplete. We could only read static HTML — buttons, pricing, and stats that load via JavaScript may not be reflected.'
    }

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
