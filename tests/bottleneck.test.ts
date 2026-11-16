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

test('stored bottleneck at 7+ while another dimension is below 7: the lowest dimension is the bottleneck', () => {
  const ua = { bottleneck: { label: 'Clarity', issue: 'x' }, dimensions: [...dims(8, 6, 7, 7).slice(0, 1), { label: 'Trust', score: 6, issue: 'Few reviews' }, ...dims(8, 6, 7, 7).slice(2)] }
  assert.deepEqual(realBottleneck(ua), { label: 'Trust', issue: 'Few reviews', score: 6 })
  assert.equal(noBottleneck(ua), false)
  assert.equal(bottleneckLine(ua), '#1 bottleneck: Trust (6/10) — Few reviews')
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

// ── URL-analysis result card / email: resultSummary ──────────────────────────
import { resultSummary, lowestDimension, BOTTLENECK_BELOW } from '../src/lib/bottleneck.ts'
import { readFileSync } from 'node:fs'

const withIssues = (scores: number[]) => ['Clarity', 'Trust', 'Conversion Readiness', 'Emotional Pull', 'User Journey']
  .slice(0, scores.length).map((label, i) => ({ label, score: scores[i], issue: `${label} issue` }))

test('result card: lowest below 7 → "Biggest Bottleneck" as before', () => {
  const r = { bottleneck: { label: 'Trust', issue: 'No reviews or testimonials' }, dimensions: withIssues([8, 5, 7, 9]) }
  assert.deepEqual(resultSummary(r), { kind: 'bottleneck', label: 'Trust', issue: 'No reviews or testimonials', score: 5 })
})

test('result card: every dimension 7+ → "No major bottleneck" with the lowest as next thing to improve', () => {
  const r = { bottleneck: { label: 'Conversion Readiness', issue: 'Could be stronger — add a pricing page or a free trial entry point' }, dimensions: withIssues([9, 8, 7, 8, 9]) }
  assert.deepEqual(resultSummary(r), { kind: 'none', next: { label: 'Conversion Readiness', score: 7, recommendation: 'Could be stronger — add a pricing page or a free trial entry point' } })
  // stored bottleneck is another dimension → the lowest dimension's own issue line is the recommendation
  const r2 = { bottleneck: { label: 'Clarity', issue: 'x' }, dimensions: withIssues([9, 7, 8]) }
  assert.deepEqual(resultSummary(r2), { kind: 'none', next: { label: 'Trust', score: 7, recommendation: 'Trust issue' } })
})

test('result card: JS-rendered page keeps "Needs Manual Review"; no data → nothing', () => {
  const r = { bottleneck: { label: 'Trust', issue: 'Could not read', isUnverifiable: true }, dimensions: withIssues([9, 9, 9]) }
  assert.equal(resultSummary(r)?.kind, 'review')
  assert.equal(resultSummary(null), null)
  assert.equal(resultSummary({ dimensions: [] }), null)
})

test('one threshold: 7 is not a bottleneck, 6.9 is', () => {
  assert.equal(BOTTLENECK_BELOW, 7)
  assert.equal(resultSummary({ dimensions: withIssues([7, 7]) })?.kind, 'none')
  assert.equal(resultSummary({ dimensions: withIssues([7, 6.9]) })?.kind, 'bottleneck')
  assert.deepEqual(lowestDimension({ dimensions: withIssues([8, 7, 7]) }), { label: 'Trust', score: 7, issue: 'Trust issue' })
})

test('the app, the cards and the email all use the one shared rule', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
  assert.match(read('../src/lib/bottleneck.ts'), /export \* from '\.\.\/\.\.\/api\/_lib\/bottleneck\.ts'/)
  assert.match(read('../api/report-email.ts'), /import \{ resultSummary \} from '\.\/_lib\/bottleneck\.js'/)
  assert.match(read('../src/components/ResultSummaryBlock.tsx'), /resultSummary\(result\)/)
  for (const v of ['../src/views/Landing.tsx', '../src/views/Scorecard.tsx']) {
    const src = read(v)
    assert.ok(src.includes('<ResultSummaryBlock'), v)
    assert.ok(!src.includes('Biggest Bottleneck'), v + ' must not hard-code the heading')
  }
  assert.ok(!/Fix the bottleneck identified above|Focus on the #1 bottleneck/.test(read('../api/report-email.ts')))
})
