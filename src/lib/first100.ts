// "Where your first 100 users are" — real public communities found by live web search, plus
// draft posts the founder publishes manually. Markr never posts.
// Pure (no runtime imports) so it can be unit-tested (tests/first100.test.ts).
// The server (api/_lib/sources.ts keepReturnedPlaces) has already dropped any place whose URL
// wasn't a returned search result, and any rules/members whose source wasn't one.

export type PlaceType = 'subreddit' | 'facebook group' | 'forum' | 'newsletter' | 'online community' | 'creator'
export type Sourced = { value: string; source_url: string } | null

export interface First100Place {
  name: string
  type: PlaceType
  url: string                  // community root, rebuilt server-side from a returned result
  evidence_url: string         // the returned result that confirmed it
  why: string                  // ≤20 words
  rules: Sourced               // posting rules, only if sourced
  members: Sourced             // member/subscriber count, only if sourced
  language: string
  last_seen: string | null     // newest page_age among matching results
  possibly_inactive: boolean   // evidence older than ~2 years
  draft: string | null         // filled by the draft calls
  no_link: boolean             // rules forbid promotion/links → draft carries no link
}

export interface First100Section {
  places: First100Place[]
  market: string
  generated_at: string
}

export const FIRST100_MAX_USES = 10   // searches in the one place-finding call
export const DRAFT_BATCH = 5          // places per draft call (2 calls for up to 10 places)
export const FIRST100_CALLS = 3       // upper bound shown in the confirm panel

const PLACE_TYPES: PlaceType[] = ['subreddit', 'facebook group', 'forum', 'newsletter', 'online community', 'creator']
const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : ''
const words = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(' ')

// ── Call 1: find places (web search) ─────────────────────────────────────────
export const SEARCH_SYSTEM = 'You are a careful community researcher. Use web search. Output ONLY valid JSON, no markdown.'

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
Places can be: subreddit, facebook group, forum, newsletter, online community (Discord/Slack/Telegram/Indie Hackers group…), creator (YouTube/Instagram/X/Substack account whose audience matches).

RULES:
- Use web search. Only list a place you saw in a search result in this conversation. Its "url" must be that community's own URL (e.g. https://www.reddit.com/r/Name), never a guess.
- Never invent a community, a member count or a rule. If you did not find the posting rules or the member count in a search result, use null.
- "rules" and "members" are {"value": "...", "source_url": "<the search result URL where you saw it>"} or null. "rules" = a one-line summary of what the rules say about self-promotion/links.
- Order: places in the primary market and its main language first, then global English ones.
- "why" ≤20 words: why this audience matches this app.

Return JSON only:
{"places":[{"name":"r/Name","type":"subreddit","url":"https://www.reddit.com/r/Name","why":"...","rules":{"value":"No self-promotion except in weekly thread","source_url":"https://..."},"members":null,"language":"English"}]}`
}

// Keep only well-formed places, with the fields the UI expects (server already checked URLs/sources)
export function normalizePlaces(json: any): First100Place[] {
  if (!Array.isArray(json?.places)) return []
  const sourced = (v: any): Sourced =>
    v && typeof v.value === 'string' && v.value.trim() && typeof v.source_url === 'string' ? { value: str(v.value, 200), source_url: v.source_url } : null
  return json.places
    .filter((p: any) => p && typeof p.name === 'string' && p.name.trim() && typeof p.url === 'string' && typeof p.evidence_url === 'string')
    .slice(0, 10)
    .map((p: any) => {
      const rules = sourced(p.rules)
      return {
        name: str(p.name, 80),
        type: PLACE_TYPES.includes(p.type) ? p.type : 'online community',
        url: p.url,
        evidence_url: p.evidence_url,
        why: words(str(p.why, 300), 20),
        rules,
        members: sourced(p.members),
        language: str(p.language, 30) || 'English',
        last_seen: typeof p.last_seen === 'string' ? p.last_seen : null,
        possibly_inactive: p.possibly_inactive === true,
        draft: null,
        no_link: forbidsPromotion(rules?.value),
      }
    })
}

// Sourced rules that forbid self-promotion or links → the draft must not carry a link
export function forbidsPromotion(rules: string | null | undefined): boolean {
  if (!rules) return false
  return /\b(no|not allowed|prohibited|banned|forbidden|don't|do not)\b[^.]{0,40}\b(self[- ]?promo\w*|promotion\w*|advertis\w*|links?|spam|marketing)\b/i.test(rules)
      || /\b(self[- ]?promo\w*|promotion\w*|advertis\w*|links?)\b[^.]{0,30}\b(not allowed|prohibited|banned|forbidden|will be removed)\b/i.test(rules)
}

// ── Calls 2-3: draft posts (no search) ───────────────────────────────────────
export const DRAFT_SYSTEM = 'You write as the founder, in first person. Output ONLY valid JSON, no markdown.'

// indexes: each place's position in the saved list (defaults to startIndex + i) — drafts come back keyed by it
export function draftPrompt(c: { appName: string; appUrl: string; product: string; founder: string; places: First100Place[]; startIndex: number; indexes?: number[] }): string {
  const at = (i: number) => c.indexes?.[i] ?? c.startIndex + i
  const list = c.places.map((p, i) =>
    `${at(i)}. ${p.name} (${p.type}, ${p.language})${p.rules ? ` — rules: ${p.rules.value}` : ' — rules unknown'}${p.no_link ? ' — NO LINK' : ''}`).join('\n')
  return `Write one draft post per place below, for the founder of ${c.appName} to post themselves.

PRODUCT: ${c.product}
${c.founder ? c.founder + '\n' : ''}APP URL: ${c.appUrl || '(none)'}

PLACES:
${list}

RULES:
- First person as the founder ("I built…"). Value first: share a lesson, a question or something useful to this audience; mention the app briefly and honestly. No hard sell, no hype.
- Adapt to the place: subreddit/forum → a discussion post with a title line; facebook group → a short friendly post; newsletter/creator → a short pitch email to the owner asking if it fits their audience; online community → a short intro message.
- Write in the place's language.
- Never name competitors or other products. Never invent numbers, user counts, quotes, testimonials or results.
- For places marked NO LINK: no URL at all, and say people can message for the link.
- ≤150 words each.

Return JSON only, "i" = the place's number above: {"drafts":[{"i":${at(0)},"text":"..."}]}`
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|app|io|ai|co|in|org|net)(?:\/\S*)?\b/gi
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Enforce in code what the prompt asks: no links where rules forbid them; no competitor names.
// A sentence naming a competitor is removed (rather than rewritten).
export function cleanDraft(text: unknown, noLink: boolean, competitorNames: string[]): string | null {
  let t = typeof text === 'string' ? text.trim() : ''
  if (!t) return null
  if (noLink) t = t.replace(URL_RE, '').replace(/\(\s*\)/g, '')
  const names = competitorNames.map(n => n.trim()).filter(n => n.length >= 3)
  if (names.length) {
    const re = new RegExp('\\b(' + names.map(escapeRe).join('|') + ')\\b', 'i')
    t = t.split(/(?<=[.!?])\s+|\n/).filter(s => !re.test(s)).join(' ')
  }
  t = t.replace(/[ \t]{2,}/g, ' ').trim()
  return t || null
}

// Attach drafts ({i, text}) to places by index
export function mergeDrafts(places: First100Place[], json: any, competitorNames: string[]): First100Place[] {
  const drafts = Array.isArray(json?.drafts) ? json.drafts : []
  return places.map((p, i) => {
    const d = drafts.find((x: any) => Number(x?.i) === i)
    return d ? { ...p, draft: cleanDraft(d.text, p.no_link, competitorNames) } : p
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
