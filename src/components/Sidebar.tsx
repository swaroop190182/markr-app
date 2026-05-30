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
}

export default function Sidebar({ onAddApp, onEditApp }: Props) {
  const { apps, currentApp, view, setView, setCurrentApp } = useStore()

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
            AI Marketing
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

        <div
          onClick={onAddApp}
          className="flex items-center gap-1.5 cursor-pointer"
          style={{
            margin: '4px 2px 14px', padding: '7px 10px', borderRadius: 7,
            border: '1px dashed var(--border2)', fontSize: 12, color: 'var(--text3)',
            transition: 'all .15s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement
            el.style.borderColor = 'var(--accent)'; el.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement
            el.style.borderColor = 'var(--border2)'; el.style.color = 'var(--text3)'
          }}
        >
          <i className="ti ti-plus" style={{ fontSize: 13 }} />
          Add app
        </div>
      </div>

      {/* Settings */}
      <div style={{ marginTop: 'auto', padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <div
          className="flex items-center gap-2 cursor-pointer"
          style={{ padding: '8px 10px', borderRadius: 7, fontSize: 13, color: 'var(--text2)' }}
        >
          <i className="ti ti-settings" style={{ fontSize: 15 }} />
          Settings
        </div>
      </div>
    </div>
  )
}
