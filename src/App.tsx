import { useState } from 'react'
import { StoreProvider, useStore } from './lib/store'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Overview from './views/Overview'
import ContentStudio from './views/ContentStudio'
import Strategy from './views/Strategy'
import Calendar from './views/Calendar'
import Insights from './views/Insights'
import AddAppModal from './components/AddAppModal'
import EditAppModal from './components/EditAppModal'
import Toast from './components/Toast'

function AppInner() {
  const { view } = useStore()
  const [showAddApp, setShowAddApp] = useState(false)
  const [editAppId, setEditAppId] = useState<number | null>(null)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar
        onAddApp={() => setShowAddApp(true)}
        onEditApp={setEditAppId}
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

      {showAddApp && (
        <AddAppModal onClose={() => setShowAddApp(false)} />
      )}
      {editAppId !== null && (
        <EditAppModal appId={editAppId} onClose={() => setEditAppId(null)} />
      )}
      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <AppInner />
    </StoreProvider>
  )
}
