// Primary-market detection for apps whose market setting is "Auto-detect".
// Pure (type imports only) so it can be unit-tested (tests/market.test.ts).
// Results use Edit App's "Primary market" names (plus Canada and Global).
import type { AppData } from '../types'

type UrlAnalysis = Pick<NonNullable<AppData['url_analysis']>, 'headline' | 'growth_teaser' | 'currencies'> & {
  bottleneck?: { issue?: string }
  dimensions?: Array<{ issue?: string }>
}

// Non-dollar currencies next to a price are the strongest signal. "$" alone is weak:
// many sites price in dollars whatever their market.
const CURRENCY_MARKET: Record<string, string> = { '₹': 'India', '£': 'United Kingdom', '€': 'Europe' }
const STRONG_SYMBOLS = Object.keys(CURRENCY_MARKET)

export function detectMarket(s: { desc?: string; url?: string; ua?: UrlAnalysis | null; screenshotPricing?: string[] }): string {
  const ua = s.ua ?? undefined

  // 1. A non-dollar currency next to a price on the landing page or in the app's own screenshots.
  //    Two different ones → ambiguous, fall through to the other signals.
  const priceSymbols = new Set<string>([
    ...(ua?.currencies ?? []),
    ...(s.screenshotPricing ?? []).flatMap(p => STRONG_SYMBOLS.filter(c => p.includes(c))),
  ])
  const strong = [...priceSymbols].filter(c => c in CURRENCY_MARKET)
  if (strong.length === 1) return CURRENCY_MARKET[strong[0]]

  const text = [
    s.desc, ua?.headline, ua?.growth_teaser, ua?.bottleneck?.issue,
    ...(ua?.dimensions ?? []).map(d => d.issue),
  ].filter(Boolean).join(' ')

  // 2. Explicit country/city named in the description or landing page text
  const places: Array<[RegExp, string]> = [
    [/\bindia\b|\bindian\b|\bbengaluru\b|\bbangalore\b|\bmumbai\b|\bdelhi\b|\bhyderabad\b|\bpune\b|\bchennai\b|\bkolkata\b|\bgurgaon\b|\bgurugram\b|\bnoida\b/i, 'India'],
    [/\bunited kingdom\b|\b(?<![a-z])uk(?![a-z])\b|\bbritain\b|\blondon\b|\bmanchester\b/i, 'United Kingdom'],
    [/\bunited states\b|\b(?<![a-z])usa(?![a-z])\b|\bamerica\b|\bnew york\b|\bsan francisco\b|\bsilicon valley\b|\baustin\b|\bseattle\b/i, 'United States'],
    [/\bsingapore\b/i, 'Southeast Asia'],
    [/\baustralia\b|\bsydney\b|\bmelbourne\b/i, 'Australia'],
    [/\bcanada\b|\btoronto\b|\bvancouver\b/i, 'Canada'],
    [/\bdubai\b|\b(?<![a-z])uae(?![a-z])\b|\bunited arab emirates\b/i, 'Middle East'],
  ]
  for (const [re, market] of places) if (re.test(text)) return market

  // 3. Currency symbols anywhere in that text
  if (/₹/.test(text)) return 'India'
  if (/£/.test(text)) return 'United Kingdom'
  if (/€/.test(text)) return 'Europe'
  if (/\$/.test(text)) return 'United States'

  // 4. Country domain
  try {
    const host = new URL(s.url ?? '').hostname
    if (/\.in$/.test(host)) return 'India'
    if (/\.co\.uk$/.test(host)) return 'United Kingdom'
    if (/\.ca$/.test(host)) return 'Canada'
    if (/\.com\.au$/.test(host)) return 'Australia'
    if (/\.sg$/.test(host)) return 'Southeast Asia'
    if (/\.ae$/.test(host)) return 'Middle East'
  } catch { /* invalid URL — skip */ }

  // 5. Phone number format
  if (/\+91[\s-]?\d{4,5}/.test(text)) return 'India'
  if (/\+44[\s-]?\d/.test(text)) return 'United Kingdom'
  if (/\+1[\s-]?\(?\d{3}\)?/.test(text)) return 'United States'

  return 'Global'
}

// Everything Markr knows about the app: description, URL, landing-page analysis, screenshot pricing
export const detectMarketForApp = (app: AppData): string => detectMarket({
  desc: app.desc, url: app.url, ua: app.url_analysis,
  screenshotPricing: (app.screenshot_vision?.screenshots ?? []).flatMap(x => x.analysis?.extracted_copy?.pricing ?? []),
})

// The market an analysis should use: the user's setting, or the detected one when it's Auto-detect/unset
export const effectiveMarket = (app: AppData): string =>
  app.primary_market && app.primary_market !== 'Auto-detect' ? app.primary_market : detectMarketForApp(app)
