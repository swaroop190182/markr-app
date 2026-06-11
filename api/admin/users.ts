import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = (process.env.PRO_EMAILS ?? 'swaroop.raghu@gmail.com,swaroop.82@gmail.com')
  .split(',').map(e => e.trim().toLowerCase())

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

  // Verify caller is an admin
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid session' })
  if (!ADMIN_EMAILS.includes((user.email ?? '').toLowerCase())) {
    return res.status(403).json({ error: 'Admin only' })
  }

  // Fetch all auth users — full records with id, email, created_at
  const { data, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) return res.status(500).json({ error: listErr.message })

  const users = data.users.map(u => ({
    id:         u.id,
    email:      u.email ?? '',
    created_at: u.created_at,
  }))

  return res.status(200).json({ users })
}
