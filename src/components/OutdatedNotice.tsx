import type { OutdatedReason } from '../lib/outdated'

const REASON_TEXT: Record<OutdatedReason, string> = {
  inputs:      'your brief or screenshots changed since this ran',
  legacy_test: 'this ran with test data Markr no longer uses. Re-run for an accurate result.',
}

// Shown above an analysis that is outdated (see outdatedReason in src/lib/outdated.ts).
export default function OutdatedNotice({ onRerun, busy, oneTimeUsed, onUpgrade, reason = 'inputs' }: {
  onRerun: () => void
  busy?: boolean
  oneTimeUsed?: boolean      // Analysis Pack run already used → no free re-run
  onUpgrade?: () => void
  reason?: OutdatedReason
}) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' as const, padding:'9px 14px', marginBottom:12,
      borderRadius:'var(--r)', background:'rgba(245,166,35,.07)', border:'1px solid rgba(245,166,35,.3)' }}>
      <span style={{ fontSize:12, color:'var(--amber)', flex:1, minWidth:200 }}>
        ⚠️ <strong>Outdated</strong> — {REASON_TEXT[reason]}
      </span>
      {oneTimeUsed
        ? onUpgrade && <button className="vbtn" onClick={onUpgrade} style={{ fontSize:11 }}>Buy another analysis to re-run →</button>
        : <button className="vbtn" onClick={onRerun} disabled={busy} style={{ fontSize:11, color:'var(--amber)', borderColor:'rgba(245,166,35,.4)' }}>
            {busy ? 'Re-running…' : '↻ Re-run'}
          </button>}
    </div>
  )
}
