import type { AppData, ScreenLabel } from '../types'
import { supabase } from './supabase'

// ── Get auth token for API calls ───────────────────────────────────────────────
async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

// Thrown when the daily AI-call limit is reached (HTTP 429), so batch work can stop cleanly
export class AiLimitError extends Error {
  constructor(message: string) { super(message); this.name = 'AiLimitError' }
}

// A failed /api/claude request: HTTP status (0 = network) and the server's error code, if any
// (e.g. 'search_timeout', 'search_unavailable'), so a view can say exactly what went wrong.
export class AiRequestError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = 'AiRequestError' }
}

// Report currency corrections to the server log (fire-and-forget; never blocks or fails a save)
export function logCurrencyFixes(app: { id: number; name: string }, analysis: string, fixes: { from: string; to: string }[]): void {
  if (!fixes.length) return
  getToken().then(token => fetch('/api/currency-fixes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ appId: app.id, appName: app.name, analysis, fixes }),
  })).catch(() => {})
}

// Today's AI-call usage for the signed-in user; null if it can't be read
export async function getAiUsage(): Promise<{ plan: string; limit: number; used: number; remaining: number } | null> {
  try {
    const token = await getToken()
    const res = await fetch('/api/claude', { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } })
    if (!res.ok) return null
    const d = await res.json()
    return typeof d?.remaining === 'number' ? d : null
  } catch { return null }
}

// ── Core API call — routes through /api/claude proxy ──────────────────────────
export async function callClaude(
  prompt: string,
  system?: string,
  maxTokens = 1400,
  onChunk?: (chunk: string) => void,
  useModel: 'haiku' | 'sonnet' = 'haiku',
  feature = 'general',
  images?: string[],  // base64 data-URLs — sent to Anthropic vision API
  opts?: { webSearch?: { maxUses: number } },  // server-side web search (Anthropic only, whitelisted features)
): Promise<string> {
  const token = await getToken()

  let res: Response
  try {
    res = await fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt,
        system,
        maxTokens,
        model:   useModel,
        stream:  !!onChunk,
        feature,
        ...(images && images.length > 0 ? { images } : {}),
        ...(opts?.webSearch ? { webSearch: opts.webSearch } : {}),
      }),
    })
  } catch {
    throw new AiRequestError('Could not reach the AI service — check your connection and try again.', 0)
  }

  // A crashed or timed-out function returns Vercel's plain-text/HTML error page, not JSON.
  // Read the body as text and parse it ourselves so callers never see a raw JSON parse error.
  const readJson = async (): Promise<any> => {
    try { return JSON.parse(await res.text()) } catch { return null }
  }
  const friendlyError = (status: number) =>
    status === 429 ? 'Daily AI limit reached — try again tomorrow or upgrade your plan.'
    : status === 504 ? 'The request took too long and timed out (HTTP 504). Please try again.'
    : status >= 500 ? `The AI service had a server error (HTTP ${status}). Please try again in a moment.`
    : `The AI service returned an unexpected response (HTTP ${status}). Please try again.`

  // Handle rate limit
  if (res.status === 429) {
    const data = await readJson()
    throw new AiLimitError(data?.error ?? friendlyError(429))
  }

  if (!onChunk) {
    const data = await readJson()
    if (!res.ok || !data) throw new AiRequestError(data?.error ?? friendlyError(res.status), res.status, data?.code)
    if (data.error) throw new AiRequestError(data.error, res.status, data?.code)
    // Which provider actually served this — a 200 may come from a fallback
    // provider whose JSON adherence is weaker than Anthropic's.
    if (data.provider) console.log(`[callClaude] served by: ${data.provider} (feature: ${feature})`)
    return data.content?.map((b: { text?: string }) => b.text ?? '').join('') ?? ''
  }

  // Streaming — a failed function never starts the event stream; report it cleanly
  if (!res.ok || !res.body) {
    const data = await readJson()
    throw new Error(data?.error ?? friendlyError(res.status))
  }
  const reader = res.body.getReader()
  const dec    = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return ''
      try {
        const j = JSON.parse(data)
        if (j.provider) console.log(`[callClaude] served by: ${j.provider} (feature: ${feature}, streaming)`)
        if (j.text) onChunk(j.text)
      } catch { /* ignore */ }
    }
  }
  return ''
}

// ── Extract a JSON object from a model response ───────────────────────────────
// Strips markdown fences AND any prose before the opening brace / after the
// closing one. Fallback providers (Groq, Gemini) frequently prepend a line like
// "Here is the analysis:" despite the system prompt, which a fence-only strip
// leaves in place and JSON.parse then rejects.
export function extractJSON(raw: string): string {
  return raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^[^{]*/, '')
    .replace(/}[^}]*$/, '}')
    .trim()
}

// ── Truncation detection ──────────────────────────────────────────────────────
// A response cut off at the token cap and one mangled by a chatty provider both
// fail JSON.parse; only the first is fixed by raising maxTokens, so keep them
// distinguishable. Call this with the ORIGINAL raw string, not the extractJSON
// output — extractJSON's trailing-prose strip rewrites a truncated payload to
// end at its last closing brace, which hides the very evidence of truncation.
export function looksTruncated(raw: string, err: unknown): boolean {
  const body = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '')
  // No structure at all — a refusal or plain prose, never a truncated payload.
  // Checked first because extractJSON reduces such a response to an empty
  // string, and JSON.parse('') reports "Unexpected end of JSON input", which
  // would otherwise read as truncation.
  if (!/[{[]/.test(body)) return false

  const msg = err instanceof Error ? err.message : ''
  if (/unterminated|unexpected end of (json|input)/i.test(msg)) return true

  // Unbalanced braces/brackets mean the payload stopped mid-structure.
  let depth = 0
  for (const ch of body) {
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') depth--
  }
  return depth > 0
}

// ── Safe JSON parse ────────────────────────────────────────────────────────────
export function safeParseJSON<T>(raw: string): T {
  return JSON.parse(extractJSON(raw)) as T
}

// ── Product test context injected into every AI call ──────────────────────────
export function getTestContext(app: AppData): string {
  const pt = app.productTest
  if (!pt || pt.error) return ''

  // New rule-based format
  if (pt.checks && Array.isArray(pt.checks)) {
    const fails  = pt.checks.filter((c: any) => c.status === 'fail').map((c: any) => c.detail).join('; ')
    const warns  = pt.checks.filter((c: any) => c.status === 'warn').map((c: any) => c.detail).join('; ')
    const passes = pt.checks.filter((c: any) => c.status === 'pass').map((c: any) => c.label).join(', ')
    return [
      `\n━━━ PRODUCT TEST INTELLIGENCE (Technical Score: ${pt.score ?? 0}/100) ━━━`,
      fails  ? `CRITICAL ISSUES: ${fails}` : '',
      warns  ? `WARNINGS: ${warns}` : '',
      passes ? `PASSING: ${passes}` : '',
      pt.verdict ? `VERDICT: ${pt.verdict}` : '',
      `LOAD TIME: ${((pt.loadTime ?? 0)/1000).toFixed(1)}s`,
      '━━━ USE THESE FINDINGS TO SHAPE CONTENT AND GROWTH STRATEGY ━━━',
    ].filter(Boolean).join('\n')
  }

  // Older AI-simulated results (overall_score, tested_flows, bugs_and_issues, features_found…)
  // came from a model role-playing a QA tester without ever opening the app, so they are
  // invented and must never reach a prompt. Only the rule-based check above is injected.
  return ''
}

// ── Screenshot vision context — reads ONLY app.screenshot_vision (no images) ──
// Built from analyses saved once at upload. Compact by design: target ≤ ~1,200 chars.
const VISION_ORDER: ScreenLabel[] = ['home', 'onboarding', 'results', 'paywall', 'other']
const VISION_CHAR_CAP = 1200

export function getVisionContext(app: AppData): string {
  const sv = app.screenshot_vision
  const entries = (sv?.screenshots ?? [])
    .filter(e => e.analysis)
    .sort((a, b) => VISION_ORDER.indexOf(a.label) - VISION_ORDER.indexOf(b.label))
  if (!entries.length) return ''

  const q = (xs: string[]) => xs.map(x => `"${x}"`).join(', ')
  // Fields in priority order — lowest priority last, dropped first under the cap
  const lineFor = (e: typeof entries[number], level: number): string => {
    const a = e.analysis!, c = a.extracted_copy
    const parts = [
      c.headline               ? `"${c.headline}"`                          : '',
      c.pricing.length         ? `pricing: ${q(c.pricing)}`                 : '',
      c.ctas.length            ? `CTAs: ${q(c.ctas)}`                       : '',
      a.friction_points.length ? `friction: ${a.friction_points.join('; ')}` : '',
      a.trust_signals.length   ? `trust: ${a.trust_signals.join('; ')}`     : '',
      level < 2 && a.features_visible.length ? `features: ${a.features_visible.join(', ')}` : '',
      level < 1 && a.ui_issues.length        ? `ui: ${a.ui_issues.join('; ')}`              : '',
    ].filter(Boolean)
    return `[${e.label}] ${parts.join(' · ')}`
  }

  const build = (level: number, n: number) => [
    `\n━━━ PRODUCT UI (from ${entries.length} real screenshot${entries.length > 1 ? 's' : ''}) ━━━`,
    sv?.product_understanding ? `PRODUCT: ${sv.product_understanding}` : '',
    ...entries.slice(0, n).map(e => lineFor(e, level)),
    '━━━ Only reference UI listed here — never invent screens, copy, or prices. ━━━',
  ].filter(Boolean).join('\n')

  // Degrade: drop ui_issues → drop features → drop trailing screens
  for (const level of [0, 1, 2]) {
    const out = build(level, entries.length)
    if (out.length <= VISION_CHAR_CAP) return out
  }
  for (let n = entries.length - 1; n >= 1; n--) {
    const out = build(2, n)
    if (out.length <= VISION_CHAR_CAP) return out
  }
  return build(2, 1)
}

// ── Founder intent — the goal that evidence (landing page, screenshots) is compared against ──
// 'analysis' (default): full brief + gap instruction. 'content': audience/vision/mission only,
// never mentions gaps or competitors — for Content Studio posts. Hard cap ~800 chars.
const FOUNDER_CHAR_CAP = 800

export function getFounderContext(app: AppData, mode: 'analysis' | 'content' = 'analysis'): string {
  const b = app.founder_brief
  if (!b) return ''
  const focus = b.focus_competitors ?? [], excl = b.excluded_competitors ?? []
  const hasText = !!(b.intended_audience || b.vision || b.mission)
  const hasComps = mode === 'analysis' && (focus.length > 0 || excl.length > 0)
  if (!hasText && !hasComps) return ''

  const cut = (s: string | undefined, n: number) =>
    !s ? '' : s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'
  const list = (xs: string[], n: number, each: number) =>
    xs.slice(0, n).map(x => cut(x, each)).join(', ') + (xs.length > n ? ` (+${xs.length - n} more)` : '')

  const footer = mode === 'content'
    ? 'Write toward the intended audience and vision; never mention gaps or competitors by name.'
    : 'Compare against the evidence (landing page, screenshots) and explicitly call out gaps between intent and what the product currently shows.'

  // text = max chars per audience/vision/mission, exN = excluded names shown, each = max chars per name
  const build = (text: number, exN: number, each: number) => [
    '\n━━━ FOUNDER INTENT (the goal) ━━━',
    b.intended_audience ? `AUDIENCE: ${cut(b.intended_audience, text)}` : '',
    b.vision            ? `VISION: ${cut(b.vision, text)}`              : '',
    b.mission           ? `MISSION: ${cut(b.mission, text)}`            : '',
    mode === 'analysis' && focus.length ? `FOCUS COMPETITORS: ${list(focus, 5, each)}` : '',
    mode === 'analysis' && excl.length  ? `EXCLUDED COMPETITORS (never mention): ${list(excl, exN, each)}` : '',
    footer,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].filter(Boolean).join('\n')

  // Degrade: shorten vision/mission/audience → shorten names → show fewer excluded names
  const levels: Array<[number, number, number]> = [[200, 10, 120], [140, 10, 60], [100, 5, 40], [70, 3, 30], [50, 1, 25]]
  for (const [t, n, e] of levels) {
    const out = build(t, n, e)
    if (out.length <= FOUNDER_CHAR_CAP) return out
  }
  return build(40, 1, 20).slice(0, FOUNDER_CHAR_CAP)
}

// ── Instagram context injected into strategy prompts ──────────────────────────
// Bio and captions are never available from the renderer — every caller gets the
// same no-fabrication warning whenever a handle is present, on top of whatever
// module-specific guidance it passes in.
export function getInstagramContext(app: AppData, guidance?: string): string {
  const ig = app.url_analysis?.instagram
  const presence = `INSTAGRAM PRESENCE: ${ig ? `${ig.followers} followers, ${ig.posts} posts, following ${ig.following}` : 'No Instagram handle provided'}`
  if (!ig) return presence
  return [
    presence,
    guidance ?? '',
    'CRITICAL: Bio and captions are NOT available for this account — never assume or fabricate anything about their posting style, brand voice, or existing content.',
  ].filter(Boolean).join('\n')
}
