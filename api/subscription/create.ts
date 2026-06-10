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

  const { planId, usdAmount, inrRate: clientRate, isIndian } = req.body as {
    planId:     string
    usdAmount?: number
    inrRate?:   number
    isIndian?:  boolean
  }

  const keyId     = process.env.RAZORPAY_KEY_ID!
  const keySecret = process.env.RAZORPAY_KEY_SECRET!
  const auth      = Buffer.from(`${keyId}:${keySecret}`).toString('base64')

  // Routing decision is server-authoritative:
  // - Analysis Pack: always one-time order
  // - Content Engine / Pro Bundle + Indian: Razorpay subscription (pre-created INR plan)
  // - Content Engine / Pro Bundle + international: one-time order (dynamic INR paise)
  const useSubscription = planId !== 'analysis' && !!isIndian

  console.log('[subscription/create] planId:', planId, '| isIndian:', isIndian, '| useSubscription:', useSubscription)
  console.log('[subscription/create] RAZORPAY_PLAN_ID_CONTENT:     ', process.env.RAZORPAY_PLAN_ID_CONTENT      ?? '(not set)')
  console.log('[subscription/create] RAZORPAY_PLAN_ID_PRO:         ', process.env.RAZORPAY_PLAN_ID_PRO          ?? '(not set)')
  console.log('[subscription/create] RAZORPAY_PLAN_ID_CONTENT_INR: ', process.env.RAZORPAY_PLAN_ID_CONTENT_INR  ?? '(not set)')
  console.log('[subscription/create] RAZORPAY_PLAN_ID_PRO_INR:     ', process.env.RAZORPAY_PLAN_ID_PRO_INR      ?? '(not set)')

  const notes = {
    user_id: user.id,
    email:   user.email,
    app:     'markr',
    plan_id: planId,
  }

  try {
    if (useSubscription) {
      // ── Indian user: auto-recurring INR subscription ───────────────────────
      const rzpPlanId = planId === 'content'
        ? (isIndian ? process.env.RAZORPAY_PLAN_ID_CONTENT_INR! : process.env.RAZORPAY_PLAN_ID_CONTENT!)
        : (isIndian ? process.env.RAZORPAY_PLAN_ID_PRO_INR!     : process.env.RAZORPAY_PLAN_ID_PRO!)

      if (!rzpPlanId) {
        throw new Error(`Razorpay plan ID not configured for plan: ${planId}`)
      }

      console.log('[subscription/create] Creating INR subscription with plan:', rzpPlanId)

      const rzpRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id:         rzpPlanId,
          total_count:     120,
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
        billing_cycle:   'recurring_inr',
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'user_id' })

      return res.status(200).json({ subscription_id: sub.id, key_id: keyId })

    } else {
      // ── One-time order: Analysis Pack (all users) or subscription plan (international) ──
      const isInternationalSubscription = planId !== 'analysis'
      if (isInternationalSubscription) {
        console.log(`[subscription/create] International one-time order for ${planId} — renewal reminder needed for user ${user.id}`)
      }

      const usd = usdAmount ?? PLAN_USD[planId] ?? 10
      let inrRate = clientRate
      if (!inrRate) {
        inrRate = await fetch('https://open.er-api.com/v6/latest/USD')
          .then(r => r.json())
          .then(d => (d.rates?.INR as number) ?? 95)
          .catch(() => 95)
      }
      const amountPaise = Math.round(usd * inrRate * 100)

      console.log(`[subscription/create] Creating order: $${usd} × ${inrRate} = ${amountPaise} paise`)

      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
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
        billing_cycle:   isInternationalSubscription ? 'one_time_international' : 'one_time',
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'user_id' })

      return res.status(200).json({ order_id: order.id, key_id: keyId, amount_paise: amountPaise })
    }

  } catch (e) {
    console.error('Create subscription error:', e)
    return res.status(500).json({ error: (e as Error).message })
  }
}
