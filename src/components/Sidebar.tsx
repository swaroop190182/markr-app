import { useStore } from '../lib/store'
import type { ViewType } from '../types'

const NAV_ITEMS: { view: ViewType; icon: string; label: string; badge?: number }[] = [
  { view: 'overview', icon: 'ti-layout-dashboard', label: 'Overview' },
  { view: 'studio',   icon: 'ti-sparkles',          label: 'Content Studio' },
  { view: 'strategy', icon: 'ti-bulb',              label: 'Strategy' },
  { view: 'calendar', icon: 'ti-calendar',          label: 'Calendar', badge: 12 },
  { view: 'insights', icon: 'ti-telescope',         label: 'Insights & Analysis' },
]

interface Props {
  onAddApp: () => void
  onEditApp: (id: number) => void
  onSignOut: () => void
  userEmail: string
}

export default function Sidebar({ onAddApp, onEditApp, onSignOut, userEmail }: Props) {
  const { apps, currentApp, view, plan, canAddApp, setView, setCurrentApp } = useStore()

  return (
    <div
      className="flex flex-col overflow-y-auto flex-shrink-0"
      style={{
        width: 220, minWidth: 220,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5"
        style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="flex items-center justify-center text-white font-black text-base"
          style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent), var(--pink))',
            fontFamily: 'Syne, sans-serif', fontSize: 16,
          }}
        >
          M
        </div>
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            Markr
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
            AI Co-founder
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: '12px 8px 6px' }}>
        {NAV_ITEMS.map(item => (
          <div
            key={item.view}
            onClick={() => setView(item.view)}
            className="flex items-center gap-2 cursor-pointer select-none"
            style={{
              padding: '8px 10px', borderRadius: 7, fontSize: 13,
              color: view === item.view ? 'var(--accent2)' : 'var(--text2)',
              background: view === item.view ? 'rgba(124,111,247,.15)' : 'transparent',
              transition: 'all .15s', marginBottom: 2,
            }}
            onMouseEnter={e => {
              if (view !== item.view) (e.currentTarget as HTMLElement).style.background = 'var(--surface2)'
            }}
            onMouseLeave={e => {
              if (view !== item.view) (e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize: 15 }} />
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge && (
              <span style={{
                background: 'var(--accent)', color: '#fff',
                fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 20
              }}>
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Apps */}
      <div style={{ padding: '12px 8px 6px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
        <div style={{
          fontSize: 10, color: 'var(--text3)', letterSpacing: '.08em',
          textTransform: 'uppercase', padding: '0 8px 6px'
        }}>
          My Apps
        </div>

        {apps.map(app => (
          <div
            key={app.id}
            className="flex items-center gap-2 cursor-pointer"
            style={{
              padding: '7px 10px', borderRadius: 7, fontSize: 12,
              color: app.id === currentApp.id ? 'var(--text)' : 'var(--text2)',
              background: app.id === currentApp.id ? 'var(--surface2)' : 'transparent',
              border: `1px solid ${app.id === currentApp.id ? 'var(--border2)' : 'transparent'}`,
              transition: 'all .15s', marginBottom: 2,
            }}
          >
            <div
              style={{ width: 8, height: 8, borderRadius: '50%', background: app.color, flexShrink: 0 }}
              onClick={() => setCurrentApp(app.id)}
            />
            <span
              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => setCurrentApp(app.id)}
            >
              {app.name}
            </span>
            <span
              style={{ fontSize: 10, color: 'var(--text3)' }}
              onClick={() => setCurrentApp(app.id)}
            >
              {app.platform}
            </span>
            <span
              onClick={() => onEditApp(app.id)}
              title="Edit app"
              style={{ fontSize: 12, cursor: 'pointer', padding: '2px 3px', borderRadius: 4, flexShrink: 0, color: 'var(--text3)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent2)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text3)'}
            >
              ✏️
            </span>
          </div>
        ))}

        {canAddApp ? (
          <div
            id="add-app-btn"
            onClick={onAddApp}
            className="flex items-center gap-1.5 cursor-pointer"
            style={{ margin: '4px 2px 8px', padding: '7px 10px', borderRadius: 7, border: '1px dashed var(--border2)', fontSize: 12, color: 'var(--text3)', transition: 'all .15s' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--accent)'; el.style.color = 'var(--accent)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border2)'; el.style.color = 'var(--text3)' }}
          >
            <i className="ti ti-plus" style={{ fontSize: 13 }} />
            Add app
          </div>
        ) : (
          <div
            style={{ margin: '4px 2px 8px', padding: '10px 10px', borderRadius: 7, border: '1px solid rgba(124,111,247,.25)', background: 'rgba(124,111,247,.06)', fontSize: 11, cursor: 'default' }}
          >
            <div style={{ color: 'var(--accent2)', fontWeight: 700, marginBottom: 4 }}>Free plan · 1 app limit</div>
            <div style={{ color: 'var(--text3)', lineHeight: 1.5, marginBottom: 8 }}>Upgrade to Pro for unlimited apps</div>
            <a href="/pricing" style={{ display: 'block', textAlign: 'center', padding: '5px 10px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
              Upgrade to Pro →
            </a>
          </div>
        )}

        {/* Plan badge */}
        <div style={{ padding: '4px 10px', marginBottom: 8 }}>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: plan === 'pro' ? 'rgba(52,201,138,.12)' : 'rgba(124,111,247,.1)', color: plan === 'pro' ? 'var(--green)' : 'var(--accent2)', border: `1px solid ${plan === 'pro' ? 'rgba(52,201,138,.25)' : 'rgba(124,111,247,.2)'}` }}>
            {plan === 'pro' ? '✓ Pro' : 'Free'}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '6px 10px', marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
        </div>

        {/* Feedback */}
        <a
          href={`mailto:swaroop.raghu@gmail.com?subject=Markr Feedback&body=Hi Swaroop,%0A%0A[Tell us what's working, what's broken, or what you'd love to see]%0A%0AApp I'm using: %0AMy account: ${userEmail}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, fontSize: 12, color: 'var(--text3)', textDecoration: 'none', transition: 'all .15s', marginBottom: 2 }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement
            el.style.background = 'var(--surface2)'
            el.style.color = 'var(--accent2)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement
            el.style.background = 'transparent'
            el.style.color = 'var(--text3)'
          }}
        >
          <i className="ti ti-message-circle" style={{ fontSize: 14 }} />
          Share feedback
        </a>

        {/* Sign out */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={onSignOut}
          style={{ padding: '8px 10px', borderRadius: 7, fontSize: 13, color: 'var(--text2)', transition: 'all .15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          <i className="ti ti-logout" style={{ fontSize: 15 }} />
          Sign out
        </div>
      </div>
    </div>
  )
}
