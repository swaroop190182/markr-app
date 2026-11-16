// "Where your first 100 users are" — real public communities confirmed by live web search,
// with draft posts the founder publishes manually. Markr never posts.
import { useState } from 'react'
import { useStore } from '../../lib/store'
import { callClaude, getAiUsage, getFounderContext, extractJSON } from '../../lib/claude'
import { readCompetitive } from '../../lib/founder'
import { effectiveMarket } from '../../lib/market'
import { inputsChangedAt, markGenerated } from '../../lib/outdated'
import { fixAnalysisCurrency } from '../../lib/prices'
import { CopyButton } from '../../components/ui'
import { toast } from '../../components/Toast'
import {
  searchPrompt, draftPrompt, normalizePlaces, mergeDrafts, readFirst100, isFirst100Outdated,
  SEARCH_SYSTEM, DRAFT_SYSTEM, FIRST100_MAX_USES, DRAFT_BATCH, FIRST100_CALLS,
  type First100Place, type First100Section,
} from '../../lib/first100'
import type { AppData } from '../../types'

const box: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px' }
const btn = (primary = true): React.CSSProperties => ({
  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
  background: primary ? 'var(--accent)' : 'transparent', color: primary ? '#fff' : 'var(--text2)',
  border: primary ? 'none' : '1px solid var(--border)',
})
const chip: React.CSSProperties = { fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--surface2, rgba(124,111,247,.08))', color: 'var(--text3)', textTransform: 'capitalize' }
const srcLink = (url: string) => <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>source</a>

export default function FirstHundred({ app, plan, onUpgrade }: { app: AppData; plan: string; onUpgrade?: () => void }) {
  const { updateApp } = useStore()
  const [confirming, setConfirming] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [busy, setBusy] = useState<'' | 'search' | 'drafts'>('')

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

  function save(places: First100Place[], market: string, generatedAt: string) {
    let gtm: any = {}
    try { if (app.gtm_analysis) gtm = JSON.parse(app.gtm_analysis) } catch {}
    const fixed = fixAnalysisCurrency(app, 'first100', { places })
    const next: First100Section = { places: fixed.places, market, generated_at: generatedAt }
    // Only the section changes — gtm_analyzed_at (the GTM plan's own date and lock) is left alone
    updateApp(app.id, { gtm_analysis: markGenerated(JSON.stringify({ ...gtm, first100: next })) } as any)
  }

  // Draft posts for the given places (batches of DRAFT_BATCH in parallel). A failed batch leaves draft: null.
  async function writeDrafts(places: First100Place[], only?: (p: First100Place) => boolean): Promise<First100Place[]> {
    const idx = places.map((p, i) => i).filter(i => !only || only(places[i]))
    const batches: number[][] = []
    for (let i = 0; i < idx.length; i += DRAFT_BATCH) batches.push(idx.slice(i, i + DRAFT_BATCH))
    let out = places
    const results = await Promise.allSettled(batches.map(async b => {
      // Places keep their position in the saved list, so drafts come back keyed by it
      const raw = await callClaude(
        draftPrompt({ appName: app.name, appUrl: app.url || '', product, founder: getFounderContext(app), places: b.map(i => places[i]), startIndex: b[0], indexes: b }),
        DRAFT_SYSTEM, 3000, undefined, 'haiku', 'first_100_drafts')
      return JSON.parse(extractJSON(raw))
    }))
    let failed = 0
    for (const r of results) {
      if (r.status === 'fulfilled') out = mergeDrafts(out, r.value, competitorNames)
      else failed++
    }
    if (failed) toast(`${failed} draft batch${failed > 1 ? 'es' : ''} failed — use "Write missing drafts" to retry.`)
    return out
  }

  async function openConfirm() {
    setConfirming(true)
    setRemaining(null)
    const u = await getAiUsage()
    setRemaining(u ? u.remaining : null)
  }

  async function run() {
    setConfirming(false)
    setBusy('search')
    const market = effectiveMarket(app)
    try {
      const raw = await callClaude(
        searchPrompt({ appName: app.name, category: app.category, market, product, founder: getFounderContext(app), competitorNames }),
        SEARCH_SYSTEM, 4000, undefined, 'haiku', 'first_100', undefined, { webSearch: { maxUses: FIRST100_MAX_USES } })
      const places = normalizePlaces(JSON.parse(raw))
      if (!places.length) { toast('No communities could be confirmed by live search — try again later.'); return }
      const generatedAt = new Date().toISOString()
      save(places, market, generatedAt)               // places are kept even if drafting fails
      setBusy('drafts')
      save(await writeDrafts(places), market, generatedAt)
      toast(`Found ${places.length} places to post`)
    } catch (e: any) {
      toast(e?.message ?? 'Could not find places — please try again.')
    } finally {
      setBusy('')
    }
  }

  async function retryDrafts() {
    if (!section) return
    setBusy('drafts')
    try { save(await writeDrafts(section.places, p => !p.draft), section.market, section.generated_at) }
    finally { setBusy('') }
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
            {busy === 'search' ? 'Searching for real communities…' : 'Writing drafts…'}
          </div>
        ) : !confirming && (
          <button style={btn(!section)} onClick={openConfirm}>{section ? 'Re-run' : 'Find places'}</button>
        )}
      </div>

      {outdated && !busy && (
        <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,166,35,.08)', border: '1px solid rgba(245,166,35,.25)' }}>
          Your brief or screenshots changed since these were found — re-run to update them.
        </div>
      )}

      {confirming && (
        <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, lineHeight: 1.6 }}>
          Uses up to {FIRST100_CALLS} AI calls and up to {FIRST100_MAX_USES} live web searches.{' '}
          {remaining === null ? 'Checking your remaining calls…' : `You have ${remaining} AI call${remaining === 1 ? '' : 's'} left today.`}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={btn()} disabled={remaining !== null && remaining < FIRST100_CALLS} onClick={run}>Find places</button>
            <button style={btn(false)} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
          {remaining !== null && remaining < FIRST100_CALLS && (
            <div style={{ color: 'var(--text3)', marginTop: 6 }}>Not enough AI calls left today — try again tomorrow.</div>
          )}
        </div>
      )}

      {section?.places.map((p, i) => (
        <div key={p.url + i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', opacity: p.possibly_inactive ? 0.85 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name} ↗</a>
            <span style={chip}>{p.type}</span>
            {p.language && p.language !== 'English' && <span style={chip}>{p.language}</span>}
            {p.possibly_inactive && <span style={{ ...chip, color: '#b7791f' }}>⏳ may be inactive — check before posting</span>}
            <a href={p.evidence_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>found via</a>
          </div>
          {p.why && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{p.why}</div>}
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
          {p.draft && (
            <div style={{ marginTop: 10 }}>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, padding: '10px 12px', borderRadius: 8, background: 'rgba(124,111,247,.05)', border: '1px solid rgba(124,111,247,.15)' }}>{p.draft}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <CopyButton text={p.draft} />
                {p.no_link && <span style={{ fontSize: 11, color: 'var(--text3)' }}>No link included — this community's rules limit promotion.</span>}
              </div>
            </div>
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
