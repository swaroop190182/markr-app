// THE bottleneck rule, shared by the server (report email) and the app (src/lib/bottleneck.ts
// re-exports this file): a landing-page dimension is only "the bottleneck" when it scores below 7.
// When every dimension scores 7 or above there is no bottleneck — show the lowest one as the
// next thing to improve instead.
// Pure, no imports, so it runs in Vercel functions, the browser bundle and tests/bottleneck.test.ts.

export const BOTTLENECK_BELOW = 7

type Dim = { label?: string; score?: number; issue?: string }
type Result = {
  bottleneck?: { label?: string; issue?: string; isUnverifiable?: boolean } | null
  dimensions?: Dim[] | null
} | null | undefined

const scoredDims = (r: Result): Array<{ label: string; score: number; issue: string }> =>
  (r?.dimensions ?? [])
    .filter(d => typeof d?.score === 'number' && typeof d?.label === 'string' && d.label)
    .map(d => ({ label: d.label as string, score: d.score as number, issue: d.issue ?? '' }))

const scoreOf = (r: Result, label: string | undefined): number | null =>
  label ? scoredDims(r).find(d => d.label.toLowerCase() === label.toLowerCase())?.score ?? null : null

// Lowest-scoring dimension (the first one on ties)
export function lowestDimension(r: Result): { label: string; score: number; issue: string } | null {
  const dims = scoredDims(r)
  return dims.length ? dims.reduce((lo, d) => (d.score < lo.score ? d : lo)) : null
}

// Every scored dimension is 7 or above
export function noBottleneck(r: Result): boolean {
  const dims = scoredDims(r)
  return dims.length > 0 && dims.every(d => d.score >= BOTTLENECK_BELOW)
}

// The bottleneck, or null when there isn't one:
//  - every dimension 7+                      → null
//  - stored bottleneck scores below 7         → the stored one (its own issue text)
//  - stored one scores 7+ (or none stored)    → the lowest dimension, which is below 7
//  - stored one has no score / no dimensions  → the stored one, as given
export function realBottleneck(r: Result): { label: string; issue: string; score: number | null } | null {
  if (noBottleneck(r)) return null
  const b = r?.bottleneck
  const s = scoreOf(r, b?.label)
  if (b?.label && (s === null || s < BOTTLENECK_BELOW)) return { label: b.label, issue: b.issue ?? '', score: s }
  const lo = lowestDimension(r)
  return lo ? { label: lo.label, issue: lo.issue, score: lo.score } : null
}

export const isRealBottleneck = (r: Result, label: string): boolean => realBottleneck(r)?.label === label

// What a result card shows under the scores
export type ResultSummary =
  | { kind: 'review'; label: string; issue: string }                                   // JS-rendered page — as before
  | { kind: 'bottleneck'; label: string; issue: string; score: number | null }         // "🚨 Biggest Bottleneck"
  | { kind: 'none'; next: { label: string; score: number; recommendation: string } }   // "✅ No major bottleneck"

export function resultSummary(r: Result): ResultSummary | null {
  const b = r?.bottleneck
  if (b?.isUnverifiable && b.label) return { kind: 'review', label: b.label, issue: b.issue ?? '' }
  if (noBottleneck(r)) {
    const lo = lowestDimension(r)!
    // The stored text for that dimension is its recommendation ("Could be stronger — …"); else its own issue line
    const recommendation = b?.label === lo.label && b.issue ? b.issue : lo.issue
    return { kind: 'none', next: { label: lo.label, score: lo.score, recommendation } }
  }
  const real = realBottleneck(r)
  return real ? { kind: 'bottleneck', ...real } : null
}

// ── Prompt wording ───────────────────────────────────────────────────────────
export const NO_BOTTLENECK_TEXT = 'No bottleneck — every landing-page dimension scores 7 or above; maintain it.'

// One line for prompts: the real bottleneck, or the explicit "no bottleneck — maintain"
export function bottleneckLine(r: Result, prefix = '#1 bottleneck'): string {
  const b = realBottleneck(r)
  if (b) return `${prefix}: ${b.label}${b.score !== null ? ` (${b.score}/10)` : ''} — ${b.issue}`
  return noBottleneck(r) ? NO_BOTTLENECK_TEXT : ''
}
