import type { VercelRequest, VercelResponse } from '@vercel/node'

const RATE_LIMITS = { pro: 200, free: 5 }
const usageMap    = new Map<string, { count: number; date: string }>()

function getPlan(email: string): 'pro' | 'free' {
  const PRO = (process.env.PRO_EMAILS ?? 'swaroop.raghu@gmail.com,swaroop.82@gmail.com')
    .split(',').map(e => e.trim().toLowerCase())
  return PRO.includes(email.toLowerCase()) ? 'pro' : 'free'
}

function checkAndIncrement(userId: string, plan: 'pro' | 'free'): { allowed: boolean; remaining: number } {
  const today = new Date().toISOString().split('T')[0]
  const key   = `${userId}:${today}`
  const limit = RATE_LIMITS[plan]
  const cur   = usageMap.get(key)
  const count = (cur?.date === today ? cur.count : 0)
  if (count >= limit) return { allowed: false, remaining: 0 }
  usageMap.set(key, { count: count + 1, date: today })
  return { allowed: true, remaining: limit - count - 1 }
}

// ── Call Anthropic Claude Haiku ───────────────────────────────────────────────
async function callAnthropic(prompt: string, system: string, maxTokens: number, doStream: boolean, res: VercelResponse): Promise<boolean> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return false

  try {
    const body = JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      stream:     doStream,
      system,
      messages: [{ role: 'user', content: prompt }],
    })
    const headers = {
      'Content-Type':      'application/json',
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
    }

    if (doStream) {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body })
      if (!upstream.ok) {
        const err = await upstream.json().catch(() => ({}))
        // If out of credits, fall through to Gemini
        if (upstream.status === 429 || upstream.status === 402 || (err as any)?.error?.type === 'insufficient_balance_error') return false
        throw new Error((err as any)?.error?.message ?? `Anthropic error ${upstream.status}`)
      }
      const reader = upstream.body!.getReader()
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
          if (data === '[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return true }
          try {
            const j = JSON.parse(data)
            const t = j.delta?.text
            if (t) res.write(`data: ${JSON.stringify({ text: t })}\n\n`)
          } catch { /* ignore */ }
        }
      }
      res.write('data: [DONE]\n\n'); res.end()
      return true
    } else {
      const resp = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        if (resp.status === 429 || resp.status === 402 || (err as any)?.error?.type === 'insufficient_balance_error') return false
        throw new Error((err as any)?.error?.message ?? `Anthropic error ${resp.status}`)
      }
      const data = await resp.json()
      res.status(200).json({ content: data.content, provider: 'anthropic' })
      return true
    }
  } catch (e) {
    console.error('Anthropic error:', e)
    return false
  }
}

// ── Call Google Gemini Flash (free fallback) ──────────────────────────────────
async function callGemini(prompt: string, system: string, maxTokens: number, doStream: boolean, res: VercelResponse): Promise<boolean> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return false

  try {
    const model    = 'gemini-2.0-flash'
    const endpoint = doStream
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    })

    if (doStream) {
      const upstream = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      if (!upstream.ok) return false
      const reader = upstream.body!.getReader()
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
          try {
            const j    = JSON.parse(data)
            const text = j.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`)
          } catch { /* ignore */ }
        }
      }
      res.write('data: [DONE]\n\n'); res.end()
      return true
    } else {
      const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      if (!resp.ok) return false
      const data = await resp.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      res.status(200).json({ content: [{ type: 'text', text }], provider: 'gemini' })
      return true
    }
  } catch (e) {
    console.error('Gemini error:', e)
    return false
  }
}

// ── Call Groq Llama (free fallback #2) ───────────────────────────────────────
async function callGroq(prompt: string, system: string, maxTokens: number, doStream: boolean, res: VercelResponse): Promise<boolean> {
  const key = process.env.GROQ_API_KEY
  if (!key) return false

  try {
    const body = JSON.stringify({
      model:       'llama-3.1-70b-versatile',
      max_tokens:  maxTokens,
      stream:      doStream,
      messages: [
        { role: 'system',  content: system },
        { role: 'user',    content: prompt },
      ],
    })
    const headers = {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${key}`,
    }

    if (doStream) {
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers, body })
      if (!upstream.ok) return false
      const reader = upstream.body!.getReader()
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
          if (data === '[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return true }
          try {
            const j    = JSON.parse(data)
            const text = j.choices?.[0]?.delta?.content
            if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`)
          } catch { /* ignore */ }
        }
      }
      res.write('data: [DONE]\n\n'); res.end()
      return true
    } else {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers, body })
      if (!resp.ok) return false
      const data = await resp.json()
      const text = data.choices?.[0]?.message?.content ?? ''
      res.status(200).json({ content: [{ type: 'text', text }], provider: 'groq' })
      return true
    }
  } catch (e) {
    console.error('Groq error:', e)
    return false
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token     = req.headers.authorization?.slice(7)
  const isCronJob = req.headers['x-cron-job'] === 'true' &&
                    req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`

  if (!token) return res.status(401).json({ error: 'No token' })

  let userId    = 'cron'
  let userEmail = 'cron@markr.internal'

  if (!isCronJob) {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Invalid session' })
    userId    = user.id
    userEmail = user.email ?? ''
  }

  const { prompt, system, maxTokens, stream: doStream } = req.body

  // Rate limiting
  if (!isCronJob) {
    const plan = getPlan(userEmail)
    const { allowed, remaining } = checkAndIncrement(userId, plan)
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

  // Try Anthropic first — fall back to Gemini, then Groq
  const anthropicOk = await callAnthropic(prompt, sys, tok, doStream, res)
  if (anthropicOk) return

  console.log('Anthropic unavailable — falling back to Gemini')
  const geminiOk = await callGemini(prompt, sys, tok, doStream, res)
  if (geminiOk) return

  console.log('Gemini unavailable — falling back to Groq')
  const groqOk = await callGroq(prompt, sys, tok, doStream, res)
  if (groqOk) return

  // All providers failed
  res.status(503).json({ error: 'AI service temporarily unavailable. Please try again in a moment.' })
}
