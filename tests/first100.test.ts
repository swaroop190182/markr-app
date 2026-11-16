// "Where your first 100 users are" helpers (src/lib/first100.ts).
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePlaces, forbidsPromotion, cleanDraft, mergeDrafts, readFirst100, carryFirst100,
  isFirst100Outdated, searchPrompt, draftPrompt, type First100Place,
} from '../src/lib/first100.ts'

const place = (o: any = {}) => ({
  name: 'r/IndianStartups', type: 'subreddit', url: 'https://www.reddit.com/r/IndianStartups',
  evidence_url: 'https://www.reddit.com/r/IndianStartups/comments/a/b', why: 'Founders in India', rules: null, members: null,
  language: 'English', last_seen: null, possibly_inactive: false, ...o,
})

test('normalizePlaces keeps well-formed places, caps the list and "why", maps unknown types', () => {
  const longWhy = Array.from({ length: 30 }, (_, i) => 'w' + i).join(' ')
  const ps = normalizePlaces({ places: [
    place({ why: longWhy, type: 'telegram channel' }),
    { name: 'No evidence', url: 'https://a.org' },             // not confirmed by the server → dropped
    { name: '', url: 'https://b.org', evidence_url: 'https://b.org/x' },
    ...Array.from({ length: 12 }, (_, i) => place({ name: 'P' + i })),
  ] })
  assert.equal(ps.length, 10)
  assert.equal(ps[0].why.split(' ').length, 20)
  assert.equal(ps[0].type, 'online community')
  assert.equal(ps[0].draft, null)
  assert.deepEqual(normalizePlaces({}), [])
})

test('normalizePlaces: rules/members only when sourced; no_link from sourced rules', () => {
  const [p] = normalizePlaces({ places: [place({
    rules: { value: 'No self-promotion or links in posts', source_url: 'https://www.reddit.com/r/IndianStartups/about/rules' },
    members: { value: '', source_url: 'https://x' },
  })] })
  assert.equal(p.rules?.value, 'No self-promotion or links in posts')
  assert.equal(p.members, null)
  assert.equal(p.no_link, true)
})

test('forbidsPromotion', () => {
  for (const r of ['No self-promotion', 'Links are not allowed', 'Advertising will be removed', 'Do not post links to your product', 'Self promo is banned'])
    assert.equal(forbidsPromotion(r), true, r)
  for (const r of ['Be kind', 'Weekly promo thread on Fridays', 'Share your project in the Show-off channel', '', null, undefined])
    assert.equal(forbidsPromotion(r as any), false, String(r))
})

test('cleanDraft strips links only for no-link places and removes sentences naming competitors', () => {
  const text = 'I built Emrise to help with journaling. Try it at https://emrise.app today. Unlike Calm, it is short. What helps you?'
  assert.equal(cleanDraft(text, false, []), text)
  const noLink = cleanDraft(text, true, [])!
  assert.ok(!/https?:|emrise\.app/.test(noLink), noLink)
  assert.ok(noLink.includes('I built Emrise'))
  assert.equal(cleanDraft('Visit www.emrise.app or emrise.app/join now.', true, []), 'Visit or now.')
  const noComp = cleanDraft(text, false, ['Calm', 'Me'])!                 // "Me" < 3 chars → ignored
  assert.ok(!/Calm/.test(noComp))
  assert.ok(noComp.includes('What helps you?'))
  assert.equal(cleanDraft('', false, []), null)
  assert.equal(cleanDraft(42, false, []), null)
  assert.equal(cleanDraft('Calm is great.', false, ['Calm']), null)
})

test('mergeDrafts attaches drafts by index and cleans them', () => {
  const ps = normalizePlaces({ places: [place(), place({ name: 'B', rules: { value: 'No links', source_url: 'https://s' } })] }) as First100Place[]
  const out = mergeDrafts(ps, { drafts: [{ i: 1, text: 'Hi all, link: https://x.com/a' }, { i: 7, text: 'orphan' }] }, [])
  assert.equal(out[0].draft, null)
  assert.ok(out[1].draft && !out[1].draft.includes('https'))
  assert.deepEqual(mergeDrafts(ps, null, []), ps)
})

test('readFirst100 / carryFirst100 keep the section across a GTM regenerate', () => {
  const section = { places: [], market: 'India', generated_at: '2026-11-10T00:00:00Z' }
  const prev = JSON.stringify({ channels: [], first100: section })
  assert.deepEqual(readFirst100(prev), section)
  assert.equal(readFirst100('not json'), null)
  assert.equal(readFirst100(null), null)
  assert.deepEqual(carryFirst100(prev, { channels: [1] }), { channels: [1], first100: section })
  assert.deepEqual(carryFirst100(JSON.stringify({ channels: [] }), { channels: [1] }), { channels: [1] })
})

test('isFirst100Outdated: only when it ran before the inputs changed', () => {
  const s = { places: [], market: 'India', generated_at: '2026-11-10T00:00:00Z' }
  assert.equal(isFirst100Outdated(s, Date.parse('2026-11-12T00:00:00Z')), true)
  assert.equal(isFirst100Outdated(s, Date.parse('2026-11-01T00:00:00Z')), false)
  assert.equal(isFirst100Outdated(s, null), false)
  assert.equal(isFirst100Outdated(null, Date.now()), false)
  assert.equal(isFirst100Outdated({ ...s, generated_at: 'bad' }, Date.now()), false)
})

test('prompts carry the honesty rules, market and no-link marks', () => {
  const sp = searchPrompt({ appName: 'Emrise', category: 'Health', market: 'India', product: 'Journaling', founder: '', competitorNames: ['Calm'] })
  assert.ok(sp.includes('Never invent a community, a member count or a rule'))
  assert.ok(sp.includes('PRIMARY MARKET: India'))
  const ps = normalizePlaces({ places: [place({ rules: { value: 'No links', source_url: 'https://s' } })] })
  const dp = draftPrompt({ appName: 'Emrise', appUrl: 'https://emrise.app', product: 'Journaling', founder: '', places: ps, startIndex: 5 })
  assert.ok(dp.includes('5. r/IndianStartups'))
  assert.ok(dp.includes('NO LINK'))
  assert.ok(dp.includes('"i":5'))
})
