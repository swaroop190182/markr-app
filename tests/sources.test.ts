// Server-side source checks for the competitive web-search pass (api/_lib/sources.ts).
// Run with: npm test   (Node's built-in runner; no extra dependencies)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSourceUrl, keepSourcedFacts, fillWebsitesFromResults } from '../api/_lib/sources.ts'

// Mirrors api/claude.ts: every returned search result URL, normalized → original
function resultsMap(urls: string[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const u of urls) { const n = normalizeSourceUrl(u); if (n && !m.has(n)) m.set(n, u) }
  return m
}

function check(modelJson: any, resultUrls: string[]) {
  const allowed = resultsMap(resultUrls)
  const stats = { kept: 0, dropped: 0, derived: 0 }
  const json = keepSourcedFacts(structuredClone(modelJson), allowed, stats)
  fillWebsitesFromResults(json, allowed, stats)
  return { json, stats }
}

test('normalizeSourceUrl strips www, trailing slash, #fragment and utm_*', () => {
  assert.equal(normalizeSourceUrl('https://www.crunchbase.com/organization/calm/'), 'crunchbase.com/organization/calm')
  assert.equal(normalizeSourceUrl('http://calm.com/pricing?utm_source=x#plans'), 'calm.com/pricing')
  assert.equal(normalizeSourceUrl('javascript:alert(1)'), null)
  assert.equal(normalizeSourceUrl('not a url'), null)
})

test('facts are kept only when their source_url was a returned search result', () => {
  const { json, stats } = check({ competitors: [{
    name: 'Calm',
    website:   { value: 'https://calm.com', source_url: 'https://calm.com/pricing' },
    pricing:   { value: '$69.99/yr', source_url: 'http://www.calm.com/pricing/' },          // same page, written differently
    funding:   { value: '$218M', source_url: 'https://www.crunchbase.com/organization/calm' },
    team_size: { value: '500', source_url: 'https://www.linkedin.com/company/calm' },     // never returned → drop
  }] }, ['https://calm.com/pricing?utm_source=x#plans', 'https://www.crunchbase.com/organization/calm/'])
  const c = json.competitors[0]
  assert.equal(c.website?.value, 'https://calm.com')
  assert.equal(c.pricing?.value, '$69.99/yr')
  assert.equal(c.funding?.value, '$218M')
  assert.equal(c.team_size, null)
  assert.equal(c.name, 'Calm')
  assert.deepEqual(stats, { kept: 3, dropped: 1, derived: 0 })
})

test('empty values and invented source URLs are dropped', () => {
  const { json } = check({ competitors: [{
    name: 'Fake',
    website:   { value: 'not a url', source_url: 'https://calm.com/pricing' },
    pricing:   { value: '', source_url: 'https://calm.com/pricing' },
    funding:   null,
    team_size: { value: '10', source_url: 'https://made-up.example/about' },
  }] }, ['https://calm.com/pricing'])
  const c = json.competitors[0]
  assert.equal(c.website, null)
  assert.equal(c.pricing, null)
  assert.equal(c.funding, null)
  assert.equal(c.team_size, null)
})

test('Amaha: model says amaha.care, search returned amahahealth.com → website is amahahealth.com', () => {
  const { json, stats } = check({ competitors: [{
    name: 'Amaha',
    website: { value: 'https://amaha.care', source_url: 'https://www.amahahealth.com/' },   // cites another site
    pricing: null, funding: null, team_size: null,
  }] }, ['https://www.amahahealth.com/', 'https://www.crunchbase.com/organization/amaha', 'https://inc42.com/buzz/amaha-raises'])
  assert.deepEqual(json.competitors[0].website, { value: 'https://www.amahahealth.com', source_url: 'https://www.amahahealth.com/' })
  assert.equal(stats.dropped, 1)   // amaha.care rejected: no result on that domain
  assert.equal(stats.derived, 1)   // site taken from the results instead
})

test('Amaha: model says amaha.care, no matching search result → website is null', () => {
  const { json } = check({ competitors: [{
    name: 'Amaha',
    website: { value: 'https://amaha.care', source_url: 'https://www.crunchbase.com/organization/amaha' },
    pricing: null, funding: null, team_size: null,
  }] }, ['https://www.crunchbase.com/organization/amaha', 'https://inc42.com/buzz/amaha-raises'])
  assert.equal(json.competitors[0].website, null)
})

test("model's website is confirmed by any returned result on its own domain (source swapped to that result)", () => {
  const { json } = check({ competitors: [{
    name: 'Amaha', website: { value: 'https://www.amahahealth.com', source_url: 'https://inc42.com/x' },
  }] }, ['https://www.amahahealth.com/therapy', 'https://inc42.com/x'])
  assert.deepEqual(json.competitors[0].website, { value: 'https://www.amahahealth.com', source_url: 'https://www.amahahealth.com/therapy' })
})

test('lookalike domains, blog subdomains and third-party platforms never become the website', () => {
  const { json } = check({ competitors: [{ name: 'Amaha', website: null }] },
    ['https://amahareviews.com/', 'https://amaha.medium.com/post', 'https://www.linkedin.com/company/amaha'])
  assert.equal(json.competitors[0].website, null)
})

test('a website named after the company on a two-part TLD is found (amahahealth.co.in)', () => {
  const { json } = check({ competitors: [{ name: 'Amaha', website: null }] }, ['https://www.amahahealth.co.in/about'])
  assert.equal(json.competitors[0].website?.value, 'https://www.amahahealth.co.in')
})
