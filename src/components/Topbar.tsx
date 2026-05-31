import { useStore } from '../lib/store'

const VIEW_LABELS: Record<string, string> = {
  overview: 'Overview',
  studio:   'Content Studio',
  strategy: 'Strategy',
  calendar: 'Calendar',
  insights: 'Insights & Analysis',
}

export default function Topbar({ onMenuClick, onSignOut, userEmail }: { onMenuClick?: () => void; onSignOut?: () => void; userEmail?: string }) {
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
        <span style={{ fontFamily:"'Inter',sans-serif", fontSize:16, fontWeight:700, color:'var(--text)', whiteSpace:'nowrap' }}>
          {VIEW_LABELS[view] ?? view}
        </span>
        <span style={{ fontSize:12, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          · {currentApp?.name}
        </span>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:6 }} className="topbar-actions">
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
          onClick={() => {
            setView('insights')
            setTimeout(() => {
              const btn = document.getElementById('run-full-analysis-btn')
              if (btn) btn.click()
            }, 150)
          }}>
          <i className="ti ti-telescope" style={{ fontSize:12 }} />
          <span className="topbar-label">Deep Analysis</span>
        </button>

        {/* Divider */}
        <div style={{ width:1, height:20, background:'var(--border)', margin:'0 2px' }} className="topbar-label" />

        {/* Feedback */}
        <a
          href={`mailto:swaroop.raghu@gmail.com?subject=Markr Feedback&body=Hi Swaroop,%0A%0A[Your feedback here]%0A%0AAccount: ${userEmail}`}
          className="vbtn topbar-label"
          style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, textDecoration:'none' }}
          title="Share feedback"
        >
          <i className="ti ti-message-circle" style={{ fontSize:13 }} />
          Feedback
        </a>

        {/* Sign out */}
        <button
          onClick={onSignOut}
          className="vbtn"
          style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}
          title="Sign out"
        >
          <i className="ti ti-logout" style={{ fontSize:13 }} />
          <span className="topbar-label">Sign out</span>
        </button>
      </div>

      <style>{`
        @media (max-width: 768px) {
          #sidebar-toggle { display: block !important; }
          .topbar-label { display: none !important; }
          .topbar-actions .vbtn { padding: 6px 8px; }
          .topbar-actions .gen-btn { padding: 6px 8px; }
        }
      `}</style>
    </div>
  )
}
