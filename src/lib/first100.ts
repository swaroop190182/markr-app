// "Where your first 100 users are" — real public communities found by live web search, plus
// draft posts the founder publishes manually. Markr never posts.
// Pure (no runtime imports) so it can be unit-tested (tests/first100.test.ts).
// The server (api/_lib/sources.ts keepReturnedPlaces) has already dropped any place whose URL
// wasn't a returned search result, and any rules/members whose source wasn't one.

export type PlaceType = 'subreddit' | 'facebook group' | 'linkedin group' | 'forum' | 'newsletter' | 'online community' | 'creator'
export type Sourced = { value: string; source_url: string } | null
// allowed = sourced rules allow promotion · forbidden = sourced rules limit it · unknown = rules not found
export type LinkPolicy = 'allowed' | 'forbidden' | 'unknown'

export interface First100Place {
  name: string
  type: PlaceType
  url: string                  // community root, rebuilt server-side from a returned result
  evidence_url: string         // the returned result that confirmed it
  why: string                  // ≤20 words
  rules: Sourced               // posting rules, only if sourced
  members: Sourced             // member/subscriber count, only if sourced
  language: string             // language most of the community's own pages are written in (model's read)
  last_seen: string | null     // newest page_age among matching results
  possibly_inactive: boolean   // evidence older than ~2 years
  draft: string | null         // filled by the draft calls
  link_policy: LinkPolicy
  no_link: boolean             // link_policy !== 'allowed' → draft carries no link
}

export interface First100Section {
  places: First100Place[]
  market: string
  generated_at: string
}

export const FIRST100_MAX_USES = 10   // searches per place-finding call
export const TOPUP_BELOW = 6          // a second, targeted search call runs only if fewer places were confirmed
export const MAX_PLACES = 10
export const DRAFT_BATCH = 5          // places per draft call (2 calls for up to 10 places)
export const FIRST100_CALLS = 4       // upper bound shown in the confirm panel: 2 searches + 2 draft calls
export const FIRST100_SEARCHES = 2 * FIRST100_MAX_USES

const PLACE_TYPES: PlaceType[] = ['subreddit', 'facebook group', 'linkedin group', 'forum', 'newsletter', 'online community', 'creator']
const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : ''
const words = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(' ')

// ── Type from the confirmed URL ──────────────────────────────────────────────
const host = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^(www|old|new|np|m)\./, '') } catch { return '' } }
const path0 = (u: string) => { try { return new URL(u).pathname.split('/').filter(Boolean)[0] ?? '' } catch { return '' } }
const NEWSLETTER_HOSTS = /(^|\.)(substack\.com|beehiiv\.com|buttondown\.(email|com)|ghost\.io|mailchimp\.com|convertkit\.com|kit\.com|revue\.co|tinyletter\.com)$/
const COMMUNITY_HOSTS  = /(^|\.)(discord\.gg|discord\.com|slack\.com|t\.me|telegram\.me|chat\.whatsapp\.com|circle\.so|skool\.com|indiehackers\.com|groups\.google\.com|mighty\.network|geneva\.com)$/
const CREATOR_HOSTS    = /(^|\.)(youtube\.com|x\.com|twitter\.com|instagram\.com|threads\.net|tiktok\.com)$/

// The place type implied by its (server-confirmed) URL, or null when the URL doesn't say
export function typeFromUrl(url: string): PlaceType | null {
  const h = host(url)
  if (!h) return null
  if (/(^|\.)reddit\.com$/.test(h) && path0(url) === 'r') return 'subreddit'
  if (/(^|\.)facebook\.com$/.test(h) && path0(url) === 'groups') return 'facebook group'
  if (/(^|\.)linkedin\.com$/.test(h) && path0(url) === 'groups') return 'linkedin group'
  if (NEWSLETTER_HOSTS.test(h)) return 'newsletter'
  if (COMMUNITY_HOSTS.test(h)) return 'online community'
  if (CREATOR_HOSTS.test(h)) return 'creator'
  return null
}

const TYPE_LABEL: Record<PlaceType, string> = {
  'subreddit': 'Subreddit', 'facebook group': 'Facebook group', 'linkedin group': 'LinkedIn group', 'forum': 'Forum',
  'newsletter': 'Newsletter', 'online community': 'Community', 'creator': 'Creator',
}
// Label shown on the card — from the URL when it says, so older saved places are labelled right too
export const placeTypeLabel = (p: { type: string; url: string }): string =>
  TYPE_LABEL[typeFromUrl(p.url) ?? (PLACE_TYPES.includes(p.type as PlaceType) ? p.type as PlaceType : 'online community')]

// ── Links: only when sourced rules allow promotion ───────────────────────────
// Sourced rules that forbid self-promotion or links
export function forbidsPromotion(rules: string | null | undefined): boolean {
  if (!rules) return false
  return /\b(no|not allowed|prohibited|banned|forbidden|don't|do not)\b[^.]{0,40}\b(self[- ]?promo\w*|promotion\w*|advertis\w*|links?|spam|marketing)\b/i.test(rules)
      || /\b(self[- ]?promo\w*|promotion\w*|advertis\w*|links?)\b[^.]{0,30}\b(not allowed|prohibited|banned|forbidden|will be removed)\b/i.test(rules)
}

// Sourced rules that say promotion / sharing your product or links is allowed
export function allowsPromotion(rules: string | null | undefined): boolean {
  if (!rules || forbidsPromotion(rules)) return false
  return /\b(self[- ]?promo\w*|promotion\w*|promote|promoting|links?|sharing your (product|project|app|work|startup)|share your (product|project|app|work|startup))\b[^.]{0,40}\b(allowed|welcome|permitted|ok|okay|fine|encouraged)\b/i.test(rules)
      || /\b(allowed|welcome|permitted|encouraged|feel free)\b[^.]{0,30}\b(self[- ]?promo\w*|promot\w*|share your (product|project|app|work|startup)|post your (product|project|app|startup)|links?)\b/i.test(rules)
}

export function linkPolicy(rules: Sourced | undefined): LinkPolicy {
  if (!rules?.value) return 'unknown'
  return allowsPromotion(rules.value) ? 'allowed' : forbidsPromotion(rules.value) ? 'forbidden' : 'unknown'
}

// What the card says about the link
export function linkNote(policy: LinkPolicy): string {
  return policy === 'allowed'   ? 'Link included — this community\'s rules allow promotion.'
       : policy === 'forbidden' ? 'No link — this community\'s rules limit promotion. The draft offers value or asks a question instead.'
       :                          'No link — this community\'s rules weren\'t found, so the draft offers value or asks a question instead.'
}

// ── Language: English unless the community and the app share another language ──
const SCRIPT_LANGS: Array<[RegExp, string]> = [
  [/\p{Script=Devanagari}/u, 'Hindi'], [/\p{Script=Bengali}/u, 'Bengali'], [/\p{Script=Tamil}/u, 'Tamil'],
  [/\p{Script=Telugu}/u, 'Telugu'], [/\p{Script=Kannada}/u, 'Kannada'], [/\p{Script=Malayalam}/u, 'Malayalam'],
  [/\p{Script=Gujarati}/u, 'Gujarati'], [/\p{Script=Gurmukhi}/u, 'Punjabi'], [/\p{Script=Arabic}/u, 'Arabic'],
  [/\p{Script=Cyrillic}/u, 'Russian'], [/\p{Script=Hangul}/u, 'Korean'], [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'Japanese'],
  [/\p{Script=Han}/u, 'Chinese'], [/\p{Script=Thai}/u, 'Thai'], [/\p{Script=Hebrew}/u, 'Hebrew'], [/\p{Script=Greek}/u, 'Greek'],
]
const LATIN_STOPWORDS: Record<string, string[]> = {
  English:    ['the', 'and', 'your', 'with', 'for', 'you', 'to', 'of', 'is', 'in'],
  Spanish:    ['el', 'la', 'los', 'las', 'tu', 'con', 'para', 'que', 'es', 'en', 'y', 'de'],
  Portuguese: ['o', 'os', 'as', 'seu', 'sua', 'com', 'para', 'que', 'é', 'em', 'e', 'de', 'você'],
  French:     ['le', 'la', 'les', 'votre', 'avec', 'pour', 'que', 'est', 'et', 'de', 'vous'],
  German:     ['der', 'die', 'das', 'und', 'mit', 'für', 'ist', 'dein', 'ihr', 'sie', 'zu'],
  Indonesian: ['dan', 'yang', 'untuk', 'dengan', 'anda', 'kamu', 'ini', 'di', 'ke'],
}

// Language of a piece of text: a non-Latin script decides it; Latin text is matched on common words. Default English.
export function detectLanguage(text: string): string {
  const letters = text.match(/\p{L}/gu) ?? []
  if (!letters.length) return 'English'
  for (const [re, lang] of SCRIPT_LANGS) {
    const n = letters.filter(ch => re.test(ch)).length
    if (n / letters.length > 0.5) return lang
  }
  const toks = text.toLowerCase().match(/\p{L}+/gu) ?? []
  let best = 'English', bestN = 0
  for (const [lang, sw] of Object.entries(LATIN_STOPWORDS)) {
    const n = toks.filter(t => sw.includes(t)).length
    if (n > bestN || (n === bestN && lang === 'English')) { best = lang; bestN = n }
  }
  return bestN >= 2 ? best : 'English'
}

const norm = (s: string) => s.trim().toLowerCase()
// Drafts are in English, unless the community's own pages are mostly in another language AND that is the app's primary language
export const draftLanguage = (placeLanguage: string, appLanguage: string): string =>
  placeLanguage && norm(placeLanguage) !== 'english' && norm(placeLanguage) === norm(appLanguage) ? appLanguage : 'English'

// Letters allowed in a draft of a given language (one script per draft)
const LANG_SCRIPT: Record<string, RegExp> = Object.fromEntries([
  ...SCRIPT_LANGS.map(([re, lang]) => [lang, re]),
  ...Object.keys(LATIN_STOPWORDS).map(lang => [lang, /\p{Script=Latin}/u]),
]) as Record<string, RegExp>
const LATIN = /\p{Script=Latin}/u

// Keep only sentences written in the draft's script. The app name, URLs and @handles may stay in Latin.
export function keepOneScript(text: string, language: string, allowLatin: string[] = []): string {
  const script = LANG_SCRIPT[language] ?? LATIN
  const lines = text.split('\n').map(line => line.split(/(?<=[.!?।])\s+/).filter(s => {
    let t = s.replace(/https?:\/\/\S+|www\.\S+|@\w+/g, '')
    for (const a of allowLatin) if (a.trim()) t = t.split(a).join('')
    const letters = t.match(/\p{L}/gu) ?? []
    return letters.every(ch => script.test(ch))
  }).join(' '))
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ── Call 1 (+ optional top-up): find places (web search) ─────────────────────
export const SEARCH_SYSTEM = 'You are a careful community researcher. Use web search. Output ONLY valid JSON, no markdown.'

const PLATFORM_QUERIES = (market: string) => `- Reddit: site:reddit.com/r/ <topic>
- LinkedIn groups: site:linkedin.com/groups <topic>
- Indie Hackers: site:indiehackers.com/group <topic>
- Facebook groups: site:facebook.com/groups <topic> ${market}
- Newsletters: <topic> newsletter site:substack.com (or beehiiv.com)
- Discord / Slack: <topic> discord invite, <topic> slack community join
- Forums: <topic> forum ${market}`

const PLACE_RULES = `RULES:
- An article listing communities ("best subreddits for…") does NOT confirm them. If one names a community, search for that community's own page (e.g. "r/Name" or the group's exact name) and list it only if its own page or a post inside it appears in your results.
- Only list a place whose own page, or a post inside it, appeared in a search result in this conversation. Its "url" must be that community's own URL taken from that result (for a post inside a subreddit, give https://www.reddit.com/r/Name), never a guess.
- Leave out anything you could not confirm — fewer confirmed places are better than more guessed ones.
- Never invent a community, a member count or a rule. If you did not find the posting rules or the member count in a search result, use null.
- "rules" and "members" are {"value": "...", "source_url": "<the search result URL where you saw it>"} or null. "rules" = a one-line summary of what the rules say about self-promotion/links.
- "language" = the language most posts on the community's own pages are written in.
- "why" ≤20 words: why this audience matches this app.

Return JSON only:
{"places":[{"name":"r/Name","type":"subreddit","url":"https://www.reddit.com/r/Name","why":"...","rules":{"value":"No self-promotion except in weekly thread","source_url":"https://..."},"members":null,"language":"English"}]}`

export function searchPrompt(c: {
  appName: string; category: string; market: string
  product: string                // screenshot product summary / description
  founder: string                // getFounderContext output (may be '')
  competitorNames: string[]      // names only — to find where their users talk, never to mention
}): string {
  return `Find 8-10 REAL public online places where the target users of this app already gather and where a founder could post helpfully.

APP: ${c.appName} (${c.category})
PRODUCT: ${c.product}
${c.founder ? c.founder + '\n' : ''}PRIMARY MARKET: ${c.market}
${c.competitorNames.length ? `Similar products (use only to find where these users talk; never name them in output): ${c.competitorNames.join(', ')}\n` : ''}
Places can be: subreddit, facebook group, linkedin group, forum, newsletter, online community (Discord/Slack/Telegram/Indie Hackers group…), creator (YouTube/Instagram/X account whose audience matches).

HOW TO SEARCH — search for the community pages themselves, one platform per query, not for articles about communities. Cover these platforms:
${PLATFORM_QUERIES(c.market)}
Order: places in the primary market first, then global ones.

${PLACE_RULES}`
}

// Second search call, only when the first confirmed fewer than TOPUP_BELOW places: confirm the
// candidates the first call named but couldn't confirm, and cover platforms it didn't reach.
export function topUpPrompt(c: {
  appName: string; category: string; market: string; product: string
  confirmed: Array<{ name: string; url: string }>
  unconfirmed: Array<{ name: string; url: string }>
  want: number
}): string {
  const reached = new Set(c.confirmed.map(p => typeFromUrl(p.url)).filter(Boolean))
  return `Find up to ${c.want} MORE real public online places where the target users of this app gather. Search for each community's own page.

APP: ${c.appName} (${c.category})
PRODUCT: ${c.product}
PRIMARY MARKET: ${c.market}

ALREADY CONFIRMED (do not list again):
${c.confirmed.length ? c.confirmed.map(p => `- ${p.name} ${p.url}`).join('\n') : '- none'}

${c.unconfirmed.length ? `NAMED EARLIER BUT NOT CONFIRMED — their own pages did not appear in the results. Search for each one's own page directly (e.g. "r/Name" site:reddit.com, or the group's exact name with site:facebook.com/groups):
${c.unconfirmed.map(p => `- ${p.name}${p.url ? ' (' + p.url + ')' : ''}`).join('\n')}

` : ''}THEN cover these platforms${reached.size ? ` (already covered: ${[...reached].join(', ')})` : ''}, one platform per query:
${PLATFORM_QUERIES(c.market)}

${PLACE_RULES}`
}

// Stable key for a confirmed community URL (host without www/old + path, lower case)
export const placeKey = (url: string): string => { try { const u = new URL(url); return host(url) + u.pathname.replace(/\/+$/, '').toLowerCase() } catch { return url.toLowerCase() } }

// First call's places, then new ones from the top-up (no duplicates); may-be-inactive last; at most MAX_PLACES
export function mergePlaces(first: First100Place[], more: First100Place[]): First100Place[] {
  const seen = new Set(first.map(p => placeKey(p.url)))
  const all = [...first, ...more.filter(p => { const k = placeKey(p.url); if (seen.has(k)) return false; seen.add(k); return true })]
  return [...all.filter(p => !p.possibly_inactive), ...all.filter(p => p.possibly_inactive)].slice(0, MAX_PLACES)
}

// Keep only well-formed places, with the fields the UI expects (server already checked URLs/sources)
export function normalizePlaces(json: any): First100Place[] {
  if (!Array.isArray(json?.places)) return []
  const sourced = (v: any): Sourced =>
    v && typeof v.value === 'string' && v.value.trim() && typeof v.source_url === 'string' ? { value: str(v.value, 200), source_url: v.source_url } : null
  return json.places
    .filter((p: any) => p && typeof p.name === 'string' && p.name.trim() && typeof p.url === 'string' && typeof p.evidence_url === 'string')
    .slice(0, MAX_PLACES)
    .map((p: any): First100Place => {
      const rules = sourced(p.rules)
      const policy = linkPolicy(rules)
      return {
        name: str(p.name, 80),
        type: typeFromUrl(p.url) ?? (PLACE_TYPES.includes(p.type) ? p.type : 'online community'),   // the confirmed URL decides when it can
        url: p.url,
        evidence_url: p.evidence_url,
        why: words(str(p.why, 300), 20),
        rules,
        members: sourced(p.members),
        language: str(p.language, 30) || 'English',
        last_seen: typeof p.last_seen === 'string' ? p.last_seen : null,
        possibly_inactive: p.possibly_inactive === true,
        draft: null,
        link_policy: policy,
        no_link: policy !== 'allowed',
      }
    })
}

// The places the server dropped as "no returned result in this community" — worth a direct search
export function unconfirmedCandidates(json: any): Array<{ name: string; url: string }> {
  const d = Array.isArray(json?.place_check?.dropped) ? json.place_check.dropped : []
  return d.filter((x: any) => x && typeof x.name === 'string' && x.name.trim() && x.reason !== 'no name')
    .map((x: any) => ({ name: str(x.name, 80), url: str(x.url, 200) })).slice(0, 8)
}

// ── Draft calls (no search) ──────────────────────────────────────────────────
export const DRAFT_SYSTEM = 'You write as the founder, in first person. Output ONLY valid JSON, no markdown.'

// indexes: each place's position in the saved list (defaults to startIndex + i) — drafts come back keyed by it
export function draftPrompt(c: {
  appName: string; appUrl: string; product: string; founder: string; places: First100Place[]; startIndex: number; indexes?: number[]
  appLanguage?: string
}): string {
  const at = (i: number) => c.indexes?.[i] ?? c.startIndex + i
  const appLang = c.appLanguage ?? 'English'
  const list = c.places.map((p, i) =>
    `${at(i)}. ${p.name} (${p.type}) — write in ${draftLanguage(p.language, appLang)}${p.rules ? ` — rules: ${p.rules.value}` : ' — rules unknown'}${p.no_link ? ' — NO LINK' : ' — link allowed'}`).join('\n')
  return `Write one draft post per place below, for the founder of ${c.appName} to post themselves.

PRODUCT: ${c.product}
${c.founder ? c.founder + '\n' : ''}APP URL: ${c.appUrl || '(none)'}

PLACES:
${list}

RULES:
- First person as the founder ("I built…"). Value first: share a lesson, a question or something useful to this audience; mention the app briefly and honestly. No hard sell, no hype.
- Adapt to the place: subreddit/forum → a discussion post with a title line; facebook/linkedin group → a short friendly post; newsletter/creator → a short pitch email to the owner asking if it fits their audience; online community → a short intro message.
- Write each draft entirely in the language given for that place. Never mix scripts or languages in one draft.
- Never name competitors or other products. Never invent numbers, user counts, quotes, testimonials or results.
- NO LINK places: no URL or domain at all. Offer something useful or ask the community a genuine question instead; the app may be named once in passing.
- "link allowed" places: the app URL may appear once, at the end.
- ≤150 words each.

Return JSON only, "i" = the place's number above: {"drafts":[{"i":${at(0)},"text":"..."}]}`
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|app|io|ai|co|in|org|net)(?:\/\S*)?\b/gi
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Enforce in code what the prompt asks: no links where not allowed; no competitor names (the sentence
// naming one is removed); one script per draft (sentences in another script are removed).
export function cleanDraft(text: unknown, noLink: boolean, competitorNames: string[], language = 'English', appName = ''): string | null {
  let t = typeof text === 'string' ? text.trim() : ''
  if (!t) return null
  if (noLink) t = t.replace(URL_RE, '').replace(/\(\s*\)/g, '')
  const names = competitorNames.map(n => n.trim()).filter(n => n.length >= 3)
  if (names.length) {
    const re = new RegExp('\\b(' + names.map(escapeRe).join('|') + ')\\b', 'i')
    t = t.split(/(?<=[.!?])\s+|\n/).filter(s => !re.test(s)).join(' ')
  }
  t = keepOneScript(t, language, appName ? [appName] : [])
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?])/g, '$1').trim()
  return t || null
}

// Attach drafts ({i, text}) to places by index
export function mergeDrafts(places: First100Place[], json: any, competitorNames: string[], appLanguage = 'English', appName = ''): First100Place[] {
  const drafts = Array.isArray(json?.drafts) ? json.drafts : []
  return places.map((p, i) => {
    const d = drafts.find((x: any) => Number(x?.i) === i)
    return d ? { ...p, draft: cleanDraft(d.text, p.no_link, competitorNames, draftLanguage(p.language, appLanguage), appName) } : p
  })
}

// ── Storage inside gtm_analysis ──────────────────────────────────────────────
export function readFirst100(gtmRaw: string | null | undefined): First100Section | null {
  try {
    const s = gtmRaw ? JSON.parse(gtmRaw)?.first100 : null
    return s && Array.isArray(s.places) ? s : null
  } catch { return null }
}

// genMarketingAll replaces the whole GTM JSON — carry the existing section over
export function carryFirst100<T extends object>(prevGtmRaw: string | null | undefined, next: T): T & { first100?: First100Section } {
  const s = readFirst100(prevGtmRaw)
  return s ? { ...next, first100: s } : next
}

// Section-level outdated check: ran before the brief or screenshots last changed
export function isFirst100Outdated(s: First100Section | null, inputsChangedAt: number | null): boolean {
  const ran = s ? Date.parse(s.generated_at) : NaN
  return Number.isFinite(ran) && inputsChangedAt !== null && ran < inputsChangedAt
}

// ── What the user sees for each outcome (never fail silently) ────────────────
// Errors are matched by shape (name / status / code) so this module stays free of runtime imports.
export type RunFailure = 'limit' | 'timeout' | 'unavailable' | 'network' | 'other'

export function classifyError(e: any): RunFailure {
  if (e?.name === 'AiLimitError' || e?.status === 429) return 'limit'
  if (e?.code === 'search_timeout' || e?.status === 504) return 'timeout'
  if (e?.code === 'search_unavailable' || e?.status === 503) return 'unavailable'
  if (e?.status === 0) return 'network'
  return 'other'
}

export function searchErrorMessage(e: any): string {
  switch (classifyError(e)) {
    case 'limit':       return 'Daily AI limit reached — try again tomorrow or upgrade your plan.'
    case 'timeout':     return 'Live search took too long and was stopped. Nothing was saved — please try again.'
    case 'unavailable': return 'Live search is unavailable right now. Nothing was saved — please try again later.'
    case 'network':     return 'Could not reach Markr — check your connection and try again.'
    default:            return `The search failed: ${typeof e?.message === 'string' && e.message ? e.message : 'unknown error'}. Nothing was saved — please try again.`
  }
}

// The search ran but nothing survived the check (proposed = places the model listed before it)
export function noneConfirmedMessage(proposed: number): string {
  return proposed > 0
    ? `The search found ${proposed} place${proposed === 1 ? '' : 's'}, but none could be confirmed by a returned search result, so nothing was saved. Retrying often finds different results.`
    : 'The search did not return any places, so nothing was saved. Please try again.'
}

export function draftsFailedMessage(failed: number, total: number, e: any): string {
  const why = classifyError(e) === 'limit' ? ' — daily AI limit reached' : classifyError(e) === 'timeout' ? ' — the request timed out' : ''
  return `Drafts could not be written for ${failed} of ${total} place${total === 1 ? '' : 's'}${why}. The places are saved; use "Write missing drafts" to try again.`
}
