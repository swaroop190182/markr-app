// ── Helper: extract text from HTML ───────────────────────────────────────────
function extractFromHtml(html: string) {
  const get = (pattern: RegExp) =>
    (html.match(pattern)?.[1] ?? '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/<[^>]+>/g,'').trim()

  const getAll = (tag: string, limit = 4) => {
    const re = new RegExp(`<${tag}[^>]*>([\s\S]{1,120}?)<\/${tag}>`, 'gi')
    const out: string[] = []; let m
    while ((m = re.exec(html)) && out.length < limit)
      out.push(m[1].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim())
    return out
  }

  const title    = get(/<title[^>]*>([^<]{1,120})<\/title>/i)
  const h1s      = getAll('h1', 2)
  const h2s      = getAll('h2', 5)
  const h3s      = getAll('h3', 5)
  const metaDesc = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
                || get(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i)
  const ogTitle  = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,120})["']/i)
                || get(/<meta[^>]+content=["']([^"']{1,120})["'][^>]+property=["']og:title["']/i)
  const ogDesc   = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,300})["']/i)
                || get(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+property=["']og:description["']/i)
  const twDesc   = get(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']{1,300})["']/i)
                || get(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']twitter:description["']/i)
  const twTitle  = get(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']{1,120})["']/i)

  // JSON-LD — often has name, description for any app
  const jsonLdRaw = get(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]{1,3000}?)<\/script>/i)
  let jsonLdText = ''
  try {
    const jld = JSON.parse(jsonLdRaw)
    jsonLdText = [jld.name, jld.description, jld.headline, jld.alternateName].filter(Boolean).join(' ')
  } catch { jsonLdText = jsonLdRaw.replace(/[{}"\[\]]/g,' ').replace(/\s+/g,' ').slice(0,300) }

  // Paragraph text — present in static sites, Webflow, Framer etc
  const paras = getAll('p', 8)

  // Button/CTA text
  const allButtons: string[] = []
  const btnRe = /<(?:button|a)[^>]*>([^<]{3,60})<\/(?:button|a)>/gi; let bm
  while ((bm = btnRe.exec(html)) && allButtons.length < 10)
    allButtons.push(bm[1].replace(/<[^>]+>/g,'').trim())

  // Visible body text (works for static sites)
  const bodyText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    title, h1: h1s[0] ?? '', h2s, h3s, h1s, paras,
    metaDesc, ogTitle, ogDesc, twTitle, twDesc, jsonLdText,
    bodyText: bodyText.slice(0, 3000),
    allButtons,
    bestTitle: title || ogTitle || twTitle || '',
    bestDesc:  metaDesc || ogDesc || twDesc || jsonLdText || '',
    bestH1:    h1s[0] || ogTitle || twTitle || title || '',
    hasViewport: String(/<meta[^>]+name=["']viewport["']/i.test(html)),
  }
}

// ── Fetch a URL safely ────────────────────────────────────────────────────────
async function fetchSafe(url: string, timeout = 5000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

// ── Main scraper — multi-pass for JS apps ─────────────────────────────────────
async function scrapeUrl(url: string): Promise<Record<string, string>> {
  const base = new URL(url).origin

  // Pass 1: Main page
  const mainHtml = await fetchSafe(url)
  if (!mainHtml) throw new Error('Could not reach this URL — make sure it is public and accessible.')

  const main = extractFromHtml(mainHtml)

  // Detect if JS app (little visible text, or no H1)
  const visibleWordCount = main.bodyText.split(' ').filter(w => w.length > 2).length
  const isJSApp = visibleWordCount < 100 || main.h1 === ''

  let extraText = ''
  let extraH2s: string[] = []
  let extraParas: string[] = []

  if (isJSApp) {
    // Pass 2: Try sitemap to find content pages
    const sitemap = await fetchSafe(`${base}/sitemap.xml`, 3000)
    if (sitemap) {
      const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map(m => m[1])
        .filter(u => /about|features|how|pricing|product|what|why/i.test(u))
        .slice(0, 3)

      for (const pageUrl of urls) {
        const pageHtml = await fetchSafe(pageUrl, 4000)
        if (pageHtml) {
          const page = extractFromHtml(pageHtml)
          extraText += ' ' + page.bodyText.slice(0, 1000)
          extraH2s  = [...extraH2s, ...page.h2s, ...page.h3s]
          extraParas = [...extraParas, ...page.paras]
        }
      }
    }

    // Pass 3: Try /about and /features directly
    if (!extraText.trim()) {
      for (const path of ['/about', '/features', '/how-it-works', '/product']) {
        const pageHtml = await fetchSafe(`${base}${path}`, 3000)
        if (pageHtml) {
          const page = extractFromHtml(pageHtml)
          if (page.bodyText.split(' ').length > 100) {
            extraText += ' ' + page.bodyText.slice(0, 1000)
            extraH2s  = [...extraH2s, ...page.h2s]
            extraParas = [...extraParas, ...page.paras]
            break
          }
        }
      }
    }
  }

  // Combine all text sources
  const allText = [
    main.bestTitle, main.bestDesc, main.bestH1,
    main.h2s.join(' '), main.h3s.join(' '),
    main.paras.join(' '), main.jsonLdText,
    extraText, extraH2s.join(' '), extraParas.join(' ')
  ].join(' ').replace(/\s+/g, ' ')

  const youCount = (allText.match(/\byou\b|\byour\b/gi) ?? []).length
  const weCount  = (allText.match(/\bwe\b|\bour\b|\bwe've\b/gi) ?? []).length

  // CTA detection from all sources
  const ctaText = main.allButtons
    .find(b => /start|try|get|sign|join|analyze|free|demo|launch|begin/i.test(b)) ?? ''

  return {
    title:          main.bestTitle,
    metaDesc:       main.bestDesc,
    h1:             main.bestH1,
    h2s:            [...main.h2s, ...extraH2s].slice(0,6).join(' | '),
    ogTitle:        main.ogTitle,
    allText:        allText.slice(0, 2000),
    ctaText,
    hasViewport:    main.hasViewport,
    hasSocialProof: String(/testimonial|review|rating|stars|trusted|customers|\d+\s*users|\d+\s*founders/i.test(allText)),
    hasNumbers:     String(/\d+[k+]?\s*(?:users|customers|apps|founders|teams|reviews|clients)/i.test(allText)),
    hasUrgency:     String(/free|now|today|start|instantly|minutes|fast|quick/i.test(allText)),
    youCount:       String(youCount),
    weCount:        String(weCount),
    isJSApp:        String(isJSApp),
    extraPagesRead: String(extraText.length > 50),
  }
}

// ── Rule-based scoring ────────────────────────────────────────────────────────
function scoreApp(data: Record<string, string>, url: string) {
  const title     = data.title || ''
  const metaDesc  = data.metaDesc || ''
  const h1        = data.h1 || ''
  const h2s       = data.h2s || ''
  const ctaText   = data.ctaText || ''
  const youCount  = parseInt(data.youCount || '0')
  const weCount   = parseInt(data.weCount || '0')
  const hasSP     = data.hasSocialProof === 'true'
  const hasNums   = data.hasNumbers === 'true'
  const hasUrg    = data.hasUrgency === 'true'
  const isJSApp   = data.isJSApp === 'true'
  const extraRead = data.extraPagesRead === 'true'
  const allText   = data.allText || (title + ' ' + metaDesc + ' ' + h1 + ' ' + h2s)
  const headline  = h1 || data.ogTitle || title
  // Use combined text for all keyword analysis
  const analyzeText = allText

  // ── 1. Clarity ───────────────────────────────────────────────────────────────
  let clarity = 3
  if (headline.length > 10)                                          clarity += 2
  const wc = headline.split(' ').length
  if (wc >= 3 && wc <= 12)                                           clarity += 2
  if (metaDesc.length > 30 && metaDesc.length < 160)                 clarity += 2
  if (!/^welcome|^home$|^coming soon/i.test(headline))              clarity += 1
  clarity = Math.min(10, clarity)
  const clarityIssue = clarity < 7
    ? h1
      ? `"${h1.slice(0,55)}" — does a cold visitor instantly know what they get?`
      : 'No clear headline detected. Your H1 is your first impression.'
    : `Headline communicates value clearly`

  // ── 2. User Journey ──────────────────────────────────────────────────────────
  let journey = 4
  if (ctaText)                                                        journey += 2
  if (ctaText && !/^sign up$|^register$|^submit$|^click here$/i.test(ctaText)) journey += 2
  if (data.hasViewport === 'true')                                    journey += 1
  if (metaDesc)                                                       journey += 1
  journey = Math.min(10, journey)
  const journeyIssue = !ctaText
    ? 'No prominent CTA detected above the fold — users don\'t know what to do next'
    : /^sign up$|^register$|^get started$|^submit$/i.test(ctaText)
      ? `"${ctaText}" tells users nothing about what they\'re getting`
      : `CTA "${ctaText.slice(0,40)}" is action-oriented`

  // ── 3. Emotional Pull ────────────────────────────────────────────────────────
  let emotion = 3
  // For JS apps, check meta text for you/your language
  const metaYou = (analyzeText.match(/\byou\b|\byour\b/gi) ?? []).length
  const metaWe  = (analyzeText.match(/\bwe\b|\bour\b/gi) ?? []).length
  if (metaYou > metaWe || metaYou >= 2)                              emotion += 3
  if (hasNums)                                                        emotion += 2
  if (hasUrg)                                                         emotion += 2
  emotion = Math.min(10, emotion)
  const effectiveYou = Math.max(youCount, (analyzeText.match(/\byou\b|\byour\b/gi) ?? []).length)
  const effectiveWe  = Math.max(weCount,  (analyzeText.match(/\bwe\b|\bour\b/gi) ?? []).length)
  const emotionIssue = (effectiveWe > 0 && effectiveYou < effectiveWe)
    ? `Page uses "we/our" ${effectiveWe}× vs "you/your" ${effectiveYou}× — flip this to speak to the user`
    : (effectiveYou === 0 && effectiveWe === 0 && !isJSApp)
      ? 'No visible copy detected — check if your landing page has readable text content'
      : !hasUrg
        ? 'Good user focus but missing urgency — add a specific reason to act today'
        : 'Speaks to the user and creates momentum'

  // ── 4. Trust ─────────────────────────────────────────────────────────────────
  let trust = 3
  if (hasSP)                                                          trust += 3
  if (hasNums)                                                        trust += 2
  if (url.startsWith('https'))                                        trust += 1
  if (metaDesc.length > 50)                                          trust += 1
  trust = Math.min(10, trust)
  const trustIssue = !hasSP
    ? 'No social proof detected — no testimonials, user counts, or logos. Why should I trust this?'
    : !hasNums
      ? 'Social proof exists but no numbers — "hundreds of users" converts less than "2,400 users"'
      : 'Trust signals present'

  // ── 5. Conversion Readiness ──────────────────────────────────────────────────
  let conversion = 3
  if (ctaText)                                                        conversion += 2
  if (/free|trial|demo|start|get/i.test(ctaText + h1 + metaDesc))   conversion += 2
  if (metaDesc)                                                       conversion += 1
  if (headline.length > 0)                                            conversion += 2
  conversion = Math.min(10, conversion)
  const conversionIssue = !ctaText
    ? 'No conversion action visible — add a free trial or demo CTA'
    : !/free|trial|demo|start/i.test(ctaText + h1 + metaDesc)
      ? 'No low-friction entry point — "free" or "demo" dramatically increases signups'
      : 'Clear conversion path exists'

  // ── Overall & bottleneck ─────────────────────────────────────────────────────
  const overall = Math.round((clarity + journey + emotion + trust + conversion) / 5 * 10) / 10

  const dimensions = [
    { label:'Clarity',              score:clarity,    issue:clarityIssue    },
    { label:'User Journey',         score:journey,    issue:journeyIssue    },
    { label:'Emotional Pull',       score:emotion,    issue:emotionIssue    },
    { label:'Trust',                score:trust,      issue:trustIssue      },
    { label:'Conversion Readiness', score:conversion, issue:conversionIssue },
  ]
  const bottleneck = [...dimensions].sort((a,b) => a.score - b.score)[0]

  // ── Category detection ───────────────────────────────────────────────────────
  const allText = (url + title + h1 + metaDesc + h2s).toLowerCase()
  let category = 'App'
  if (/health|wellness|fitness|nutrition|mental|medical|diet|baby|mother|parenting/.test(allText)) category = 'Health & Wellness'
  else if (/legal|lawyer|law|attorney|court|contract|compliance/.test(allText))                    category = 'Legal'
  else if (/finance|invest|money|bank|payment|fintech|budget|tax/.test(allText))                   category = 'Finance'
  else if (/education|learn|course|school|teach|tutor|study/.test(allText))                        category = 'Education'
  else if (/ecommerce|shop|store|product|buy|sell|cart/.test(allText))                             category = 'E-commerce'
  else if (/saas|software|platform|dashboard|workflow|api|developer/.test(allText))                category = 'SaaS'
  else if (/marketing|social|content|brand|seo|ads|campaign/.test(allText))                        category = 'Marketing'
  else if (/productivity|task|project|manage|organise|team|collaborate/.test(allText))             category = 'Productivity'

  // ── Growth teasers ───────────────────────────────────────────────────────────
  const teasers: Record<string,string> = {
    'Health & Wellness': 'A "day in the life" series showing real user transformations gets 3× more saves than product demos in your niche. Sign up to get the exact 7-post sequence built for your app.',
    'Legal':             'Weekly "myth vs fact" posts in legal communities build authority faster than ads — lawyers and founders both share them. Sign up for the exact post templates.',
    'Finance':           '"Money mistake Monday" reels consistently outperform product demos in finance. Sign up to get the weekly content calendar tailored to your app.',
    'Education':         '"Before/after learning" posts with specific outcomes convert cold audiences 5× faster than feature-first content. Sign up to get the templates.',
    'SaaS':              'Founder-led "how I built this" content drives more inbound than product demos for B2B apps. Sign up to get the 30-day content plan for your app.',
    'Marketing':         'Weekly teardowns of competitor campaigns build authority fast — your audience will tag you in every one. Sign up to get the format built for your niche.',
    'Productivity':      '"My exact workflow" posts are the highest-saved content format in your category. Sign up to get the weekly templates built around your specific features.',
    'E-commerce':        'Customer story reels with specific numbers ("saved ₹2,000 in one week") convert 8× better than product showcases. Sign up for the templates.',
    'App':               '"Problem → solution" posts showing the exact moment your app saves the day is the highest-converting format for mobile apps. Sign up to get 7 done-for-you templates.',
  }

  const isJSApp = data.isJSApp === 'true'

  return {
    overall,
    headline: headline.slice(0, 80) || 'No headline detected',
    category,
    dimensions,
    bottleneck: { label: bottleneck.label, issue: bottleneck.issue },
    growth_teaser: teasers[category] ?? teasers['App'],
    scraped: { title: title.slice(0,80), h1: h1.slice(0,80), metaDesc: metaDesc.slice(0,120) },
    isJSApp,
    note: isJSApp ? 'Scores are based on meta tags (og:title, description, twitter tags). For more accurate results, ensure your app has rich OG meta tags.' : null,
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL required' })

  url = url.trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  // IP rate limit
  const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || 'unknown'
  if (!checkIpLimit(ip)) {
    return res.status(429).json({ error: 'You\'ve analyzed 3 URLs today — come back tomorrow or sign up for unlimited access.' })
  }

  try {
    const scraped = await scrapeUrl(url)
    const result  = scoreApp(scraped, url)

    // Save lead — fire and forget
    try {
      const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
      supabase.from('markr_url_leads').insert({ url }).catch(() => {})
    } catch { /* non-blocking */ }

    res.status(200).json(result)
  } catch (e) {
    res.status(422).json({ error: (e as Error).message })
  }
}
