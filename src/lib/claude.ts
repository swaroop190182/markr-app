import type { AppData, ProductTest, ScreenLabel } from '../types'
import { supabase } from './supabase'

// ── Get auth token for API calls ───────────────────────────────────────────────
async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
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

  const res = await fetch('/api/claude', {
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

  // Handle rate limit
  if (res.status === 429) {
    const data = await res.json()
    throw new Error(data.error)
  }

  if (!onChunk) {
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    // Which provider actually served this — a 200 may come from a fallback
    // provider whose JSON adherence is weaker than Anthropic's.
    if (data.provider) console.log(`[callClaude] served by: ${data.provider} (feature: ${feature})`)
    return data.content?.map((b: { text?: string }) => b.text ?? '').join('') ?? ''
  }

  // Streaming
  const reader = res.body!.getReader()
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

  // Legacy AI format
  const features = (pt.features_found ?? []).map((f: any) => `${f.name} (${f.quality})`).join(', ')
  const flows    = (pt.tested_flows   ?? []).map((f: any) =>
    `${f.name}: ${f.status} ${f.score}/100${f.friction_point ? ' — ' + f.friction_point : ''}`
  ).join('; ')
  const works    = (pt.what_works_well   ?? []).join('; ')
  const fixes    = (pt.what_needs_fixing ?? []).join('; ')
  const highBugs = (pt.bugs_and_issues  ?? [])
    .filter((b: any) => b.severity === 'Critical' || b.severity === 'High')
    .map((b: any) => `${b.title} [${b.severity}]`).join('; ')
  const ux = pt.ux_ratings
    ? Object.entries(pt.ux_ratings).map(([k, v]) => `${k}:${v}`).join(', ')
    : ''

  return [
    `\n━━━ PRODUCT TEST INTELLIGENCE (QA Score: ${pt.overall_score ?? 0}/100 — "${pt.verdict ?? ''}") ━━━`,
    pt.first_impression ? `FIRST IMPRESSION: ${pt.first_impression}` : '',
    features ? `FEATURES TESTED & QUALITY: ${features}` : '',
    flows    ? `FLOWS TESTED: ${flows}` : '',
    works    ? `WHAT GENUINELY WORKS: ${works}` : '',
    fixes    ? `WHAT NEEDS FIXING: ${fixes}` : '',
    highBugs ? `HIGH-SEVERITY BUGS: ${highBugs}` : '',
    ux       ? `UX SCORES: ${ux}` : '',
    pt.tester_recommendation   ? `TESTER VERDICT: ${pt.tester_recommendation}` : '',
    pt.competitive_edge_from_test ? `REAL COMPETITIVE EDGE: ${pt.competitive_edge_from_test}` : '',
    ...(pt.content_implications ?? []).map((c: any, i: number) => `  ${i + 1}. ${c}`),
    pt.onboarding_verdict ? `ONBOARDING: ${pt.onboarding_verdict}` : '',
    '━━━ ALL OUTPUTS MUST REFLECT THESE REAL PRODUCT FINDINGS ━━━',
  ].filter(Boolean).join('\n')
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

// ── Run product test — uses Sonnet for complex reasoning ──────────────────────
export async function runProductTest(app: AppData, testPass: string): Promise<ProductTest> {
  const creds = app.testCreds!
  const allFeatures = [
    ...(app.features ?? []),
    ...(creds.flows
      ? creds.flows.split(/[,.\n]/).map(s => s.trim()).filter(s => s.length > 3)
      : [])
  ].filter((v, i, a) => a.indexOf(v) === i)

  const prompt = `You are a senior QA engineer testing "${app.name}" — a ${app.category} ${app.platform} app.
Login: ${creds.loginUrl || app.url} as ${creds.user} / [password: ${testPass.length} chars]
App: ${app.desc}

FEATURES & TABS TO TEST EXHAUSTIVELY (one flow entry per feature, max 8 flows):
${allFeatures.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Keep ALL string values under 20 words. Output ONLY valid JSON, no markdown, no trailing commas:
{"overall_score":75,"verdict":"Good with gaps","verdict_emoji":"🟡","executive_summary":"2 sentence verdict","tester_recommendation":"1 direct sentence","first_impression":"1 sentence","tested_flows":[{"name":"Feature Name","status":"Pass","score":80,"steps_tested":["accessed via nav","tested action"],"observation":"honest observation","friction_point":null},{"name":"Another Feature","status":"Partial","score":65,"steps_tested":["accessed","tested"],"observation":"honest observation","friction_point":"issue found"}],"features_found":[{"name":"Feature A","description":"what it does and quality","quality":"Good"},{"name":"Feature B","description":"assessment","quality":"Average"}],"bugs_and_issues":[{"title":"Bug","description":"1 sentence","severity":"Medium","location":"screen name"}],"ux_ratings":{"onboarding":70,"navigation":75,"visual_design":80,"performance":72,"mobile_responsiveness":68,"error_handling":60},"what_works_well":["strength 1","strength 2","strength 3"],"what_needs_fixing":["fix 1","fix 2","fix 3"],"content_implications":["highlight: strength","avoid: gap","angle: real moment"],"ux_observations":"1-2 sentences","onboarding_verdict":"1 sentence","competitive_edge_from_test":"1 sentence"}`

  const raw = await callClaude(
    prompt,
    'You are a senior QA engineer. Output ONLY valid JSON. Keep string values under 20 words. No markdown.',
    // Up to 8 flows plus features_found, bugs_and_issues, ux_ratings and four
    // string arrays — comfortably past 4000 on a feature-rich app.
    8000,
    undefined,
    'haiku'  // Haiku is fast and cheap — JSON output quality is fine
  )
  return safeParseJSON<ProductTest>(raw)
}
