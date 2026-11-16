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
    place({ why: longWhy, type: 'telegram channel', url: 'https://forum.example.org', evidence_url: 'https://forum.example.org/t/1' }),   // URL says nothing: model type checked
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

test('every failure has a specific visible message', async () => {
  const { searchErrorMessage, noneConfirmedMessage, draftsFailedMessage, classifyError } = await import('../src/lib/first100.ts')
  const limit = Object.assign(new Error('x'), { name: 'AiLimitError' })
  assert.equal(classifyError(limit), 'limit')
  assert.match(searchErrorMessage(limit), /Daily AI limit/)
  assert.match(searchErrorMessage({ status: 504, code: 'search_timeout' }), /took too long/)
  assert.match(searchErrorMessage({ status: 504 }), /took too long/)
  assert.match(searchErrorMessage({ status: 503, code: 'search_unavailable' }), /unavailable/)
  assert.match(searchErrorMessage({ status: 0, message: 'net' }), /connection/)
  assert.match(searchErrorMessage({ status: 500, message: 'boom' }), /The search failed: boom/)
  assert.match(searchErrorMessage(undefined), /unknown error/)
  assert.equal(noneConfirmedMessage(9).startsWith('The search found 9 places, but none could be confirmed'), true)
  assert.match(noneConfirmedMessage(1), /found 1 place,/)
  assert.match(noneConfirmedMessage(0), /did not return any places/)
  assert.match(draftsFailedMessage(5, 10, limit), /5 of 10 places — daily AI limit reached/)
  assert.match(draftsFailedMessage(1, 1, { status: 504 }), /1 of 1 place — the request timed out/)
})

test('search prompt asks for community pages, not listicles', () => {
  const sp = searchPrompt({ appName: 'Markr', category: 'Productivity', market: 'India', product: 'Growth tool', founder: '', competitorNames: [] })
  assert.ok(sp.includes('site:reddit.com/r/'))
  assert.ok(sp.includes('does NOT confirm them'))
  assert.ok(sp.includes('site:facebook.com/groups <topic> India'))
})

// ── Coverage, links, language, type labels ───────────────────────────────────
import {
  typeFromUrl, placeTypeLabel, allowsPromotion, linkPolicy, linkNote, detectLanguage, draftLanguage, keepOneScript,
  mergePlaces, unconfirmedCandidates, topUpPrompt,
} from '../src/lib/first100.ts'

test('type comes from the confirmed URL: Substack = Newsletter, Discord/Slack = Community, reddit = Subreddit', () => {
  assert.equal(typeFromUrl('https://www.reddit.com/r/SaaS'), 'subreddit')
  assert.equal(typeFromUrl('https://lenny.substack.com'), 'newsletter')
  assert.equal(typeFromUrl('https://substack.com/@someone'), 'newsletter')
  assert.equal(typeFromUrl('https://weekly.beehiiv.com'), 'newsletter')
  assert.equal(typeFromUrl('https://discord.gg/abc'), 'online community')
  assert.equal(typeFromUrl('https://join.slack.com/t/founders'), 'online community')
  assert.equal(typeFromUrl('https://www.indiehackers.com/group/saas'), 'online community')
  assert.equal(typeFromUrl('https://www.facebook.com/groups/123'), 'facebook group')
  assert.equal(typeFromUrl('https://www.linkedin.com/groups/999'), 'linkedin group')
  assert.equal(typeFromUrl('https://www.youtube.com/@chan'), 'creator')
  assert.equal(typeFromUrl('https://forum.example.org'), null)
  // the model said "creator" for a Substack: the URL wins, also for already-saved places
  assert.equal(placeTypeLabel({ type: 'creator', url: 'https://lenny.substack.com' }), 'Newsletter')
  assert.equal(placeTypeLabel({ type: 'online community', url: 'https://discord.gg/x' }), 'Community')
  assert.equal(placeTypeLabel({ type: 'subreddit', url: 'https://www.reddit.com/r/SaaS' }), 'Subreddit')
  assert.equal(placeTypeLabel({ type: 'forum', url: 'https://forum.example.org' }), 'Forum')
  const [p] = normalizePlaces({ places: [place({ type: 'creator', url: 'https://lenny.substack.com', evidence_url: 'https://lenny.substack.com/p/x' })] })
  assert.equal(p.type, 'newsletter')
})

test('link only when sourced rules allow promotion; unknown rules = no link', () => {
  for (const r of ['Self-promotion is allowed on Fridays', 'Feel free to share your project', 'Links are welcome', 'Promoting your startup is encouraged'])
    assert.equal(allowsPromotion(r), true, r)
  for (const r of ['No self-promotion', 'Be kind', 'Links are not allowed', ''])
    assert.equal(allowsPromotion(r), false, r)
  assert.equal(linkPolicy({ value: 'Self-promotion is allowed', source_url: 's' }), 'allowed')
  assert.equal(linkPolicy({ value: 'No self-promotion', source_url: 's' }), 'forbidden')
  assert.equal(linkPolicy({ value: 'Be kind', source_url: 's' }), 'unknown')
  assert.equal(linkPolicy(null), 'unknown')
  const [unknown, allowed] = normalizePlaces({ places: [place(), place({ name: 'B', rules: { value: 'Share your project — self-promotion allowed', source_url: 'https://s' } })] })
  assert.deepEqual([unknown.link_policy, unknown.no_link], ['unknown', true])
  assert.deepEqual([allowed.link_policy, allowed.no_link], ['allowed', false])
  assert.match(linkNote('unknown'), /rules weren't found/)
  assert.match(linkNote('forbidden'), /rules limit promotion/)
  assert.match(linkNote('allowed'), /Link included/)
  // the unknown-rules draft loses its link
  const out = mergeDrafts([unknown, allowed], { drafts: [{ i: 0, text: 'Try it: https://markr.app' }, { i: 1, text: 'Try it: https://markr.app' }] }, [])
  assert.ok(!out[0].draft!.includes('markr.app'))
  assert.ok(out[1].draft!.includes('https://markr.app'))
})

test('language: English unless the community and the app share another language', () => {
  assert.equal(detectLanguage('Track your mood in 10 seconds. Start free'), 'English')
  assert.equal(detectLanguage('अपने मूड को ट्रैक करें'), 'Hindi')
  assert.equal(detectLanguage('Controla tu estado de ánimo con la app para que estés bien'), 'Spanish')
  assert.equal(detectLanguage(''), 'English')
  assert.equal(draftLanguage('Hindi', 'English'), 'English')     // community in Hindi, app in English → English
  assert.equal(draftLanguage('Hindi', 'Hindi'), 'Hindi')
  assert.equal(draftLanguage('hindi', 'Hindi'), 'Hindi')
  assert.equal(draftLanguage('Hinglish', 'Hindi'), 'English')
  assert.equal(draftLanguage('English', 'Hindi'), 'English')
  assert.equal(draftLanguage('', 'Hindi'), 'English')
})

test('never mix scripts in one draft', () => {
  assert.equal(keepOneScript('I built Markr. यह बहुत अच्छा है। What do you use?', 'English'), 'I built Markr. What do you use?')
  // a Hindi draft keeps the app name and the URL in Latin, drops an English sentence
  assert.equal(keepOneScript('मैंने Markr बनाया। Try it now. https://markr.app', 'Hindi', ['Markr']), 'मैंने Markr बनाया। https://markr.app')
  assert.equal(cleanDraft('Hello there. नमस्ते दोस्तों।', false, [], 'English'), 'Hello there.')
  assert.equal(cleanDraft('Prices from ₹49/mo. Ask me anything!', false, [], 'English'), 'Prices from ₹49/mo. Ask me anything!')
})

test('top-up: unconfirmed candidates are searched directly; merged without duplicates', () => {
  const json = { place_check: { proposed: 3, confirmed: 1, dropped: [
    { name: 'r/startups', url: 'https://www.reddit.com/r/startups', reason: 'no returned result in this community' },
    { name: '', url: 'https://x', reason: 'no name' },
  ] } }
  assert.deepEqual(unconfirmedCandidates(json), [{ name: 'r/startups', url: 'https://www.reddit.com/r/startups' }])
  assert.deepEqual(unconfirmedCandidates({}), [])
  const tp = topUpPrompt({ appName: 'Markr', category: 'Productivity', market: 'India', product: 'p',
    confirmed: [{ name: 'r/SaaS', url: 'https://www.reddit.com/r/SaaS' }], unconfirmed: unconfirmedCandidates(json), want: 9 })
  assert.ok(tp.includes('- r/SaaS https://www.reddit.com/r/SaaS'))
  assert.ok(tp.includes('- r/startups'))
  assert.ok(tp.includes('already covered: subreddit'))
  assert.ok(tp.includes('site:linkedin.com/groups') && tp.includes('site:indiehackers.com/group'))
  assert.ok(tp.includes('does NOT confirm them'))
  const a = normalizePlaces({ places: [place()] })
  const b = normalizePlaces({ places: [
    place({ url: 'https://old.reddit.com/r/IndianStartups/' }),      // same community, different spelling → dropped
    place({ name: 'Old', url: 'https://oldforum.example.org', possibly_inactive: true }),
    place({ name: 'New', url: 'https://www.indiehackers.com/group/saas' }),
  ] })
  assert.deepEqual(mergePlaces(a, b).map(p => p.name), ['r/IndianStartups', 'New', 'Old'])
})

test('search prompt covers Reddit, LinkedIn groups, Indie Hackers and more, one platform per query', () => {
  const sp = searchPrompt({ appName: 'Markr', category: 'Productivity', market: 'India', product: 'p', founder: '', competitorNames: [] })
  for (const q of ['site:reddit.com/r/', 'site:linkedin.com/groups', 'site:indiehackers.com/group', 'site:facebook.com/groups', 'site:substack.com', 'discord invite'])
    assert.ok(sp.includes(q), q)
})

test('draft prompt gives each place its language and link status', () => {
  const ps = normalizePlaces({ places: [
    place({ language: 'Hindi' }),
    place({ name: 'B', rules: { value: 'Self-promotion is allowed', source_url: 'https://s' } }),
  ] })
  const en = draftPrompt({ appName: 'Markr', appUrl: 'https://markr.app', product: 'p', founder: '', places: ps, startIndex: 0, appLanguage: 'English' })
  assert.ok(en.includes('0. r/IndianStartups (subreddit) — write in English'))
  assert.ok(en.includes('— NO LINK'))
  assert.ok(en.includes('1. B (subreddit) — write in English — rules: Self-promotion is allowed — link allowed'))
  assert.ok(en.includes('Never mix scripts'))
  const hi = draftPrompt({ appName: 'Markr', appUrl: '', product: 'p', founder: '', places: ps, startIndex: 0, appLanguage: 'Hindi' })
  assert.ok(hi.includes('0. r/IndianStartups (subreddit) — write in Hindi'))
})
