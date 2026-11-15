import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// Server log of prices the client corrected back to their original currency in AI analysis output
// (src/lib/currency.ts). One line per correction: app, analysis, wrong value, corrected value.
// No AI call, no database write, does not count toward the daily limit.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const token = req.headers.authorization?.slice(7)
  if (!token) return res.status(401).json({ error: 'No token' })
  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid session' })

  const { appId, appName, analysis, fixes } = req.body ?? {}
  const clip = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').slice(0, 120)
  const list = Array.isArray(fixes) ? fixes.slice(0, 50) : []
  for (const f of list) {
    console.log(`[currency-fix] user=${user.id} app=${clip(appId)} "${clip(appName)}" analysis=${clip(analysis)} wrong="${clip(f?.from)}" corrected="${clip(f?.to)}"`)
  }
  return res.status(204).end()
}
