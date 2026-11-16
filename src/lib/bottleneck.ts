// A landing-page dimension is only "the bottleneck" when it scores below 7. When every dimension
// scores 7 or above there is no bottleneck — the advice is to maintain, not to fix.
// Pure (type imports only) so it can be unit-tested (tests/bottleneck.test.ts).

export const BOTTLENECK_BELOW = 7

type Ua = {
  bottleneck?: { label?: string; issue?: string } | null
  dimensions?: Array<{ label?: string; score?: number }> | null
} | null | undefined

const scoreOf = (ua: Ua, label: string | undefined): number | null => {
  if (!label) return null
  const d = (ua?.dimensions ?? []).find(x => (x.label ?? '').toLowerCase() === label.toLowerCase())
  return typeof d?.score === 'number' ? d.score : null
}

// The stored bottleneck, only if it really is one (its dimension scores below 7).
// Score unknown: kept only if some dimension scores below 7; with no dimension data, kept as is.
export function realBottleneck(ua: Ua): { label: string; issue: string; score: number | null } | null {
  const b = ua?.bottleneck
  if (!b?.label) return null
  const score = scoreOf(ua, b.label)
  if (score !== null) return score < BOTTLENECK_BELOW ? { label: b.label, issue: b.issue ?? '', score } : null
  const dims = (ua?.dimensions ?? []).filter(d => typeof d.score === 'number')
  if (dims.length && dims.every(d => (d.score as number) >= BOTTLENECK_BELOW)) return null
  return { label: b.label, issue: b.issue ?? '', score: null }
}

// Every scored dimension is 7 or above
export function noBottleneck(ua: Ua): boolean {
  const dims = (ua?.dimensions ?? []).filter(d => typeof d.score === 'number')
  return dims.length > 0 && dims.every(d => (d.score as number) >= BOTTLENECK_BELOW) && !realBottleneck(ua)
}

export const NO_BOTTLENECK_TEXT = 'No bottleneck — every landing-page dimension scores 7 or above; maintain it.'

// One line for prompts: the real bottleneck, or the explicit "no bottleneck — maintain"
export function bottleneckLine(ua: Ua, prefix = '#1 bottleneck'): string {
  const b = realBottleneck(ua)
  if (b) return `${prefix}: ${b.label}${b.score !== null ? ` (${b.score}/10)` : ''} — ${b.issue}`
  return noBottleneck(ua) ? NO_BOTTLENECK_TEXT : ''
}

// Is this dimension the (real) bottleneck?
export const isRealBottleneck = (ua: Ua, label: string): boolean => realBottleneck(ua)?.label === label
