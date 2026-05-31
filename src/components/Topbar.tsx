import { useStore } from '../lib/store'

const VIEW_LABELS: Record<string, string> = {
  overview: 'Overview',
  studio:   'Content Studio',
  strategy: 'Strategy',
  calendar: 'Calendar',
  insights: 'Insights & Analysis',
}

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { view, currentApp, setView } = useStore()

  return (
    <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'12px 18px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>

      {/* Hamburger — shown via CSS on mobile */}
      <button
        id="sidebar-toggle"
        onClick={onMenuClick}
        style={{ display:'none', background:'transparent', border:'1px solid var(--border2)', borderRadius:6, padding:'6px 8px', cursor:'pointer', color:'var(--text2)', flexShrink:0 }}
      >
        <i className="ti ti-menu-2" style={{ fontSize:16 }} />
      </button>

      <div style={{ flex:1, display:'flex', alignItems:'baseline', gap:6, minWidth:0 }}>
        <span style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, color:'var(--text)', whiteSpace:'nowrap' }}>
          {VIEW_LABELS[view] ?? view}
        </span>
        <span style={{ fontSize:12, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          · {currentApp?.name}
        </span>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:8 }} className="topbar-actions">
        <button className="vbtn" style={{ display:'flex', alignItems:'center', gap:5 }}
          onClick={() => { setView('overview'); setTimeout(() => document.getElementById('ai-insight-btn')?.click(), 100) }}>
          <i className="ti ti-sparkles" style={{ fontSize:12 }} />
          <span className="topbar-label">AI Insight</span>
        </button>
        <button className="gen-btn" style={{ fontSize:12, padding:'7px 12px' }}
          onClick={() => { setView('studio'); setTimeout(() => document.getElementById('generate-all-btn')?.click(), 100) }}>
          <i className="ti ti-bolt" style={{ fontSize:12 }} />
          <span className="topbar-label">Generate All 3</span>
        </button>
        <button className="gen-btn" style={{ fontSize:12, padding:'7px 12px', background:'linear-gradient(135deg,var(--accent),var(--pink))' }}
          onClick={() => setView('insights')}>
          <i className="ti ti-telescope" style={{ fontSize:12 }} />
          <span className="topbar-label">Deep Analysis</span>
        </button>
      </div>

      <style>{`
        @media (max-width: 768px) {
          #sidebar-toggle { display: block !important; }
          .topbar-label { display: none; }
          .topbar-actions .vbtn { padding: 6px 8px; }
          .topbar-actions .gen-btn { padding: 6px 8px; }
        }
      `}</style>
    </div>
  )
}
