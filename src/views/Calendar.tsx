import { useStore } from '../lib/store'

export default function Calendar() {
  const { currentApp, setView } = useStore()

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'70vh', textAlign:'center', padding:'40px 24px' }}>
      {/* Icon */}
      <div style={{ width:72, height:72, borderRadius:20, background:'linear-gradient(135deg,rgba(124,111,247,.2),rgba(226,111,175,.15))', border:'1px solid rgba(124,111,247,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 24px' }}>
        📅
      </div>

      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, letterSpacing:'-.02em', margin:'0 0 12px', color:'var(--text)' }}>
        Content Calendar
      </div>
      <div style={{ fontSize:15, color:'var(--text3)', maxWidth:440, lineHeight:1.75, margin:'0 0 32px' }}>
        Schedule and manage your generated posts across platforms. See what's planned, what's missing, and bulk-generate content for the week ahead.
      </div>

      {/* Coming soon features */}
      <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'20px 24px', maxWidth:420, textAlign:'left', marginBottom:32 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text3)', marginBottom:14 }}>Coming soon</div>
        {[
          { icon:'🗓', label:'Weekly view', desc:'See morning, midday, evening slots for each day' },
          { icon:'✅', label:'Post scheduling', desc:'Assign generated posts to specific dates' },
          { icon:'⚡', label:'Bulk generation', desc:'Generate a full week of content in one click' },
          { icon:'📊', label:'Consistency tracking', desc:'See how regularly you\'re posting' },
        ].map(f => (
          <div key={f.label} style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:16, flexShrink:0 }}>{f.icon}</span>
            <div>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{f.label}</div>
              <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
        <button className="gen-btn" onClick={() => setView('studio')}>
          <i className="ti ti-sparkles" style={{ fontSize:13 }} />
          Generate today's posts instead
        </button>
        <button className="vbtn" style={{ fontSize:12, padding:'7px 14px' }}
          onClick={() => window.open(`mailto:swaroop.raghu@gmail.com?subject=Calendar Feature Request&body=Hi, I'd love to see the Calendar feature in Markr. Here's what I'd want: `, '_blank')}>
          💬 Tell us what you need
        </button>
      </div>

      <div style={{ fontSize:12, color:'var(--text3)', marginTop:20 }}>
        Using <strong style={{ color:'var(--text2)' }}>{currentApp?.name}</strong> · Calendar unlocks after billing is live
      </div>
    </div>
  )
}
