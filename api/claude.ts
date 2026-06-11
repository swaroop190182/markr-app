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

// ── Call Anthropic ─────────────────────────────────────────────────────────────
async function callAnthropic(prompt: string, system: string, maxTokens: number, doStream: boolean, res: VercelResponse): Promise<boolean> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return false
  try {
    const body = JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:maxTokens, stream:doStream, system, messages:[{role:'user',content:prompt}] })
    const headers = { 'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' }
    if (doStream) {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers, body })
      if (!upstream.ok) {
        const err = await upstream.json().catch(()=>({}))
        if (upstream.status===429||upstream.status===402||(err as any)?.error?.type==='insufficient_balance_error') return false
        return false
      }
      const reader = upstream.body!.getReader(); const dec = new TextDecoder(); let buf = ''
      while (true) {
        const {done,value} = await reader.read(); if (done) break
        buf += dec.decode(value,{stream:true})
        const lines = buf.split('\n'); buf = lines.pop()??''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const d = line.slice(5).trim()
          if (d==='[DONE]') { res.write('data: [DONE]\n\n'); res.end(); return true }
          try { const j=JSON.parse(d); const t=j.delta?.text; if(t) res.write(`data: ${JSON.stringify({text:t})}\n\n`) } catch {}
        }
      }
      res.write('data: [DONE]\n\n'); res.end(); return true
    } else {
      const resp = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers, body })
      if (!resp.ok) return false
      const data = await resp.json()
      if (data.error) return false
      res.status(200).json({ content:data.content, provider:'anthropic' }); return true
    }
  } catch { return false }
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

  const { prompt, system, maxTokens, stream: doStream } = req.body

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

  const anthropicOk = await callAnthropic(prompt, sys, tok, doStream, res)
  if (anthropicOk) return

  console.log('Anthropic unavailable — falling back to Gemini')
  const geminiOk = await callGemini(prompt, sys, tok, doStream, res)
  if (geminiOk) return

  console.log('Gemini unavailable — falling back to Groq')
  const groqOk = await callGroq(prompt, sys, tok, doStream, res)
  if (groqOk) return

  res.status(503).json({ error:'AI service temporarily unavailable. Please try again in a moment.' })
}
