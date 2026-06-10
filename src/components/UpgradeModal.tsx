import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from './Toast'

interface Props {
  onClose: () => void
  trigger?: 'trial_expired' | 'feature_gate' | 'manual'
}

declare global {
  interface Window { Razorpay: any }
}

const PLANS = [
  {
    id:        'analysis' as const,
    name:      'Analysis Pack',
    usd:       10,
    period:    'one-time',
    badge:     null,
    accent:    '#34c98a',
    border:    'rgba(52,201,138,.35)',
    bg:        'rgba(52,201,138,.06)',
    ctaBg:     'linear-gradient(135deg,#34c98a,#22b573)',
    rzpType:   'order' as const,
    items: [
      '3 apps',
      'Full landing page analysis',
      'Competitive intelligence',
      'SWOT, BMC, Growth & Pricing strategy',
      'AI copy recommendations',
      'One-time purchase — results saved permanently',
    ],
    cta: 'Buy Analysis Pack',
  },
  {
    id:        'content' as const,
    name:      'Content Engine',
    usd:       6,
    period:    '/month',
    badge:     null,
    accent:    '#e26faf',
    border:    'rgba(226,111,175,.35)',
    bg:        'rgba(226,111,175,.06)',
    ctaBg:     'linear-gradient(135deg,#e26faf,#c4559a)',
    rzpType:   'subscription' as const,
    items: [
      '3 apps',
      '30 AI calls/day',
      '3 daily Instagram posts every morning',
      'Weekly content pillar refresh',
    ],
    cta: 'Start Content Engine',
  },
  {
    id:        'pro' as const,
    name:      'Pro Bundle',
    usd:       14,
    period:    '/month',
    badge:     'Best value',
    accent:    '#7c6ff7',
    border:    'rgba(124,111,247,.5)',
    bg:        'rgba(124,111,247,.08)',
    ctaBg:     'linear-gradient(135deg,#7c6ff7,#9b8af4)',
    rzpType:   'subscription' as const,
    items: [
      '10 apps',
      '50 AI calls/day',
      'Everything in Analysis Pack',
      'Everything in Content Engine',
      'Daily email delivery',
    ],
    cta: 'Get Pro Bundle',
  },
] as const

function detectCurrency(): string | null {
  const locale = navigator.language
  const currencyMap: Record<string, string> = {
    'en-IN': 'INR', 'hi': 'INR', 'hi-IN': 'INR',
    'en-GB': 'GBP', 'en-AU': 'AUD',
    'en-CA': 'CAD', 'de': 'EUR', 'fr': 'EUR', 'es': 'EUR',
  }
  const lang = locale.split('-')[0]
  const fromLocale = currencyMap[locale] || currencyMap[lang]
  if (fromLocale) return fromLocale

  // Timezone fallback — handles en-US on Indian devices
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata') return 'INR'
  if (tz?.startsWith('Europe/')) return 'EUR'
  if (tz === 'Europe/London') return 'GBP'
  if (tz?.startsWith('Australia/')) return 'AUD'
  if (tz?.startsWith('America/Toronto') || tz?.startsWith('America/Vancouver')) return 'CAD'

  return null
}

function isIndianTimezone(): boolean {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta'
}

function localPrice(usd: number, rates: Record<string, number>): string {
  const currency = detectCurrency()
  console.log('[localPrice] usd:', usd, '| currency detected:', currency, '| rate available:', currency ? rates[currency] : 'n/a', '| rates empty:', Object.keys(rates).length === 0)
  if (!currency || !rates[currency]) return ''
  const amount = Math.round(usd * rates[currency])
  const result = `≈ ${new Intl.NumberFormat(navigator.language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)}`
  console.log('[localPrice] result:', result)
  return result
}

export default function UpgradeModal({ onClose, trigger = 'manual' }: Props) {
  const [loading,      setLoading]      = useState(false)
  const [selectedId,   setSelectedId]   = useState<'analysis'|'content'|'pro'>('pro')
  const [rates,        setRates]        = useState<Record<string, number>>({})
  const isIndian = isIndianTimezone()

  const localPrices = useMemo(() => ({
    analysis: localPrice(10, rates),
    content:  localPrice(6,  rates),
    pro:      localPrice(14, rates),
  }), [rates])

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    console.log('[UpgradeModal] navigator.language:', navigator.language)
    console.log('[UpgradeModal] timezone:', tz)
    console.log('[UpgradeModal] isIndian:', isIndian)
  }, [])

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then(data => {
        const loaded = data.rates || {}
        console.log('[UpgradeModal] rates loaded — INR:', loaded['INR'], '| total currencies:', Object.keys(loaded).length)
        setRates(loaded)
      })
      .catch(err => console.error('[UpgradeModal] rates fetch failed:', err))
  }, [])

  const selected = PLANS.find(p => p.id === selectedId)!

  async function handleUpgrade() {
    setLoading(true)
    try {
      await loadRazorpayScript()

      // Indian users get auto-recurring INR subscriptions; international get one-time orders
      const actualType: 'order' | 'subscription' =
        selected.rzpType === 'order' ? 'order'
        : isIndian ? 'subscription'
        : 'order'

      // Fetch live INR rate to pass to backend; fallback 95
      const inrRate: number = await fetch('https://open.er-api.com/v6/latest/USD')
        .then(r => r.json())
        .then(d => d.rates?.INR ?? 95)
        .catch(() => 95)

      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Not logged in')

      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
        body: JSON.stringify({ planId: selected.id, usdAmount: selected.usd, inrRate, isIndian }),
      })
      const { subscription_id, order_id, key_id, amount_paise, error } = await res.json()
      if (error) throw new Error(error)

      const { data: { user } } = await supabase.auth.getUser()

      const options: any = {
        key:   key_id,
        name:  'Markr',
        description: `${selected.name} — $${selected.usd}${selected.period}`,
        image: 'https://markr.mindprintjournal.com/icon.png',
        prefill: { email: user?.email ?? '' },
        theme: { color: selected.accent },
        handler: () => {
          toast(`🎉 Welcome to ${selected.name}! Your account is being upgraded…`, 5000)
          onClose()
          setTimeout(() => window.location.reload(), 3000)
        },
        modal: { ondismiss: () => setLoading(false) },
      }

      if (actualType === 'order') {
        options.order_id = order_id
        options.amount   = amount_paise   // authoritative paise from server
      } else {
        options.subscription_id = subscription_id
      }

      new window.Razorpay(options).open()
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

  const triggerMessages: Record<string, string> = {
    trial_expired: 'Your free trial has ended. Choose a plan to keep using Markr.',
    feature_gate:  'This feature requires a paid plan. Upgrade to unlock it.',
    manual:        'Choose the plan that fits how you use Markr.',
  }

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{ background:'var(--surface)', border:'1px solid rgba(124,111,247,.25)', borderRadius:'var(--r2)', padding:24, width:560, maxWidth:'100%', maxHeight:'90vh', overflowY:'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:19, fontWeight:800, marginBottom:6 }}>Upgrade Markr</div>
          <div style={{ fontSize:13, color:'var(--text3)', lineHeight:1.5 }}>{triggerMessages[trigger]}</div>
        </div>

        {/* Plan selector — 3 compact cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:20 }}>
          {PLANS.map(p => {
            const active = selectedId === p.id
            return (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{
                  position:'relative', borderRadius:10, padding:'12px 10px', cursor:'pointer',
                  background: active ? p.bg : 'var(--surface2)',
                  border: `1.5px solid ${active ? p.border : 'var(--border)'}`,
                  transition:'border .15s, background .15s',
                }}
              >
                {p.badge && (
                  <div style={{ position:'absolute', top:-8, left:'50%', transform:'translateX(-50%)', background:p.accent, color:'#fff', fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:20, whiteSpace:'nowrap' as const }}>{p.badge}</div>
                )}
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:3 }}>{p.name}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:2 }}>
                  <span style={{ fontSize:18, fontWeight:800, color: active ? p.accent : 'var(--text)' }}>${p.usd}</span>
                  <span style={{ fontSize:10, color:'var(--text3)' }}>{p.period}</span>
                </div>
                {localPrices[p.id] && (
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>
                    {localPrices[p.id]}{p.period !== 'one-time' ? p.period : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Selected plan details */}
        <div style={{ border:`1px solid ${selected.border}`, borderRadius:10, padding:'14px 16px', marginBottom:20, background: selected.bg }}>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{selected.name} — what's included</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
              <span style={{ fontWeight:700 }}>${selected.usd}{selected.period}</span>
              {localPrices[selected.id] && (
                <span style={{ color:'var(--text2)', marginLeft:6 }}>
                  {localPrices[selected.id]}{selected.period !== 'one-time' ? selected.period : ''}
                </span>
              )}
            </div>
          </div>
          {selected.items.map(item => (
            <div key={item} style={{ display:'flex', gap:8, fontSize:12, color:'var(--text2)', marginBottom:7, lineHeight:1.5 }}>
              <span style={{ color: selected.accent, flexShrink:0 }}>✓</span>{item}
            </div>
          ))}
          <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid var(--border)', fontSize:11, color:'var(--text3)' }}>
            {selected.rzpType === 'order'
              ? '🔒 One-time purchase — no recurring charges'
              : isIndian
                ? '🔄 Auto-renews monthly via Razorpay · Cancel anytime'
                : '💳 One-time payment · Renewal reminder sent by email'
            }
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          style={{ width:'100%', padding:'13px 20px', borderRadius:9, background: selected.ctaBg, color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily:"'DM Sans',sans-serif", opacity: loading ? 0.7 : 1, transition:'all .2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
        >
          {loading
            ? <><span className="spinner" style={{ color:'#fff' }} /> Processing…</>
            : `${selected.cta} — $${selected.usd}${selected.period}${localPrice(selected.usd, rates) ? ` (${localPrice(selected.usd, rates)}${selected.period !== 'one-time' ? selected.period : ''})` : ''}`
          }
        </button>

        <button
          onClick={onClose}
          style={{ width:'100%', marginTop:10, padding:'10px', background:'transparent', border:'none', color:'var(--text3)', fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}
        >
          {trigger === 'trial_expired' ? 'Continue on free plan' : 'Maybe later'}
        </button>

        <div style={{ textAlign:'center', fontSize:11, color:'var(--text3)', marginTop:8 }}>
          {isIndian
            ? 'Secured by Razorpay · UPI, cards, net banking accepted'
            : 'Secured by Razorpay · International cards accepted'
          }
        </div>
      </div>
    </div>
  )
}
