import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from './lib/supabase'
import { StoreProvider, useStore } from './lib/store'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Overview from './views/Overview'
import ContentStudio from './views/ContentStudio'
import Strategy from './views/Strategy'
import Calendar from './views/Calendar'
import Insights from './views/Insights'
import Auth from './views/Auth'
import Landing from './views/Landing'
import AddAppModal from './components/AddAppModal'
import EditAppModal from './components/EditAppModal'
import UpgradeModal from './components/UpgradeModal'
import Toast from './components/Toast'

function AppInner({ session }: { session: Session }) {
  const { view, trialExpired } = useStore()
  const [showAddApp,   setShowAddApp]   = useState(false)
  const [editAppId,    setEditAppId]    = useState<number | null>(null)
  const [showUpgrade,  setShowUpgrade]  = useState(false)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)

  // Auto-show upgrade modal when trial expires
  useEffect(() => {
    if (trialExpired) {
      const t = setTimeout(() => setShowUpgrade(true), 2000)
      return () => clearTimeout(t)
    }
  }, [trialExpired])

  return (
    <div className="app-layout" style={{ background: 'var(--bg)' }}>
      {/* Mobile sidebar overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
        <Sidebar
          onAddApp={() => { setShowAddApp(true); setSidebarOpen(false) }}
          onEditApp={id => { setEditAppId(id); setSidebarOpen(false) }}
          onSignOut={() => supabase.auth.signOut()}
          onUpgrade={() => setShowUpgrade(true)}
          userEmail={session.user.email ?? ''}
        />
      </div>

      <div className="app-main">
        <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="app-content">
          {view === 'overview'  && <Overview onAddApp={() => setShowAddApp(true)} />}
          {view === 'studio'    && <ContentStudio />}
          {view === 'strategy'  && <Strategy />}
          {view === 'calendar'  && <Calendar />}
          {view === 'insights'  && <Insights />}
        </main>
      </div>

      {showAddApp  && <AddAppModal onClose={() => setShowAddApp(false)} />}
      {editAppId !== null && <EditAppModal appId={editAppId} onClose={() => setEditAppId(null)} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} trigger={trialExpired ? 'trial_expired' : 'manual'} />}
      <Toast />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [path,    setPath]    = useState(window.location.pathname)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        setPath('/app')
        window.history.pushState({}, '', '/app')
      } else if (event === 'SIGNED_OUT') {
        setPath('/')
        window.history.pushState({}, '', '/')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', background:'#0a0a0c', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,#7c6ff7,#e26faf)', margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Syne,sans-serif', fontSize:20, fontWeight:800, color:'#fff' }}>M</div>
          <span className="spinner" style={{ color:'#7c6ff7' }} />
        </div>
      </div>
    )
  }

  if (session && (path === '/' || path === '/login' || path === '')) {
    return (
      <StoreProvider userId={session.user.id} userEmail={session.user.email ?? ''}>
        <AppInner session={session} />
      </StoreProvider>
    )
  }

  if (path === '/' || path === '') return <Landing />
  if (path === '/login') return <Auth />

  if (path.startsWith('/app')) {
    if (!session) {
      window.history.pushState({}, '', '/login')
      setPath('/login')
      return <Auth />
    }
    return (
      <StoreProvider userId={session.user.id} userEmail={session.user.email ?? ''}>
        <AppInner session={session} />
      </StoreProvider>
    )
  }

  return <Landing />
}
