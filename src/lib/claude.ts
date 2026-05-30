import type { AppData, ProductTest } from '../types'

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5'

// ── Core API call ──────────────────────────────────────────────────────────────
export async function callClaude(
  prompt: string,
  system?: string,
  maxTokens = 1400,
  onChunk?: (chunk: string) => void
): Promise<string> {
  if (!API_KEY) throw new Error('No API key. Add VITE_ANTHROPIC_API_KEY to your .env file.')

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      stream: !!onChunk,
      system: system ?? 'You are a world-class marketing strategist. Be specific, creative, and actionable. No preamble.',
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!onChunk) {
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.content?.map((b: { text?: string }) => b.text ?? '').join('') ?? ''
  }

  // Streaming
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return ''
      try {
        const j = JSON.parse(data)
        const delta = j.delta?.text
        if (delta) onChunk(delta)
      } catch { /* ignore parse errors */ }
    }
  }
  return ''
}

// ── Safe JSON parse with retry hint ───────────────────────────────────────────
export function safeParseJSON<T>(raw: string): T {
  const cleaned = raw.replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned) as T
}

// ── Product test context injected into every AI call ──────────────────────────
export function getTestContext(app: AppData): string {
  const pt = app.productTest
  if (!pt || pt.error) return ''

  const features  = (pt.features_found ?? []).map(f => `${f.name} (${f.quality})`).join(', ')
  const flows     = (pt.tested_flows   ?? []).map(f =>
    `${f.name}: ${f.status} ${f.score}/100${f.friction_point ? ' — ' + f.friction_point : ''}`
  ).join('; ')
  const works     = (pt.what_works_well    ?? []).join('; ')
  const fixes     = (pt.what_needs_fixing  ?? []).join('; ')
  const highBugs  = (pt.bugs_and_issues    ?? [])
    .filter(b => b.severity === 'Critical' || b.severity === 'High')
    .map(b => `${b.title} [${b.severity}]`).join('; ')
  const ux        = pt.ux_ratings
    ? Object.entries(pt.ux_ratings).map(([k, v]) => `${k}:${v}`).join(', ')
    : ''

  return [
    `\n━━━ PRODUCT TEST INTELLIGENCE (QA Score: ${pt.overall_score}/100 — "${pt.verdict}") ━━━`,
    pt.first_impression ? `FIRST IMPRESSION: ${pt.first_impression}` : '',
    `FEATURES TESTED & QUALITY: ${features}`,
    `FLOWS TESTED: ${flows}`,
    `WHAT GENUINELY WORKS: ${works}`,
    `WHAT NEEDS FIXING: ${fixes}`,
    highBugs ? `HIGH-SEVERITY BUGS: ${highBugs}` : '',
    `UX SCORES: ${ux}`,
    pt.tester_recommendation ? `TESTER VERDICT: ${pt.tester_recommendation}` : '',
    pt.competitive_edge_from_test ? `REAL COMPETITIVE EDGE: ${pt.competitive_edge_from_test}` : '',
    'CONTENT IMPLICATIONS:',
    ...(pt.content_implications ?? []).map((c, i) => `  ${i + 1}. ${c}`),
    pt.onboarding_verdict ? `ONBOARDING: ${pt.onboarding_verdict}` : '',
    '━━━ ALL OUTPUTS MUST REFLECT THESE REAL PRODUCT FINDINGS ━━━',
  ].filter(Boolean).join('\n')
}

// ── Run product test ───────────────────────────────────────────────────────────
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

FEATURES & TABS TO TEST EXHAUSTIVELY (create ONE flow entry per feature, max 8 flows):
${allFeatures.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Keep ALL string values under 20 words. Output ONLY valid JSON, no markdown, no trailing commas:
{"overall_score":75,"verdict":"Good with gaps","verdict_emoji":"🟡","executive_summary":"2 sentence verdict","tester_recommendation":"1 direct sentence","first_impression":"1 sentence","tested_flows":[{"name":"Feature Name","status":"Pass","score":80,"steps_tested":["accessed via nav","tested action"],"observation":"honest observation","friction_point":null},{"name":"Another Feature","status":"Partial","score":65,"steps_tested":["accessed","tested"],"observation":"honest observation","friction_point":"issue found"}],"features_found":[{"name":"Feature A","description":"what it does and quality","quality":"Good"},{"name":"Feature B","description":"assessment","quality":"Average"}],"bugs_and_issues":[{"title":"Bug","description":"1 sentence","severity":"Medium","location":"screen name"}],"ux_ratings":{"onboarding":70,"navigation":75,"visual_design":80,"performance":72,"mobile_responsiveness":68,"error_handling":60},"what_works_well":["strength 1","strength 2","strength 3"],"what_needs_fixing":["fix 1","fix 2","fix 3"],"content_implications":["highlight: strength","avoid: gap","angle: real moment"],"ux_observations":"1-2 sentences","onboarding_verdict":"1 sentence","competitive_edge_from_test":"1 sentence"}`

  const raw = await callClaude(
    prompt,
    'You are a senior QA engineer. Output ONLY valid JSON. Keep string values under 20 words. No markdown.',
    4000
  )
  return safeParseJSON<ProductTest>(raw)
}
