import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'swaroop.raghu@gmail.com'
const PRO_EMAILS  = (process.env.PRO_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())

function isPro(email: string): boolean {
  return PRO_EMAILS.includes(email.toLowerCase()) || email.toLowerCase() === ADMIN_EMAIL
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.slice(7)
  if (!token) return res.status(401).json({ error: 'No token' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid session' })

  if (!isPro(user.email ?? '')) {
    return res.status(403).json({ error: 'Deep QA is a Pro feature.' })
  }

  return res.status(503).json({
    error: 'Deep Browser Test coming soon',
    message: 'Real browser testing requires an external browser service. Coming in the next update.'
  })
}
