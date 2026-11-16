// "Where your first 100 users are" — real public communities confirmed by live web search,
// with draft posts the founder publishes manually. Markr never posts.
// Every outcome ends in a visible status message in this card (not only a toast).
import { useState } from 'react'
import { useStore } from '../../lib/store'
import { callClaude, getAiUsage, getFounderContext, extractJSON } from '../../lib/claude'
import { readCompetitive, hasFounderBrief } from '../../lib/founder'
import { effectiveMarket } from '../../lib/market'
import { inputsChangedAt, markGenerated } from '../../lib/outdated'
import { fixAnalysisCurrency } from '../../lib/prices'
import { CopyButton } from '../../components/ui'
import { toast } from '../../components/Toast'
import {
  searchPrompt, topUpPrompt, draftPrompt, normalizePlaces, mergePlaces, mergeDrafts, unconfirmedCandidates,
  readFirst100, isFirst100Outdated, placeTypeLabel, linkPolicy, linkNote, detectLanguage, inferType, assignAngles, repeatedDrafts, draftHowTo,
  searchErrorMessage, noneConfirmedMessage, draftsFailedMessage,
  SEARCH_SYSTEM, DRAFT_SYSTEM, FIRST100_MAX_USES, FIRST100_SEARCHES, TOPUP_BELOW, MAX_PLACES, FIRST100_CALLS,
  type First100Place, type First100Section,
} from '../../lib/first100'
import type { AppData } from '../../types'

type Status = { tone: 'error' | 'warn' | 'ok'; text: string; action?: 'retry' | 'drafts' } | null

const box: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px' }
const btn = (primary = true): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
  background: primary ? 'var(--accent)' : 'transparent', color: primary ? '#fff' : 'var(--text2)',
  border: primary ? 'none' : '1px solid var(--border)',
})
const chip: React.CSSProperties = { fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--surface2, rgba(124,111,247,.08))', color: 'var(--text3)', textTransform: 'capitalize' }
const TONE = {
  error: { bg: 'rgba(229,72,77,.08)',  border: 'rgba(229,72,77,.3)',  icon: '⛔' },
  warn:  { bg: 'rgba(245,166,35,.08)', border: 'rgba(245,166,35,.3)', icon: '⚠️' },
  ok:    { bg: 'rgba(52,201,138,.08)', border: 'rgba(52,201,138,.3)', icon: '✅' },
}
const srcLink = (url: string) => <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>source</a>

export default function FirstHundred({ app, plan, onUpgrade, onEditApp }: { app: AppData; plan: string; onUpgrade?: () => void; onEditApp?: (id: number) => void }) {
  const { updateApp } = useStore()
  const [confirming, setConfirming] = useState(false)
  const [briefNotice, setBriefNotice] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [busy, setBusy] = useState<'' | 'search' | 'topup' | 'drafts'>('')
  const [status, setStatus] = useState<Status>(null)

  const isPro = plan === 'pro' || plan === 'guest_pro'
  const section = readFirst100(app.gtm_analysis)
  const outdated = isFirst100Outdated(section, inputsChangedAt(app))

  if (!isPro) return (
    <div style={{ ...box, textAlign: 'center', padding: '28px 24px' }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Where your first 100 users are — Pro</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 14px' }}>
        Markr uses live web search to find real communities where your audience already gathers — subreddits, groups, forums, newsletters — and drafts a post for each that you publish yourself.
      </div>
      {onUpgrade && <button style={btn()} onClick={onUpgrade}>Upgrade to Pro</button>}
    </div>
  )

  const competitorNames = ((readCompetitive(app)?.comps ?? []) as any[])
    .map(c => (typeof c?.name === 'string' ? c.name.trim() : '')).filter(Boolean)
  const product = app.screenshot_vision?.product_understanding || app.desc || ''
  // The app's primary language, from its own product copy (landing page headline, screenshot headlines and buttons)
  const appLanguage = detectLanguage([
    app.url_analysis?.headline,
    ...(app.screenshot_vision?.screenshots ?? []).flatMap(s => [s.analysis?.extracted_copy?.headline, ...(s.analysis?.extracted_copy?.ctas ?? [])]),
  ].filter(Boolean).join('. '))

  // Writes the section into the GTM JSON (gtm_analyzed_at — the plan's own date and lock — is left alone).
  // `base` is the GTM JSON to write into: the second save of a run passes the first save's result,
  // since `app` in this closure is still the pre-run snapshot. Returns the JSON written, or null if the save failed.
  async function save(places: First100Place[], market: string, generatedAt: string, base = app.gtm_analysis): Promise<string | null> {
    let gtm: any = {}
    try { if (base) gtm = JSON.parse(base) } catch {}
    const fixed = fixAnalysisCurrency(app, 'first100', { places })
    const next: First100Section = { places: fixed.places, market, generated_at: generatedAt }
    const json = markGenerated(JSON.stringify({ ...gtm, first100: next }))
    return (await updateApp(app.id, { gtm_analysis: json } as any)) ? json : null
  }

  // Draft posts for the given places in ONE call (so the model sees them all), each with its own angle.
  // Then a code check: a draft repeating an earlier draft's opening or core argument gets one repair
  // call with the others listed to avoid; if it still repeats, it is left empty ("Write missing drafts").
  async function writeDrafts(input: First100Place[], only?: (p: First100Place) => boolean) {
    // Type re-derived from the community's own nature (fixes older saved places too); angles spread across the run
    const places = input.map(p => ({ ...p, type: inferType(p) }))
    const idx = places.map((_, i) => i).filter(i => !only || only(places[i]))
    const keep = places.map((_, i) => i).filter(i => !idx.includes(i) && places[i].draft)   // drafts not being rewritten
    const angles = assignAngles(places)
    const callDrafts = async (ids: number[], avoidFrom: number[], cur: First100Place[]) => {
      const raw = await callClaude(
        draftPrompt({ appName: app.name, appUrl: app.url || '', product, founder: getFounderContext(app),
          places: ids.map(i => cur[i]), startIndex: ids[0], indexes: ids, appLanguage, angles: ids.map(i => angles[i]),
          avoid: avoidFrom.map(i => ({ opening: (cur[i].draft ?? '').split('\n')[0].slice(0, 90), point: cur[i].point })) }),
        DRAFT_SYSTEM, 4500, undefined, 'haiku', 'first_100_drafts')
      const merged = mergeDrafts(cur, JSON.parse(extractJSON(raw)), competitorNames, appLanguage, app.name)
      return merged.map((p, i) => ids.includes(i) ? { ...p, angle: angles[i] } : p)
    }

    let out: First100Place[] = places, firstError: any = null
    if (idx.length) {
      try { out = await callDrafts(idx, keep, places) }
      catch (e) { firstError = e; console.warn('[first_100] draft call failed:', e) }
    }
    // Repeats: rewrite once, avoiding every other draft
    let repeats = repeatedDrafts(out).filter(i => idx.includes(i))
    if (repeats.length && !firstError) {
      console.log(`[first_100] repeated openings/arguments at ${repeats.join(',')} — one repair call`)
      try {
        const others = out.map((_, i) => i).filter(i => !repeats.includes(i) && out[i].draft)
        out = await callDrafts(repeats, others, out)
      } catch (e) { console.warn('[first_100] repair call failed:', e) }
      repeats = repeatedDrafts(out).filter(i => idx.includes(i))
      if (repeats.length) out = out.map((p, i) => repeats.includes(i) ? { ...p, draft: null, point: null } : p)   // never two alike
    }
    const missing = idx.filter(i => !out[i].draft).length   // failed call + drafts emptied by the clean-up or the repeat check
    return { places: out, missing, total: idx.length, firstError }
  }

  // Without a founder brief, drafts can only describe the product from the landing page — say so first
  function startRun() {
    setStatus(null)
    if (!hasFounderBrief(app.founder_brief)) { setBriefNotice(true); return }
    openConfirm()
  }

  async function openConfirm() {
    setBriefNotice(false)
    setConfirming(true)
    setStatus(null)
    setRemaining(null)
    const u = await getAiUsage()
    setRemaining(u ? u.remaining : null)
  }

  async function run() {
    setConfirming(false)
    setStatus(null)
    setBusy('search')
    const market = effectiveMarket(app)
    try {
      // 1. Find places (live search)
      let raw: string
      try {
        raw = await callClaude(
          searchPrompt({ appName: app.name, category: app.category, market, product, founder: getFounderContext(app), competitorNames }),
          SEARCH_SYSTEM, 4000, undefined, 'haiku', 'first_100', undefined, { webSearch: { maxUses: FIRST100_MAX_USES } })
      } catch (e) {
        console.warn('[first_100] search failed:', e)
        setStatus({ tone: 'error', text: searchErrorMessage(e), action: 'retry' })
        return
      }
      let json: any
      try { json = JSON.parse(raw) } catch {
        console.warn('[first_100] unreadable search response:', raw.slice(0, 300))
        setStatus({ tone: 'error', text: 'The search response could not be read. Nothing was saved — please try again.', action: 'retry' })
        return
      }
      let places = normalizePlaces(json)
      let proposed = Number(json?.place_check?.proposed ?? json?.places?.length ?? 0)
      console.log(`[first_100] search 1: proposed=${proposed} confirmed=${json?.place_check?.confirmed ?? '?'} usable=${places.length}`)

      // 1b. Too few confirmed → one targeted search: look up the unconfirmed candidates' own pages
      //     and cover the platforms the first call didn't reach. Same server check applies.
      let topUpNote = ''
      if (places.length < TOPUP_BELOW) {
        setBusy('topup')
        try {
          const raw2 = await callClaude(
            topUpPrompt({ appName: app.name, category: app.category, market, product,
              confirmed: places.map(p => ({ name: p.name, url: p.url })), unconfirmed: unconfirmedCandidates(json), want: MAX_PLACES - places.length }),
            SEARCH_SYSTEM, 4000, undefined, 'haiku', 'first_100', undefined, { webSearch: { maxUses: FIRST100_MAX_USES } })
          const json2 = JSON.parse(raw2)
          const before = places.length
          places = mergePlaces(places, normalizePlaces(json2))
          proposed += Number(json2?.place_check?.proposed ?? 0)
          console.log(`[first_100] search 2 (top-up): proposed=${json2?.place_check?.proposed ?? '?'} confirmed=${json2?.place_check?.confirmed ?? '?'} new=${places.length - before}`)
        } catch (e) {
          console.warn('[first_100] top-up search failed:', e)
          topUpNote = ` The follow-up search couldn't run (${searchErrorMessage(e).split(/[.—]/)[0].trim().toLowerCase()}), so fewer places may have been found.`
        }
      }
      if (!places.length) {
        setStatus({ tone: 'warn', text: noneConfirmedMessage(proposed) + topUpNote, action: 'retry' })
        return
      }

      // 2. Save the places first, so they are kept even if drafting fails
      const generatedAt = new Date().toISOString()
      const firstSave = await save(places, market, generatedAt)

      // 3. Drafts
      setBusy('drafts')
      const d = await writeDrafts(places)
      const finalSave = await save(d.places, market, generatedAt, firstSave ?? app.gtm_analysis)

      const found = `Found ${places.length} confirmed place${places.length === 1 ? '' : 's'}${proposed > places.length ? ` (of ${proposed} the search suggested)` : ''}.${topUpNote}`
      if (!firstSave || !finalSave) {
        setStatus({ tone: 'error', text: `${found} They couldn't be saved, so they will disappear when you reload — please try again.`, action: 'retry' })
      } else if (d.missing) {
        setStatus({ tone: 'warn', text: `${found} ${draftsFailedMessage(d.missing, d.total, d.firstError)}`, action: 'drafts' })
      } else {
        setStatus({ tone: 'ok', text: `${found} Drafts are ready — check each community's rules before posting.` })
        toast(`Found ${places.length} places to post`)
      }
    } catch (e: any) {
      // Anything unexpected (bug, storage) — still visible
      console.error('[first_100] run failed:', e)
      setStatus({ tone: 'error', text: `Something went wrong: ${e?.message ?? 'unknown error'}. Please try again.`, action: 'retry' })
    } finally {
      setBusy('')
    }
  }

  async function retryDrafts() {
    if (!section) return
    setStatus(null)
    setBusy('drafts')
    try {
      const d = await writeDrafts(section.places, p => !p.draft)
      const saved = await save(d.places, section.market, section.generated_at)
      if (!saved) setStatus({ tone: 'error', text: 'The drafts were written but could not be saved — please try again.', action: 'drafts' })
      else if (d.missing) setStatus({ tone: 'warn', text: draftsFailedMessage(d.missing, d.total, d.firstError), action: 'drafts' })
      else setStatus({ tone: 'ok', text: 'Drafts are ready.' })
    } catch (e: any) {
      console.error('[first_100] retry drafts failed:', e)
      setStatus({ tone: 'error', text: `Something went wrong: ${e?.message ?? 'unknown error'}. Please try again.`, action: 'drafts' })
    } finally {
      setBusy('')
    }
  }

  const missingDrafts = section?.places.filter(p => !p.draft).length ?? 0

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Syne,sans-serif' }}>🎯 Where your first 100 users are</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>Markr finds the places; you post. Always check each community's rules first.</div>
        </div>
        {busy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)' }}>
            <span className="spinner" style={{ color: 'var(--accent)' }} />
            {busy === 'search' ? 'Searching for real communities… (up to a minute)'
              : busy === 'topup' ? 'Searching specific platforms for more communities…'
              : 'Writing drafts…'}
          </div>
        ) : !confirming && !briefNotice && (
          <button style={btn(!section)} onClick={startRun}>{section ? 'Re-run' : 'Find places'}</button>
        )}
      </div>

      {briefNotice && !busy && (
        <div style={{ fontSize: 12, lineHeight: 1.6, padding: '10px 12px', borderRadius: 8, background: 'rgba(245,166,35,.08)', border: '1px solid rgba(245,166,35,.3)' }}>
          ⚠️ Add your founder brief first — drafts will describe your product from it.
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {onEditApp && <button style={{ ...btn(), padding: '5px 12px', fontSize: 11 }} onClick={() => { setBriefNotice(false); onEditApp(app.id) }}>Add brief</button>}
            <button style={{ ...btn(false), padding: '5px 12px', fontSize: 11 }} onClick={openConfirm}>Run anyway</button>
          </div>
        </div>
      )}

      {status && !busy && (
        <div role="status" style={{ fontSize: 12, lineHeight: 1.6, padding: '10px 12px', borderRadius: 8, background: TONE[status.tone].bg, border: `1px solid ${TONE[status.tone].border}` }}>
          {TONE[status.tone].icon} {status.text}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {status.action === 'retry' && <button style={{ ...btn(), padding: '5px 12px', fontSize: 11 }} onClick={openConfirm}>Retry</button>}
            {status.action === 'drafts' && <button style={{ ...btn(), padding: '5px 12px', fontSize: 11 }} onClick={retryDrafts}>Write missing drafts</button>}
            <button style={{ ...btn(false), padding: '5px 12px', fontSize: 11 }} onClick={() => setStatus(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {outdated && !busy && (
        <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,166,35,.08)', border: '1px solid rgba(245,166,35,.25)' }}>
          Your brief or screenshots changed since these were found — re-run to update them.
        </div>
      )}

      {confirming && (
        <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.6 }}>
          Uses up to {FIRST100_CALLS} AI calls and up to {FIRST100_SEARCHES} live web searches (a second, targeted search runs only if the first confirms fewer than {TOPUP_BELOW} places).{' '}
          {remaining === null ? 'Checking your remaining calls…' : `You have ${remaining} AI call${remaining === 1 ? '' : 's'} left today.`}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={btn()} disabled={remaining !== null && remaining < FIRST100_CALLS} onClick={run}>Find places</button>
            <button style={btn(false)} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
          {remaining !== null && remaining < FIRST100_CALLS && (
            <div style={{ color: 'var(--text3)', marginTop: 6 }}>Daily AI limit reached — not enough calls left for a run. Try again tomorrow or upgrade your plan.</div>
          )}
        </div>
      )}

      {section?.places.map((p, i) => (
        <div key={p.url + i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', opacity: p.possibly_inactive ? 0.85 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name} ↗</a>
            <span style={chip}>{placeTypeLabel(p)}</span>
            {p.language && p.language !== 'English' && <span style={chip}>{p.language}</span>}
            {p.possibly_inactive && <span style={{ ...chip, color: '#b7791f' }}>⏳ may be inactive — check before posting</span>}
            <a href={p.evidence_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>found via</a>
          </div>
          {p.why && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{p.why}</div>}
          {(p.third_party ?? false) && (
            <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text3)' }}>🔗 The link goes to a page about this community, not the community itself — find the join link there.</div>
          )}
          <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text3)' }}>
            {p.rules
              ? <>📋 Rules: <span style={{ color: 'var(--text2)' }}>{p.rules.value}</span>{srcLink(p.rules.source_url)}</>
              : <>⚠️ Rules not found — check before posting</>}
          </div>
          {p.members && (
            <div style={{ fontSize: 11, marginTop: 3, color: 'var(--text3)' }}>
              👥 Members: <span style={{ color: 'var(--text2)' }}>{p.members.value}</span>{srcLink(p.members.source_url)}
            </div>
          )}
          {p.draft ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, padding: '10px 12px', borderRadius: 8, background: 'rgba(124,111,247,.05)', border: '1px solid rgba(124,111,247,.15)' }}>{p.draft}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                <CopyButton text={p.draft} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>{draftHowTo(inferType(p))}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{linkNote(p.link_policy ?? linkPolicy(p.rules))}</span>
              </div>
            </div>
          ) : !busy && (
            <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text3)' }}>No draft yet — use "Write missing drafts" below.</div>
          )}
        </div>
      ))}

      {section && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--text3)', flexWrap: 'wrap' }}>
          Found {new Date(section.generated_at).toLocaleDateString()} · Market: {section.market}
          {missingDrafts > 0 && !busy && (
            <button style={{ ...btn(false), padding: '4px 10px', fontSize: 11 }} onClick={retryDrafts}>
              Write missing drafts ({missingDrafts})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
