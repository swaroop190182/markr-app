// The block under a URL-analysis score (Landing result card, public Scorecard).
// One rule for both — resultSummary() in src/lib/bottleneck.ts: a dimension is only
// "the bottleneck" when it scores below 7.
import { resultSummary } from '../lib/bottleneck'

const D = "'Inter', sans-serif"

type Props = {
  result: Parameters<typeof resultSummary>[0]
  padding?: string
}

export default function ResultSummaryBlock({ result, padding = '14px 20px' }: Props) {
  const s = resultSummary(result)
  if (!s) return null

  const tone = s.kind === 'none'
    ? { bg: 'rgba(52,201,138,.05)', head: '#34c98a' }
    : s.kind === 'review'
      ? { bg: 'rgba(245,166,35,.04)', head: '#f5a623' }
      : { bg: 'rgba(220,38,38,.04)', head: '#fca5a5' }

  const heading = s.kind === 'review'
    ? `⚠️ Needs Manual Review — Unable to fully evaluate ${s.label} — JavaScript-rendered page`
    : s.kind === 'bottleneck'
      ? `🚨 Biggest Bottleneck — ${s.label}`
      : '✅ No major bottleneck'

  return (
    <div style={{ padding, borderBottom: '1px solid rgba(255,255,255,.07)', background: tone.bg }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: tone.head, letterSpacing: '.06em', textTransform: 'uppercase' as const, marginBottom: 5, fontFamily: D }}>
        {heading}
      </div>
      {s.kind === 'none' ? (
        <>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', lineHeight: 1.6, fontFamily: D, marginBottom: 3 }}>
            Next thing to improve: <strong>{s.next.label} ({s.next.score}/10)</strong>
          </div>
          {s.next.recommendation && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.6, fontFamily: D }}>{s.next.recommendation}</div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', lineHeight: 1.6, fontFamily: D }}>{s.issue}</div>
      )}
    </div>
  )
}
