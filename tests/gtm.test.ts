// Go-to-Market plan in three parts (src/lib/gtm.ts).
// Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GTM_PARTS, GTM_PART_INFO, gtmMandatory, channelsPrompt, templatesPrompt, playbookPrompt, parseGtmPart,
  stripUnsourcedFigures, stripNamedCommunities, isLegacyPlaybook, startRun, applyPart, failPart, missingParts, isRunComplete, readGtm,
} from '../src/lib/gtm.ts'

const ctx = (mandatory: string[] = []) => ({
  appName: 'Markr', category: 'Productivity', context: 'APP: "Markr"\n  Overall score: 5/10\n  Competitor price ₹499/mo',
  targetUser: 'indie founders', currencyRule: 'CURRENCY RULE: keep currencies.', mandatory,
})

test('each part is sized well under the 60s limit and logged under its own feature', () => {
  assert.deepEqual(GTM_PARTS, ['channels', 'templates', 'playbook'])
  assert.deepEqual(GTM_PARTS.map(p => GTM_PART_INFO[p].feature), ['gtm_channels', 'gtm_templates', 'gtm_playbook'])
  for (const p of GTM_PARTS) assert.ok(GTM_PART_INFO[p].maxTokens <= 3000, p)
})

test('mandatory findings go to the part that uses them', () => {
  const m = gtmMandatory(
    { overall: 5, dimensions: [{ label: 'Trust', score: 4 }, { label: 'Conversion Readiness', score: 3 }], bottleneck: { label: 'Trust', issue: 'no reviews' } },
    { comps: [{ positioningGap: 'no free tier' }], winCond: 'be fastest' },
    { opportunities: [{ title: 'Students' }] })
  assert.equal(m.channels.length, 3)            // page below 7, trust, competitor gap
  assert.equal(m.templates.length, 0)
  assert.equal(m.playbook.length, 4)            // conversion, bottleneck, win condition, SWOT opportunity
  assert.deepEqual(gtmMandatory(null, null, null), { channels: [], templates: [], playbook: [] })
})

test('prompts: shared context, own JSON shape, no communities from memory, patterns not case studies', () => {
  const c = channelsPrompt(ctx(['Page is 5/10']))
  assert.ok(c.includes('Overall score: 5/10') && c.includes('- Page is 5/10') && c.includes('"channels"'))
  assert.ok(c.includes('Never name a specific subreddit') && !c.includes('real subreddit'))
  const t = templatesPrompt(ctx())
  assert.ok(t.includes('"templates"') && !t.includes('"subreddit"'))
  const p = playbookPrompt(ctx())
  assert.ok(p.includes('"categoryPlaybook"') && p.includes('"pattern"') && !p.includes('"company"') && !p.includes('real compan'))
  assert.ok(p.includes('Do not name companies'))
  for (const x of [c, t, p]) assert.ok(x.includes('CURRENCY RULE'))
})

test('figures not in the context are removed from the playbook; context figures stay', () => {
  const r = stripUnsourcedFigures('Referral loops work early. One app grew 300% in 2021. Pricing at ₹499/mo anchors well. Reached 10,000 users fast.', ctx().context)
  assert.equal(r.text, 'Referral loops work early. Pricing at ₹499/mo anchors well.')
  assert.equal(r.removed, 2)
})

test('named subreddits are replaced with generic wording', () => {
  assert.equal(stripNamedCommunities('Post in r/SaaS and r/startups'), 'Post in a relevant subreddit and a relevant subreddit')
  assert.equal(stripNamedCommunities('Share it (r/IndieHackers) today'), 'Share it (a relevant subreddit) today')
  assert.equal(stripNamedCommunities('Use a b/r test'), 'Use a b/r test')
})

test('parseGtmPart validates and cleans each part', () => {
  assert.throws(() => parseGtmPart('channels', {}, ''), /no channels/)
  assert.throws(() => parseGtmPart('templates', { templates: {} }, ''), /no templates/)
  assert.throws(() => parseGtmPart('playbook', { foo: 1 }, ''), /no playbook/)
  const ch = parseGtmPart('channels', { channels: [{ name: 'Reddit', firstAction: 'Post in r/SaaS' }, {}, {}, {}] }, '')
  assert.equal(ch.data.length, 3)
  assert.equal(ch.data[0].firstAction, 'Post in a relevant subreddit')
  const tp = parseGtmPart('templates', { templates: { coldDM: 'Hi', redditPost: { subreddit: 'r/SaaS', title: 't', body: 'b' } } }, '')
  assert.deepEqual(tp.data.redditPost, { title: 't', body: 'b' })
  const pb = parseGtmPart('playbook', { playbook: {
    categoryPlaybook: [{ pattern: 'Founder-led content', what: 'Write weekly. Acme grew 5x in 2020.', when: 'pre-seed', why: 'trust' }],
    whatNotToDo: [], marketingFormula: [{ step: 1, action: 'Fix the page' }], eternalPrinciples: [],
  } }, '')
  assert.equal(pb.data.categoryPlaybook[0].what, 'Write weekly.')
  assert.equal(pb.removedFigures, 1)
})

test('old saved playbooks with named companies are recognised', () => {
  assert.equal(isLegacyPlaybook({ categoryPlaybook: [{ company: 'Calm', what: 'x', results: '10M users' }] }), true)
  assert.equal(isLegacyPlaybook({ categoryPlaybook: [{ pattern: 'x', what: 'y' }] }), false)
  assert.equal(isLegacyPlaybook(null), false)
})

test('run bookkeeping: parts saved as they finish, first100 kept, failed part keeps its previous version', () => {
  const prev = JSON.stringify({ channels: ['old channels'], templates: { coldDM: 'old' }, playbook: { old: true }, first100: { places: [1] }, _markr_ctx: 2 })
  let o = startRun(prev, GTM_PARTS, 'run1', '2026-11-16T00:00:00Z', { generatedAtScore: 5 })
  assert.deepEqual(o.first100, { places: [1] })
  assert.equal(o.generatedAtScore, 5)
  assert.deepEqual(missingParts(o), GTM_PARTS)
  assert.equal(isRunComplete(o), false)
  o = applyPart(o, 'channels', ['new channels'])
  o = failPart(o, 'templates', 'timed out')
  o = applyPart(o, 'playbook', { new: true })
  assert.deepEqual(o.channels, ['new channels'])
  assert.deepEqual(o.templates, { coldDM: 'old' })          // previous version kept
  assert.deepEqual(missingParts(o), ['templates'])
  assert.equal(o._gtm_run.errors.templates, 'timed out')
  assert.equal(isRunComplete(o), false)
  // Retry the missing part only
  o = applyPart(o, 'templates', { coldDM: 'new' })
  assert.deepEqual(missingParts(o), [])
  assert.equal(o._gtm_run.errors.templates, undefined)
  assert.equal(isRunComplete(o), true)
  assert.deepEqual(o.first100, { places: [1] })
})

test('playbook-only run covers just that part', () => {
  let o = startRun(JSON.stringify({ channels: ['c'] }), ['playbook'], 'r2')
  assert.deepEqual(missingParts(o), ['playbook'])
  o = applyPart(o, 'playbook', { p: 1 })
  assert.equal(isRunComplete(o), true)
  assert.deepEqual(o.channels, ['c'])
  assert.equal(isRunComplete(readGtm(JSON.stringify({ channels: [] }))), false)   // no run recorded
  assert.deepEqual(readGtm('not json'), {})
})
