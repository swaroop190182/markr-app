import type { VercelRequest, VercelResponse } from '@vercel/node'

// Rate limits per plan (calls per day)
const RATE_LIMITS = { pro: 200, free: 20 }

// In-memory rate limiter (resets on cold start — good enough for launch)
const usageMap = new Map<string, { count: number; date: string }>()

function getPlan(email: string): 'pro' | 'free' {
  const PRO = (process.env.PRO_EMAILS ?? 'swaroop.raghu@gmail.com')
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ─────────────────────────────────────────────────────────────────
  const token = req.headers.authorization?.slice(7)
  if (!token) return res.status(401).json({ error: 'No token' })

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid session' })

  // ── Rate limit ───────────────────────────────────────────────────────────
  const plan = getPlan(user.email ?? '')
  const { allowed, remaining } = checkAndIncrement(user.id, plan)

  if (!allowed) {
    return res.status(429).json({
      error: plan === 'free'
        ? `Free plan limit: ${RATE_LIMITS.free} AI calls/day. Upgrade to Pro for ${RATE_LIMITS.pro}/day.`
        : `Pro plan limit: ${RATE_LIMITS.pro} calls/day. Resets at midnight.`,
      remaining: 0, plan,
    })
  }

  // ── Call Claude ──────────────────────────────────────────────────────────
  const { prompt, system, maxTokens, model: reqModel, stream: doStream } = req.body

  // Haiku for everything — Sonnet only for product test (complex reasoning)
  const model = reqModel === 'sonnet'
    ? 'claude-sonnet-4-5'
    : 'claude-haiku-4-5-20251001'

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!
  const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
  const headers = {
    'Content-Type':      'application/json',
    'x-api-key':         ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
  }
  const body = JSON.stringify({
    model,
    max_tokens: maxTokens ?? 1400,
    stream: !!doStream,
    system: system ?? 'You are a world-class marketing strategist. Be specific, creative, and actionable. No preamble.',
    messages: [{ role: 'user', content: prompt }],
  })

  res.setHeader('X-Remaining-Calls', String(remaining))
  res.setHeader('X-Plan', plan)

  if (doStream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const upstream = await fetch(ANTHROPIC_URL, { method: 'POST', headers, body })
    const reader   = upstream.body!.getReader()
    const dec      = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n'); buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return }
        try {
          const j = JSON.parse(data)
          const t = j.delta?.text
          if (t) res.write(`data: ${JSON.stringify({ text: t })}\n\n`)
        } catch { /* ignore */ }
      }
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } else {
    const resp = await fetch(ANTHROPIC_URL, { method: 'POST', headers, body })
    const data = await resp.json()
    if (data.error) return res.status(500).json({ error: data.error.message })
    res.status(200).json({ content: data.content, remaining, plan })
  }
}
