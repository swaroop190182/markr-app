import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { toast } from '../components/Toast'

interface DeliveryPref {
  enabled:   boolean
  frequency: 'daily' | 'weekly'
  app_id:    number | null
}

export default function DeliverySettings() {
  const { apps, currentApp } = useStore()
  const [pref,    setPref]    = useState<DeliveryPref>({ enabled: false, frequency: 'daily', app_id: currentApp?.id ?? null })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => { loadPref() }, [])

  async function loadPref() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('markr_delivery_prefs')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
    if (data) setPref({ enabled: data.enabled, frequency: data.frequency, app_id: data.app_id })
    setLoading(false)
  }

  async function savePref() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('markr_delivery_prefs')
      .upsert({
        user_id:   user.id,
        email:     user.email,
        app_id:    pref.app_id ?? currentApp?.id,
        enabled:   pref.enabled,
        frequency: pref.frequency,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) toast('Failed to save: ' + error.message)
    else toast(pref.enabled ? '✅ Delivery enabled! First email coming soon.' : '✅ Delivery disabled.')
    setSaving(false)
  }

  async function sendTestEmail() {
    setTesting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast('Not logged in'); setTesting(false); return }

      const res = await fetch('/api/cron/deliver', {
        method: 'POST',
        headers: {
          'Content-Type':     'application/json',
          'Authorization':    'Bearer markr_cron_2026',
          'x-manual-trigger': 'markr_cron_2026',
          'x-user-token':     session.access_token,
        },
      })
      const data = await res.json()
      if (data.sent > 0) toast('📧 Test email sent! Check your inbox.', 4000)
      else if (data.error) toast('Error: ' + data.error)
      else toast('Something went wrong — check Vercel logs.')
    } catch (e) {
      toast('Failed: ' + (e as Error).message)
    }
    setTesting(false)
  }

  if (loading) return <div style={{ padding:24, color:'var(--text3)', fontSize:13 }}>Loading…</div>

  return (
    <div style={{ maxWidth:480 }}>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, marginBottom:6 }}>📬 Content Delivery</div>
      <div style={{ fontSize:13, color:'var(--text3)', marginBottom:24, lineHeight:1.6 }}>
        Get your content plan delivered to your inbox automatically. No need to open the app.
      </div>

      {/* Toggle */}
      <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'16px 18px', marginBottom:14, display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:600, marginBottom:3 }}>Email delivery</div>
          <div style={{ fontSize:12, color:'var(--text3)' }}>Receive your content plan directly in your inbox</div>
        </div>
        <div
          onClick={() => setPref(p => ({ ...p, enabled: !p.enabled }))}
          style={{ width:44, height:24, borderRadius:12, background: pref.enabled?'var(--accent)':'var(--surface3)', cursor:'pointer', position:'relative', transition:'background .2s', flexShrink:0 }}
        >
          <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left: pref.enabled?23:3, transition:'left .2s' }} />
        </div>
      </div>

      {pref.enabled && (
        <>
          {/* Frequency */}
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'16px 18px', marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>Frequency</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { value:'daily',  label:'Daily',  desc:'Every morning at 7am', emoji:'☀️' },
                { value:'weekly', label:'Weekly', desc:'Every Monday at 7am',  emoji:'📅' },
              ].map(f => (
                <div key={f.value}
                  onClick={() => setPref(p => ({ ...p, frequency: f.value as any }))}
                  style={{ padding:'12px 14px', borderRadius:'var(--r)', border:`1.5px solid ${pref.frequency===f.value?'var(--accent)':'var(--border)'}`, background: pref.frequency===f.value?'rgba(124,111,247,.08)':'transparent', cursor:'pointer', transition:'all .15s' }}>
                  <div style={{ fontSize:20, marginBottom:6 }}>{f.emoji}</div>
                  <div style={{ fontSize:13, fontWeight:600, color: pref.frequency===f.value?'var(--accent2)':'var(--text)' }}>{f.label}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* App selection */}
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'16px 18px', marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>Generate content for</div>
            <select
              value={pref.app_id ?? ''}
              onChange={e => setPref(p => ({ ...p, app_id: Number(e.target.value) }))}
              style={{ width:'100%' }}
            >
              {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </>
      )}

      {/* What you'll receive */}
      {pref.enabled && (
        <div style={{ background:'rgba(124,111,247,.06)', border:'1px solid rgba(124,111,247,.2)', borderRadius:'var(--r)', padding:'12px 14px', marginBottom:20, fontSize:12, color:'var(--text2)', lineHeight:1.7 }}>
          <div style={{ fontWeight:700, color:'var(--accent2)', marginBottom:6 }}>What you'll receive:</div>
          {['🌅 Morning post — caption, hashtags, image prompt','💡 Midday post — optimised for shares','🌙 Evening post — designed for comments','🎯 Content pillars for the day'].map(i => (
            <div key={i} style={{ marginBottom:3 }}>{i}</div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', gap:10 }}>
        <button className="gen-btn" onClick={savePref} disabled={saving} style={{ flex:1, justifyContent:'center' }}>
          {saving ? <><span className="spinner" style={{ color:'#fff' }} /> Saving…</> : '💾 Save settings'}
        </button>
        {pref.enabled && (
          <button className="vbtn" onClick={sendTestEmail} disabled={testing} style={{ fontSize:12, padding:'9px 14px' }}>
            {testing ? <><span className="spinner" /> Sending…</> : '📧 Send test email'}
          </button>
        )}
      </div>
    </div>
  )
}
