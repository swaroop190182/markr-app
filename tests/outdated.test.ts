// "Outdated" analyses (src/lib/outdated.ts) and founder-brief change tracking (src/lib/founder.ts).
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOutdated, inputsChangedAt, outdatedKeys, callCost, canBypassLock, isOneTimeUsed } from '../src/lib/outdated.ts'
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
