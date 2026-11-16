// A dimension is only "the bottleneck" when it scores below 7 (src/lib/bottleneck.ts).
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { realBottleneck, noBottleneck, bottleneckLine, isRealBottleneck, NO_BOTTLENECK_TEXT } from '../src/lib/bottleneck.ts'
import { gtmMandatory } from '../src/lib/gtm.ts'

const dims = (c: number, t: number, v: number, e: number) => [
  { label: 'Clarity', score: c }, { label: 'Trust', score: t }, { label: 'Conversion Readiness', score: v }, { label: 'Emotional Pull', score: e },
]

test('9/10 is never "the #1 bottleneck"; every dimension 7+ → no bottleneck — maintain', () => {
  const ua = { overall: 8.5, bottleneck: { label: 'Clarity', issue: 'headline could be sharper' }, dimensions: dims(9, 8, 8, 7) }
  assert.equal(realBottleneck(ua), null)
  assert.equal(isRealBottleneck(ua, 'Clarity'), false)
  assert.equal(noBottleneck(ua), true)
  assert.equal(bottleneckLine(ua), NO_BOTTLENECK_TEXT)
})

test('a dimension below 7 is the bottleneck, with its score', () => {
  const ua = { bottleneck: { label: 'Trust', issue: 'no reviews' }, dimensions: dims(8, 5, 7, 7) }
  assert.deepEqual(realBottleneck(ua), { label: 'Trust', issue: 'no reviews', score: 5 })
  assert.equal(isRealBottleneck(ua, 'Trust'), true)
  assert.equal(noBottleneck(ua), false)
  assert.equal(bottleneckLine(ua), '#1 bottleneck: Trust (5/10) — no reviews')
  assert.equal(bottleneckLine(ua, '#1 WEAKNESS'), '#1 WEAKNESS: Trust (5/10) — no reviews')
})

test('stored bottleneck at 7+ while another dimension is low: not called a bottleneck, and not "maintain" either', () => {
  const ua = { bottleneck: { label: 'Clarity', issue: 'x' }, dimensions: dims(8, 6, 7, 7) }
  assert.equal(realBottleneck(ua), null)
  assert.equal(noBottleneck(ua), false)
  assert.equal(bottleneckLine(ua), '')
})

test('unknown score: kept only if some dimension is below 7; no dimension data → kept', () => {
  assert.equal(realBottleneck({ bottleneck: { label: 'Speed', issue: 'slow' }, dimensions: dims(8, 8, 8, 8) }), null)
  assert.deepEqual(realBottleneck({ bottleneck: { label: 'Speed', issue: 'slow' }, dimensions: dims(8, 6, 8, 8) }), { label: 'Speed', issue: 'slow', score: null })
  assert.deepEqual(realBottleneck({ bottleneck: { label: 'Speed', issue: 'slow' } }), { label: 'Speed', issue: 'slow', score: null })
  assert.equal(bottleneckLine({ bottleneck: { label: 'Speed', issue: 'slow' } }), '#1 bottleneck: Speed — slow')
  assert.equal(realBottleneck(null), null)
  assert.equal(bottleneckLine(undefined), '')
})

test('GTM findings use the same rule', () => {
  const allHigh = gtmMandatory({ overall: 8.5, bottleneck: { label: 'Clarity', issue: 'x' }, dimensions: dims(9, 8, 8, 7) }, null, null)
  assert.ok(!allHigh.playbook.some(m => m.includes('#1 bottleneck')))
  assert.ok(allHigh.playbook.some(m => m.startsWith(NO_BOTTLENECK_TEXT)))
  const low = gtmMandatory({ overall: 6, bottleneck: { label: 'Trust', issue: 'no reviews' }, dimensions: dims(8, 5, 7, 7) }, null, null)
  assert.ok(low.playbook.some(m => m.includes('#1 bottleneck is "Trust" (5/10)')))
})
