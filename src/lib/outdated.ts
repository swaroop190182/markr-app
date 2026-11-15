import type { AppData } from '../types'

// The saved analyses that depend on the founder brief and screenshot analysis.
export type AnalysisKey = 'competitive' | 'bmc' | 'swot' | 'growth' | 'pricing' | 'positioning' | 'gtm'

export const ANALYSES: Record<AnalysisKey, { label: string; field: keyof AppData; calls: number }> = {
  competitive: { label: 'Competitive',     field: 'competitive_analyzed_at', calls: 3 },  // pass 1 + live sources + website search
  bmc:         { label: 'Business Model',  field: 'bmc_analyzed_at',         calls: 1 },
  swot:        { label: 'SWOT',            field: 'swot_analyzed_at',        calls: 1 },
  growth:      { label: 'Growth',          field: 'growth_analyzed_at',      calls: 1 },
  pricing:     { label: 'Pricing',         field: 'pricing_analyzed_at',     calls: 1 },
  positioning: { label: 'Positioning',     field: 'positioning_analyzed_at', calls: 1 },
  gtm:         { label: 'Go-to-Market',    field: 'gtm_analyzed_at',         calls: 1 },
}

// Re-runnable from Insights' "Refresh all outdated"; Positioning and GTM re-run from their own tabs
export const INSIGHTS_KEYS: AnalysisKey[] = ['competitive', 'bmc', 'swot', 'growth', 'pricing']

const toTime = (s: unknown): number | null => {
  if (typeof s !== 'string') return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

// When the founder brief or the screenshot analysis last changed (null if neither date is known)
export function inputsChangedAt(app: AppData): number | null {
  const ts = [toTime(app.founder_brief?.updated_at), toTime(app.screenshot_vision?.updated_at)]
    .filter((t): t is number => t !== null)
  return ts.length ? Math.max(...ts) : null
}

// Outdated = it ran before the brief or screenshots last changed.
// A missing date on either side (never run, or older saved data) never counts as outdated.
export function isOutdated(app: AppData, key: AnalysisKey): boolean {
  const ran = toTime(app[ANALYSES[key].field])
  const changed = inputsChangedAt(app)
  return ran !== null && changed !== null && ran < changed
}

export const outdatedKeys = (app: AppData, keys: AnalysisKey[] = INSIGHTS_KEYS): AnalysisKey[] =>
  keys.filter(k => isOutdated(app, k))

// Outdated analyses skip their refresh lock — except for one-time (Analysis Pack) users who
// have used their run: they see the notice, but re-running keeps the existing locks.
export function isOneTimeUsed(app: AppData, plan: string): boolean {
  return plan === 'analysis' && !!app.analysis_used_at
}
export function canBypassLock(app: AppData, plan: string, key: AnalysisKey): boolean {
  return isOutdated(app, key) && !isOneTimeUsed(app, plan)
}

// Upper bound of AI calls a re-run uses (Competitive counts as up to 3)
export const callCost = (keys: AnalysisKey[]): number => keys.reduce((n, k) => n + ANALYSES[k].calls, 0)
