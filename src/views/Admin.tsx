import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN_EMAIL = 'swaroop.raghu@gmail.com'

interface User {
  id: string
  email: string
  created_at: string
  plan: 'pro' | 'free'
  app_count: number
  calls_today: number
  last_active: string | null
  razorpay_sub_id: string | null
}

interface Lead {
  id: string
  url: string
  email: string | null
  created_at: string
  converted: boolean
}

interface Stats {
  total_users: number
  pro_users: number
  free_users: number
  total_apps: number
  total_leads: number
  converted_leads: number
  calls_today: number
  calls_this_week: number
}

type AdminTab = 'overview' | 'users' | 'leads' | 'usage'

export default function Admin() {
  const [tab, setTab]         = useState<AdminTab>('overview')
  const [users, setUsers]     = useState<User[]>([])
  const [leads, setLeads]     = useState<Lead[]>([])
  const [stats, setStats]     = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [toast, setToast]     = useState('')
  const [session, setSession] = useState<any>(null)
  const [authed, setAuthed]   = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email === ADMIN_EMAIL) {
        setSession(session); setAuthed(true)
      }
    })
  }, [])

  // ── Load all data ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!authed) return
    setLoading(true)
    try {
      // Users from auth (via service key — proxy through Supabase)
      const { data: subs } = await supabase
        .from('markr_subscriptions')
        .select('*')
        .order('created_at', { ascending: false })

      const { data: apps } = await supabase
        .from('markr_apps')
        .select('user_id')

      const { data: limits } = await supabase
        .from('markr_rate_limits')
        .select('*')
        .eq('date', new Date().toISOString().split('T')[0])

      const { data: leadsData } = await supabase
        .from('markr_url_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      const { data: deliveryPrefs } = await supabase
        .from('markr_delivery_prefs')
        .select('user_id, email')

      // Build user list from subscriptions
      const appCountMap: Record<string, number> = {}
      apps?.forEach(a => { appCountMap[a.user_id] = (appCountMap[a.user_id] ?? 0) + 1 })

      const callsMap: Record<string, number> = {}
      limits?.forEach(l => { callsMap[l.user_id] = l.count })

      const emailMap: Record<string, string> = {}
      deliveryPrefs?.forEach(d => { if (d.email) emailMap[d.user_id] = d.email })

      const userList: User[] = (subs ?? []).map(s => ({
        id:              s.user_id,
        email:           emailMap[s.user_id] ?? s.user_id,
        created_at:      s.created_at,
        plan:            s.plan ?? 'free',
        app_count:       appCountMap[s.user_id] ?? 0,
        calls_today:     callsMap[s.user_id] ?? 0,
        last_active:     s.updated_at ?? null,
        razorpay_sub_id: s.razorpay_sub_id ?? null,
      }))

      setUsers(userList)
      setLeads(leadsData ?? [])

      // Stats
      const today = new Date().toISOString().split('T')[0]
      const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0]
      const { data: weekLimits } = await supabase
        .from('markr_rate_limits')
        .select('count')
        .gte('date', weekAgo)

      const totalCalls = limits?.reduce((s, l) => s + (l.count ?? 0), 0) ?? 0
      const weekCalls  = weekLimits?.reduce((s, l) => s + (l.count ?? 0), 0) ?? 0

      setStats({
        total_users:     userList.length,
        pro_users:       userList.filter(u => u.plan === 'pro').length,
        free_users:      userList.filter(u => u.plan === 'free').length,
        total_apps:      apps?.length ?? 0,
        total_leads:     leadsData?.length ?? 0,
        converted_leads: leadsData?.filter(l => l.converted).length ?? 0,
        calls_today:     totalCalls,
        calls_this_week: weekCalls,
      })
    } catch (e) {
      console.error('Admin load error:', e)
    }
    setLoading(false)
  }, [authed])

  useEffect(() => { loadData() }, [loadData])

  // ── Grant / Revoke Pro ─────────────────────────────────────────────────────
  async function setPlan(userId: string, plan: 'pro' | 'free') {
    const { error } = await supabase
      .from('markr_subscriptions')
      .upsert({ user_id: userId, plan, status: plan === 'pro' ? 'active' : 'inactive', updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) { showToast('Error: ' + error.message); return }
    showToast(`Plan updated to ${plan}`)
    setUsers(p => p.map(u => u.id === userId ? { ...u, plan } : u))
    if (stats) setStats({ ...stats,
      pro_users:  users.filter(u => u.id === userId ? plan === 'pro' : u.plan === 'pro').length,
      free_users: users.filter(u => u.id === userId ? plan === 'free' : u.plan === 'free').length,
    })
  }

  // ── Delete user's apps ─────────────────────────────────────────────────────
  async function deleteUserApps(userId: string) {
    if (!confirm('Delete all apps for this user?')) return
    const { error } = await supabase.from('markr_apps').delete().eq('user_id', userId)
    if (error) { showToast('Error: ' + error.message); return }
    showToast('Apps deleted')
    setUsers(p => p.map(u => u.id === userId ? { ...u, app_count: 0 } : u))
  }

  if (!authed) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Inter,sans-serif', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:32 }}>🔒</div>
      <div style={{ fontSize:16, fontWeight:600 }}>Admin access only</div>
      <div style={{ fontSize:13, color:'#888' }}>Sign in as swaroop.raghu@gmail.com</div>
      <a href="/login" style={{ marginTop:8, padding:'10px 24px', background:'#7c6ff7', color:'#fff', borderRadius:8, textDecoration:'none', fontSize:14, fontWeight:600 }}>Sign in</a>
    </div>
  )

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.id.toLowerCase().includes(search.toLowerCase())
  )

  const TABS: { id: AdminTab; label: string; icon: string }[] = [
    { id:'overview', label:'Overview',   icon:'ti-dashboard' },
    { id:'users',    label:'Users',      icon:'ti-users' },
    { id:'leads',    label:'URL Leads',  icon:'ti-link' },
    { id:'usage',    label:'Usage',      icon:'ti-chart-bar' },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'#f4f4f8', fontFamily:'Inter,sans-serif' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:16, right:16, zIndex:999, background:'#111', color:'#fff', padding:'10px 18px', borderRadius:8, fontSize:13, fontWeight:500 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e4e4f0', padding:'14px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:7, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:15 }}>M</div>
          <div>
            <div style={{ fontSize:15, fontWeight:700 }}>Markr Admin</div>
            <div style={{ fontSize:11, color:'#888' }}>{ADMIN_EMAIL}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={loadData} style={{ padding:'7px 14px', borderRadius:7, border:'1px solid #e4e4f0', background:'#fff', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', gap:5 }}>
            <i className="ti ti-refresh" style={{ fontSize:13 }} /> Refresh
          </button>
          <a href="/app" style={{ padding:'7px 14px', borderRadius:7, border:'1px solid #e4e4f0', background:'#fff', cursor:'pointer', fontSize:12, textDecoration:'none', color:'#111', display:'flex', alignItems:'center', gap:5 }}>
            <i className="ti ti-arrow-left" style={{ fontSize:13 }} /> Back to app
          </a>
        </div>
      </div>

      <div style={{ display:'flex' }}>
        {/* Sidebar */}
        <div style={{ width:200, minHeight:'calc(100vh - 57px)', background:'#fff', borderRight:'1px solid #e4e4f0', padding:'16px 12px', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'none', background:tab===t.id?'rgba(124,111,247,.1)':'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:tab===t.id?600:400, color:tab===t.id?'#7c6ff7':'#555', marginBottom:2, textAlign:'left' }}>
              <i className={`ti ${t.icon}`} style={{ fontSize:15 }} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex:1, padding:24, overflow:'auto' }}>
          {loading ? (
            <div style={{ textAlign:'center', paddingTop:60, color:'#888' }}>Loading admin data…</div>
          ) : (
            <>
              {/* ── OVERVIEW ── */}
              {tab === 'overview' && stats && (
                <div>
                  <div style={{ fontSize:18, fontWeight:700, marginBottom:20 }}>Overview</div>

                  {/* Stat cards */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
                    {[
                      { label:'Total Users',    value:stats.total_users,     icon:'ti-users',      color:'#7c6ff7' },
                      { label:'Pro Users',      value:stats.pro_users,       icon:'ti-crown',      color:'#34c98a' },
                      { label:'Free Users',     value:stats.free_users,      icon:'ti-user',       color:'#f5a623' },
                      { label:'Total Apps',     value:stats.total_apps,      icon:'ti-device-mobile', color:'#e26faf' },
                      { label:'URL Leads',      value:stats.total_leads,     icon:'ti-link',       color:'#7c6ff7' },
                      { label:'Conversions',    value:stats.converted_leads, icon:'ti-check',      color:'#34c98a' },
                      { label:'AI Calls Today', value:stats.calls_today,     icon:'ti-bolt',       color:'#f5a623' },
                      { label:'Calls This Week',value:stats.calls_this_week, icon:'ti-chart-line', color:'#5a4fd4' },
                    ].map(s => (
                      <div key={s.label} style={{ background:'#fff', borderRadius:10, border:'1px solid #e4e4f0', padding:'16px 18px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                          <div style={{ fontSize:11, color:'#888', fontWeight:500 }}>{s.label}</div>
                          <div style={{ width:28, height:28, borderRadius:7, background:`${s.color}18`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <i className={`ti ${s.icon}`} style={{ fontSize:14, color:s.color }} />
                          </div>
                        </div>
                        <div style={{ fontSize:26, fontWeight:700, color:'#111' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Conversion rate */}
                  {stats.total_leads > 0 && (
                    <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e4e4f0', padding:'18px 20px', marginBottom:16, display:'flex', alignItems:'center', gap:16 }}>
                      <div style={{ fontSize:32, fontWeight:700, color:'#7c6ff7' }}>
                        {Math.round((stats.converted_leads / stats.total_leads) * 100)}%
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>URL Analyzer Conversion Rate</div>
                        <div style={{ fontSize:12, color:'#888' }}>{stats.converted_leads} signed up out of {stats.total_leads} who analyzed a URL</div>
                      </div>
                    </div>
                  )}

                  {/* Recent users */}
                  <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e4e4f0', padding:'18px 20px' }}>
                    <div style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>Recent signups</div>
                    {users.slice(0,5).map(u => (
                      <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 0', borderBottom:'1px solid #f0f0f7' }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(124,111,247,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#7c6ff7', flexShrink:0 }}>
                          {u.email[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                          <div style={{ fontSize:11, color:'#888' }}>{u.app_count} apps · {u.calls_today} calls today</div>
                        </div>
                        <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:u.plan==='pro'?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:u.plan==='pro'?'#16a870':'#888' }}>
                          {u.plan}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── USERS ── */}
              {tab === 'users' && (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                    <div style={{ fontSize:18, fontWeight:700 }}>Users ({users.length})</div>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by email…"
                      style={{ padding:'8px 12px', borderRadius:7, border:'1px solid #e4e4f0', fontSize:13, width:240, outline:'none' }} />
                  </div>

                  <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e4e4f0', overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:'#f8f8fc' }}>
                          {['User','Plan','Apps','Calls Today','Last Active','Actions'].map(h => (
                            <th key={h} style={{ padding:'11px 16px', fontSize:11, fontWeight:600, color:'#888', textAlign:'left', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid #e4e4f0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(u => (
                          <tr key={u.id} style={{ borderBottom:'1px solid #f0f0f7' }}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#fafafc'}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>
                            <td style={{ padding:'12px 16px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(124,111,247,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#7c6ff7', flexShrink:0 }}>
                                  {u.email[0].toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:500 }}>{u.email}</div>
                                  <div style={{ fontSize:10, color:'#aaa' }}>{new Date(u.created_at).toLocaleDateString('en-IN')}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding:'12px 16px' }}>
                              <span style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:700, background:u.plan==='pro'?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:u.plan==='pro'?'#16a870':'#888' }}>
                                {u.plan === 'pro' ? '✓ Pro' : 'Free'}
                              </span>
                            </td>
                            <td style={{ padding:'12px 16px', fontSize:13, color:'#555' }}>{u.app_count}</td>
                            <td style={{ padding:'12px 16px', fontSize:13, color:'#555' }}>
                              <span style={{ color:u.calls_today > 100?'#e55':u.calls_today>50?'#f5a623':'#555' }}>{u.calls_today}</span>
                            </td>
                            <td style={{ padding:'12px 16px', fontSize:12, color:'#888' }}>
                              {u.last_active ? new Date(u.last_active).toLocaleDateString('en-IN') : '—'}
                            </td>
                            <td style={{ padding:'12px 16px' }}>
                              <div style={{ display:'flex', gap:6 }}>
                                {u.plan === 'free' ? (
                                  <button onClick={() => setPlan(u.id, 'pro')}
                                    style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(52,201,138,.3)', background:'rgba(52,201,138,.08)', color:'#16a870', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                                    Grant Pro
                                  </button>
                                ) : (
                                  <button onClick={() => setPlan(u.id, 'free')}
                                    style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(220,38,38,.2)', background:'rgba(220,38,38,.06)', color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                                    Revoke Pro
                                  </button>
                                )}
                                <button onClick={() => deleteUserApps(u.id)}
                                  style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #e4e4f0', background:'#fff', color:'#888', fontSize:11, cursor:'pointer' }}>
                                  <i className="ti ti-trash" style={{ fontSize:11 }} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredUsers.length === 0 && (
                          <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'#aaa', fontSize:13 }}>No users found</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── LEADS ── */}
              {tab === 'leads' && (
                <div>
                  <div style={{ fontSize:18, fontWeight:700, marginBottom:20 }}>
                    URL Leads ({leads.length}) — {leads.filter(l=>l.converted).length} converted
                  </div>
                  <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e4e4f0', overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:'#f8f8fc' }}>
                          {['URL','Email','Date','Status'].map(h => (
                            <th key={h} style={{ padding:'11px 16px', fontSize:11, fontWeight:600, color:'#888', textAlign:'left', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid #e4e4f0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map(l => (
                          <tr key={l.id} style={{ borderBottom:'1px solid #f0f0f7' }}>
                            <td style={{ padding:'11px 16px', fontSize:12, color:'#555', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              <a href={l.url} target="_blank" rel="noreferrer" style={{ color:'#7c6ff7', textDecoration:'none' }}>{l.url.replace(/^https?:\/\//,'')}</a>
                            </td>
                            <td style={{ padding:'11px 16px', fontSize:12, color:'#555' }}>{l.email || '—'}</td>
                            <td style={{ padding:'11px 16px', fontSize:11, color:'#888' }}>{new Date(l.created_at).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding:'11px 16px' }}>
                              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:700, background:l.converted?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:l.converted?'#16a870':'#888' }}>
                                {l.converted ? '✓ Converted' : 'Not signed up'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── USAGE ── */}
              {tab === 'usage' && (
                <div>
                  <div style={{ fontSize:18, fontWeight:700, marginBottom:20 }}>Usage — Today's AI calls by user</div>
                  <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e4e4f0', overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:'#f8f8fc' }}>
                          {['User','Plan','Calls Today','Usage Bar','Limit'].map(h => (
                            <th key={h} style={{ padding:'11px 16px', fontSize:11, fontWeight:600, color:'#888', textAlign:'left', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid #e4e4f0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...users].sort((a,b) => b.calls_today - a.calls_today).filter(u => u.calls_today > 0).map(u => {
                          const limit = u.plan === 'pro' ? 200 : 5
                          const pct   = Math.min(100, Math.round((u.calls_today / limit) * 100))
                          const color = pct > 80 ? '#e55' : pct > 50 ? '#f5a623' : '#34c98a'
                          return (
                            <tr key={u.id} style={{ borderBottom:'1px solid #f0f0f7' }}>
                              <td style={{ padding:'12px 16px', fontSize:13 }}>{u.email}</td>
                              <td style={{ padding:'12px 16px' }}>
                                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:700, background:u.plan==='pro'?'rgba(52,201,138,.12)':'rgba(144,144,176,.1)', color:u.plan==='pro'?'#16a870':'#888' }}>
                                  {u.plan}
                                </span>
                              </td>
                              <td style={{ padding:'12px 16px', fontSize:14, fontWeight:600, color }}>{u.calls_today}</td>
                              <td style={{ padding:'12px 16px', width:160 }}>
                                <div style={{ height:6, background:'#f0f0f7', borderRadius:3, overflow:'hidden' }}>
                                  <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3 }} />
                                </div>
                                <div style={{ fontSize:10, color:'#aaa', marginTop:3 }}>{pct}% of limit</div>
                              </td>
                              <td style={{ padding:'12px 16px', fontSize:13, color:'#888' }}>{limit}/day</td>
                            </tr>
                          )
                        })}
                        {users.filter(u=>u.calls_today > 0).length === 0 && (
                          <tr><td colSpan={5} style={{ padding:32, textAlign:'center', color:'#aaa', fontSize:13 }}>No AI calls made today</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
