import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN = 'swaroop.raghu@gmail.com'

export default function Admin() {
  const [authed,  setAuthed]  = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<'overview'|'users'|'leads'|'usage'>('overview')
  const [users,   setUsers]   = useState<any[]>([])
  const [leads,   setLeads]   = useState<any[]>([])
  const [stats,   setStats]   = useState<any>(null)
  const [search,  setSearch]  = useState('')
  const [toast,   setToast]   = useState('')

  const msg = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email === ADMIN) setAuthed(true)
      setLoading(false)
    })
  }, [])

  useEffect(() => { if (authed) load() }, [authed])

  async function load() {
    setLoading(true)
    try {
      const today   = new Date().toISOString().split('T')[0]
      const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0]
      const [s1,s2,s3,s4,s5,s6] = await Promise.all([
        supabase.from('markr_subscriptions').select('*').order('created_at', { ascending: false }),
        supabase.from('markr_apps').select('user_id'),
        supabase.from('markr_rate_limits').select('*').eq('date', today),
        supabase.from('markr_url_leads').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('markr_rate_limits').select('count').gte('date', weekAgo),
        supabase.from('markr_delivery_prefs').select('user_id, email'),
      ])
      const appMap: Record<string,number> = {}
      s2.data?.forEach((a:any) => { appMap[a.user_id] = (appMap[a.user_id]??0)+1 })
      const callMap: Record<string,number> = {}
      s3.data?.forEach((l:any) => { callMap[l.user_id] = l.count })
      const emailMap: Record<string,string> = {}
      s6.data?.forEach((d:any) => { if (d.email) emailMap[d.user_id] = d.email })
      const ul = (s1.data??[]).map((s:any) => ({
        id: s.user_id, email: emailMap[s.user_id]??s.user_id.slice(0,12)+'…',
        plan: s.plan??'free', apps: appMap[s.user_id]??0, calls: callMap[s.user_id]??0, since: s.created_at,
      }))
      setUsers(ul)
      setLeads(s4.data??[])
      setStats({
        users: ul.length, pro: ul.filter((u:any)=>u.plan==='pro').length,
        free: ul.filter((u:any)=>u.plan==='free').length, apps: s2.data?.length??0,
        leads: s4.data?.length??0, conv: s4.data?.filter((l:any)=>l.converted).length??0,
        today: s3.data?.reduce((a:number,l:any)=>a+(l.count??0),0)??0,
        week: s5.data?.reduce((a:number,l:any)=>a+(l.count??0),0)??0,
      })
    } catch(e) { msg('Load error') }
    setLoading(false)
  }

  async function setPlan(id: string, plan: 'pro'|'free') {
    const { error } = await supabase.from('markr_subscriptions')
      .upsert({ user_id:id, plan, status:plan==='pro'?'active':'inactive', updated_at:new Date().toISOString() }, { onConflict:'user_id' })
    if (error) { msg('Error: '+error.message); return }
    msg('Updated to '+plan)
    setUsers(p => p.map(u => u.id===id ? {...u,plan} : u))
  }

  async function deleteApps(id: string) {
    if (!confirm('Delete all apps?')) return
    await supabase.from('markr_apps').delete().eq('user_id', id)
    msg('Apps deleted')
    setUsers(p => p.map(u => u.id===id ? {...u,apps:0} : u))
  }

  const f: CSSProperties = { fontFamily:'Inter,-apple-system,sans-serif' }
  const card: CSSProperties = { background:'#fff', border:'1px solid #e4e4f0', borderRadius:10, padding:'16px 18px' }
  const TH: CSSProperties = { padding:'10px 14px', fontSize:10, fontWeight:600, color:'#888', textAlign:'left' as const, textTransform:'uppercase' as const, letterSpacing:'.06em', borderBottom:'1px solid #e4e4f0', background:'#f8f8fc' }
  const TD: CSSProperties = { padding:'10px 14px', borderBottom:'1px solid #f4f4f8', fontSize:13 }

  if (!authed && !loading) return (
    <div style={{ ...f, padding:40, textAlign:'center', color:'#888' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
      <div>Admin access only</div>
    </div>
  )

  const filtered = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()))
  const TABS = [
    { id:'overview', label:'Overview' },
    { id:'users',    label:'Users' },
    { id:'leads',    label:'Leads' },
    { id:'usage',    label:'Usage' },
  ] as const

  return (
    <div style={{ ...f, fontSize:13 }}>
      {toast && (
        <div style={{ position:'fixed', top:16, right:16, zIndex:999, background:'#111', color:'#fff', padding:'10px 18px', borderRadius:8, fontSize:13 }}>
          {toast}
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ fontSize:17, fontWeight:700 }}>Admin Dashboard</div>
        <button onClick={load} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e4e4f0', background:'#fff', cursor:'pointer', fontSize:12 }}>
          Refresh
        </button>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:18 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'7px 16px', borderRadius:7, border:'none', background:tab===t.id?'#7c6ff7':'#f0f0f7', cursor:'pointer', fontSize:12, fontWeight:tab===t.id?600:400, color:tab===t.id?'#fff':'#555' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign:'center', padding:40, color:'#888' }}>Loading…</div>}

      {!loading && (
        <div>
          {tab==='overview' && stats && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
                {([
                  { l:'Total Users',     v:stats.users, c:'#7c6ff7' },
                  { l:'Pro Users',       v:stats.pro,   c:'#34c98a' },
                  { l:'Free Users',      v:stats.free,  c:'#f5a623' },
                  { l:'Total Apps',      v:stats.apps,  c:'#e26faf' },
                  { l:'URL Leads',       v:stats.leads, c:'#7c6ff7' },
                  { l:'Conversions',     v:stats.conv,  c:'#34c98a' },
                  { l:'AI Calls Today',  v:stats.today, c:'#f5a623' },
                  { l:'Calls This Week', v:stats.week,  c:'#5a4fd4' },
                ] as any[]).map((x:any) => (
                  <div key={x.l} style={card}>
                    <div style={{ fontSize:11, color:'#888', marginBottom:8 }}>{x.l}</div>
                    <div style={{ fontSize:26, fontWeight:700, color:x.c }}>{x.v}</div>
                  </div>
                ))}
              </div>
              {stats.leads>0 && (
                <div style={{ ...card, display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
                  <div style={{ fontSize:30, fontWeight:700, color:'#7c6ff7' }}>{Math.round((stats.conv/stats.leads)*100)}%</div>
                  <div>
                    <div style={{ fontWeight:600, marginBottom:2 }}>URL Analyzer Conversion Rate</div>
                    <div style={{ fontSize:12, color:'#888' }}>{stats.conv} signed up out of {stats.leads}</div>
                  </div>
                </div>
              )}
              <div style={card}>
                <div style={{ fontWeight:600, marginBottom:12 }}>Recent users</div>
                {users.slice(0,6).map((u:any) => (
                  <div key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #f4f4f8' }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(124,111,247,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#7c6ff7' }}>{u.email[0].toUpperCase()}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                      <div style={{ fontSize:11, color:'#888' }}>{u.apps} apps · {u.calls} calls today</div>
                    </div>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:u.plan==='pro'?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:u.plan==='pro'?'#16a870':'#888' }}>{u.plan}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab==='users' && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div style={{ fontSize:15, fontWeight:600 }}>Users ({users.length})</div>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search email…"
                  style={{ padding:'7px 12px', borderRadius:7, border:'1px solid #e4e4f0', fontSize:13, width:200, outline:'none' }} />
              </div>
              <div style={{ ...card, padding:0, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>{['User','Plan','Apps','Calls','Joined','Actions'].map(h=><th key={h} style={TH}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filtered.map((u:any) => (
                      <tr key={u.id}>
                        <td style={TD}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(124,111,247,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#7c6ff7' }}>{u.email[0].toUpperCase()}</div>
                            <div>
                              <div style={{ fontWeight:500 }}>{u.email}</div>
                              <div style={{ fontSize:10, color:'#aaa' }}>{new Date(u.since).toLocaleDateString('en-IN')}</div>
                            </div>
                          </div>
                        </td>
                        <td style={TD}><span style={{ fontSize:11, padding:'2px 9px', borderRadius:20, fontWeight:700, background:u.plan==='pro'?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:u.plan==='pro'?'#16a870':'#888' }}>{u.plan==='pro'?'✓ Pro':'Free'}</span></td>
                        <td style={{ ...TD, color:'#555' }}>{u.apps}</td>
                        <td style={{ ...TD, color:u.calls>100?'#e55':u.calls>50?'#f5a623':'#555' }}>{u.calls}</td>
                        <td style={{ ...TD, color:'#888', fontSize:12 }}>{new Date(u.since).toLocaleDateString('en-IN')}</td>
                        <td style={TD}>
                          <div style={{ display:'flex', gap:6 }}>
                            {u.plan==='free'
                              ? <button onClick={()=>setPlan(u.id,'pro')} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(52,201,138,.3)', background:'rgba(52,201,138,.08)', color:'#16a870', fontSize:11, fontWeight:600, cursor:'pointer' }}>Grant Pro</button>
                              : <button onClick={()=>setPlan(u.id,'free')} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(220,38,38,.2)', background:'rgba(220,38,38,.06)', color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>Revoke Pro</button>
                            }
                            <button onClick={()=>deleteApps(u.id)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #e4e4f0', background:'#fff', color:'#888', fontSize:11, cursor:'pointer' }}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length===0 && <tr><td colSpan={6} style={{ ...TD, textAlign:'center', color:'#aaa', padding:32 }}>No users found</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab==='leads' && (
            <div>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>URL Leads ({leads.length}) — {leads.filter((l:any)=>l.converted).length} converted</div>
              <div style={{ ...card, padding:0, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>{['URL','Email','Date','Status'].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {leads.map((l:any) => (
                      <tr key={l.id}>
                        <td style={{ ...TD, maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          <a href={l.url} target="_blank" rel="noreferrer" style={{ color:'#7c6ff7', textDecoration:'none' }}>{l.url.replace(/^https?:\/\//,'')}</a>
                        </td>
                        <td style={{ ...TD, color:'#555' }}>{l.email||'—'}</td>
                        <td style={{ ...TD, color:'#888', fontSize:12 }}>{new Date(l.created_at).toLocaleDateString('en-IN')}</td>
                        <td style={TD}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:700, background:l.converted?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:l.converted?'#16a870':'#888' }}>{l.converted?'✓ Converted':'Pending'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab==='usage' && (
            <div>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>Today's AI Usage</div>
              <div style={{ ...card, padding:0, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>{['User','Plan','Calls','Usage','Limit'].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...users].sort((a,b)=>b.calls-a.calls).filter((u:any)=>u.calls>0).map((u:any) => {
                      const lim = u.plan==='pro'?200:5
                      const pct = Math.min(100,Math.round((u.calls/lim)*100))
                      const c   = pct>80?'#e55':pct>50?'#f5a623':'#34c98a'
                      return (
                        <tr key={u.id}>
                          <td style={TD}>{u.email}</td>
                          <td style={TD}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:700, background:u.plan==='pro'?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:u.plan==='pro'?'#16a870':'#888' }}>{u.plan}</span></td>
                          <td style={{ ...TD, fontWeight:600, color:c }}>{u.calls}</td>
                          <td style={{ ...TD, width:140 }}>
                            <div style={{ height:6, background:'#f0f0f7', borderRadius:3, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pct}%`, background:c, borderRadius:3 }} />
                            </div>
                            <div style={{ fontSize:10, color:'#aaa', marginTop:2 }}>{pct}%</div>
                          </td>
                          <td style={{ ...TD, color:'#888' }}>{lim}/day</td>
                        </tr>
                      )
                    })}
                    {users.filter((u:any)=>u.calls>0).length===0 && <tr><td colSpan={5} style={{ ...TD, textAlign:'center', color:'#aaa', padding:32 }}>No AI calls today</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
