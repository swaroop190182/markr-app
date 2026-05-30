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
import Toast from './components/Toast'

function AppInner({ session }: { session: Session }) {
  const { view } = useStore()
  const [showAddApp, setShowAddApp] = useState(false)
  const [editAppId, setEditAppId] = useState<number | null>(null)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar
        onAddApp={() => setShowAddApp(true)}
        onEditApp={setEditAppId}
        onSignOut={() => supabase.auth.signOut()}
        userEmail={session.user.email ?? ''}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg)' }}>
          {view === 'overview'  && <Overview />}
          {view === 'studio'    && <ContentStudio />}
          {view === 'strategy'  && <Strategy />}
          {view === 'calendar'  && <Calendar />}
          {view === 'insights'  && <Insights />}
        </main>
      </div>
      {showAddApp && <AddAppModal onClose={() => setShowAddApp(false)} />}
      {editAppId !== null && <EditAppModal appId={editAppId} onClose={() => setEditAppId(null)} />}
      <Toast />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const path = window.location.pathname

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      // After login redirect to /app
      if (session && window.location.pathname === '/login') {
        window.location.href = '/app'
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Loading spinner
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, color: '#fff' }}>M</div>
          <span className="spinner" style={{ color: '#7c6ff7' }} />
        </div>
      </div>
    )
  }

  // Landing page
  if (path === '/' || path === '') return <Landing />

  // Login page
  if (path === '/login') return <Auth />

  // App — requires auth
  if (path.startsWith('/app')) {
    if (!session) {
      window.location.href = '/login'
      return null
    }
    return (
      <StoreProvider userId={session.user.id}>
        <AppInner session={session} />
      </StoreProvider>
    )
  }

  // Default fallback
  return <Landing />
}
