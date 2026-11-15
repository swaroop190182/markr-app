// Brand voice cleanup (api/_lib/brand.ts): the old simulated "PRODUCT TEST" block must never reach a prompt.
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripLegacyProductTest } from '../api/_lib/brand.ts'

// Exactly how the old Add App / Edit App built it: `BRAND TONE: ${tone}${testCtx}\n` + brand voice + rules
const legacyBrand =
  'You are the Instagram content strategist for Amaha, a health mobile app.\n\n'
  + 'TARGET AUDIENCE: Indian adults managing stress\nCORE PROBLEM: Overwhelm\nDIFFERENTIATOR: Clinician-built\nBRAND TONE: Warm and calm'
  + '\n\nPRODUCT TEST (62/100 — Good with gaps):\n'
  + '• Works: Onboarding is smooth; Mood tracker is clear\n'
  + '• Fix: Response submission data loss; Slow paywall\n'
  + '• Content: highlight: tracker; avoid: billing'
  + '\n'
  + '\nBRAND VOICE:\nAlways gentle. Never clinical jargon.\n'
  + '\nRULES:\n• Write from the user\'s perspective\n• Never salesy'

test('the simulated PRODUCT TEST block is removed; everything else stays', () => {
  const out = stripLegacyProductTest(legacyBrand)
  assert.equal(out.includes('PRODUCT TEST'), false)
  assert.equal(out.includes('Response submission data loss'), false)
  assert.equal(out.includes('62/100'), false)
  assert.ok(out.includes('BRAND TONE: Warm and calm'))
  assert.ok(out.includes('BRAND VOICE:\nAlways gentle. Never clinical jargon.'))
  assert.ok(out.includes("RULES:\n• Write from the user's perspective\n• Never salesy"))   // real bullets kept
})

test('brand voices without the block are unchanged (apart from trimming)', () => {
  const clean = 'You are the strategist.\n\nBRAND TONE: Bold\n\nRULES:\n• Never salesy'
  assert.equal(stripLegacyProductTest(clean), clean)
})

test('empty or missing brand voice becomes an empty string', () => {
  assert.equal(stripLegacyProductTest(null), '')
  assert.equal(stripLegacyProductTest(undefined), '')
  assert.equal(stripLegacyProductTest(''), '')
})
