// "Outdated" analyses (src/lib/outdated.ts) and founder-brief change tracking (src/lib/founder.ts).
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOutdated, inputsChangedAt, outdatedKeys, callCost, canBypassLock, isOneTimeUsed, outdatedReason, markGenerated, hasLegacyProductTest, carrySimulatedMarker } from '../src/lib/outdated.ts'
import { stampFounderBrief, hasFounderBrief, normalizeFounderBrief } from '../src/lib/founder.ts'

const app = (over: Record<string, unknown>) => ({ id: 1, name: 'X', ...over }) as any

test('analysis older than the brief change is outdated; newer is not', () => {
  const a = app({ founder_brief: { vision: 'v', updated_at: '2026-11-10T00:00:00Z' },
    swot_analyzed_at: '2026-11-01T00:00:00Z', bmc_analyzed_at: '2026-11-12T00:00:00Z' })
  assert.equal(isOutdated(a, 'swot'), true)
  assert.equal(isOutdated(a, 'bmc'), false)
})

test('a screenshot change alone makes an analysis outdated', () => {
  const a = app({ screenshot_vision: { screenshots: [], product_understanding: null, updated_at: '2026-11-10T00:00:00Z' },
    pricing_analyzed_at: '2026-11-09T00:00:00Z' })
  assert.equal(isOutdated(a, 'pricing'), true)
})

test('the later of brief and screenshot changes is used', () => {
  const a = app({ founder_brief: { vision: 'v', updated_at: '2026-11-01T00:00:00Z' },
    screenshot_vision: { screenshots: [], product_understanding: null, updated_at: '2026-11-10T00:00:00Z' },
    growth_analyzed_at: '2026-11-05T00:00:00Z' })
  assert.equal(inputsChangedAt(a), Date.parse('2026-11-10T00:00:00Z'))
  assert.equal(isOutdated(a, 'growth'), true)
})

test('missing or invalid dates never count as outdated', () => {
  assert.equal(isOutdated(app({ founder_brief: { vision: 'v', updated_at: '2026-11-10T00:00:00Z' } }), 'swot'), false)   // never ran
  assert.equal(isOutdated(app({ founder_brief: { vision: 'v' }, swot_analyzed_at: '2026-11-01T00:00:00Z' }), 'swot'), false)   // old brief, no date
  assert.equal(isOutdated(app({ founder_brief: { vision: 'v', updated_at: 'not a date' }, swot_analyzed_at: '2026-11-01T00:00:00Z' }), 'swot'), false)
})

test('outdatedKeys lists only outdated Insights analyses; callCost counts Competitive as 3', () => {
  const a = app({ founder_brief: { vision: 'v', updated_at: '2026-11-10T00:00:00Z' },
    competitive_analyzed_at: '2026-11-01T00:00:00Z', swot_analyzed_at: '2026-11-02T00:00:00Z',
    bmc_analyzed_at: '2026-11-12T00:00:00Z', positioning_analyzed_at: '2026-11-01T00:00:00Z' })
  assert.deepEqual(outdatedKeys(a), ['competitive', 'swot'])            // positioning is not an Insights tab
  assert.deepEqual(outdatedKeys(a, ['positioning']), ['positioning'])
  assert.equal(callCost(['competitive', 'swot']), 4)
})

test('stampFounderBrief: content change gets a new updated_at; identical save keeps the old one', () => {
  const prev = { vision: 'Old', updated_at: '2026-11-01T00:00:00Z' }
  const changed = stampFounderBrief(prev, { vision: 'New' }, '2026-11-15T00:00:00Z')
  assert.deepEqual(changed, { vision: 'New', updated_at: '2026-11-15T00:00:00Z' })
  assert.equal(stampFounderBrief(prev, { vision: 'Old' }, '2026-11-15T00:00:00Z'), prev)
})

test('whitespace-only edits are normalized away and do not count as a change', () => {
  const prev = { vision: 'Grow fast', updated_at: '2026-11-01T00:00:00Z' }
  const next = normalizeFounderBrief({ vision: '  Grow   fast ' })
  assert.equal(stampFounderBrief(prev, next, '2026-11-15T00:00:00Z'), prev)
})

test('clearing a filled brief keeps { updated_at }; an empty brief stays null; a new brief is stamped', () => {
  assert.deepEqual(stampFounderBrief({ vision: 'v', updated_at: '2026-11-01T00:00:00Z' }, null, '2026-11-15T00:00:00Z'), { updated_at: '2026-11-15T00:00:00Z' })
  assert.equal(stampFounderBrief(null, null, '2026-11-15T00:00:00Z'), null)
  assert.deepEqual(stampFounderBrief(null, { mission: 'm' }, '2026-11-15T00:00:00Z'), { mission: 'm', updated_at: '2026-11-15T00:00:00Z' })
})

test('hasFounderBrief ignores a cleared { updated_at } brief and empty lists', () => {
  assert.equal(hasFounderBrief({ updated_at: '2026-11-15T00:00:00Z' }), false)
  assert.equal(hasFounderBrief({ focus_competitors: [] }), false)
  assert.equal(hasFounderBrief(null), false)
  assert.equal(hasFounderBrief({ focus_competitors: ['Calm'] }), true)
})

test('outdated analyses skip the refresh lock, except a used one-time Analysis Pack run', () => {
  const base = { founder_brief: { vision: 'v', updated_at: '2026-11-10T00:00:00Z' }, swot_analyzed_at: '2026-11-01T00:00:00Z' }
  assert.equal(canBypassLock(app(base), 'pro', 'swot'), true)
  assert.equal(canBypassLock(app(base), 'analysis', 'swot'), true)                                         // run not used yet
  assert.equal(canBypassLock(app({ ...base, analysis_used_at: '2026-11-02T00:00:00Z' }), 'analysis', 'swot'), false)
  assert.equal(isOneTimeUsed(app({ analysis_used_at: '2026-11-02T00:00:00Z' }), 'pro'), false)            // only Analysis Pack is one-time
  assert.equal(canBypassLock(app({ ...base, swot_analyzed_at: '2026-11-12T00:00:00Z' }), 'pro', 'swot'), false)   // not outdated
})

// ── Analyses built while simulated product-test data could be in the prompt ──
const legacyPt  = { overall_score: 62, verdict: 'Good with gaps', bugs_and_issues: [{ title: 'Data loss' }] }
const realPt    = { score: 71, checks: [{ id: 'x', status: 'pass' }] }
const oldSwot   = JSON.stringify({ verdict: 'Fix response submission data loss' })   // no marker
const newSwot   = markGenerated(JSON.stringify({ verdict: 'Fresh' }))

test('markGenerated stamps analysis JSON; non-JSON is left unchanged', () => {
  assert.equal(JSON.parse(newSwot)._markr_ctx, 2)
  assert.equal(markGenerated('not json'), 'not json')
})

test('legacy-format product test flags unmarked BMC/SWOT/Growth/Pricing/GTM as outdated', () => {
  const a = app({ productTest: legacyPt, swot_analysis: oldSwot, gtm_analysis: oldSwot,
    competitive_analysis: oldSwot, positioning_analysis: oldSwot })
  assert.equal(hasLegacyProductTest(a), true)
  assert.equal(outdatedReason(a, 'swot'), 'legacy_test')
  assert.equal(outdatedReason(a, 'gtm'), 'legacy_test')            // reads the saved SWOT/Growth
  assert.equal(outdatedReason(a, 'competitive'), null)              // never received test data
  assert.equal(outdatedReason(a, 'positioning'), null)
  assert.equal(outdatedReason(a, 'bmc'), null)                      // nothing saved → nothing to flag
  assert.deepEqual(outdatedKeys(a), ['swot'])
})

test('re-running clears the legacy flag; rule-based or no test never flags', () => {
  assert.equal(outdatedReason(app({ productTest: legacyPt, swot_analysis: newSwot }), 'swot'), null)
  assert.equal(outdatedReason(app({ productTest: realPt, swot_analysis: oldSwot }), 'swot'), null)
  assert.equal(outdatedReason(app({ productTest: { error: 'failed' }, swot_analysis: oldSwot }), 'swot'), null)
  assert.equal(outdatedReason(app({ swot_analysis: oldSwot }), 'swot'), null)
})

test('legacy flag skips the lock for subscribers, not for a used one-time run', () => {
  const a = { productTest: legacyPt, swot_analysis: oldSwot, swot_analyzed_at: new Date().toISOString() }
  assert.equal(canBypassLock(app(a), 'pro', 'swot'), true)
  assert.equal(canBypassLock(app({ ...a, analysis_used_at: '2026-11-01T00:00:00Z' }), 'analysis', 'swot'), false)
})

test('a brief/screenshot change is still reported as "inputs"', () => {
  const a = app({ founder_brief: { vision: 'v', updated_at: '2026-11-10T00:00:00Z' },
    swot_analyzed_at: '2026-11-01T00:00:00Z', swot_analysis: newSwot })
  assert.equal(outdatedReason(a, 'swot'), 'inputs')
})

// ── Readiness check run before the old analyses were re-run ─────────────────
test('a rule-based result that replaced a simulated test carries the marker, and it is kept on later runs', () => {
  const first = carrySimulatedMarker(legacyPt as any, realPt)
  assert.equal(first.had_simulated_test, true)
  const second = carrySimulatedMarker(first as any, { score: 80, checks: [] })   // later readiness re-run
  assert.equal(second.had_simulated_test, true)
  assert.equal(carrySimulatedMarker(realPt as any, { score: 80, checks: [] }).had_simulated_test, undefined)   // never simulated
  assert.equal(carrySimulatedMarker(null, realPt).had_simulated_test, undefined)
})

test('after the readiness check replaced a simulated test, unstamped analyses are still flagged', () => {
  const pt = carrySimulatedMarker(legacyPt as any, realPt)
  const a = app({ productTest: pt, swot_analysis: oldSwot, gtm_analysis: oldSwot, competitive_analysis: oldSwot })
  assert.equal(hasLegacyProductTest(a), true)
  assert.equal(outdatedReason(a, 'swot'), 'legacy_test')
  assert.equal(outdatedReason(a, 'gtm'), 'legacy_test')
  assert.equal(outdatedReason(a, 'competitive'), null)
  assert.equal(outdatedReason(app({ productTest: pt, swot_analysis: newSwot }), 'swot'), null)   // re-run clears it
})
