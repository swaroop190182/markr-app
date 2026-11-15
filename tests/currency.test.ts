// Prices in analysis output stay in their original currency (src/lib/currency.ts).
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knownPricesFrom, fixCurrencyText, fixCurrencyDeep } from '../src/lib/currency.ts'

// Known prices as they appear in the app's data: screenshot pricing + sourced competitor pricing
const known = knownPricesFrom(['₹49/mo', 'Premium ₹199/month', '$69.99/year', '₹99.00'])   // ₹99.00 has no period → ignored

test('known prices are parsed with amount and period; one-off prices are skipped', () => {
  assert.deepEqual(known, [
    { symbol: '₹', amount: '49',    period: 'mo' },
    { symbol: '₹', amount: '199',   period: 'mo' },
    { symbol: '$', amount: '69.99', period: 'yr' },
  ])
})

test('real SWOT example: Emrise "$49/mo" → "₹49/mo"', () => {
  const r = fixCurrencyText("Emrise's paywall ($49/mo) blocks first use", known)
  assert.equal(r.text, "Emrise's paywall (₹49/mo) blocks first use")
  assert.deepEqual(r.fixes, [{ from: '$49/mo', to: '₹49/mo' }])
})

test('real SWOT example: Amaha "$199/mo" → "₹199/mo"', () => {
  assert.equal(fixCurrencyText('Undercut Amaha ($199/mo)', known).text, 'Undercut Amaha (₹199/mo)')
})

test('real SWOT example: model-made conversion "= ₹583/mo equiv." is removed', () => {
  const r = fixCurrencyText('Calm $69.99/year = ₹583/mo equiv. is the premium anchor', known)
  assert.equal(r.text, 'Calm $69.99/year is the premium anchor')
  assert.deepEqual(r.fixes, [{ from: '$69.99/year = ₹583/mo equiv.', to: '$69.99/year' }])
  assert.equal(fixCurrencyText('Calm $69.99/year (≈ ₹583/mo)', known).text, 'Calm $69.99/year')
})

test('left unchanged: no period, already correct, unknown amount, same-currency arithmetic', () => {
  for (const s of [
    'Spend $49 on a test ad',                 // no period → not a price we match
    'Emrise costs ₹49/mo',                    // already correct
    'A $12/mo tier would undercut',           // unknown amount
    'Calm $69.99/year = $5.83/mo',            // same currency — arithmetic, not a conversion
  ]) {
    const r = fixCurrencyText(s, known)
    assert.equal(r.text, s, s)
    assert.equal(r.fixes.length, 0, s)
  }
})

test('ambiguous amounts (known in two currencies) are left alone', () => {
  const both = knownPricesFrom(['₹49/mo', '$49/mo'])
  assert.equal(fixCurrencyText('Priced at £49/mo', both).text, 'Priced at £49/mo')
})

test('formatting differences still match: "₹1,500 per month" vs "$1500/mo"', () => {
  const k = knownPricesFrom(['₹1,500 per month'])
  assert.equal(fixCurrencyText('Therapy is $1500/mo', k).text, 'Therapy is ₹1500/mo')
})

test('fixCurrencyDeep fixes nested strings, leaves keys and non-strings alone, and counts fixes', () => {
  const swot = { weaknesses: [{ point: 'Paywall ($49/mo) before value', rating: 'High' }], score: 49, '$49/mo': 'key' }
  const { value, fixes } = fixCurrencyDeep(swot, known)
  assert.equal(value.weaknesses[0].point, 'Paywall (₹49/mo) before value')
  assert.equal(value.score, 49)
  assert.ok('$49/mo' in value)
  assert.equal(fixes.length, 1)
})
