import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verify webhook signature
  const signature  = req.headers['x-razorpay-signature'] as string
  const secret     = process.env.RAZORPAY_WEBHOOK_SECRET!
  const body       = JSON.stringify(req.body)
  const expected   = createHmac('sha256', secret).update(body).digest('hex')

  if (signature !== expected) {
    console.error('Invalid webhook signature')
    return res.status(400).json({ error: 'Invalid signature' })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  const event   = req.body.event
  const payload = req.body.payload?.subscription?.entity

  if (!payload) return res.status(200).json({ received: true })

  const subId  = payload.id
  const notes  = payload.notes ?? {}
  const userId = notes.user_id

  console.log(`Webhook: ${event} | sub: ${subId} | user: ${userId}`)

  try {
    if (event === 'subscription.activated' || event === 'subscription.charged') {
      // Payment successful — upgrade to Pro
      const periodEnd = payload.current_end
        ? new Date(payload.current_end * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

      if (userId) {
        await supabase.from('markr_subscriptions').upsert({
          user_id:             userId,
          plan:                'pro',
          status:              'active',
          razorpay_sub_id:     subId,
          current_period_end:  periodEnd,
          updated_at:          new Date().toISOString(),
        }, { onConflict: 'user_id' })
        console.log(`✅ Upgraded user ${userId} to Pro`)
      }
    }

    if (event === 'subscription.cancelled' || event === 'subscription.halted') {
      // Payment failed or cancelled — downgrade to free
      if (userId) {
        await supabase.from('markr_subscriptions').upsert({
          user_id:    userId,
          plan:       'free',
          status:     event === 'subscription.halted' ? 'halted' : 'cancelled',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        console.log(`⬇️ Downgraded user ${userId} to Free`)
      }
    }

    res.status(200).json({ received: true })
  } catch (e) {
    console.error('Webhook handler error:', e)
    res.status(500).json({ error: (e as Error).message })
  }
}
