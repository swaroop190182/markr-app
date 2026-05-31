import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth check
  const token = req.headers.authorization?.slice(7)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

  const keyId     = process.env.RAZORPAY_KEY_ID!
  const keySecret = process.env.RAZORPAY_KEY_SECRET!
  const planId    = process.env.RAZORPAY_PLAN_ID!
  const auth      = Buffer.from(`${keyId}:${keySecret}`).toString('base64')

  try {
    // Create Razorpay subscription
    const rzpRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id:        planId,
        total_count:    120,          // 10 years max
        quantity:       1,
        customer_notify: 1,
        notes: {
          user_id: user.id,
          email:   user.email,
          app:     'markr',
        }
      })
    })

    const sub = await rzpRes.json()
    if (sub.error) throw new Error(sub.error.description)

    // Save to Supabase
    await supabase.from('markr_subscriptions').upsert({
      user_id:          user.id,
      plan:             'free',
      status:           'created',
      razorpay_sub_id:  sub.id,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'user_id' })

    res.status(200).json({
      subscription_id: sub.id,
      key_id:          keyId,
    })
  } catch (e) {
    console.error('Create subscription error:', e)
    res.status(500).json({ error: (e as Error).message })
  }
}
