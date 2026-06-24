import { useState } from 'react'
import { useStore } from '../lib/store'
import { CopyButton } from '../components/ui'
import { callClaude } from '../lib/claude'
import { toast } from '../components/Toast'

export default function Strategy() {
  const { currentApp, updateApp, plan } = useStore()
  const [loading, setLoading] = useState(false)

  const canUseAnalysis = plan === 'analysis' || plan === 'pro' || plan === 'guest_pro'

  if (!canUseAnalysis) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 24px', textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:16 }}>🎯</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:700, marginBottom:8 }}>Positioning</div>
        <div style={{ fontSize:13, color:'var(--text3)', lineHeight:1.7, maxWidth:420, marginBottom:24 }}>
          Generate your positioning statement, messaging hierarchy, and brand voice guide — all grounded in your existing app analysis.
        </div>
        <div style={{ fontSize:11, color:'var(--text3)' }}>Requires Analysis or Pro plan</div>
      </div>
    )
  }

  // Parse cached result
  let cached: any = null
  try { if (currentApp.positioning_analysis) cached = JSON.parse(currentApp.positioning_analysis) } catch {}

  // Build context from existing stored analyses
  function buildContext() {
    const ua          = currentApp.url_analysis
    const ctx         = (currentApp as any).content_context
    let   competitive: any = null
    try { if (currentApp.competitive_analysis) competitive = JSON.parse(currentApp.competitive_analysis) } catch {}

    const lines: string[] = []
    lines.push(`APP NAME: ${currentApp.name}`)
    lines.push(`CATEGORY: ${currentApp.category}${currentApp.stage ? ` (${currentApp.stage})` : ''}`)
    if (currentApp.desc) lines.push(`DESCRIPTION: ${currentApp.desc}`)

    if (ctx?.typical_user)  lines.push(`TARGET USER: ${ctx.typical_user}`)
    if (ctx?.before_state)  lines.push(`BEFORE STATE (problem): ${ctx.before_state}`)
    if (ctx?.real_result)   lines.push(`PROVEN RESULT: ${ctx.real_result}`)
    if (ctx?.user_quote)    lines.push(`REAL USER QUOTE: "${ctx.user_quote}"`)

    if (ua) {
      if (ua.headline)   lines.push(`CURRENT HEADLINE: "${ua.headline}"`)
      if (ua.overall)    lines.push(`LANDING PAGE SCORE: ${ua.overall}/10`)
      if (ua.bottleneck) lines.push(`#1 WEAKNESS: ${ua.bottleneck.label} — ${ua.bottleneck.issue}`)
      const trust = ua.dimensions?.find((d: any) => d.label === 'Trust')
      if (trust)         lines.push(`TRUST SCORE: ${trust.score}/10 — ${trust.issue ?? ''}`)
    }

    if (competitive?.comps?.length) {
      const top = competitive.comps[0]
      lines.push(`TOP COMPETITOR: ${top.name}`)
      if (top.positioningGap) lines.push(`COMPETITOR POSITIONING GAP: ${top.positioningGap}`)
      if (top.userHates?.length) lines.push(`WHAT COMPETITOR DOES BADLY: ${top.userHates.slice(0, 2).join('; ')}`)
    }
    if (competitive?.winCond) lines.push(`WIN CONDITION: ${competitive.winCond}`)
    if (competitive?.wspace)  lines.push(`MARKET WHITESPACE: ${competitive.wspace}`)

    return lines.filter(Boolean).join('\n')
  }

  async function generate() {
    setLoading(true)
    try {
      const context = buildContext()
      const ua  = currentApp.url_analysis
      const ctx = (currentApp as any).content_context
      const targetUser = ctx?.typical_user || 'target user'
      const problem    = ctx?.before_state  || 'their problem'

      let competitive: any = null
      try { if (currentApp.competitive_analysis) competitive = JSON.parse(currentApp.competitive_analysis) } catch {}
      const compName     = competitive?.comps?.[0]?.name || 'alternatives'
      const compWeakness = competitive?.comps?.[0]?.userHates?.[0]
        || competitive?.comps?.[0]?.positioningGap
        || 'lacks key features'

      const prompt = `You are a positioning strategist. Using ONLY the data below — no invented details — generate a concise positioning strategy.

CONTEXT:
${context}

Generate three outputs. Return ONLY valid JSON, no markdown:
{
  "positioningStatement": "For [target user] who [specific problem from context], ${currentApp.name} is the [category] that [specific unique benefit from context] unlike ${compName} which [specific weakness from context].",
  "messagingHierarchy": {
    "primaryMessage": "Rewritten headline — shorter, clearer, benefit-led. Max 10 words. Must be stronger than the current headline.",
    "supportingMessage": "One sentence backing up the primary message with a specific mechanism or differentiator from context.",
    "proofPoint": "One specific piece of evidence — a score, a result, a user quote, or a competitive advantage from the context above."
  },
  "voiceGuide": [
    {
      "adjective": "first brand tone adjective",
      "say": "example phrase that embodies this tone (10-15 words, brand-specific)",
      "notSay": "example phrase that violates this tone (10-15 words)"
    },
    {
      "adjective": "second brand tone adjective",
      "say": "...",
      "notSay": "..."
    },
    {
      "adjective": "third brand tone adjective",
      "say": "...",
      "notSay": "..."
    }
  ]
}

Rules:
- positioningStatement must use the exact format above — fill in [bracketed] parts from context
- Target user: "${targetUser}", Problem: "${problem}", Competitor: "${compName}", Weakness: "${compWeakness}"
- primaryMessage must be shorter and more benefit-driven than the current headline
- proofPoint must cite something specific from context (score, quote, or competitive fact)
- voiceGuide adjectives must reflect the app category (${currentApp.category}) and target user
- say/notSay examples must be concrete and brand-specific — not generic marketing phrases`

      const raw     = await callClaude(prompt, 'Output ONLY valid JSON. No markdown fences.', 1800, undefined, 'sonnet', 'positioning')
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').replace(/^[^{]*/, '').replace(/}[^}]*$/, '}').trim()
      const parsed  = JSON.parse(cleaned)

      if (!parsed.positioningStatement) throw new Error('Invalid response')

      await updateApp(currentApp.id, {
        positioning_analysis:   JSON.stringify(parsed),
        positioning_analyzed_at: new Date().toISOString(),
      } as any)
      toast('Positioning generated!')
    } catch (e: any) {
      toast('Error: ' + (e?.message ?? 'Generation failed'))
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 740, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, marginBottom: 3 }}>
            Positioning
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            Statement · Messaging hierarchy · Voice guide — built from your existing analysis
          </div>
        </div>
        <button
          className="gen-btn"
          style={{ fontSize: 12, padding: '9px 20px', flexShrink: 0 }}
          onClick={generate}
          disabled={loading}
        >
          {loading ? '⏳ Generating…' : cached ? '🔄 Regenerate' : '✨ Generate Positioning'}
        </button>
      </div>

      {!cached && !loading && (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--surface)', borderRadius: 'var(--r2)', border: '1px solid var(--surface3)', color: 'var(--text3)', fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🎯</div>
          <div style={{ marginBottom: 6, fontWeight: 600, color: 'var(--text2)' }}>No positioning generated yet</div>
          <div style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 380, margin: '0 auto' }}>
            Pulls from your URL analysis, competitive intelligence, and content context — no new input needed.
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <span className="spinner" style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Building positioning from your app data…</div>
        </div>
      )}

      {cached && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 1 — Positioning Statement */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r2)', border: '1px solid var(--surface3)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)', letterSpacing: '.06em', textTransform: 'uppercase' }}>01</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginLeft: 10 }}>Positioning Statement</span>
              </div>
              <CopyButton text={cached.positioningStatement} label="Copy" />
            </div>
            <div style={{ padding: '18px 16px' }}>
              <div style={{
                fontSize: 14, lineHeight: 1.75, color: 'var(--text)',
                background: 'rgba(124,111,247,.06)', border: '1px solid rgba(124,111,247,.15)',
                borderRadius: 'var(--r)', padding: '14px 16px',
                fontStyle: 'italic',
              }}>
                "{cached.positioningStatement}"
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
                Use this in your About page, pitch deck, and as the north star for all marketing copy.
              </div>
            </div>
          </div>

          {/* 2 — Messaging Hierarchy */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r2)', border: '1px solid var(--surface3)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--surface2)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)', letterSpacing: '.06em', textTransform: 'uppercase' }}>02</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginLeft: 10 }}>Messaging Hierarchy</span>
            </div>
            <div style={{ padding: '16px' }}>
              {[
                { key: 'primaryMessage',   label: 'Primary Message',    icon: '🎯', hint: 'Your headline — most prominent text on the page' },
                { key: 'supportingMessage', label: 'Supporting Message', icon: '💬', hint: 'Subheadline — backs up the primary message' },
                { key: 'proofPoint',       label: 'Proof Point',        icon: '✅', hint: 'Social proof or evidence — builds trust immediately' },
              ].map(({ key, label, icon, hint }) => (
                <div key={key} style={{ marginBottom: 12, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 'var(--r)', border: '1px solid var(--surface3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 13 }}>{icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>{label}</span>
                    </div>
                    <CopyButton text={cached.messagingHierarchy?.[key] ?? ''} label="Copy" />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 4 }}>
                    {cached.messagingHierarchy?.[key]}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{hint}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 3 — Voice Guide */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r2)', border: '1px solid var(--surface3)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--surface2)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)', letterSpacing: '.06em', textTransform: 'uppercase' }}>03</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginLeft: 10 }}>Voice Guide</span>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(cached.voiceGuide ?? []).map((item: any, i: number) => (
                <div key={i} style={{ border: '1px solid var(--surface3)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', background: 'rgba(124,111,247,.06)', borderBottom: '1px solid var(--surface3)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent2)', textTransform: 'capitalize' }}>
                      {item.adjective}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    <div style={{ padding: '10px 14px', borderRight: '1px solid var(--surface3)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', marginBottom: 5, letterSpacing: '.05em' }}>✓ SAY</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>"{item.say}"</div>
                    </div>
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginBottom: 5, letterSpacing: '.05em' }}>✗ NOT</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>"{item.notSay}"</div>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.6, padding: '2px 4px' }}>
                Apply these consistently across landing page copy, social posts, email, and ads.
              </div>
            </div>
          </div>

          {cached && (
            <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right', paddingTop: 4 }}>
              {currentApp.positioning_analyzed_at
                ? `Generated ${Math.floor((Date.now() - new Date((currentApp as any).positioning_analyzed_at).getTime()) / (1000 * 60 * 60 * 24))} days ago`
                : 'Just generated'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
