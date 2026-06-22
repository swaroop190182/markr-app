import { useState, useCallback } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader, CopyButton } from '../components/ui'
import { callClaude, getTestContext, safeParseJSON } from '../lib/claude'
import { SLOT_CONFIGS } from '../lib/data'
import { toast } from '../components/Toast'
import type { AgentPost, ContentContext } from '../types'

type SlotKey = 'morning' | 'midday' | 'evening'
type SlotState = 'idle' | 'generating' | 'ready' | 'error'

const POST_STYLES = [
  { id: 'educational', emoji: '🎓', label: 'Educational', desc: 'Tips, facts, how-tos',
    voice: 'Authoritative yet approachable. Lead with concrete insight. Use specific numbers and examples.',
    subFormats: [
      'POST 1 — CONCRETE TIP OR NON-OBVIOUS INSIGHT: Open with a specific, usable insight (include a number or stat where possible). Structure clearly. Optimised for SAVES.',
      'POST 2 — MYTH VS REALITY OR COMMON MISTAKE: Challenge a wrong assumption the target user holds. Format: "Most people think X. Actually Y." Make it feel like a revelation. Optimised for SHARES.',
      'POST 3 — STEP-BY-STEP OR 3-POINT LIST: Actionable and scannable. Each point must be concrete and distinct. End with a question asking which step they have tried. Optimised for COMMENTS.',
    ] as const },
  { id: 'conversational', emoji: '💬', label: 'Conversational', desc: 'Questions, polls, community',
    voice: 'Warm, casual, community-driven. Write like a real person talking to a friend. Short punchy sentences.',
    subFormats: [
      'POST 1 — RELATABLE OBSERVATION: Open with a shared struggle or "Have you ever..." hook. Make the reader feel seen. Close with a soft moment of connection. Optimised for SAVES.',
      'POST 2 — HONEST CONFESSION OR BEHIND-THE-SCENES: Casual and real. Something the brand or user would actually admit. No polish, no buzzwords. Optimised for SHARES.',
      'POST 3 — DIRECT QUESTION OR TWO-OPTION POLL: Pure community engagement. Open with curiosity or a light take, close with a clear question or two poll options. Optimised for COMMENTS.',
    ] as const },
  { id: 'story', emoji: '📖', label: 'Story', desc: 'Personal moments, behind the scenes',
    voice: 'Narrative, visual, human. Each post is a distinct story format. Use the app name, category, and target user from context. Never generic.',
    subFormats: [
      'POST 1 — BEFORE/AFTER MOMENT: "[Target user] used to struggle with [problem this app solves]. Now [specific positive change]." Use the app actual value proposition. Concrete, not generic. Optimised for SAVES.',
      'POST 2 — REAL-LIFE SCENE: Describe a specific moment in the target user day where this app made a difference. Visual and sensory. No product features — just the human moment. Optimised for SHARES.',
      'POST 3 — MINI JOURNEY (3 sentences + question): Show progression — where the user started, what changed, where they are now. End with an open question inviting others to share their experience. Optimised for COMMENTS.',
    ] as const },
  { id: 'bold', emoji: '🔥', label: 'Bold', desc: 'Strong opinions, contrarian takes',
    voice: 'Confident, direct, unapologetic. Open with a strong claim. No hedging ("maybe", "kind of", "perhaps"). Take a clear side.',
    subFormats: [
      'POST 1 — COUNTER-INTUITIVE CLAIM: Open with a statement that challenges what people believe. Back it up in 2-3 sentences. No hedging. Optimised for SAVES.',
      'POST 2 — HOT TAKE OR UNPOPULAR OPINION: State a clear position most people avoid taking. One strong claim + brief explanation + why it matters. Optimised for SHARES.',
      'POST 3 — DIRECT CHALLENGE TO THE AUDIENCE: Call out a bad habit or limiting belief the target user holds. End with a sharp question that forces reflection. Optimised for COMMENTS.',
    ] as const },
  { id: 'warm', emoji: '😊', label: 'Warm', desc: 'Nurturing, supportive, emotional',
    voice: 'Empathetic, encouraging, emotionally resonant. Acknowledge struggles before offering hope. Avoid generic affirmations.',
    subFormats: [
      'POST 1 — ACKNOWLEDGMENT + GENTLE REFRAME: Open by naming a real struggle the target user faces. Then offer a gentle reframe or small shift in perspective. Optimised for SAVES.',
      'POST 2 — SMALL WIN CELEBRATION: Celebrate a specific, relatable moment of progress. Make the reader feel proud. Concrete and grounded — not generic \"you\'ve got this\". Optimised for SHARES.',
      'POST 3 — HEARTFELT ENCOURAGEMENT + OPEN QUESTION: Warm close with genuine encouragement and a question inviting the community to share their experience or struggle. Optimised for COMMENTS.',
    ] as const },
] as const
type StyleId = typeof POST_STYLES[number]['id']

interface SlotData {
  state: SlotState
  post: AgentPost | null
  error?: string
}

function getTodaysPillars(pillars: string[]) {
  const day = new Date().getDay()
  const base = (day * 3) % pillars.length
  return {
    morning: pillars[base % pillars.length],
    midday:  pillars[(base+1) % pillars.length],
    evening: pillars[(base+2) % pillars.length],
  }
}

function ContentContextSetup({ existing, onSave, onCancel, canSkip, onSkip }: {
  existing?: ContentContext | null
  onSave: (ctx: ContentContext) => void
  onCancel?: () => void
  canSkip?: boolean
  onSkip?: () => void
}) {
  const [form, setForm] = useState<ContentContext>({
    typical_user: existing?.typical_user ?? '',
    real_result:  existing?.real_result  ?? '',
    user_quote:   existing?.user_quote   ?? '',
    before_state: existing?.before_state ?? '',
  })
  const [saving, setSaving] = useState(false)

  const field = (key: keyof ContentContext, label: string, placeholder: string, required = true, multiline = false) => (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>
        {label}{required && <span style={{ color:'var(--accent)', marginLeft:3 }}>*</span>}
      </label>
      {multiline ? (
        <textarea
          rows={3}
          placeholder={placeholder}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={{ resize:'vertical', fontSize:13, padding:'9px 11px', borderRadius:'var(--r)', border:'1px solid var(--surface3)', background:'var(--surface2)', color:'var(--text)', fontFamily:'DM Sans, sans-serif', lineHeight:1.55, outline:'none' }}
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={{ fontSize:13, padding:'9px 11px', borderRadius:'var(--r)', border:'1px solid var(--surface3)', background:'var(--surface2)', color:'var(--text)', fontFamily:'DM Sans, sans-serif', outline:'none' }}
        />
      )}
    </div>
  )

  async function submit() {
    if (!form.typical_user.trim() || !form.real_result.trim() || !form.before_state.trim()) {
      toast('Please fill in the required fields.')
      return
    }
    setSaving(true)
    onSave(form)
  }

  const isImprovement = canSkip && !existing

  return (
    <div style={{ maxWidth:540, margin:'0 auto', padding:'8px 0 24px' }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:700, marginBottom:6 }}>
          {existing ? 'Edit Content Context' : isImprovement ? 'Get better posts in 2 minutes' : 'Content Context Setup'}
        </div>
        <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.7 }}>
          {isImprovement
            ? 'Tell us about your real users and results — your posts will immediately feel more specific and credible instead of generic.'
            : 'Answer 4 quick questions so every post is grounded in your real audience and results — not generic language.'}
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {field('typical_user', '1. Who is your typical user?', 'e.g. "Freelance designers who struggle to track invoices"')}
        {field('real_result',  '2. What result have users seen from your app?', 'e.g. "Save 3 hours/week on invoicing"')}
        {field('user_quote',   '3. Paste any real user feedback or review you\'ve received', 'e.g. "This app saved my business — Jane D." (optional)', false, true)}
        {field('before_state', '4. What were users doing before they found your app?', 'e.g. "Using spreadsheets and chasing clients manually"')}

        <div style={{ display:'flex', gap:10, marginTop:4 }}>
          <button
            onClick={submit}
            disabled={saving}
            style={{ flex:1, padding:'11px 0', borderRadius:9, background:'linear-gradient(135deg,#e26faf,#c4559a)', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:saving?'default':'pointer', opacity:saving?.6:1, fontFamily:'DM Sans, sans-serif' }}
          >
            {saving ? 'Saving…' : (existing ? 'Save changes' : 'Save & start generating →')}
          </button>
          {onCancel && (
            <button onClick={onCancel} style={{ padding:'11px 18px', borderRadius:9, background:'var(--surface2)', color:'var(--text2)', border:'none', fontSize:13, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
              Cancel
            </button>
          )}
        </div>

        {canSkip && onSkip && (
          <button
            onClick={onSkip}
            style={{ background:'none', border:'none', color:'var(--text3)', fontSize:12, cursor:'pointer', textDecoration:'underline', padding:0, fontFamily:'DM Sans, sans-serif', textAlign:'center' }}
          >
            Skip for now — generate posts without context
          </button>
        )}
      </div>
    </div>
  )
}

export default function ContentStudio({ onUpgrade }: { onUpgrade?: () => void }) {
  const { currentApp, plan, updateApp, setView } = useStore()
  const pillars = currentApp.pillars ?? ['Content','Education','Tips','Community','Stories','Wins']
  const todaysPillars = getTodaysPillars(pillars)
  const pt = currentApp.productTest
  const pillarSuggestions = currentApp.pillar_suggestions ?? null
  const hasPillars = !!(pillarSuggestions && Object.keys(pillarSuggestions).length > 0)
  const weakestDim = currentApp.url_analysis?.dimensions
    ?.slice().sort((a, b) => a.score - b.score)[0] ?? null

  const defaultPillar = hasPillars
    ? (Object.keys(pillarSuggestions!).find(p =>
        weakestDim && p.toLowerCase().includes(weakestDim.label.toLowerCase().split(/\s+/)[0])
      ) ?? Object.keys(pillarSuggestions!)[0])
    : null

  const [selectedPillar, setSelectedPillar] = useState<string | null>(defaultPillar)
  const [editingContext, setEditingContext] = useState(false)
  const [skippedContext, setSkippedContext] = useState(false)

  // An "existing" app is one that had data before the content_context feature was added.
  // Proxy: any analysis or pillar data present means it was used before this feature shipped.
  const isExistingApp = !!(
    currentApp.pillar_suggestions ||
    currentApp.url_analysis ||
    currentApp.analyzed ||
    currentApp.competitive_analysis ||
    currentApp.bmc_analysis ||
    currentApp.swot_analysis ||
    currentApp.growth_analysis ||
    currentApp.pricing_analysis
  )

  const [slots, setSlots] = useState<Record<SlotKey, SlotData>>({
    morning: { state:'idle', post:null },
    midday:  { state:'idle', post:null },
    evening: { state:'idle', post:null },
  })
  const [activeTab, setActiveTab] = useState<Record<SlotKey, string>>({
    morning:'caption', midday:'caption', evening:'caption'
  })
  const [postStyle, setPostStyle] = useState<StyleId>(
    (currentApp.post_style as StyleId | null) ?? 'conversational'
  )

  function changeStyle(id: StyleId) {
    setPostStyle(id)
    updateApp(currentApp.id, { post_style: id } as any)
  }

  async function saveContentContext(ctx: ContentContext) {
    await updateApp(currentApp.id, { content_context: ctx } as any)
    setEditingContext(false)
    toast('Content context saved ✓')
  }

  const updateSlot = (key: SlotKey, update: Partial<SlotData>) =>
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], ...update } }))

  const generatePost = useCallback(async (type: SlotKey, style: StyleId) => {
    const c = SLOT_CONFIGS[type]
    const pillar = selectedPillar ?? todaysPillars[type]
    const pillarIdeas: string[] = (selectedPillar && pillarSuggestions?.[selectedPillar]) ? pillarSuggestions[selectedPillar] : []
    updateSlot(type, { state:'generating', post:null })

    const brandVoice = currentApp.brand ?? `You are the Instagram content strategist for ${currentApp.name}, a ${currentApp.category} app.`
    const testCtx = getTestContext(currentApp)
    const styleConfig = POST_STYLES.find(s => s.id === style) ?? POST_STYLES[1]
    const ctx = (currentApp as any).content_context as ContentContext | null | undefined
    const sanitize = (s: string) => s?.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '').trim() ?? ''
    const contentCtxBlock = ctx ? `
━━━ CONTENT CONTEXT (mandatory — use in every post) ━━━
TARGET USER: ${sanitize(ctx.typical_user)}
REAL RESULT: ${sanitize(ctx.real_result)}${ctx.user_quote?.trim() ? `\nACTUAL USER QUOTE: "${sanitize(ctx.user_quote)}"` : ''}
BEFORE STATE: ${sanitize(ctx.before_state)}
This context MUST shape every word. Never fall back to generic language — write for this specific user, their real result, and what they were doing before.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''

    // Slot metadata — metric and hook per slot; format instruction driven by chosen style
    const SLOT_META = {
      morning: { metric: 'SAVES',    hook: 'save_hook',    idx: 0 },
      midday:  { metric: 'SHARES',   hook: 'share_hook',   idx: 1 },
      evening: { metric: 'COMMENTS', hook: 'comment_hook', idx: 2 },
    }[type] as { metric: string; hook: string; idx: number }
    const formatInstruction = styleConfig.subFormats[SLOT_META.idx]

    // Gather already-generated captions from other slots for uniqueness constraints
    const otherSlots = (['morning', 'midday', 'evening'] as SlotKey[]).filter(s => s !== type)
    const existingCaptions = otherSlots
      .map(s => slots[s].post?.caption ?? '')
      .filter(Boolean)

    const avoidFirstWords = existingCaptions
      .map(cap => cap.trim().split(/\s+/)[0].replace(/[^a-zA-Z]/g, '').toLowerCase())
      .filter(Boolean)

    const avoidCTAs = existingCaptions
      .map(cap => {
        const sentences = cap.split(/(?<=[.!?])\s+/)
        return sentences[sentences.length - 1]?.trim().slice(0, 80) ?? ''
      })
      .filter(Boolean)

    const justDidUsed = existingCaptions.some(cap =>
      /just\s+(did|finished|tried|launched|shipped|built|ran)/i.test(cap) &&
      /what'?s\s+your/i.test(cap)
    )

    const uniquenessRules = existingCaptions.length > 0 ? `
CROSS-POST UNIQUENESS — other posts already generated:
${existingCaptions.map((cap, i) => `  Post already written: "${cap.slice(0, 100)}…"`).join('\n')}

HARD RULES — violating any of these makes the output invalid:
1. Do NOT start your caption with any of these words (case-insensitive): ${avoidFirstWords.map(w => `"${w}"`).join(', ')}
2. Do NOT use any of these closing CTAs or near-variants: ${avoidCTAs.map(s => `"${s}"`).join(' | ')}
3. ${justDidUsed ? 'The "Just did X, what\'s your Y?" pattern is ALREADY USED — do not use it at all.' : 'Do NOT use the "Just did X, what\'s your Y?" pattern — it is banned across all 3 posts.'}
4. Your caption MUST begin with a different word than every other post.
5. Your CTA/closing line MUST be meaningfully different from every other post's closing line.` : `
HARD RULE: Do NOT use the "Just did X, what\'s your Y?" pattern.`

    const prompt = `${brandVoice}
${testCtx}
${testCtx ? `CRITICAL: Reference specific features and real UX details from the product test. Caption must feel like it was written by someone who has actually used ${currentApp.name} deeply.` : ''}
${contentCtxBlock}

Generate 3 posts for this content pillar: ${pillar}. The posts should directly support this pillar's goal.
App: ${currentApp.name} — ${currentApp.desc ?? currentApp.category}
${pillarIdeas.length > 0 ? `Pillar post ideas to draw from:\n${pillarIdeas.slice(0, 5).map((idea, i) => `  ${i + 1}. ${idea}`).join('\n')}` : ''}
${weakestDim ? `Weakest landing page dimension: "${weakestDim.label}" (score: ${weakestDim.score}/10) — ${weakestDim.issue}. Posts should help build credibility in this area.` : ''}

━━━ POST STYLE ━━━
Style: ${styleConfig.emoji} ${styleConfig.label.toUpperCase()} (${styleConfig.desc})
Voice direction: ${styleConfig.voice}
Every word of the caption must reflect this style. The style overrides any default tone.

UNIVERSAL RULES (apply to every post regardless of style):
- Never use the words "just", "simply", or "easily"
- No generic questions like "What's your go-to X?"
- Each post must feel like a different moment, tone, and format from the others
- Reference the app's actual value proposition — not generic wellness or productivity language
- Write for the specific target user detected from the app description, not a generic audience
━━━━━━━━━━━━━━━━━

━━━ FORMAT REQUIREMENT ━━━
${formatInstruction}
${uniquenessRules}
━━━━━━━━━━━━━━━━━━━━━━━━━

Output ONLY valid JSON:
{
  "caption": "max 250 chars — authentic Instagram caption for the ${pillar} content pillar. Must match the format requirement above exactly. NO buzzwords.",
  "hashtags": ["12 hashtags without # — mix niche + broad"],
  "image_prompt": "Detailed Canva/DALL-E prompt — specific scene, lighting, mood, 1:1 format",
  "best_posting_time": "${c.time}",
  "pillar": "${pillar}",
  "${SLOT_META.hook}": "3-6 words to drive ${SLOT_META.metric.toLowerCase()}",
  ${type==='midday' ? '"insight_headline": "punchy 8-word headline for image overlay",' : ''}
  ${type==='evening' ? '"poll_options": ["Option A (2-4 words)", "Option B (2-4 words)"],' : ''}
  "post_idea": "one specific reel or carousel idea referencing a real feature",
  "engagement_type": "${type==='evening'?'poll_or_question':type==='midday'?'share_trigger':'save_trigger'}"
}`

    const SYSTEM = 'You are an expert Instagram content strategist. Output ONLY valid JSON. Follow both the POST STYLE and FORMAT REQUIREMENT exactly — both are mandatory.'
    try {
      const raw = await callClaude(prompt, SYSTEM, 1800)
      const post = safeParseJSON<AgentPost>(raw)
      updateSlot(type, { state:'ready', post })
      toast(`${c.label} ready! ✓`)
    } catch(e) {
      // If context was present it may have caused malformed JSON — retry without it
      if (contentCtxBlock) {
        try {
          const raw = await callClaude(prompt.replace(contentCtxBlock, ''), SYSTEM, 1800)
          const post = safeParseJSON<AgentPost>(raw)
          updateSlot(type, { state:'ready', post })
          toast(`${c.label} ready! ✓`)
          return
        } catch { /* fall through */ }
      }
      updateSlot(type, { state:'error', error: 'Generation failed — please try again.' })
    }
  }, [currentApp, todaysPillars, postStyle, selectedPillar, pillarSuggestions])

  const generateAll = () => {
    generatePost('morning', postStyle)
    setTimeout(() => generatePost('midday',  postStyle), 1800)
    setTimeout(() => generatePost('evening', postStyle), 3600)
  }

  if (plan !== 'content' && plan !== 'pro' && plan !== 'guest_pro') {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'60px 24px', textAlign:'center' }}>
        <div style={{ fontSize:36, marginBottom:16 }}>🔒</div>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:700, marginBottom:8 }}>Content Studio</div>
        <div style={{ fontSize:13, color:'var(--text3)', lineHeight:1.7, maxWidth:420, marginBottom:24 }}>
          Generate 3 daily Instagram posts — morning saves, midday shares, and evening engagement — all grounded in your app's real features and brand voice.
        </div>
        <button
          onClick={onUpgrade}
          style={{ padding:'12px 28px', borderRadius:9, background:'linear-gradient(135deg,#e26faf,#c4559a)', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}
        >
          Upgrade to Content Engine →
        </button>
        <div style={{ marginTop:10, fontSize:11, color:'var(--text3)' }}>$6/month · 30 AI posts/day · 3 apps</div>
      </div>
    )
  }

  const contentContext = (currentApp as any).content_context as ContentContext | null | undefined

  // Editing existing context (triggered from "Edit context" button or nudge banner)
  if (editingContext) {
    return (
      <ContentContextSetup
        existing={contentContext}
        onSave={saveContentContext}
        onCancel={() => setEditingContext(false)}
      />
    )
  }

  // New app with no context — required, no skip
  if (!contentContext && !isExistingApp) {
    return (
      <ContentContextSetup
        onSave={saveContentContext}
      />
    )
  }

  // Existing app with no context — optional form (unless already skipped)
  if (!contentContext && isExistingApp && !skippedContext) {
    return (
      <ContentContextSetup
        onSave={saveContentContext}
        canSkip
        onSkip={() => setSkippedContext(true)}
      />
    )
  }

  return (
    <div>
      {pt && !pt.error && (
        <div style={{ background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.25)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
          <span>🧪</span>
          <div style={{ flex:1, fontSize:12 }}>
            <strong style={{ color:'var(--green)' }}>AI Readiness Assessment active</strong> — posts are grounded in your assessment findings (score: {pt.overall_score}/100). Features: <span style={{ color:'var(--text2)' }}>{(pt.features_found??[]).map(f=>f.name).join(', ')}</span>
          </div>
        </div>
      )}

      {/* Content context bar — filled or nudge */}
      {contentContext ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, padding:'8px 12px', borderRadius:'var(--r)', background:'var(--surface2)', border:'1px solid var(--surface3)' }}>
          <div style={{ flex:1, fontSize:11, color:'var(--text3)', lineHeight:1.5 }}>
            <strong style={{ color:'var(--text2)' }}>Content context:</strong>{' '}
            {contentContext.typical_user}{contentContext.real_result ? ` · ${contentContext.real_result}` : ''}
          </div>
          <button
            onClick={() => setEditingContext(true)}
            style={{ fontSize:11, padding:'4px 11px', borderRadius:20, border:'1px solid var(--surface3)', background:'transparent', color:'var(--text2)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', whiteSpace:'nowrap' }}
          >
            Edit context
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditingContext(true)}
          style={{ display:'flex', alignItems:'center', gap:8, width:'100%', marginBottom:12, padding:'8px 12px', borderRadius:'var(--r)', background:'rgba(226,111,175,.06)', border:'1px dashed rgba(226,111,175,.3)', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans, sans-serif' }}
        >
          <span style={{ fontSize:14 }}>✨</span>
          <span style={{ flex:1, fontSize:12, color:'rgba(226,111,175,.9)', lineHeight:1.4 }}>
            Add context about your users to get better posts →
          </span>
        </button>
      )}

      {/* Post Style selector */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
        <span style={{ fontSize:11, color:'var(--text3)', fontWeight:500, flexShrink:0 }}>Post style →</span>
        {POST_STYLES.map(s => (
          <button
            key={s.id}
            onClick={() => changeStyle(s.id)}
            style={{
              fontSize:11, padding:'4px 12px', borderRadius:20, fontWeight:600, cursor:'pointer', border:'none',
              background: postStyle === s.id ? 'var(--accent)' : 'var(--surface2)',
              color: postStyle === s.id ? '#fff' : 'var(--text2)',
              transition:'background .15s,color .15s',
            }}
          >
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {/* Pillar selector */}
      {hasPillars ? (
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:6 }}>
            <span style={{ fontSize:11, color:'var(--text3)', fontWeight:500, flexShrink:0 }}>Content pillar →</span>
            {Object.keys(pillarSuggestions!).map(p => (
              <button
                key={p}
                onClick={() => setSelectedPillar(p)}
                style={{
                  fontSize:11, padding:'4px 12px', borderRadius:20, fontWeight:600, cursor:'pointer', border:'none',
                  background: selectedPillar === p ? '#7c6ff7' : 'var(--surface2)',
                  color: selectedPillar === p ? '#fff' : 'var(--text2)',
                  transition:'background .15s,color .15s',
                }}
              >
                {p}
              </button>
            ))}
            {weakestDim && selectedPillar === defaultPillar && (
              <span style={{ fontSize:10, color:'var(--text3)', marginLeft:2 }}>
                ↑ auto-selected (weakest: {weakestDim.label})
              </span>
            )}
            <button id="generate-all-btn" className="gen-btn" style={{ fontSize:11, padding:'5px 14px', marginLeft:'auto' }} onClick={generateAll}>
              ✨ Generate All 3
            </button>
          </div>
          {selectedPillar && pillarSuggestions![selectedPillar] && (
            <div style={{ fontSize:10, color:'var(--text3)', paddingLeft:4, lineHeight:1.5 }}>
              Ideas: {pillarSuggestions![selectedPillar].slice(0, 3).join(' · ')}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
          <span style={{ fontSize:12, color:'var(--text3)' }}>📋 No content pillars yet.</span>
          <button
            onClick={() => setView('overview')}
            style={{ fontSize:11, padding:'4px 12px', borderRadius:20, fontWeight:600, cursor:'pointer', background:'transparent', border:'1px solid var(--accent)', color:'var(--accent)' }}
          >
            Generate content pillars first →
          </button>
          <button id="generate-all-btn" className="gen-btn" style={{ fontSize:11, padding:'5px 14px', marginLeft:'auto' }} onClick={generateAll}>
            ✨ Generate All 3
          </button>
        </div>
      )}

      {/* Metric legend */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        {[['📥 Morning → Saves','rgba(59,130,246,.1)','#60a5fa'],['🔁 Midday → Shares','rgba(139,92,246,.1)','#a78bfa'],['💬 Evening → Comments','rgba(16,185,129,.1)','#34d399']].map(([l,bg,c]) => (
          <div key={l as string} style={{ fontSize:11, padding:'5px 12px', borderRadius:20, fontWeight:600, border:'1px solid var(--surface3)', background:bg as string, color:c as string, display:'flex', alignItems:'center', gap:5 }}>{l}</div>
        ))}
      </div>

      {/* Agent cards */}
      <div className="studio-cards" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:14 }}>
        {(['morning','midday','evening'] as SlotKey[]).map(type => (
          <AgentCard
            key={type}
            type={type}
            slot={slots[type]}
            pillar={selectedPillar ?? todaysPillars[type]}
            activeTab={activeTab[type]}
            onTabChange={tab => setActiveTab(prev => ({...prev, [type]:tab}))}
            onGenerate={() => generatePost(type, postStyle)}
          />
        ))}
      </div>
    </div>
  )
}

function AgentCard({ type, slot, pillar, activeTab, onTabChange, onGenerate }: {
  type: SlotKey
  slot: SlotData
  pillar: string
  activeTab: string
  onTabChange: (t: string) => void
  onGenerate: () => void
}) {
  const c = SLOT_CONFIGS[type]
  const { state, post } = slot

  const tabs = post ? [
    'caption','hashtags','image','timing','post idea',
    ...(post.insight_headline ? ['headline'] : []),
  ] : []

  const hook = post ? (post.save_hook ?? post.share_hook ?? post.comment_hook ?? '') : ''

  return (
    <div style={{ background:'var(--surface)', borderRadius:'var(--r2)', overflow:'hidden', display:'flex', flexDirection:'column', border:`1.5px solid ${state==='ready' ? c.border : 'var(--surface3)'}`, transition:'border-color .3s' }}>
      {/* Header */}
      <div style={{ padding:'13px 15px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--surface2)', background:c.bg }}>
        <span style={{ fontSize:20 }}>{c.emoji}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:c.color }}>{c.label}</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{c.time}</div>
        </div>
        {state==='ready' && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:c.bg, color:c.color, border:`1px solid ${c.border}` }}>Ready ✓</span>}
      </div>

      {/* Body */}
      <div style={{ padding:14, flex:1, display:'flex', flexDirection:'column', gap:10 }}>
        {state==='idle' && (
          <div style={{ textAlign:'center', padding:'28px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:28 }}>{c.emoji}</span>
            <div style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600, background:c.metricBg, color:c.metricColor }}>{c.metricLabel}</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>Ready to generate</div>
            <button onClick={onGenerate} style={{ width:'100%', padding:'9px 14px', borderRadius:'var(--r)', border:`1.5px solid ${c.border}`, background:'transparent', color:c.color, fontSize:12, fontWeight:600, cursor:'pointer', marginTop:4, fontFamily:'DM Sans, sans-serif' }}>
              ✨ Generate post
            </button>
          </div>
        )}

        {state==='generating' && (
          <div style={{ textAlign:'center', padding:'28px 0' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, color:c.color, fontSize:13 }}>
              <span className="spinner" style={{ color:c.color }} /> Generating…
            </div>
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:8 }}>Caption · Hashtags · Image prompt · Timing…</div>
          </div>
        )}

        {state==='error' && (
          <div style={{ textAlign:'center', padding:'14px 0' }}>
            <div style={{ color:'var(--red)', marginBottom:12, fontSize:12 }}>⚠️ {slot.error}</div>
            <button onClick={onGenerate} style={{ padding:'7px 14px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:7, fontSize:12, cursor:'pointer' }}>Retry</button>
          </div>
        )}

        {state==='ready' && post && (
          <>
            {/* Badges */}
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, border:`1px solid ${c.border}`, background:c.metricBg, color:c.metricColor, fontWeight:600 }}>{c.metricLabel}</span>
              {post.pillar && post.pillar !== 'undefined' && post.pillar.trim() && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, border:`1px solid ${c.border}`, background:c.bg, color:c.color, fontWeight:600 }}>{post.pillar}</span>}
            </div>

            {/* Metric reason */}
            {c.metricReason && <div style={{ fontSize:11, padding:'8px 10px', borderRadius:'var(--r)', fontWeight:500, lineHeight:1.5, border:'1px solid var(--surface2)', background:c.metricBg, color:c.metricColor }}>{c.metricReason}</div>}

            {/* Hook */}
            {hook && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'6px 10px', background:'rgba(180,120,0,.08)', border:'1px solid rgba(180,120,0,.2)', borderRadius:'var(--r)', fontSize:11, color:'#5c3d02' }}>
                <span>💡 Hook: <em>"{hook}"</em></span>
                <CopyButton text={hook} label="Copy" />
              </div>
            )}

            {/* Tabs */}
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', borderBottom:'1px solid rgba(255,255,255,.07)', paddingBottom:8 }}>
              {tabs.map(tab => (
                <button key={tab} onClick={() => onTabChange(tab)}
                  style={{ padding:'4px 10px', borderRadius:20, border:`1px solid ${activeTab===tab ? 'rgba(255,255,255,.15)' : 'transparent'}`, fontSize:11, fontWeight:activeTab===tab ? 600 : 500, color:activeTab===tab ? 'var(--text)' : 'var(--text2)', background:activeTab===tab ? 'var(--surface2)' : 'transparent', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab==='caption' && (
              <>
                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <CopyButton text={post.caption + '\n\n' + (post.hashtags??[]).map(h=>'#'+h).join(' ')} label="Copy caption + hashtags" />
                </div>
                <div style={{ fontSize:13, lineHeight:1.85, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'10px 12px', whiteSpace:'pre-wrap', color:'var(--text)' }}>{post.caption}</div>
                {post.poll_options && (
                  <div style={{ display:'flex', gap:6 }}>
                    {post.poll_options.map((o,i) => (
                      <div key={i} style={{ flex:1, padding:'7px 10px', borderRadius:'var(--r)', fontSize:12, textAlign:'center', border:`1px solid ${c.border}`, background:c.bg, color:c.color }}>{o}</div>
                    ))}
                  </div>
                )}
              </>
            )}
            {activeTab==='hashtags' && (
              <>
                <div style={{ display:'flex', justifyContent:'flex-end' }}><CopyButton text={(post.hashtags??[]).map(h=>'#'+h).join(' ')} label="Copy all" /></div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {(post.hashtags??[]).map(h => (
                    <span key={h} onClick={() => navigator.clipboard.writeText('#'+h)}
                      style={{ fontSize:12, padding:'4px 10px', borderRadius:20, border:`1px solid ${c.border}`, background:c.bg, color:c.color, fontWeight:500, cursor:'pointer' }}>
                      #{h}
                    </span>
                  ))}
                </div>
              </>
            )}
            {activeTab==='image' && (
              <>
                <div style={{ display:'flex', justifyContent:'flex-end' }}><CopyButton text={post.image_prompt} label="Copy prompt" /></div>
                <div style={{ fontSize:12, lineHeight:1.7, padding:'10px 12px', borderRadius:'var(--r)', border:'1px solid rgba(253,230,138,.15)', fontStyle:'italic', color:'#111118', background:'rgba(245,166,35,.06)' }}>{post.image_prompt}</div>
                <div style={{ fontSize:11, lineHeight:1.9, padding:'10px 12px', background:'var(--surface2)', borderRadius:'var(--r)', border:'1px solid var(--border)', color:'var(--text2)' }}>
                  Paste into: <a href="https://www.canva.com/ai-image-generator/" target="_blank" style={{ color:'#60a5fa' }}>Canva AI</a> · <a href="https://firefly.adobe.com" target="_blank" style={{ color:'#60a5fa' }}>Adobe Firefly</a> · <a href="https://labs.openai.com" target="_blank" style={{ color:'#60a5fa' }}>DALL-E</a>
                </div>
              </>
            )}
            {activeTab==='timing' && (
              <>
                <div style={{ padding:'13px 14px', borderRadius:'var(--r)', border:`1px solid ${c.border}`, background:c.bg }}>
                  <div style={{ fontSize:18, fontWeight:700, color:c.color, marginBottom:4 }}>⏰ {post.best_posting_time}</div>
                  <div style={{ fontSize:12, lineHeight:1.55, color:c.color, opacity:.8 }}>{c.timeReason}</div>
                </div>
                <div style={{ fontSize:12, lineHeight:1.75, padding:'10px 12px', background:'var(--surface2)', borderRadius:'var(--r)', border:'1px solid var(--border)', color:'var(--text2)' }}>
                  <strong style={{ color:'var(--text)' }}>Why this works:</strong><br/>{c.metricReason}<br/><br/>
                  <strong style={{ color:'var(--text)' }}>Best days:</strong> {c.bestDays}
                </div>
              </>
            )}
            {activeTab==='headline' && post.insight_headline && (
              <>
                <div style={{ display:'flex', justifyContent:'flex-end' }}><CopyButton text={post.insight_headline} label="Copy" /></div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:18, textAlign:'center', padding:14, borderRadius:'var(--r)', border:`1px solid ${c.border}`, background:c.bg, color:c.color, lineHeight:1.4 }}>"{post.insight_headline}"</div>
              </>
            )}
            {activeTab==='post idea' && (
              <>
                <div style={{ display:'flex', justifyContent:'flex-end' }}><CopyButton text={post.post_idea} label="Copy" /></div>
                <div style={{ fontSize:12, lineHeight:1.7, padding:'10px 12px', background:'rgba(139,92,246,.06)', border:'1px solid rgba(139,92,246,.15)', borderRadius:'var(--r)', color:'#c4b5fd' }}>💡 {post.post_idea}</div>
              </>
            )}

            <button onClick={onGenerate} style={{ width:'100%', padding:'9px 14px', borderRadius:'var(--r)', border:'1.5px solid rgba(255,255,255,.12)', background:'transparent', color:'var(--text2)', fontSize:12, fontWeight:600, cursor:'pointer', marginTop:4, fontFamily:'DM Sans, sans-serif', transition:'all .15s' }}>
              🔄 Regenerate
            </button>
          </>
        )}
      </div>
    </div>
  )
}
