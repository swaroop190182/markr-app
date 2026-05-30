import { useStore } from '../lib/store'

const VIEW_LABELS: Record<string, string> = {
  overview: 'Overview',
  studio:   'Content Studio',
  strategy: 'Strategy',
  calendar: 'Calendar',
  insights: 'Insights & Analysis',
}

export default function Topbar() {
  const { view, currentApp, setView } = useStore()

  return (
    <div
      className="flex items-center gap-3 flex-shrink-0"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '13px 22px',
      }}
    >
      <div className="flex items-baseline gap-1.5">
        <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
          {VIEW_LABELS[view] ?? view}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          · {currentApp.name}
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          className="vbtn flex items-center gap-1.5"
          onClick={() => {
            // AI Insight — handled in Overview
            setView('overview')
            setTimeout(() => {
              const btn = document.getElementById('ai-insight-btn')
              btn?.click()
            }, 100)
          }}
        >
          <i className="ti ti-sparkles" style={{ fontSize: 13 }} />
          AI Insight
        </button>

        <button
          className="gen-btn"
          style={{ fontSize: 12, padding: '7px 14px' }}
          onClick={() => {
            setView('studio')
            setTimeout(() => {
              const btn = document.getElementById('generate-all-btn')
              btn?.click()
            }, 100)
          }}
        >
          <i className="ti ti-bolt" style={{ fontSize: 13 }} />
          Generate All 3
        </button>

        <button
          className="gen-btn"
          style={{
            fontSize: 12, padding: '7px 14px',
            background: 'linear-gradient(135deg, var(--accent), var(--pink))'
          }}
          onClick={() => setView('insights')}
        >
          <i className="ti ti-telescope" style={{ fontSize: 13 }} />
          Deep Analysis
        </button>
      </div>
    </div>
  )
}
