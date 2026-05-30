import { useStore } from '../lib/store'
import { Card, CardHeader } from '../components/ui'

export default function Calendar() {
  const { currentApp } = useStore()
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const posts: Record<number,string[]> = {3:['var(--pink)'],5:['var(--text)','var(--text)'],8:['var(--pink)'],10:['var(--pink)','var(--text)'],12:['var(--blue)'],14:['var(--pink)','var(--text)'],17:['var(--pink)'],19:['var(--text)'],21:['var(--blue)','var(--pink)'],24:['var(--text)','var(--text)'],26:['var(--pink)'],28:['var(--blue)','var(--text)','var(--pink)']}

  return (
    <div>
      <div className="card" style={{ marginBottom:16 }}>
        <CardHeader title="June 2026" action={
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            {[['Instagram','var(--pink)'],['X','var(--text)'],['Facebook','var(--blue)']].map(([n,c]) => (
              <span key={n as string} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--text2)' }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:c as string, display:'inline-block' }} />{n}
              </span>
            ))}
          </div>
        } />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
          {days.map(d => <div key={d} style={{ textAlign:'center', fontSize:10, color:'var(--text3)', padding:'4px 0' }}>{d}</div>)}
          {Array.from({length:35},(_,i) => {
            const day = i-3
            if (day<1||day>30) return <div key={i} style={{ aspectRatio:'1', borderRadius:6, background:'var(--surface2)', opacity:.15 }} />
            const p = posts[day]
            return (
              <div key={i} style={{ aspectRatio:'1', borderRadius:6, background:'var(--surface2)', display:'flex', flexDirection:'column', alignItems:'center', padding:'4px 2px', cursor:'pointer', border:`1px solid ${day===29?'var(--accent)':p?'rgba(124,111,247,.4)':'transparent'}`, transition:'all .15s' }}>
                <span style={{ fontSize:10, color: day===29?'var(--accent2)':'var(--text2)', fontWeight:day===29?700:400 }}>{day}</span>
                {p && <div style={{ display:'flex', gap:2, marginTop:2, flexWrap:'wrap', justifyContent:'center' }}>{p.map((c,j) => <div key={j} style={{ width:4, height:4, borderRadius:'50%', background:c }} />)}</div>}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card>
          <CardHeader title="Upcoming Posts" />
          {[{day:'Jun 2',p:'Instagram',t:'Morning reflection post',s:'Scheduled'},{day:'Jun 3',p:'X',t:'Feature thread',s:'Pending'},{day:'Jun 5',p:'Instagram',t:'Midday insight',s:'Draft'},{day:'Jun 6',p:'Instagram',t:'Evening engagement',s:'Draft'}].map((item,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:11, color:'var(--text3)', width:40 }}>{item.day}</span>
              <span style={{ width:6, height:6, borderRadius:'50%', background:item.s==='Scheduled'?'var(--green)':item.s==='Pending'?'var(--amber)':'var(--text3)', display:'inline-block', marginRight:4 }} />
              <span style={{ fontSize:12, flex:1 }}>{item.t}</span>
              <span style={{ fontSize:10, color:'var(--text3)' }}>{item.p}</span>
            </div>
          ))}
        </Card>
        <Card>
          <CardHeader title="Month Stats" />
          {[['Posts planned','23'],['Approved','11'],['Pending','6'],['Drafts','6'],['Platforms','2/4'],['Score','78%']].map(([l,v]) => (
            <div key={l as string} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:12, color:'var(--text2)' }}>{l}</span>
              <span style={{ fontSize:13, fontWeight:600 }}>{v}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
