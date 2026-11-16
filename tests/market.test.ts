// Primary-market detection for "Auto-detect" apps (src/lib/market.ts).
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectMarket } from '../src/lib/market.ts'

// Edit App's "Primary market" names, plus Canada and Global
const NAMES = ['India', 'United States', 'United Kingdom', 'Europe', 'Southeast Asia', 'Middle East', 'Australia', 'Canada', 'Global']
const ua = (o: any) => ({ headline: '', growth_teaser: '', ...o })

test('₹ price on the landing page beats a "$" in an issue line (the Emrise bug)', () => {
  const r = detectMarket({
    desc: 'Mood journaling app', url: 'https://emrise.app',
    ua: ua({ currencies: ['₹'], bottleneck: { issue: 'No $ pricing anchor above the fold' } }),
  })
  assert.equal(r, 'India')
})

test('screenshot pricing "₹49/mo" → India', () => {
  assert.equal(detectMarket({ desc: 'Habit tracker', url: 'https://x.com', screenshotPricing: ['₹49/mo', '7-day free trial'] }), 'India')
})

test('£ on the landing page → United Kingdom; € → Europe', () => {
  assert.equal(detectMarket({ url: 'https://a.io', ua: ua({ currencies: ['£', '$'] }) }), 'United Kingdom')
  assert.equal(detectMarket({ url: 'https://a.io', ua: ua({ currencies: ['€'] }) }), 'Europe')
})

test('two different strong currencies are ambiguous → falls through to other signals', () => {
  assert.equal(detectMarket({ url: 'https://a.co.uk', ua: ua({ currencies: ['₹'] }), screenshotPricing: ['£9.99/mo'] }), 'United Kingdom')
  assert.equal(detectMarket({ url: 'https://a.io', ua: ua({ currencies: ['₹', '€'] }) }), 'Global')
})

test('"$" alone does not decide at the price step', () => {
  // landing page prices in $, but the description names Bengaluru
  assert.equal(detectMarket({ desc: 'Built in Bengaluru for students', url: 'https://a.io', ua: ua({ currencies: ['$'] }) }), 'India')
})

test('text, domain and phone signals', () => {
  assert.equal(detectMarket({ desc: 'Therapy for people in Mumbai', url: 'https://a.io' }), 'India')
  assert.equal(detectMarket({ desc: 'Therapy app', url: 'https://www.calmmind.co.uk' }), 'United Kingdom')
  assert.equal(detectMarket({ desc: 'Call us on +91 98765 43210', url: 'https://a.io' }), 'India')
  assert.equal(detectMarket({ desc: 'Clinics across Singapore', url: 'https://a.io' }), 'Southeast Asia')
  assert.equal(detectMarket({ desc: 'Made in Dubai', url: 'https://a.io' }), 'Middle East')
})

test('nothing found → Global', () => {
  assert.equal(detectMarket({ desc: 'A calm journaling app', url: 'https://a.io' }), 'Global')
  assert.equal(detectMarket({}), 'Global')
})

test('every result is one of Edit App\'s market names (or Canada / Global)', () => {
  const inputs = [
    { desc: 'India' }, { desc: 'London' }, { desc: 'New York' }, { desc: 'Singapore' }, { desc: 'Sydney' },
    { desc: 'Toronto' }, { desc: 'UAE' }, { desc: '₹99' }, { desc: '£5' }, { desc: '€5' }, { desc: '$5' },
    { url: 'https://a.in' }, { url: 'https://a.ca' }, { url: 'https://a.com.au' }, { url: 'https://a.sg' }, { url: 'https://a.ae' },
    { desc: '+44 20 7946' }, { desc: '+1 (415) 555' }, {},
  ]
  for (const i of inputs) assert.ok(NAMES.includes(detectMarket(i)), JSON.stringify(i) + ' → ' + detectMarket(i))
})
