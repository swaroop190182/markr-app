import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const PLAN_USD: Record<string, number> = {
  analysis: 10,
  content:  6,
  pro:      14,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.slice(7)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' })

  const { planId, type, usdAmount, inrRate: clientRate } = req.body as {
    planId:     string
    type:       'order' | 'subscription'
    usdAmount?: number
    inrRate?:   number
  }

  const keyId     = process.env.RAZORPAY_KEY_ID!
  const keySecret = process.env.RAZORPAY_KEY_SECRET!
  const auth      = Buffer.from(`${keyId}:${keySecret}`).toString('base64')

  const notes = {
    user_id: user.id,
    email:   user.email,
    app:     'markr',
    plan_id: planId,
  }

  try {
    if (type === 'order') {
      // One-time purchase (Analysis Pack) — charge in INR paise
      const usd = usdAmount ?? PLAN_USD[planId] ?? 10
      let inrRate = clientRate
      if (!inrRate) {
        inrRate = await fetch('https://open.er-api.com/v6/latest/USD')
          .then(r => r.json())
          .then(d => (d.rates?.INR as number) ?? 95)
          .catch(() => 95)
      }
      const amountPaise = Math.round(usd * inrRate * 100)

      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization':  `Basic ${auth}`,
          'Content-Type':   'application/json',
        },
        body: JSON.stringify({
          amount:   amountPaise,
          currency: 'INR',
          receipt:  `markr_${planId}_${user.id.slice(0, 8)}`,
          notes,
        }),
      })
      const order = await rzpRes.json()
      if (order.error) throw new Error(order.error.description)

      await supabase.from('markr_subscriptions').upsert({
        user_id:         user.id,
        plan:            planId,
        status:          'created',
        razorpay_sub_id: order.id,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'user_id' })

      return res.status(200).json({
        order_id:     order.id,
        key_id:       keyId,
        amount_paise: amountPaise,
      })
    } else {
      // Recurring subscription (Content Engine or Pro Bundle)
      // Use per-plan Razorpay plan ID from env, falling back to the default
      const rzpPlanId = planId === 'content'
        ? (process.env.RAZORPAY_PLAN_ID_CONTENT ?? process.env.RAZORPAY_PLAN_ID!)
        : (process.env.RAZORPAY_PLAN_ID_PRO     ?? process.env.RAZORPAY_PLAN_ID!)

      const rzpRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          plan_id:         rzpPlanId,
          total_count:     120,   // 10 years max
          quantity:        1,
          customer_notify: 1,
          notes,
        }),
      })
      const sub = await rzpRes.json()
      if (sub.error) throw new Error(sub.error.description)

      await supabase.from('markr_subscriptions').upsert({
        user_id:         user.id,
        plan:            planId,
        status:          'created',
        razorpay_sub_id: sub.id,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'user_id' })

      return res.status(200).json({
        subscription_id: sub.id,
        key_id:          keyId,
      })
    }
  } catch (e) {
    console.error('Create subscription error:', e)
    return res.status(500).json({ error: (e as Error).message })
  }
}
