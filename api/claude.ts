import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

type PlanKey = 'free' | 'analysis' | 'content' | 'guest_pro' | 'pro'
const RATE_LIMITS: Record<PlanKey, number> = { free: 5, analysis: 10, content: 30, guest_pro: 30, pro: 50 }

function isProEmail(email: string): boolean {
  const PRO = (process.env.PRO_EMAILS ?? 'swaroop.raghu@gmail.com,swaroop.82@gmail.com')
    .split(',').map(e => e.trim().toLowerCase())
  return PRO.includes(email.toLowerCase())
}

async function getPlan(supabase: any, userId: string, email: string): Promise<PlanKey> {
  if (isProEmail(email)) return 'pro'
  // Check DB subscription — covers all paid/admin-granted plans
  const { data } = await supabase
    .from('markr_subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .single()
  if (data?.status === 'active') {
    const p = data.plan as string
    if (p in RATE_LIMITS) return p as PlanKey
  }
  return 'free'
}

async function checkRateLimit(supabase: any, userId: string, plan: PlanKey): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().split('T')[0]
  const limit = RATE_LIMITS[plan]

  // Read current count from Supabase
  const { data } = await supabase
    .from('markr_rate_limits')
    .select('count')
    .eq('user_id', userId)
    .eq('date', today)
    .single()

  const count = data?.count ?? 0
  if (count >= limit) return { allowed: false, remaining: 0 }

  // Increment
  await supabase
    .from('markr_rate_limits')
    .upsert({ user_id: userId, date: today, count: count + 1, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' })

  return { allowed: true, remaining: limit - count - 1 }
}

type UsageInfo = { inputTokens: number; outputTokens: number; model: string }

async function logUsage(supabase: any, userId: string, feature: string, u: UsageInfo) {
  try {
    await supabase.from('markr_api_usage').insert({
      user_id:       userId !== 'cron' ? userId : null,
      feature,
      tokens_input:  u.inputTokens,
      tokens_output: u.outputTokens,
      model:         u.model,
    })
  } catch { /* non-critical — never block the response */ }
}

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

// ── Call Anthropic ─────────────────────────────────────────────────────────────
async function callAnthropic(prompt: string, system: string, maxTokens: number, doStream: boolean, res: VercelResponse, images?: string[]): Promise<UsageInfo | { failStatus: number } | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const MODEL = ANTHROPIC_MODEL
  try {
    // Build message content — multi-part when images are provided
    const messageContent: any = images && images.length > 0
      ? [
          ...images.map(img => {
            const mediaType = img.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
            const data = img.replace(/^data:[^;]+;base64,/, '')
            return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
          }),
          { type: 'text', text: prompt },
        ]
      : prompt
    const body = JSON.stringify({ model: MODEL, max_tokens: maxTokens, stream: doStream, system, messages: [{role:'user', content: messageContent}] })
    const headers = { 'Content-Type':'application/json', 'x-api-key': key, 'anthropic-version':'2023-06-01' }
    if (doStream) {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers, body })
      if (!upstream.ok) {
        return { failStatus: upstream.status }
      }
      res.write(`data: ${JSON.stringify({ provider: 'anthropic' })}\n\n`)
      const reader = upstream.body!.getReader(); const dec = new TextDecoder(); let buf = ''
      let inputTokens = 0, outputTokens = 0
      while (true) {
        const {done, value} = await reader.read(); if (done) break
        buf += dec.decode(value, {stream: true})
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const d = line.slice(5).trim()
          if (d === '[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return { inputTokens, outputTokens, model: MODEL } }
          try {
            const j = JSON.parse(d)
            // Capture token counts from Anthropic SSE events
            if (j.message?.usage?.input_tokens)  inputTokens  = j.message.usage.input_tokens
            if (j.usage?.output_tokens)           outputTokens = j.usage.output_tokens
            const t = j.delta?.text; if (t) res.write(`data: ${JSON.stringify({text: t})}\n\n`)
          } catch {}
        }
      }
      res.write('data: [DONE]\n\n'); res.end()
      return { inputTokens, outputTokens, model: MODEL }
    } else {
      const resp = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers, body })
      if (!resp.ok) return { failStatus: resp.status }
      const data = await resp.json()
      if (data.error) return null
      res.status(200).json({ content: data.content, provider: 'anthropic' })
      return { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0, model: MODEL }
    }
  } catch { return null }
}

// ── Web-search pass (Anthropic only) ─────────────────────────────────────────
// Used for sourced facts. The model's JSON is never trusted: every
// {value, source_url} whose source_url wasn't actually returned by a search
// result in this call is replaced with null before it leaves the server, and a
// website is kept only if a returned result is on that website's own domain.
const WEB_SEARCH_FEATURES = new Set(['competitive_facts'])   // opt-in per feature; nothing else can spend searches
const WEB_SEARCH_MAX_USES = 10
const WEB_SEARCH_BUDGET_MS = 45_000   // stop resuming pause_turn after this
const WEB_SEARCH_HARD_MS   = 55_000   // stay under the 60s function limit

// Comparable form of a URL: host without www, no trailing slash, no #fragment, no utm_* params
function normalizeSourceUrl(u: string): string | null {
  try {
    const url = new URL(u.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    for (const k of [...url.searchParams.keys()]) if (k.toLowerCase().startsWith('utm_')) url.searchParams.delete(k)
    const q = url.searchParams.toString()
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${q ? '?' + q : ''}`
  } catch { return null }
}

type FactStats = { kept: number; dropped: number; derived: number }

const hostOfNorm = (n: string) => n.split(/[/?]/)[0]   // host part of a normalizeSourceUrl() result
const sameSite   = (a: string, b: string) => a === b || a.endsWith('.' + b) || b.endsWith('.' + a)

// A website is confirmed only by a search result that was actually returned on that same domain.
// Returns that result's original URL (used as the website's source), or null.
function findResultOnSite(siteUrl: string, allowed: Map<string, string>): string | null {
  const n = normalizeSourceUrl(siteUrl)
  if (!n) return null
  const host = hostOfNorm(n)
  for (const [norm, original] of allowed) if (sameSite(hostOfNorm(norm), host)) return original
  return null
}

// Walk the model's JSON; keep a {value, source_url} only if its source was a real search result.
// "website" is stricter: its own domain must appear among the returned results (the cited
// source_url is ignored and replaced with that result), so a guessed domain can't be "verified".
function keepSourcedFacts(node: any, allowed: Map<string, string>, stats: FactStats, key?: string): any {
  if (Array.isArray(node)) return node.map(n => keepSourcedFacts(n, allowed, stats))
  if (node && typeof node === 'object') {
    if ('value' in node && 'source_url' in node) {
      const val = node.value == null ? '' : String(node.value).trim()
      if (key === 'website') {
        const onSite = val ? findResultOnSite(val, allowed) : null
        if (onSite) { stats.kept++; return { value: node.value, source_url: onSite } }
        stats.dropped++
        return null
      }
      const src = typeof node.source_url === 'string' ? normalizeSourceUrl(node.source_url) : null
      if (src && allowed.has(src) && val) { stats.kept++; return { value: node.value, source_url: node.source_url } }
      stats.dropped++
      return null
    }
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(node)) out[k] = keepSourcedFacts(v, allowed, stats, k)
    return out
  }
  return node
}

// When the model's website wasn't confirmed, take a returned result whose domain is named
// after the company: the name itself, or the name plus a common affix (amaha + health).
// Third-party platforms never count as a company's own site.
const SITE_AFFIXES = ['app', 'apps', 'hq', 'inc', 'labs', 'ai', 'io', 'health', 'care', 'online', 'official', 'global', 'india', 'tech', 'co', 'in', 'get', 'try', 'join', 'use', 'go', 'my']
const THIRD_PARTY_HOSTS = ['apple.com', 'google.com', 'crunchbase.com', 'tracxn.com', 'pitchbook.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com', 'wikipedia.org', 'medium.com', 'reddit.com', 'g2.com', 'capterra.com', 'producthunt.com']

// Registrable label: "amahahealth" for www.amahahealth.com and amahahealth.co.in; "medium" for amaha.medium.com
function siteLabel(host: string): string {
  const p = host.split('.')
  const i = p.length >= 3 && p[p.length - 1].length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov'].includes(p[p.length - 2]) ? p.length - 3 : p.length - 2
  return (p[Math.max(0, i)] ?? '').replace(/[^a-z0-9]/g, '')
}

function hostNamedAfter(host: string, name: string): boolean {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (n.length < 3) return false
  const label = siteLabel(host)
  return label === n || SITE_AFFIXES.some(a => label === n + a || label === a + n)
}

function fillWebsitesFromResults(json: any, allowed: Map<string, string>, stats: FactStats): void {
  if (!Array.isArray(json?.competitors)) return
  for (const c of json.competitors) {
    if (!c || typeof c.name !== 'string' || c.website) continue
    for (const [norm, original] of allowed) {
      const host = hostOfNorm(norm)
      if (THIRD_PARTY_HOSTS.some(t => sameSite(host, t)) || !hostNamedAfter(host, c.name)) continue
      try { c.website = { value: new URL(original).origin, source_url: original }; stats.derived++; break } catch { /* skip */ }
    }
  }
}

type SearchResult =
  | { ok: true; json: any; inputTokens: number; outputTokens: number; searches: number }
  | { ok: false; reason: string }

async function callAnthropicWithSearch(prompt: string, system: string, maxTokens: number, maxUses: number, feature: string): Promise<SearchResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, reason: 'no ANTHROPIC_API_KEY' }
  const started = Date.now()
  const assistant: any[] = []          // all assistant content so far (resent unchanged on pause_turn)
  const allowed = new Map<string, string>()   // normalized → original URL of every search result returned
  let inputTokens = 0, outputTokens = 0, searches = 0, pauses = 0, stop = ''
  try {
    while (true) {
      const remaining = WEB_SEARCH_HARD_MS - (Date.now() - started)
      if (remaining < 5_000) return { ok: false, reason: 'time budget exhausted' }
      const messages: any[] = [{ role: 'user', content: prompt }]
      if (assistant.length) messages.push({ role: 'assistant', content: assistant })
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
        }),
        signal: AbortSignal.timeout(remaining),
      })
      if (!resp.ok) return { ok: false, reason: `anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}` }
      const data = await resp.json()
      inputTokens  += data.usage?.input_tokens ?? 0
      outputTokens += data.usage?.output_tokens ?? 0
      searches     += data.usage?.server_tool_use?.web_search_requests ?? 0
      for (const b of data.content ?? []) {
        assistant.push(b)
        // Success content is a list of results; an error (e.g. max_uses_exceeded) is a single object — skip it
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
          for (const r of b.content) {
            const n = r?.type === 'web_search_result' && typeof r.url === 'string' ? normalizeSourceUrl(r.url) : null
            if (n && !allowed.has(n)) allowed.set(n, r.url)
          }
        }
      }
      stop = data.stop_reason ?? ''
      if (stop === 'pause_turn' && pauses < 3 && Date.now() - started < WEB_SEARCH_BUDGET_MS) { pauses++; continue }
      break
    }
    if (stop !== 'end_turn') return { ok: false, reason: `stopped: ${stop}` }

    const text = assistant.filter(b => b.type === 'text').map(b => b.text).join('')
    const body = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '')
    const start = body.indexOf('{'), end = body.lastIndexOf('}')
    if (start === -1 || end <= start) return { ok: false, reason: 'no JSON in response' }
    const stats: FactStats = { kept: 0, dropped: 0, derived: 0 }
    const json = keepSourcedFacts(JSON.parse(body.slice(start, end + 1)), allowed, stats)
    if (feature === 'competitive_facts') fillWebsitesFromResults(json, allowed, stats)
    json.checked_at = new Date().toISOString()

    // Timing line for tuning FACTS_BATCH
    console.log(`[web_search] feature=${feature} ms=${Date.now() - started} searches=${searches} pauses=${pauses} stop=${stop} in=${inputTokens} out=${outputTokens} sources=${allowed.size} kept=${stats.kept} dropped=${stats.dropped} sites_from_results=${stats.derived}`)
    return { ok: true, json, inputTokens, outputTokens, searches }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  } finally {
    console.log(`[web_search] feature=${feature} finished ms=${Date.now() - started} searches=${searches} pauses=${pauses} stop=${stop}`)
  }
}

// ── Call Gemini ────────────────────────────────────────────────────────────────
async function callGemini(prompt: string, system: string, maxTokens: number, doStream: boolean, res: VercelResponse): Promise<boolean> {
  const key = process.env.GEMINI_API_KEY; if (!key) return false
  try {
    const model = 'gemini-2.0-flash'
    const endpoint = doStream
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
    const body = JSON.stringify({ system_instruction:{parts:[{text:system}]}, contents:[{role:'user',parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:maxTokens,temperature:0.7} })
    if (doStream) {
      const upstream = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body })
      if (!upstream.ok) return false
      res.write(`data: ${JSON.stringify({ provider: 'gemini' })}\n\n`)
      const reader = upstream.body!.getReader(); const dec = new TextDecoder(); let buf = ''
      while (true) {
        const {done,value} = await reader.read(); if (done) break
        buf += dec.decode(value,{stream:true})
        const lines = buf.split('\n'); buf = lines.pop()??''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try { const j=JSON.parse(line.slice(5).trim()); const t=j.candidates?.[0]?.content?.parts?.[0]?.text; if(t) res.write(`data: ${JSON.stringify({text:t})}\n\n`) } catch {}
        }
      }
      res.write('data: [DONE]\n\n'); res.end(); return true
    } else {
      const resp = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body })
      if (!resp.ok) return false
      const data = await resp.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text??''
      res.status(200).json({ content:[{type:'text',text}], provider:'gemini' }); return true
    }
  } catch { return false }
}

// ── Call Groq ──────────────────────────────────────────────────────────────────
async function callGroq(prompt: string, system: string, maxTokens: number, doStream: boolean, res: VercelResponse): Promise<boolean> {
  const key = process.env.GROQ_API_KEY; if (!key) return false
  try {
    const body = JSON.stringify({ model:'llama-3.3-70b-versatile', max_tokens:maxTokens, stream:doStream, messages:[{role:'system',content:system},{role:'user',content:prompt}] })
    const headers = { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` }
    if (doStream) {
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers, body })
      if (!upstream.ok) return false
      res.write(`data: ${JSON.stringify({ provider: 'groq' })}\n\n`)
      const reader = upstream.body!.getReader(); const dec = new TextDecoder(); let buf = ''
      while (true) {
        const {done,value} = await reader.read(); if (done) break
        buf += dec.decode(value,{stream:true})
        const lines = buf.split('\n'); buf = lines.pop()??''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const d = line.slice(5).trim()
          if (d==='[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return true }
          try { const j=JSON.parse(d); const t=j.choices?.[0]?.delta?.content; if(t) res.write(`data: ${JSON.stringify({text:t})}\n\n`) } catch {}
        }
      }
      res.write('data: [DONE]\n\n'); res.end(); return true
    } else {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers, body })
      if (!resp.ok) return false
      const data = await resp.json()
      const text = data.choices?.[0]?.message?.content??''
      res.status(200).json({ content:[{type:'text',text}], provider:'groq' }); return true
    }
  } catch { return false }
}

// ── Main handler ───────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  const token     = req.headers.authorization?.slice(7)
  const isCronJob = req.headers['x-cron-job'] === 'true' &&
                    req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`

  if (!token) return res.status(401).json({ error:'No token' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

  let userId = 'cron', userEmail = 'cron@markr.internal'
  if (!isCronJob) {
    const { data:{ user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error:'Invalid session' })
    userId = user.id; userEmail = user.email ?? ''
  }

  const { prompt, system, maxTokens, stream: doStream, feature = 'general', images, webSearch } = req.body

  // Web search is opt-in per feature, Anthropic-only, non-streaming
  if (webSearch && (!WEB_SEARCH_FEATURES.has(feature) || doStream || (images && images.length))) {
    return res.status(400).json({ error: 'Web search is not available for this request.' })
  }

  // Rate limiting — stored in Supabase, survives cold starts
  if (!isCronJob) {
    const plan = await getPlan(supabase, userId, userEmail)
    const { allowed, remaining } = await checkRateLimit(supabase, userId, plan)
    if (!allowed) {
      return res.status(429).json({
        error: plan === 'free'
          ? `Free plan limit: ${RATE_LIMITS.free} AI calls/day. Upgrade to Pro for ${RATE_LIMITS.pro}/day.`
          : `Pro plan limit: ${RATE_LIMITS.pro} calls/day. Resets at midnight.`,
        remaining: 0, plan,
      })
    }
    res.setHeader('X-Remaining-Calls', String(remaining))
  }

  const sys = system ?? 'You are a world-class marketing strategist. Be specific, creative, and actionable. No preamble.'
  const tok = maxTokens ?? 1400

  if (doStream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
  }

  if (webSearch) {
    const maxUses = Math.min(Math.max(1, Number(webSearch.maxUses) || WEB_SEARCH_MAX_USES), WEB_SEARCH_MAX_USES)
    const r = await callAnthropicWithSearch(prompt, sys, tok, maxUses, feature)
    if (!r.ok) {
      console.warn('[web_search] failed:', r.reason)
      // No Gemini/Groq fallback — they can't search, and recalled facts are not acceptable here
      return res.status(503).json({ error: 'Live source check unavailable — please try again later.' })
    }
    logUsage(supabase, userId, feature, { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: ANTHROPIC_MODEL })
    return res.status(200).json({ content: [{ type: 'text', text: JSON.stringify(r.json) }], provider: 'anthropic' })
  }

  const anthropicResult = await callAnthropic(prompt, sys, tok, doStream, res, images)
  if (anthropicResult && !('failStatus' in anthropicResult)) {
    console.log('[callClaude] provider: anthropic')
    logUsage(supabase, userId, feature, anthropicResult)
    return
  }

  // Vision calls are Anthropic-only — don't fall back to text-only providers
  if (images && images.length > 0) {
    return res.status(503).json({ error: 'AI vision service temporarily unavailable. Please try again.' })
  }

  const anthropicStatus = anthropicResult && 'failStatus' in anthropicResult ? anthropicResult.failStatus : null
  const status = anthropicStatus
  console.log('[callClaude] provider failover triggered, status:', status)

  // 401/429/503 from Anthropic → skip Gemini and go straight to Groq
  if (anthropicStatus !== null && [401, 429, 503].includes(anthropicStatus)) {
    console.warn(`[callClaude] Anthropic failed with ${anthropicStatus} — falling back to Groq`)
    const groqOk = await callGroq(prompt, sys, tok, doStream, res)
    if (groqOk) {
      console.log('[callClaude] provider: groq (Anthropic direct fallback)')
      logUsage(supabase, userId, feature, { inputTokens: 0, outputTokens: 0, model: 'llama-3.3-70b' })
      return
    }
    return res.status(503).json({ error: 'AI service temporarily unavailable. Please try again in a moment.' })
  }

  console.log('[callClaude] Anthropic unavailable — falling back to Gemini')
  const geminiOk = await callGemini(prompt, sys, tok, doStream, res)
  if (geminiOk) {
    console.log('[callClaude] provider: gemini')
    logUsage(supabase, userId, feature, { inputTokens: 0, outputTokens: 0, model: 'gemini-2.0-flash' })
    return
  }

  console.log('[callClaude] Gemini unavailable — falling back to Groq')
  const groqOk = await callGroq(prompt, sys, tok, doStream, res)
  if (groqOk) {
    console.log('[callClaude] provider: groq (Gemini fallback)')
    logUsage(supabase, userId, feature, { inputTokens: 0, outputTokens: 0, model: 'llama-3.3-70b' })
    return
  }

  res.status(503).json({ error: 'AI service temporarily unavailable. Please try again in a moment.' })
}
