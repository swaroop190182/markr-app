import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { toast } from './Toast'

interface Props {
  onClose: () => void
  trigger?: 'trial_expired' | 'feature_gate' | 'manual'
}

declare global {
  interface Window {
    Razorpay: any
  }
}

export default function UpgradeModal({ onClose, trigger = 'manual' }: Props) {
  const { plan } = useStore()
  const [loading, setLoading] = useState(false)

  const triggerMessages = {
    trial_expired: 'Your free trial has ended. Upgrade to Pro to keep using Markr.',
    feature_gate:  'This feature is available on Pro. Upgrade to unlock it.',
    manual:        'Upgrade to Pro for unlimited apps, full AI features, and product testing.',
  }

  async function handleUpgrade() {
    setLoading(true)
    try {
      // Load Razorpay script
      await loadRazorpayScript()

      // Get auth token
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Not logged in')

      // Create subscription on server
      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })
      const { subscription_id, key_id, error } = await res.json()
      if (error) throw new Error(error)

      // Get user details
      const { data: { user } } = await supabase.auth.getUser()

      // Open Razorpay checkout
      const options = {
        key:             key_id,
        subscription_id: subscription_id,
        name:            'Markr',
        description:     'Pro Plan — ₹999/month',
        image:           'https://markr.mindprintjournal.com/icon.png',
        prefill: {
          email: user?.email ?? '',
        },
        theme: {
          color: '#7c6ff7',
        },
        handler: async function(response: any) {
          // Payment successful
          toast('🎉 Welcome to Pro! Your account is being upgraded…', 5000)
          onClose()
          // Poll for webhook to update plan (usually takes 2-5 seconds)
          setTimeout(() => window.location.reload(), 3000)
        },
        modal: {
          ondismiss: () => {
            setLoading(false)
          }
        }
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (e) {
      toast('Payment failed: ' + (e as Error).message)
      setLoading(false)
    }
  }

  function loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) { resolve(); return }
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload  = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Razorpay'))
      document.head.appendChild(script)
    })
  }

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background:'var(--surface)', border:'1px solid rgba(124,111,247,.3)', borderRadius:'var(--r2)', padding:28, width:440, maxWidth:'95vw' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:56, height:56, borderRadius:16, background:'linear-gradient(135deg,rgba(124,111,247,.2),rgba(226,111,175,.15))', border:'1px solid rgba(124,111,247,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, margin:'0 auto 14px' }}>⚡</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, marginBottom:8 }}>Upgrade to Markr Pro</div>
          <div style={{ fontSize:13, color:'var(--text3)', lineHeight:1.6 }}>{triggerMessages[trigger]}</div>
        </div>

        {/* Price */}
        <div style={{ textAlign:'center', padding:'16px 0', marginBottom:20, borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:4, justifyContent:'center' }}>
            <span style={{ fontFamily:"'Syne',sans-serif", fontSize:42, fontWeight:800, color:'#a599ff', letterSpacing:'-0.03em' }}>₹999</span>
            <span style={{ fontSize:14, color:'var(--text3)' }}>/month</span>
          </div>
          <div style={{ fontSize:12, color:'var(--text3)', marginTop:4 }}>Cancel anytime · No hidden fees</div>
        </div>

        {/* Features */}
        <div style={{ marginBottom:24 }}>
          {[
            ['🚀', 'Unlimited apps'],
            ['✍️', 'Daily content generation'],
            ['🧪', 'Product Test — full QA simulation'],
            ['🔍', 'Competitive intelligence'],
            ['📊', 'Growth playbook & SWOT'],
            ['💰', 'Pricing strategy'],
            ['⚡', '200 AI calls/day'],
          ].map(([icon, label]) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
              <span style={{ fontSize:16, flexShrink:0 }}>{icon}</span>
              <span style={{ color:'rgba(255,255,255,.8)' }}>{label}</span>
              <span style={{ marginLeft:'auto', color:'var(--green)', fontSize:12 }}>✓</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          style={{ width:'100%', padding:'13px 20px', borderRadius:9, background:'linear-gradient(135deg,#7c6ff7,#9b8af4)', color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor: loading?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity: loading?0.7:1, transition:'all .2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 0 30px rgba(124,111,247,.3)' }}
        >
          {loading
            ? <><span className="spinner" style={{ color:'#fff' }} /> Processing…</>
            : '⚡ Upgrade to Pro — ₹999/month'
          }
        </button>

        <button
          onClick={onClose}
          style={{ width:'100%', marginTop:10, padding:'10px', background:'transparent', border:'none', color:'var(--text3)', fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}
        >
          {trigger === 'trial_expired' ? 'Continue on free plan' : 'Maybe later'}
        </button>

        <div style={{ textAlign:'center', fontSize:11, color:'var(--text3)', marginTop:8 }}>
          Secured by Razorpay · UPI, cards, net banking accepted
        </div>
      </div>
    </div>
  )
}
