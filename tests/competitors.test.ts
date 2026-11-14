// Client-side competitor helpers (src/lib/competitors.ts), plus the full website pipeline:
// server source check → client merge → what the UI shows.
// Run with: npm test   (Node's built-in runner; no extra dependencies)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSourceUrl, keepSourcedFacts, fillWebsitesFromResults } from '../api/_lib/sources.ts'
import {
  applyFacts, findFactsEntry, competitorWebsite, confirmedWebsite, isPreferredSource, itunesNameMatches,
} from '../src/lib/competitors.ts'

// Server pass (as in api/claude.ts) followed by the client merge (as in genCompetitive)
function runPass2(modelJson: any, resultUrls: string[], pass1: any) {
  const allowed = new Map<string, string>()
  for (const u of resultUrls) { const n = normalizeSourceUrl(u); if (n && !allowed.has(n)) allowed.set(n, u) }
  const stats = { kept: 0, dropped: 0, derived: 0 }
  const json = keepSourcedFacts(structuredClone(modelJson), allowed, stats)
  fillWebsitesFromResults(json, allowed, stats)
  return applyFacts(pass1, findFactsEntry(json.competitors, pass1, 0), '2026-11-14T00:00:00Z')
}

const amahaPass1 = { name: 'Amaha', url: 'https://amaha.care' }   // pass 1's guess

test('Amaha: search returned amahahealth.com → shown as amahahealth.com with a tick, guess replaced', () => {
  const c = runPass2({ competitors: [{
    name: 'Amaha', website: { value: 'https://amaha.care', source_url: 'https://www.amahahealth.com/' },
    pricing: null, funding: null, team_size: null,
  }] }, ['https://www.amahahealth.com/', 'https://www.crunchbase.com/organization/amaha'], amahaPass1)
  assert.equal(competitorWebsite(c), 'https://www.amahahealth.com')
  assert.equal(confirmedWebsite(c)?.via, 'search')
  assert.equal(confirmedWebsite(c)?.source_url, 'https://www.amahahealth.com/')
  assert.equal(c.url, 'https://www.amahahealth.com')     // card header, table, Overview, export all read this
  assert.equal(c.url_guess, 'https://amaha.care')
})

test('Amaha: no matching search result → shown as amaha.care without a tick', () => {
  const c = runPass2({ competitors: [{
    name: 'Amaha', website: { value: 'https://amaha.care', source_url: 'https://www.crunchbase.com/organization/amaha' },
    pricing: null, funding: null, team_size: null,
  }] }, ['https://www.crunchbase.com/organization/amaha'], amahaPass1)
  assert.equal(competitorWebsite(c), 'https://amaha.care')
  assert.equal(confirmedWebsite(c), null)
  assert.equal(c.facts.website, null)
  assert.equal(c.url, 'https://amaha.care')
  assert.equal(c.url_guess, undefined)
})

test('old saved result with a mismatched website fact shows no tick', () => {
  const old = { name: 'Amaha', url: 'https://amaha.care',
    facts: { website: { value: 'https://amaha.care', source_url: 'https://www.amahahealth.com/' } } }
  assert.equal(confirmedWebsite(old), null)
  assert.equal(competitorWebsite(old), 'https://amaha.care')
})

test('App Store developer site wins and carries the tick', () => {
  const c = { name: 'Amaha', url: 'https://amaha.care', appStore: { sellerUrl: 'https://www.amahahealth.com' } }
  assert.equal(competitorWebsite(c), 'https://www.amahahealth.com')
  assert.equal(confirmedWebsite(c)?.via, 'app_store')
})

test('pass-2 entries match competitors by name, then by position', () => {
  const entries = [{ name: 'Headspace' }, { name: 'Calm' }]
  assert.equal(findFactsEntry(entries, { name: 'calm' }, 0), entries[1])
  assert.equal(findFactsEntry(entries, { name: 'Unknown' }, 0), entries[0])
})

test('iTunes hits are trusted only when title or seller matches the competitor', () => {
  assert.equal(itunesNameMatches('Calm', { trackName: 'Calm: Sleep & Meditation' }), true)
  assert.equal(itunesNameMatches('Amaha', { trackName: 'Something', sellerName: 'Amaha Health Pvt Ltd' }), true)
  assert.equal(itunesNameMatches('Calm', { trackName: 'Notion', sellerName: 'Notion Labs' }), false)
  assert.equal(itunesNameMatches('Ab', { trackName: 'Ab' }), false)   // too short to match safely
})

test('source confidence: own site, app stores, databases and listed news outlets are preferred', () => {
  const calm = { name: 'Calm', url: 'https://www.calm.com' }
  for (const url of [
    'https://www.calm.com/pricing', 'https://blog.calm.com/post',
    'https://apps.apple.com/us/app/calm/id571800810', 'https://play.google.com/store/apps/details?id=com.calm.android',
    'https://www.crunchbase.com/organization/calm', 'https://in.linkedin.com/company/calm', 'https://techcrunch.com/2020/12/calm',
  ]) assert.equal(isPreferredSource(calm, url), true, url)
  assert.equal(isPreferredSource({ name: 'Headspace' }, 'https://www.headspace.com/subscriptions'), true)
})

test('source confidence: blogs, lookalikes and spoofed hosts are low-confidence', () => {
  assert.equal(isPreferredSource({ name: 'Calm', url: 'https://calm.com' }, 'https://someblog.example/calm-review'), false)
  assert.equal(isPreferredSource({ name: 'Headspace' }, 'https://headspacereviews.com/pricing'), false)
  assert.equal(isPreferredSource({ name: 'Calm', url: 'https://calm.com' }, 'https://crunchbase.com.evil.example/x'), false)
})
