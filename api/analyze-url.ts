import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ── IP rate limit — 3 analyses per IP per day ─────────────────────────────────
const ipMap = new Map<string, { count: number; date: string }>()
function checkIpLimit(ip: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  const cur   = ipMap.get(ip)
  const count = cur?.date === today ? cur.count : 0
  if (count >= 3) return false
  ipMap.set(ip, { count: count + 1, date: today })
  return true
}

// ── Scrape homepage ───────────────────────────────────────────────────────────
async function scrapeUrl(url: string): Promise<Record<string, string>> {
  try {
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Markr/1.0; +https://markr.mindprintjournal.com)' },
      signal:  AbortSignal.timeout(8000),
    })
    const html = await res.text()

    const get = (pattern: RegExp) =>
      (html.match(pattern)?.[1] ?? '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/<[^>]+>/g,'').trim()

    const getAll = (tag: string, limit = 4) => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]{1,120}?)<\\/${tag}>`, 'gi')
      const out: string[] = []; let m
      while ((m = re.exec(html)) && out.length < limit)
        out.push(m[1].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim())
      return out
    }

    const title    = get(/<title[^>]*>([^<]{1,120})<\/title>/i)
    const metaDesc = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,200})["']/i)
                  || get(/<meta[^>]+content=["']([^"']{1,200})["'][^>]+name=["']description["']/i)
    const h1       = getAll('h1', 1)[0] ?? ''
    const h2s      = getAll('h2', 4)
    const ogTitle  = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,120})["']/i)

    const bodyText = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
    const youCount = (bodyText.match(/\byou\b|\byour\b/gi) ?? []).length
    const weCount  = (bodyText.match(/\bwe\b|\bour\b|\bwe've\b/gi) ?? []).length

    // Detect if this is a JS-rendered SPA (very little visible text)
    const visibleText = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()
    const isJSApp = visibleText.length < 500 || h1 === ''

    return {
      title, metaDesc, h1, h2s: h2s.join(' | '), ogTitle,
      hasViewport:    String(/<meta[^>]+name=["']viewport["']/i.test(html)),
      hasSocialProof: String(/testimonial|review|rating|stars|trusted|customers|users/i.test(html)),
      hasNumbers:     String(/\d+[k+]?\s*(?:users|customers|apps|founders|teams|reviews)/i.test(html)),
      hasUrgency:     String(/free|now|today|start|instantly|minutes|fast|quick/i.test(title + h1 + metaDesc)),
      ctaText:        get(/<(?:button|a)[^>]*(?:hero|primary|cta|action|signup|get-started)[^>]*>([^<]{1,60})<\/(?:button|a)>/i),
      youCount:       String(youCount),
      weCount:        String(weCount),
      isJSApp:        String(isJSApp),
    }
  } catch (e) {
    throw new Error(`Could not reach this URL — make sure it is public and accessible.`)
  }
}

// ── Rule-based scoring ────────────────────────────────────────────────────────
function scoreApp(data: Record<string, string>, url: string) {
  const title    = data.title || ''
  const metaDesc = data.metaDesc || ''
  const h1       = data.h1 || ''
  const h2s      = data.h2s || ''
  const ctaText  = data.ctaText || ''
  const youCount = parseInt(data.youCount || '0')
  const weCount  = parseInt(data.weCount || '0')
  const hasSP    = data.hasSocialProof === 'true'
  const hasNums  = data.hasNumbers === 'true'
  const hasUrg   = data.hasUrgency === 'true'
  const headline = h1 || data.ogTitle || title

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
  if (youCount > weCount)                                             emotion += 3
  if (hasNums)                                                        emotion += 2
  if (hasUrg)                                                         emotion += 2
  emotion = Math.min(10, emotion)
  const emotionIssue = (weCount > 0 && youCount < weCount)
    ? `Page says "we/our" ${weCount}× vs "you/your" ${youCount}× — flip this ratio to speak to the user`
    : (youCount === 0 && weCount === 0)
      ? 'Could not read page copy — this may be a JavaScript-rendered app. Analysis based on meta tags only.'
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
    note: isJSApp ? 'This appears to be a JavaScript app — scores are based on meta tags and page structure only. Static landing pages get more accurate results.' : null,
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
