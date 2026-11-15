import type { AppData } from '../types'

// The saved analyses that depend on the founder brief and screenshot analysis.
export type AnalysisKey = 'competitive' | 'bmc' | 'swot' | 'growth' | 'pricing' | 'positioning' | 'gtm'

export const ANALYSES: Record<AnalysisKey, { label: string; field: keyof AppData; data: keyof AppData; calls: number }> = {
  competitive: { label: 'Competitive',     field: 'competitive_analyzed_at', data: 'competitive_analysis', calls: 3 },  // pass 1 + live sources + website search
  bmc:         { label: 'Business Model',  field: 'bmc_analyzed_at',         data: 'bmc_analysis',         calls: 1 },
  swot:        { label: 'SWOT',            field: 'swot_analyzed_at',        data: 'swot_analysis',        calls: 1 },
  growth:      { label: 'Growth',          field: 'growth_analyzed_at',      data: 'growth_analysis',      calls: 1 },
  pricing:     { label: 'Pricing',         field: 'pricing_analyzed_at',     data: 'pricing_analysis',     calls: 1 },
  positioning: { label: 'Positioning',     field: 'positioning_analyzed_at', data: 'positioning_analysis', calls: 1 },
  gtm:         { label: 'Go-to-Market',    field: 'gtm_analyzed_at',         data: 'gtm_analysis',         calls: 1 },
}

// ── Analyses built with the old simulated product-test data ─────────────────
// Every analysis saved from now on carries this marker in its JSON. Analyses without it were
// generated while the simulated "AI Readiness Assessment" results (never from a real session)
// could still be in the prompt.
export const CONTEXT_VERSION = 2
const CONTEXT_MARKER = '_markr_ctx'

// Only these ever received that data: BMC, SWOT, Growth and Pricing had it in their prompt, and
// Go-to-Market reads the saved SWOT and Growth. Competitive and Positioning never did.
export const LEGACY_TEST_AFFECTED: AnalysisKey[] = ['bmc', 'swot', 'growth', 'pricing', 'gtm']

// Stamp an analysis JSON string as generated with the current context rules
export function markGenerated(json: string): string {
  try {
    const obj = JSON.parse(json)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return JSON.stringify({ ...obj, [CONTEXT_MARKER]: CONTEXT_VERSION })
  } catch { /* not JSON — store unchanged */ }
  return json
}

const generatedWithCurrentContext = (json: unknown): boolean => {
  if (typeof json !== 'string') return false
  try { return (JSON.parse(json)?.[CONTEXT_MARKER] ?? 0) >= CONTEXT_VERSION } catch { return false }
}

// The saved product test is in the old AI-simulated format (not the rule-based check)
export function hasLegacyProductTest(app: AppData): boolean {
  const pt = app.productTest
  return !!pt && !pt.error && !Array.isArray(pt.checks)
}

export type OutdatedReason = 'inputs' | 'legacy_test'

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

// Why a saved analysis is outdated, or null if it isn't:
//  - 'legacy_test': built while the simulated product-test data could be in its prompt — the app's
//    saved test is still in that format and the analysis predates the marker (see markGenerated)
//  - 'inputs':      it ran before the brief or screenshots last changed. A missing date on either
//    side (never run, or older saved data) never counts.
export function outdatedReason(app: AppData, key: AnalysisKey): OutdatedReason | null {
  const saved = app[ANALYSES[key].data]
  if (LEGACY_TEST_AFFECTED.includes(key) && hasLegacyProductTest(app) && typeof saved === 'string' && saved.trim()
      && !generatedWithCurrentContext(saved)) {
    return 'legacy_test'
  }
  const ran = toTime(app[ANALYSES[key].field])
  const changed = inputsChangedAt(app)
  return ran !== null && changed !== null && ran < changed ? 'inputs' : null
}

export function isOutdated(app: AppData, key: AnalysisKey): boolean {
  return outdatedReason(app, key) !== null
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
