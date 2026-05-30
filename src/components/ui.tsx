import { type ReactNode } from 'react'

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, className = '', style = {} }: {
  children: ReactNode; className?: string; style?: React.CSSProperties
}) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  )
}

// ── CardHeader ────────────────────────────────────────────────────────────────
export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3.5">
      <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
        {title}
      </span>
      {action}
    </div>
  )
}

// ── Banner ────────────────────────────────────────────────────────────────────
export function Banner({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="banner">
      {icon && <span style={{ fontSize: 16, color: 'var(--accent2)', flexShrink: 0, marginTop: 1 }}>{icon}</span>}
      <div style={{ fontSize: 12, lineHeight: 1.5, flex: 1 }}>{children}</div>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ color = 'currentColor' }: { color?: string }) {
  return <span className="spinner" style={{ color }} />
}

// ── Loading card ──────────────────────────────────────────────────────────────
export function LoadingCard({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="card" style={{ padding: 24, textAlign: 'center' }}>
      <Spinner color="var(--accent2)" />
      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12 }}>{text}</div>
    </div>
  )
}

// ── Error card ────────────────────────────────────────────────────────────────
export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 24 }}>
      <div style={{ color: 'var(--red)', marginBottom: 12, fontSize: 12 }}>⚠️ {message}</div>
      {onRetry && (
        <button className="gen-btn" style={{ margin: '0 auto' }} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ children, onClose, title, subtitle }: {
  children: ReactNode
  onClose: () => void
  title: string
  subtitle?: string
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 'var(--r2)', padding: 24, width: 500,
          maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: subtitle ? 4 : 18, color: 'var(--text)' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── Progress step ─────────────────────────────────────────────────────────────
export function ProgressStep({ label, state }: { label: string; state: 'pending' | 'active' | 'done' | 'skip' }) {
  return (
    <div className={`ap-step ${state === 'skip' ? 'pending' : state}`} style={state === 'skip' ? { opacity: .35 } : {}}>
      <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>
        {state === 'done' ? '✓' : state === 'active' ? '●' : state === 'skip' ? '—' : '○'}
      </span>
      {label}
    </div>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────
export function Field({ label, hint, children }: {
  label: string; hint?: string; children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

// ── Select field ──────────────────────────────────────────────────────────────
export function SelectField({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </Field>
  )
}

// ── Tag ───────────────────────────────────────────────────────────────────────
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 20,
      background: 'var(--surface3)', color: 'var(--text3)'
    }}>
      {children}
    </span>
  )
}

// ── Copy button ───────────────────────────────────────────────────────────────
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '4px 10px', borderRadius: 6,
        border: `1px solid ${copied ? 'rgba(74,222,128,.3)' : 'rgba(255,255,255,.15)'}`,
        background: 'rgba(255,255,255,.06)',
        color: copied ? 'var(--green)' : 'var(--text2)',
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        transition: 'all .15s', fontFamily: 'DM Sans, sans-serif',
        flexShrink: 0, whiteSpace: 'nowrap'
      }}
    >
      {copied ? '✓ Copied!' : label}
    </button>
  )
}

// Need React import for useState
import React from 'react'
