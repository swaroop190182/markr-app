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

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email === ADMIN) setAuthed(true)
      setLoading(false)
    })
  }, [])

  // Load data once authed
  useEffect(() => {
    if (authed) load()
  }, [authed])

  async function load() {
    setLoading(true)
    try {
      const today   = new Date().toISOString().split('T')[0]
      const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0]

      const [subsRes, appsRes, limitsRes, leadsRes, weekRes, delivRes] = await Promise.all([
        supabase.from('markr_subscriptions').select('*').order('created_at', { ascending: false }),
        supabase.from('markr_apps').select('user_id'),
        supabase.from('markr_rate_limits').select('*').eq('date', today),
        supabase.from('markr_url_leads').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('markr_rate_limits').select('count').gte('date', weekAgo),
        supabase.from('markr_delivery_prefs').select('user_id, email'),
      ])

      const appMap: Record<string,number>  = {}
      appsRes.data?.forEach((a: any) => { appMap[a.user_id] = (appMap[a.user_id]??0)+1 })

      const callMap: Record<string,number> = {}
      limitsRes.data?.forEach((l: any) => { callMap[l.user_id] = l.count })

      const emailMap: Record<string,string> = {}
      delivRes.data?.forEach((d: any) => { if (d.email) emailMap[d.user_id] = d.email })

      const userList = (subsRes.data ?? []).map((s: any) => ({
        id:    s.user_id,
        email: emailMap[s.user_id] ?? s.user_id.slice(0,12)+'…',
        plan:  s.plan ?? 'free',
        apps:  appMap[s.user_id] ?? 0,
        calls: callMap[s.user_id] ?? 0,
        since: s.created_at,
      }))

      setUsers(userList)
      setLeads(leadsRes.data ?? [])
      setStats({
        users: userList.length,
        pro:   userList.filter((u: any) => u.plan==='pro').length,
        free:  userList.filter((u: any) => u.plan==='free').length,
        apps:  appsRes.data?.length ?? 0,
        leads: leadsRes.data?.length ?? 0,
        conv:  leadsRes.data?.filter((l: any) => l.converted).length ?? 0,
        today: limitsRes.data?.reduce((s: number, l: any) => s+(l.count??0), 0) ?? 0,
        week:  weekRes.data?.reduce((s: number, l: any) => s+(l.count??0), 0) ?? 0,
      })
    } catch(e) {
      console.error('Admin load error:', e)
      msg('Failed to load data — check console')
    }
    setLoading(false)
  }

  async function setPlan(userId: string, plan: 'pro'|'free') {
    const { error } = await supabase.from('markr_subscriptions')
      .upsert({ user_id: userId, plan, status: plan==='pro'?'active':'inactive', updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) { msg('Error: '+error.message); return }
    msg('Plan updated to '+plan)
    setUsers(p => p.map(u => u.id===userId ? {...u, plan} : u))
  }

  async function deleteApps(userId: string) {
    if (!confirm('Delete all apps for this user?')) return
    const { error } = await supabase.from('markr_apps').delete().eq('user_id', userId)
    if (error) { msg('Error: '+error.message); return }
    msg('Apps deleted')
    setUsers(p => p.map(u => u.id===userId ? {...u, apps:0} : u))
  }

  // Shared styles
  const f: CSSProperties = { fontFamily:'Inter,-apple-system,sans-serif' }
  const card: CSSProperties = { background:'#fff', border:'1px solid #e4e4f0', borderRadius:10, padding:'16px 18px' }
  const TH: CSSProperties = { padding:'10px 14px', fontSize:10, fontWeight:600, color:'#888', textAlign:'left' as const, textTransform:'uppercase' as const, letterSpacing:'.06em', borderBottom:'1px solid #e4e4f0', background:'#f8f8fc' }
  const TD: CSSProperties = { padding:'10px 14px', borderBottom:'1px solid #f4f4f8', fontSize:13 }

  // Inside the app — user is already signed in
  // The sidebar only shows this view for the admin email
  if (!authed && !loading) return (
    <div style={{ padding:40, textAlign:'center', color:'#888' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
      <div>Admin access only</div>
    </div>
  )

  const filtered = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()))

  const TABS = [
    { id:'overview', label:'Overview',  icon:'ti-dashboard' },
    { id:'users',    label:'Users',     icon:'ti-users' },
    { id:'leads',    label:'Leads',     icon:'ti-link' },
    { id:'usage',    label:'Usage',     icon:'ti-chart-bar' },
  ] as const

  return (
    <div style={{ ...f, fontSize:13, padding:4 }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:16, right:16, zIndex:999, background:'#111', color:'#fff', padding:'10px 18px', borderRadius:8, fontSize:13 }}>
          {toast}
        </div>
      )}

      {/* Admin header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ fontSize:17, fontWeight:700 }}>Admin Dashboard</div>
        <button onClick={load} style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #e4e4f0', background:'#fff', cursor:'pointer', fontSize:12 }}>
          Refresh
        </button>
      </div>

      <div style={{ display:'flex' }}>

        {/* Sidebar */}
        <div style={{ width:185, background:'#fff', borderRight:'1px solid #e4e4f0', padding:'14px 10px', minHeight:'calc(100vh - 57px)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ width:'100%', padding:'9px 12px', borderRadius:7, border:'none', background:tab===t.id?'rgba(124,111,247,.1)':'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:tab===t.id?600:400, color:tab===t.id?'#7c6ff7':'#555', marginBottom:2, textAlign:'left' as const }}>
              
              {t.label}
            </button>
          ))}
        </div>

        {/* Main */}
        <div style={{ flex:1, padding:22, overflow:'auto' }}>
          {loading ? (
            <div style={{ textAlign:'center', paddingTop:60, color:'#888' }}>Loading…</div>
          ) : (

            <>
              {/* OVERVIEW */}
              {tab==='overview' && stats && (
                <>
                  <div style={{ fontSize:17, fontWeight:700, marginBottom:18 }}>Overview</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
                    {([
                      { l:'Total Users',     v:stats.users, c:'#7c6ff7', i:'ti-users' },
                      { l:'Pro Users',       v:stats.pro,   c:'#34c98a', i:'ti-crown' },
                      { l:'Free Users',      v:stats.free,  c:'#f5a623', i:'ti-user' },
                      { l:'Total Apps',      v:stats.apps,  c:'#e26faf', i:'ti-device-mobile' },
                      { l:'URL Leads',       v:stats.leads, c:'#7c6ff7', i:'ti-link' },
                      { l:'Conversions',     v:stats.conv,  c:'#34c98a', i:'ti-check' },
                      { l:'AI Calls Today',  v:stats.today, c:'#f5a623', i:'ti-bolt' },
                      { l:'Calls This Week', v:stats.week,  c:'#5a4fd4', i:'ti-chart-line' },
                    ] as any[]).map((x: any) => (
                      <div key={x.l} style={card}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                          <div style={{ fontSize:11, color:'#888' }}>{x.l}</div>
                          <div style={{ width:26, height:26, borderRadius:6, background:x.c+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            
                          </div>
                        </div>
                        <div style={{ fontSize:26, fontWeight:700 }}>{x.v}</div>
                      </div>
                    ))}
                  </div>
                  {stats.leads>0 && (
                    <div style={{ ...card, display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
                      <div style={{ fontSize:30, fontWeight:700, color:'#7c6ff7' }}>{Math.round((stats.conv/stats.leads)*100)}%</div>
                      <div>
                        <div style={{ fontWeight:600, marginBottom:2 }}>URL Analyzer Conversion Rate</div>
                        <div style={{ fontSize:12, color:'#888' }}>{stats.conv} signed up out of {stats.leads} who analyzed a URL</div>
                      </div>
                    </div>
                  )}
                  <div style={card}>
                    <div style={{ fontWeight:600, marginBottom:12 }}>Recent users</div>
                    {users.slice(0,6).map((u: any) => (
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
                </>
              )}

              {/* USERS */}
              {tab==='users' && (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                    <div style={{ fontSize:17, fontWeight:700 }}>Users ({users.length})</div>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search email…"
                      style={{ padding:'7px 12px', borderRadius:7, border:'1px solid #e4e4f0', fontSize:13, width:220, outline:'none' }} />
                  </div>
                  <div style={{ ...card, padding:0, overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr>{['User','Plan','Apps','Calls','Joined','Actions'].map(h=><th key={h} style={TH}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {filtered.map((u: any) => (
                          <tr key={u.id}>
                            <td style={TD}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(124,111,247,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#7c6ff7', flexShrink:0 }}>{u.email[0].toUpperCase()}</div>
                                <div>
                                  <div style={{ fontWeight:500 }}>{u.email}</div>
                                  <div style={{ fontSize:10, color:'#aaa' }}>{new Date(u.since).toLocaleDateString('en-IN')}</div>
                                </div>
                              </div>
                            </td>
                            <td style={TD}>
                              <span style={{ fontSize:11, padding:'2px 9px', borderRadius:20, fontWeight:700, background:u.plan==='pro'?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:u.plan==='pro'?'#16a870':'#888' }}>
                                {u.plan==='pro'?'✓ Pro':'Free'}
                              </span>
                            </td>
                            <td style={{ ...TD, color:'#555' }}>{u.apps}</td>
                            <td style={{ ...TD, color:u.calls>100?'#e55':u.calls>50?'#f5a623':'#555', fontWeight:u.calls>50?600:400 }}>{u.calls}</td>
                            <td style={{ ...TD, color:'#888', fontSize:12 }}>{new Date(u.since).toLocaleDateString('en-IN')}</td>
                            <td style={TD}>
                              <div style={{ display:'flex', gap:6 }}>
                                {u.plan==='free'
                                  ? <button onClick={()=>setPlan(u.id,'pro')} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(52,201,138,.3)', background:'rgba(52,201,138,.08)', color:'#16a870', fontSize:11, fontWeight:600, cursor:'pointer' }}>Grant Pro</button>
                                  : <button onClick={()=>setPlan(u.id,'free')} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(220,38,38,.2)', background:'rgba(220,38,38,.06)', color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>Revoke Pro</button>
                                }
                                <button onClick={()=>deleteApps(u.id)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #e4e4f0', background:'#fff', color:'#888', fontSize:11, cursor:'pointer' }}>
                                  
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filtered.length===0 && <tr><td colSpan={6} style={{ ...TD, textAlign:'center', color:'#aaa', padding:32 }}>No users found</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* LEADS */}
              {tab==='leads' && (
                <>
                  <div style={{ fontSize:17, fontWeight:700, marginBottom:18 }}>URL Leads ({leads.length}) — {leads.filter((l:any)=>l.converted).length} converted</div>
                  <div style={{ ...card, padding:0, overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead><tr>{['URL','Email','Date','Status'].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {leads.map((l: any) => (
                          <tr key={l.id}>
                            <td style={{ ...TD, maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              <a href={l.url} target="_blank" rel="noreferrer" style={{ color:'#7c6ff7', textDecoration:'none' }}>{l.url.replace(/^https?:\/\//,'')}</a>
                            </td>
                            <td style={{ ...TD, color:'#555' }}>{l.email||'—'}</td>
                            <td style={{ ...TD, color:'#888', fontSize:12 }}>{new Date(l.created_at).toLocaleDateString('en-IN')}</td>
                            <td style={TD}>
                              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:700, background:l.converted?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:l.converted?'#16a870':'#888' }}>
                                {l.converted?'✓ Converted':'Not signed up'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* USAGE */}
              {tab==='usage' && (
                <>
                  <div style={{ fontSize:17, fontWeight:700, marginBottom:18 }}>Today's AI Usage</div>
                  <div style={{ ...card, padding:0, overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead><tr>{['User','Plan','Calls','Usage','Limit'].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
                      <tbody>
                        {[...users].sort((a,b)=>b.calls-a.calls).filter((u: any)=>u.calls>0).map((u: any) => {
                          const lim = u.plan==='pro'?200:5
                          const pct = Math.min(100, Math.round((u.calls/lim)*100))
                          const c   = pct>80?'#e55':pct>50?'#f5a623':'#34c98a'
                          return (
                            <tr key={u.id}>
                              <td style={TD}>{u.email}</td>
                              <td style={TD}>
                                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:700, background:u.plan==='pro'?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:u.plan==='pro'?'#16a870':'#888' }}>{u.plan}</span>
                              </td>
                              <td style={{ ...TD, fontWeight:600, color:c }}>{u.calls}</td>
                              <td style={{ ...TD, width:160 }}>
                                <div style={{ height:6, background:'#f0f0f7', borderRadius:3, overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${pct}%`, background:c, borderRadius:3 }} />
                                </div>
                                <div style={{ fontSize:10, color:'#aaa', marginTop:2 }}>{pct}%</div>
                              </td>
                              <td style={{ ...TD, color:'#888' }}>{lim}/day</td>
                            </tr>
                          )
                        })}
                        {users.filter((u: any)=>u.calls>0).length===0 && (
                          <tr><td colSpan={5} style={{ ...TD, textAlign:'center', color:'#aaa', padding:32 }}>No AI calls today</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
      </div>
    </div>
  )
}

