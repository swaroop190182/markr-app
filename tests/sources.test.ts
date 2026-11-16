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

// ── "Where your first 100 users are": path-aware community matching + freshness ──
import { communityRoot, parsePageAge, keepReturnedPlaces } from '../api/_lib/sources.ts'

const NOW = Date.parse('2026-11-16T00:00:00Z')
const run = (places: any[], results: { url: string; page_age?: string }[]) => {
  const stats = { kept: 0, dropped: 0, derived: 0 }
  const json: any = { places: structuredClone(places) }
  keepReturnedPlaces(json, results, stats, NOW)
  return { places: json.places, stats }
}

test('communityRoot names the community, not just the host', () => {
  assert.deepEqual(communityRoot('https://www.reddit.com/r/SaaS/comments/abc/how_we_got/'), { key: 'reddit.com/r/saas', url: 'https://www.reddit.com/r/SaaS' })
  assert.equal(communityRoot('https://www.reddit.com/search?q=saas'), null)
  assert.equal(communityRoot('https://reddit.com'), null)
  assert.equal(communityRoot('https://www.youtube.com/@AliAbdaal/videos')?.key, 'youtube.com/@aliabdaal')
  assert.equal(communityRoot('https://www.youtube.com/watch?v=xyz'), null)
  assert.equal(communityRoot('https://discord.gg/abc123')?.key, 'discord.gg/abc123')
  assert.equal(communityRoot('https://www.facebook.com/groups/123456/posts/789')?.key, 'facebook.com/groups/123456')
  assert.equal(communityRoot('https://www.facebook.com/somebody'), null)
  assert.equal(communityRoot('https://lenny.substack.com/p/how-to-grow')?.key, 'lenny.substack.com')   // subdomain = the newsletter
  assert.equal(communityRoot('https://forum.indianstartups.org/t/thread/42')?.key, 'forum.indianstartups.org')
})

test('a place is kept only when a returned result is inside that community', () => {
  const { places, stats } = run(
    [{ name: 'r/SaaS', type: 'subreddit', url: 'https://reddit.com/r/saas' }],
    [{ url: 'https://www.reddit.com/r/SaaS/comments/abc/thread', page_age: '3 weeks ago' }])
  assert.equal(places.length, 1)
  assert.equal(places[0].url, 'https://www.reddit.com/r/SaaS')          // derived from the result, not the model's spelling
  assert.equal(places[0].evidence_url, 'https://www.reddit.com/r/SaaS/comments/abc/thread')
  assert.equal(places[0].possibly_inactive, false)
  assert.equal(stats.kept, 1)
})

test('cross-community false positives are dropped', () => {
  const cases: Array<[string, string, string]> = [
    // [model's place URL, only returned result, what it is]
    ['https://www.reddit.com/r/SaaS',               'https://www.reddit.com/r/startups/comments/x/t', 'different subreddit'],
    ['https://www.reddit.com/r/SaaS',               'https://www.reddit.com/search?q=saas',           'reddit search page'],
    ['https://www.facebook.com/groups/111',         'https://www.facebook.com/groups/222/posts/1',    'different Facebook group'],
    ['https://www.facebook.com/groups/111',         'https://www.facebook.com/someperson',            'personal Facebook page'],
    ['https://www.youtube.com/@channelA',           'https://www.youtube.com/@channelB/videos',       'different YouTube channel'],
    ['https://www.youtube.com/@channelA',           'https://www.youtube.com/watch?v=xyz',            'video with no channel path'],
    ['https://a.substack.com',                      'https://b.substack.com/p/post',                  'different Substack'],
    ['https://discord.gg/aaa',                      'https://discord.gg/bbb',                         'different Discord invite'],
    ['https://www.reddit.com',                      'https://www.reddit.com/r/SaaS/comments/x/t',     'model gave no community path'],
  ]
  for (const [want, got, what] of cases) {
    const { places, stats } = run([{ name: 'X', type: 'forum', url: want }], [{ url: got }])
    assert.equal(places.length, 0, what)
    assert.equal(stats.dropped, 1, what)
  }
})

test('freshness: newest matching result wins; older than ~2 years is tagged and sorted last', () => {
  const { places } = run(
    [
      { name: 'Old forum', type: 'forum', url: 'https://oldforum.example.org' },
      { name: 'r/IndianStartups', type: 'subreddit', url: 'https://www.reddit.com/r/IndianStartups' },
      { name: 'No date', type: 'newsletter', url: 'https://weekly.example.com' },
    ],
    [
      { url: 'https://oldforum.example.org/t/1', page_age: 'March 1, 2021' },
      { url: 'https://www.reddit.com/r/IndianStartups/comments/a/b', page_age: 'March 1, 2021' },
      { url: 'https://www.reddit.com/r/IndianStartups/comments/c/d', page_age: '2 days ago' },   // newer evidence wins
      { url: 'https://weekly.example.com/issue-12' },                                             // no page_age → not tagged
    ])
  assert.deepEqual(places.map((p: any) => p.name), ['r/IndianStartups', 'No date', 'Old forum'])
  assert.deepEqual(places.map((p: any) => p.possibly_inactive), [false, false, true])
  assert.equal(places[1].last_seen, null)
})

test('parsePageAge handles relative and absolute dates', () => {
  assert.equal(parsePageAge('2 days ago', NOW), NOW - 2 * 8.64e7)
  assert.equal(parsePageAge('2025-04-30', NOW), Date.parse('2025-04-30'))
  assert.equal(parsePageAge('April 30, 2025', NOW), Date.parse('April 30, 2025'))
  assert.equal(parsePageAge('', NOW), null)
  assert.equal(parsePageAge(undefined, NOW), null)
  assert.equal(parsePageAge('not a date', NOW), null)
})
