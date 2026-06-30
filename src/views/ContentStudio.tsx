import { useState, useCallback, useEffect } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader, CopyButton } from '../components/ui'
import { callClaude, getTestContext, safeParseJSON } from '../lib/claude'
import { SLOT_CONFIGS } from '../lib/data'
import { toast } from '../components/Toast'
import type { AppData, AgentPost, ContentContext, PostHistoryEntry } from '../types'

type ChannelId = 'instagram' | 'linkedin' | 'twitter' | 'youtube' | 'facebook' | 'whatsapp' | 'email' | 'reddit'
type SlotKey = 'morning' | 'midday' | 'evening'
type SlotState = 'idle' | 'generating' | 'ready' | 'error'

const CHANNELS: { id: ChannelId; emoji: string; label: string; desc: string }[] = [
  { id: 'instagram',  emoji: '📸', label: 'Instagram',        desc: '3 posts · captions · hashtags' },
  { id: 'linkedin',   emoji: '💼', label: 'LinkedIn',         desc: '1 thought leadership post' },
  { id: 'twitter',    emoji: '𝕏',  label: 'Twitter / X',      desc: '1 thread · 5-7 tweets' },
  { id: 'youtube',    emoji: '🎬', label: 'YouTube Shorts',   desc: '3 script outlines · 60 sec' },
  { id: 'facebook',   emoji: '👥', label: 'Facebook',         desc: '2 community posts' },
  { id: 'whatsapp',   emoji: '💬', label: 'WhatsApp',         desc: '3 broadcast messages' },
  { id: 'email',      emoji: '📧', label: 'Email Newsletter', desc: 'Subject + 200-word body' },
  { id: 'reddit',     emoji: '🔴', label: 'Reddit',           desc: '1 value-add post' },
]

function marketingChannelToId(name: string): ChannelId | null {
  const n = (name ?? '').toLowerCase()
  if (n.includes('instagram'))                     return 'instagram'
  if (n.includes('linkedin'))                      return 'linkedin'
  if (n.includes('twitter') || n === 'x' || n.includes('/x')) return 'twitter'
  if (n.includes('youtube'))                       return 'youtube'
  if (n.includes('facebook'))                      return 'facebook'
  if (n.includes('whatsapp'))                      return 'whatsapp'
  if (n.includes('email'))                         return 'email'
  if (n.includes('reddit'))                        return 'reddit'
  return null
}

function getDefaultChannel(app: AppData): ChannelId {
  try {
    const gtm = app.gtm_analysis ? JSON.parse(app.gtm_analysis) : null
    const first = gtm?.channels?.[0]?.name
    return (first ? marketingChannelToId(first) : null) ?? 'instagram'
  } catch { return 'instagram' }
}

function getRecommendedChannelIds(app: AppData): Set<ChannelId> {
  try {
    const gtm = app.gtm_analysis ? JSON.parse(app.gtm_analysis) : null
    const ids = (gtm?.channels ?? []).map((c: any) => marketingChannelToId(c.name)).filter(Boolean)
    return new Set(ids as ChannelId[])
  } catch { return new Set() }
}

const CHANNEL_TIMING: Record<ChannelId, { best: string; days: string; tip: string }> = {
  instagram: { best: '7–9 AM, 12–2 PM, 7–9 PM', days: 'Tue, Wed, Thu',   tip: 'Post stories at 8 AM for max reach on feed posts.' },
  linkedin:  { best: '8–10 AM',                  days: 'Tue, Wed, Thu',   tip: 'Morning posts get 2× more engagement than afternoon.' },
  twitter:   { best: '9 AM, 12 PM, 5–6 PM',      days: 'Mon–Fri',         tip: 'Threads perform best at lunch and after-work hours.' },
  youtube:   { best: '2–4 PM',                   days: 'Fri, Sat, Sun',   tip: 'Upload 2–3 hrs before peak view time for indexing.' },
  facebook:  { best: '9 AM–12 PM',               days: 'Wed, Thu, Fri',   tip: 'Video posts get 3× more organic reach than text.' },
  whatsapp:  { best: '8–9 AM, 7–8 PM',           days: 'Mon–Fri',         tip: 'Keep broadcast messages under 3 sentences.' },
  email:     { best: '10 AM',                    days: 'Tue, Thu',         tip: 'Subject line determines 47% of open rates — A/B test it.' },
  reddit:    { best: '8–9 AM ET',                days: 'Mon, Tue',         tip: 'Post early weekday morning for maximum upvotes.' },
}

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

function deriveContentContext(
  app: AppData,
  pillar: string,
  pillarSuggestions: Record<string, string[]> | null
): string {
  const ua = app.url_analysis
  const parts: string[] = []

  const category = ua?.category ?? app.category
  if (category) parts.push(`Category: ${category}`)

  const headline = ua?.headline
  if (headline || app.desc) {
    parts.push(`Target outcome: ${[headline, app.desc].filter(Boolean).join(' — ')}`)
  }

  const weakest = ua?.dimensions?.slice().sort((a, b) => a.score - b.score)[0]
  if (weakest) {
    parts.push(`Current weakest area: ${weakest.label} (${weakest.score}/10) — ${weakest.issue}`)
  }

  const pillarGoal = pillarSuggestions?.[pillar]?.[0] ?? ''
  parts.push(`Content focus this week: ${pillar}${pillarGoal ? ` — ${pillarGoal}` : ''}`)

  if (ua?.growth_teaser) {
    parts.push(`Growth opportunity: ${ua.growth_teaser}`)
  }

  if (parts.length === 0) return ''
  return `━━━ APP CONTEXT (automatically derived) ━━━\n${parts.join('\n')}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
}

function buildContentStrategyContext(currentApp: any, ua: any) {
  const swot        = currentApp?.swot_analysis        ? JSON.parse(currentApp.swot_analysis)        : null
  const competitive = currentApp?.competitive_analysis ? JSON.parse(currentApp.competitive_analysis) : null
  const growth      = currentApp?.growth_analysis      ? JSON.parse(currentApp.growth_analysis)      : null
  const gtm         = currentApp?.gtm_analysis         ? JSON.parse(currentApp.gtm_analysis)         : null

  return {
    targetUser:          currentApp?.content_context?.typical_user || 'target user',
    realResult:          currentApp?.content_context?.real_result  || '',
    userQuote:           currentApp?.content_context?.user_quote   || '',
    beforeState:         currentApp?.content_context?.before_state || '',
    bottleneck:          ua?.bottleneck?.label                     || '',
    bottleneckIssue:     ua?.bottleneck?.issue                     || '',
    topStrengths:        swot?.strengths?.slice(0, 2)              || [],
    topOpportunity:      swot?.opportunities?.[0]                  || '',
    positioningGap:      competitive?.positioning_gap              || '',
    competitorWeakness:  competitive?.gaps?.[0]                    || '',
    activePillar:        currentApp?.pillar_suggestions?.[0]?.name || '',
    recommendedChannels: gtm?.channels?.slice(0, 3).map((c: any) => c.name) || [],
    gtmStage:            gtm?.stage                                || '',
    headline:            ua?.headline                              || currentApp?.name || '',
    _growth: growth,  // retained for Step 3 platform-specific prompts
  }
}

function getPlatformPrompt(channel: string, ctx: any, style: string): string {
  const base = `
APP: ${ctx.headline}
TARGET USER: ${ctx.targetUser}
REAL RESULT: ${ctx.realResult}
USER QUOTE: ${ctx.userQuote}
BEFORE STATE: ${ctx.beforeState}
BOTTLENECK: ${ctx.bottleneck} — ${ctx.bottleneckIssue}
POSITIONING GAP: ${ctx.positioningGap}
ACTIVE PILLAR: ${ctx.activePillar}
TOP STRENGTH: ${ctx.topStrengths?.[0] || ''}
STYLE: ${style}
`

  switch (channel) {
    case 'Twitter / X':
      return `${base}
Write a Twitter/X thread of exactly 7 tweets about ${ctx.headline}.

TWEET FORMAT RULES:
- Every tweet must be 200-250 characters — never shorter, never longer
- Tweet 1 (Hook): A bold, counterintuitive statement that stops the scroll. End with 🧵 No question marks.
- Tweets 2-6 (Body): Each tweet builds on the previous. 2-3 sentences. Specific, not vague. Each must make sense standalone.
- Tweet 7 (CTA): One clear action. Include the app name naturally.
- Number each tweet: 1/ 2/ 3/ etc
- NEVER use "thread" as the first word
- NEVER write one-liners — each tweet needs substance
- NO generic phrases like "the key is", "at the end of the day", "game changer"

Output format:
1/ [tweet text — 200-250 chars]
2/ [tweet text — 200-250 chars]
...continue for all 7 tweets`

    case 'LinkedIn':
      return `${base}
Write 1 LinkedIn post about ${ctx.headline}.

LINKEDIN FORMAT RULES:
- Line 1 (Hook): A single bold statement or counterintuitive fact. Max 12 words. Must make someone stop scrolling. NO "I am excited", NO "thrilled to share"
- Line 2: Blank line
- Body: 4-5 short paragraphs. Max 2 sentences each. Lots of white space. Build a specific insight or story.
- Each paragraph separated by blank line
- Second-to-last paragraph: The key insight or takeaway
- Last line: Soft question OR a single-line CTA — never both
- Total length: 180-250 words
- Hashtags: Maximum 3, highly specific, at the very end on a new line
- NEVER use bullet points
- NEVER mention features — tell a story or share an insight

Output the full post exactly as it should appear on LinkedIn.`

    case 'Instagram':
      return `${base}
Write 3 Instagram posts for ${ctx.headline}. Each post must use a DIFFERENT format.

POST FORMAT (use for each post):
VISUAL: [Detailed image description — follow visual rules below]
CAPTION:
[Hook line — must be compelling before the "more" cutoff, max 125 chars]
[2-3 sentences of content]
[Closing line — NOT a generic question]
HASHTAGS: [8 hashtags — mix of niche-specific, audience-specific, and 1-2 broad. NO generic ones like #motivation #success]

FORMAT RULES:
- Post 1 (Before/After): transformation format — "[user] used to [problem]. Now [specific change]."
- Post 2 (Tip/Fact): specific tip or non-obvious fact with a real example and number
- Post 3 (Story/Scene): a cinematic real-life moment — not a product pitch
- Maximum 1 post may end with a question
- NEVER start two posts with the same word
- NEVER use "just", "simply", "easily"

VISUAL RULES:
Each VISUAL description must be directly tied to THAT post's specific message — not generic.

Post 1 VISUAL (Before/After): Split image — left side shows the PROBLEM state specific to this post's message (frustrated user, chaotic workflow, failed attempt — name the exact scene), right side shows the SOLUTION state (calm, organised, relieved — name the exact scene). Describe both halves specifically with setting, lighting, and emotion.

Post 2 VISUAL (Tip/Fact): Clean infographic style — one bold number or short statement as the focal point, minimal text overlay, strong color contrast. Describe the background color, typography mood, and any supporting graphic element that reinforces the specific tip or fact in this post.

Post 3 VISUAL (Story/Scene): Cinematic real-life moment — describe a SPECIFIC SCENE with: who is in frame, where they are, what time of day, what they are doing, what emotion is on their face, and the lighting and color palette. Think documentary-style, not stock photo.

For ALL three visuals:
- Always square (1:1) or portrait (4:5) format
- Must work as a standalone image without reading the caption
- Describe mood, lighting, and color palette — not just the subject
- Be specific to the TARGET USER of ${ctx.headline} — name their context (job, location, situation)
- Be detailed enough for a designer or AI image generator to recreate exactly
- NEVER say "person using app on phone" or "person on smartphone" — always describe who, where, when, and how they feel

Example of BAD visual: "Person using smartphone with app open"
Example of GOOD visual: "Close-up of a tired Indian founder at 11pm, dim desk lamp, laptop screen showing a red landing page score, coffee cup half empty, expression shifting to relief as score improves"`

    case 'YouTube Shorts':
      return `${base}
Write 3 YouTube Shorts scripts for ${ctx.headline}. Each script = exactly 60 seconds when spoken at normal pace.

SCRIPT FORMAT:
TITLE: [YouTube title — curiosity gap, max 60 chars, no clickbait]
HOOK (0-3 sec): [Pattern interrupt — start mid-action or with a shocking statement. NO "Hey guys", NO "Welcome back"]
CONTENT (4-52 sec): [The main value — conversational, visual, specific. Write exactly what to say. No filler. Each sentence should move the story forward.]
CTA (53-60 sec): [Single clear action — specific, not generic]

RULES:
- Write the actual script words — not descriptions of what to say
- Speak directly to ONE person, not "you all" or "everyone"
- Each script must cover a different angle
- Estimated word count per script: 120-150 words`

    case 'Facebook':
      return `${base}
Write 2 Facebook posts for ${ctx.headline}.

FACEBOOK FORMAT RULES:
- Post 1: Story-led — a specific relatable moment your target user has experienced. 80-100 words. Warm tone. End with an open question that invites sharing.
- Post 2: Value-add tip — one practical insight your target user can use today. 70-90 words. Conversational. End with a community invitation.
- Write like a real person in a community group — not a brand
- NO hashtags
- NO links in the post body
- Use "you" and "I" — never "we" as a brand
- Short sentences. Easy to read on mobile.`

    case 'WhatsApp':
      return `${base}
Write 3 WhatsApp broadcast messages for ${ctx.headline}.

WHATSAPP FORMAT RULES:
- Each message: Maximum 3 sentences. No more.
- NO formatting — no bold (*text*), no bullets, no line breaks
- Write like a message from a trusted friend — personal, warm, direct
- Message 1: Share a specific insight or fact
- Message 2: A short personal story or observation
- Message 3: A practical tip or recommendation
- Never sound like a brand or newsletter
- Never use "we" — always "I" or "you"
- Never end with "check out" or "click here"`

    case 'Email Newsletter':
      return `${base}
Write 1 email newsletter for ${ctx.headline}.

EMAIL FORMAT:
SUBJECT LINE: [Max 7 words. Curiosity gap or specific promise. No clickbait. No emojis.]
PREVIEW TEXT: [Completes or extends the subject line. Max 12 words.]

BODY:
[Opening line: Bold statement or question. Max 15 words.]

[Paragraph 1: The core insight or story — 3-4 sentences. Specific, not vague.]

[Paragraph 2: Why this matters to the reader — 2-3 sentences. Make it personal.]

[Paragraph 3: One actionable takeaway — 2 sentences.]

[CTA line: One clear action. Not "click here." Specific.]

RULES:
- Total body: 150-200 words
- ONE topic only — not a roundup
- ONE CTA only
- Short paragraphs — each separated by blank line
- Write in second person ("you") throughout`

    case 'Reddit':
      return `${base}
Write 1 Reddit post for ${ctx.headline}.

SUBREDDIT: [Recommend the single most relevant subreddit with a one-line reason why. Be specific — not r/entrepreneur but r/SaaS or r/indiegaming etc]

TITLE: [Question or observation — zero promotional language. Should spark genuine curiosity or discussion. Max 15 words.]

POST BODY:
[Opening: A genuine problem or observation — 2-3 sentences. Sounds like a real community member, not a founder.]
[Middle: Specific context or story — 3-4 sentences. Add real value. Teach something.]
[Closing: Either a genuine question to the community OR a natural mention of how you solved this problem — only if it fits organically. NEVER pitch directly.]

RULES:
- Total length: 150-200 words
- NEVER mention the app name in the title
- NEVER say "I built" in the first sentence
- Sound like someone seeking community input, not someone promoting a product
- If mentioning the app, do it as one sentence at the end: "I actually built [app] to solve exactly this — happy to share more if useful"`

    default:
      return `${base}
Write 3 posts for ${channel} about ${ctx.headline}. Make each post platform-appropriate, specific to the target user, and varied in format. Never generic.`
  }
}

async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 512
      const scale = Math.min(1, MAX / img.width)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.50))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
}

async function describeScreenshots(screenshots: string[]): Promise<string> {
  if (!screenshots.length) return ''
  try {
    return await callClaude(
      'Describe each app screenshot in 2-3 sentences focusing on: what feature is shown, what UI elements are visible, what copy or text appears, and what user action is being demonstrated. Be specific and concise.',
      'You are a precise UI analyst. Describe what you see in the screenshots clearly and concisely.',
      400,
      undefined,
      'haiku',
      'content',
      screenshots,
    )
  } catch { return '' }
}

function ContentContextSetup({ existing, onSave, onCancel }: {
  existing?: ContentContext | null
  onSave: (ctx: ContentContext) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ContentContext>({
    typical_user: existing?.typical_user ?? '',
    real_result:  existing?.real_result  ?? '',
    user_quote:   existing?.user_quote   ?? '',
    before_state: existing?.before_state ?? '',
  })
  const [screenshots, setScreenshots] = useState<string[]>(existing?.screenshots ?? [])
  const [uploading,   setUploading]   = useState(false)
  const [saving,      setSaving]      = useState(false)

  const field = (key: keyof ContentContext, label: string, placeholder: string, required = true, multiline = false) => (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>
        {label}{required && <span style={{ color:'var(--accent)', marginLeft:3 }}>*</span>}
      </label>
      {multiline ? (
        <textarea
          rows={3}
          placeholder={placeholder}
          value={form[key] as string}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={{ resize:'vertical', fontSize:13, padding:'9px 11px', borderRadius:'var(--r)', border:'1px solid var(--surface3)', background:'var(--surface2)', color:'var(--text)', fontFamily:'DM Sans, sans-serif', lineHeight:1.55, outline:'none' }}
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={form[key] as string}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={{ fontSize:13, padding:'9px 11px', borderRadius:'var(--r)', border:'1px solid var(--surface3)', background:'var(--surface2)', color:'var(--text)', fontFamily:'DM Sans, sans-serif', outline:'none' }}
        />
      )}
    </div>
  )

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - screenshots.length)
    if (!files.length) return
    setUploading(true)
    const compressed = (await Promise.all(files.map(compressImage))).filter(Boolean)
    setScreenshots(prev => [...prev, ...compressed].slice(0, 3))
    setUploading(false)
    e.target.value = ''
  }

  async function submit() {
    setSaving(true)
    onSave({ ...form, ...(screenshots.length > 0 ? { screenshots } : {}) })
  }

  return (
    <div style={{ maxWidth:540, margin:'0 auto', padding:'8px 0 24px' }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:700, marginBottom:6 }}>
          {existing ? 'Edit User Context' : 'Add Real User Context'}
        </div>
        <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.7 }}>
          {existing
            ? 'Update your user context — posts will use these details alongside the auto-derived app data.'
            : 'Add real quotes and examples to make posts feel even more specific. Posts already work without this — this just makes them better.'}
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {field('typical_user', '1. Who is your typical user?', 'e.g. "Freelance designers who struggle to track invoices"', false)}
        {field('real_result',  '2. What result have users seen from your app?', 'e.g. "Save 3 hours/week on invoicing"', false)}
        {field('user_quote',   '3. Paste any real user feedback or review you\'ve received', 'e.g. "This app saved my business — Jane D."', false, true)}
        {field('before_state', '4. What were users doing before they found your app?', 'e.g. "Using spreadsheets and chasing clients manually"', false)}

        {/* Screenshots */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>
            5. App screenshots <span style={{ color:'var(--text3)', fontWeight:400 }}>(optional · up to 3)</span>
          </label>
          <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.55 }}>
            Claude references specific UI elements visible in screenshots — makes posts feel authentic and specific.
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-start' }}>
            {screenshots.map((src, i) => (
              <div key={i} style={{ position:'relative', flexShrink:0 }}>
                <img src={src} alt={`Screenshot ${i+1}`}
                  style={{ width:80, height:60, objectFit:'cover', borderRadius:6, border:'1px solid var(--surface3)', display:'block' }} />
                <button
                  onClick={() => setScreenshots(s => s.filter((_, j) => j !== i))}
                  style={{ position:'absolute', top:-7, right:-7, width:18, height:18, borderRadius:'50%', background:'var(--red,#e55)', color:'#fff', border:'2px solid var(--surface)', fontSize:11, lineHeight:1, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, padding:0 }}
                >×</button>
              </div>
            ))}
            {screenshots.length < 3 && (
              <label style={{ width:80, height:60, borderRadius:6, border:'1px dashed var(--surface3)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:uploading?'wait':'pointer', gap:3, background:'var(--surface2)', flexShrink:0 }}>
                <input type="file" accept="image/*" multiple style={{ display:'none' }} disabled={uploading} onChange={handleFiles} />
                {uploading
                  ? <span style={{ fontSize:11, color:'var(--text3)' }}>…</span>
                  : <>
                      <span style={{ fontSize:18 }}>📷</span>
                      <span style={{ fontSize:9, color:'var(--text3)', fontWeight:600 }}>Add photo</span>
                    </>
                }
              </label>
            )}
          </div>
        </div>

        <div style={{ display:'flex', gap:10, marginTop:4 }}>
          <button
            onClick={submit}
            disabled={saving || uploading}
            style={{ flex:1, padding:'11px 0', borderRadius:9, background:'linear-gradient(135deg,#e26faf,#c4559a)', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:(saving||uploading)?'default':'pointer', opacity:(saving||uploading)?.6:1, fontFamily:'DM Sans, sans-serif' }}
          >
            {saving ? 'Saving…' : (existing ? 'Save changes' : 'Save context')}
          </button>
          <button onClick={onCancel} style={{ padding:'11px 18px', borderRadius:9, background:'var(--surface2)', color:'var(--text2)', border:'none', fontSize:13, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>
            Cancel
          </button>
        </div>
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

  const [activeChannel, setActiveChannel] = useState<ChannelId>(() => getDefaultChannel(currentApp))
  const [channelResults, setChannelResults] = useState<Record<string, string>>({})
  const [channelLoading, setChannelLoading] = useState(false)
  const [selectedPillar, setSelectedPillar] = useState<string | null>(defaultPillar)
  const [editingContext, setEditingContext] = useState(false)
  const [trendingTopics, setTrendingTopics] = useState<string[]>([])
  const [feedbackModal, setFeedbackModal] = useState(false)
  const [feedbackPosts, setFeedbackPosts] = useState<PostHistoryEntry[]>([])

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

  useEffect(() => {
    setSlots({ morning: { state:'idle', post:null }, midday: { state:'idle', post:null }, evening: { state:'idle', post:null } })
    setActiveTab({ morning:'caption', midday:'caption', evening:'caption' })
    setEditingContext(false)
    setSelectedPillar(defaultPillar)
    setActiveChannel(getDefaultChannel(currentApp))
    setChannelResults({})
    setChannelLoading(false)
  }, [currentApp.id])

  // Fetch trending topics for the app's category — must complete within 3 s or skip
  useEffect(() => {
    async function fetchTrending() {
      try {
        const fetchPromise = fetch('/api/trending', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ category: currentApp.category }),
        })
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        )
        const resp = await Promise.race([fetchPromise, timeout])
        if (resp.ok) {
          const data = await resp.json()
          setTrendingTopics(data.topics ?? [])
        }
      } catch { /* silently skip — trending is optional context */ }
    }
    fetchTrending()
  }, [currentApp.id, currentApp.category])

  // Engagement feedback loop — check if it's been 7 days since last feedback
  useEffect(() => {
    const history = (currentApp.post_history as PostHistoryEntry[] | null) ?? []
    if (history.length < 5) return
    const feedbackKey = `markr_feedback_${currentApp.id}`
    const lastShown   = localStorage.getItem(feedbackKey)
    const daysSince   = lastShown
      ? (Date.now() - new Date(lastShown).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity
    if (daysSince >= 7) {
      setFeedbackPosts(history.slice(-5).reverse())
      setFeedbackModal(true)
    }
  }, [currentApp.id])

  function changeStyle(id: StyleId) {
    setPostStyle(id)
    updateApp(currentApp.id, { post_style: id } as any)
  }

  async function saveContentContext(ctx: ContentContext) {
    await updateApp(currentApp.id, { content_context: ctx } as any)
    setEditingContext(false)
    toast('Content context saved ✓')
  }

  async function handleFeedbackSubmit(winner: PostHistoryEntry | null) {
    const feedbackKey = `markr_feedback_${currentApp.id}`
    localStorage.setItem(feedbackKey, new Date().toISOString())
    setFeedbackModal(false)
    if (!winner) return
    const ctx = (currentApp as any).content_context as ContentContext | null | undefined
    const existing = ctx?.top_performing_formats ?? []
    const key = `${winner.channel}/${winner.format}`
    const updated = [...new Set([...existing, key])].slice(-10)
    const newCtx = { typical_user:'', real_result:'', user_quote:'', before_state:'', ...ctx, top_performing_formats: updated }
    await updateApp(currentApp.id, { content_context: newCtx } as any)
    toast('Top format saved — future posts will prioritise this style ✓')
  }

  const updateSlot = (key: SlotKey, update: Partial<SlotData>) =>
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], ...update } }))

  const generatePost = useCallback(async (type: SlotKey, style: StyleId) => {
    const c = SLOT_CONFIGS[type]
    const pillar = selectedPillar ?? todaysPillars[type]
    const pillarIdeas: string[] = (selectedPillar && pillarSuggestions?.[selectedPillar]) ? pillarSuggestions[selectedPillar] : []
    updateSlot(type, { state:'generating', post:null })

    const ua = currentApp.url_analysis
    const stratCtx = buildContentStrategyContext(currentApp, ua)
    const stratCtxBlock = [
      stratCtx.targetUser !== 'target user' ? `Target user: ${stratCtx.targetUser}` : '',
      stratCtx.realResult  ? `Proven result: ${stratCtx.realResult}`  : '',
      stratCtx.beforeState ? `Before state: ${stratCtx.beforeState}`  : '',
      stratCtx.bottleneck  ? `#1 bottleneck to address: ${stratCtx.bottleneck} — ${stratCtx.bottleneckIssue}` : '',
      stratCtx.positioningGap      ? `Competitor positioning gap: ${stratCtx.positioningGap}`     : '',
      stratCtx.competitorWeakness  ? `Competitor weakness to exploit: ${stratCtx.competitorWeakness}` : '',
      stratCtx.recommendedChannels.length ? `Marketing recommended channels: ${stratCtx.recommendedChannels.join(', ')}` : '',
    ].filter(Boolean).join('\n')

    const brandVoice = currentApp.brand ?? `You are the Instagram content strategist for ${currentApp.name}, a ${currentApp.category} app.`
    const testCtx = getTestContext(currentApp)
    const styleConfig = POST_STYLES.find(s => s.id === style) ?? POST_STYLES[1]

    const derivedCtxBlock = deriveContentContext(currentApp, pillar, pillarSuggestions)

    const ENDING_RULE = {
      morning: 'THIS POST (morning) MUST end with a STATEMENT — never a question.',
      midday:  'THIS POST (midday) MUST end with a TIP or OBSERVATION — never a question.',
      evening: 'THIS POST (evening) is the only one in the set permitted to end with a question. It may also end with a statement.',
    }[type]

    const ABSOLUTE_RULES = `ABSOLUTE RULES — THESE OVERRIDE EVERYTHING ELSE:
Rule 1: OUT OF 3 POSTS, MAXIMUM 1 CAN END WITH A QUESTION. The other 2 MUST end with a statement, tip, observation or CTA.
Rule 2: NEVER use these phrases: "What's your", "How do you", "Do you", "Have you ever", "What do you think", "Share your"
Rule 3: Each post MUST use a different ending type — cycle through: statement → tip → question (in that order, mapped to morning → midday → evening).
Rule 4: If you find yourself writing a question at the end of the morning or midday post, STOP and rewrite it as a statement or tip instead.
${ENDING_RULE}
VIOLATION CHECK: Before returning JSON, check whether your caption ends with "?". If it does and this is not the evening slot, rewrite the ending as a statement or tip.`

    const ctx = (currentApp as any).content_context as ContentContext | null | undefined
    const screenshots = ctx?.screenshots ?? []
    const sanitize = (s: string) => s?.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '').trim() ?? ''
    const contentCtxBlock = ctx ? `
━━━ USER CONTEXT (real quotes and examples — layer on top of app context) ━━━
${ctx.typical_user?.trim() ? `TARGET USER: ${sanitize(ctx.typical_user)}` : ''}
${ctx.real_result?.trim()  ? `REAL RESULT: ${sanitize(ctx.real_result)}`  : ''}
${ctx.user_quote?.trim()   ? `ACTUAL USER QUOTE: "${sanitize(ctx.user_quote)}"` : ''}
${ctx.before_state?.trim() ? `BEFORE STATE: ${sanitize(ctx.before_state)}` : ''}
Use these specifics wherever possible — they make posts feel earned, not invented.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''

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

    // Describe screenshots via a separate vision call, then use text — keeps main payload small
    const screenshotDesc = screenshots.length > 0 ? await describeScreenshots(screenshots) : ''
    const screenshotInstruction = screenshotDesc
      ? `\nAPP SCREENSHOTS — visual analysis of the product:\n${screenshotDesc}\nReference these specific UI details to make captions feel authentic and grounded in the real product.\n`
      : ''

    // Post history — inject last 5 to prevent repetition
    const postHistory = (currentApp.post_history as PostHistoryEntry[] | null) ?? []
    const historyBlock = postHistory.length > 0 ? `
RECENT POSTS — create meaningfully different content (different angles, hooks, and opening lines):
${postHistory.slice(-5).map(h => `  • [${h.channel}/${h.format}] "${h.excerpt.slice(0, 80)}"`).join('\n')}
(Do NOT reuse the same opening word, hook structure, or closing CTA from any of the above)` : ''

    // Top-performing formats from engagement feedback
    const topFormats = ctx?.top_performing_formats ?? []
    const topFormatsBlock = topFormats.length > 0
      ? `\nTOP-PERFORMING FORMATS for this account: ${topFormats.join(', ')} — prioritise these when the pillar allows.\n`
      : ''

    // Trending topics from Reddit (fetched async on mount)
    const trendingBlock = trendingTopics.length > 0
      ? `\nTRENDING NOW in ${currentApp.category}:\n${trendingTopics.map(t => `  • ${t}`).join('\n')}\n(Reference these themes if relevant to the content pillar — don't force it)\n`
      : ''

    const prompt = `${ABSOLUTE_RULES}

${brandVoice}
${testCtx}
${testCtx ? `CRITICAL: Reference specific features and real UX details from the product test. Caption must feel like it was written by someone who has actually used ${currentApp.name} deeply.` : ''}
${derivedCtxBlock}
${contentCtxBlock}
${screenshotInstruction}${historyBlock}${topFormatsBlock}${trendingBlock}${stratCtxBlock ? `━━━ CROSS-MODULE STRATEGY CONTEXT ━━━\n${stratCtxBlock}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''}

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

    const SYSTEM = `${ABSOLUTE_RULES}

You are an expert Instagram content strategist. Output ONLY valid JSON. Follow the ABSOLUTE RULES, POST STYLE, and FORMAT REQUIREMENT — all are mandatory, in that priority order.`
    function recordHistory(caption: string) {
      const entry: PostHistoryEntry = { ts: new Date().toISOString(), channel: 'instagram', format: `${style}:${type}`, excerpt: caption.slice(0, 120) }
      const prev = (currentApp.post_history as PostHistoryEntry[] | null) ?? []
      updateApp(currentApp.id, { post_history: [...prev, entry].slice(-30) } as any)
    }

    try {
      const raw = await callClaude(prompt, SYSTEM, 1800, undefined, 'haiku', 'content')
      const post = safeParseJSON<AgentPost>(raw)
      updateSlot(type, { state:'ready', post })
      toast(`${c.label} ready! ✓`)
      recordHistory(post.caption ?? '')
    } catch(e) {
      // If context was present it may have caused malformed JSON — retry without it
      if (contentCtxBlock) {
        try {
          const raw = await callClaude(prompt.replace(contentCtxBlock, ''), SYSTEM, 1800, undefined, 'haiku', 'content')
          const post = safeParseJSON<AgentPost>(raw)
          updateSlot(type, { state:'ready', post })
          toast(`${c.label} ready! ✓`)
          recordHistory(post.caption ?? '')
          return
        } catch { /* fall through */ }
      }
      updateSlot(type, { state:'error', error: 'Generation failed — please try again.' })
    }
  }, [currentApp, todaysPillars, postStyle, selectedPillar, pillarSuggestions, updateApp, trendingTopics])

  const generateAll = () => {
    generatePost('morning', postStyle)
    setTimeout(() => generatePost('midday',  postStyle), 1800)
    setTimeout(() => generatePost('evening', postStyle), 3600)
  }

  async function generateForChannel() {
    const ua          = currentApp.url_analysis
    const stratCtx    = buildContentStrategyContext(currentApp, ua)
    const ch          = CHANNELS.find(c => c.id === activeChannel)
    const label       = ch?.label ?? activeChannel
    const ctx          = (currentApp as any).content_context as ContentContext | null | undefined
    const screenshots  = ctx?.screenshots ?? []

    // Describe screenshots via a separate vision call — keeps main payload small
    const screenshotDesc = screenshots.length > 0 ? await describeScreenshots(screenshots) : ''
    const screenshotNote = screenshotDesc
      ? `\n\nAPP SCREENSHOTS — visual analysis of the product:\n${screenshotDesc}\nReference these specific UI details to make content feel authentic and grounded in the real product.`
      : ''

    // Post history injection
    const postHistory   = (currentApp.post_history as PostHistoryEntry[] | null) ?? []
    const historyBlock  = postHistory.length > 0
      ? `\n\nRECENT POSTS — create meaningfully different content:\n${postHistory.slice(-5).map(h => `  • [${h.channel}] "${h.excerpt.slice(0, 80)}"`).join('\n')}\n(Do NOT reuse the same opening, hook structure, or CTA from any of the above)`
      : ''

    // Top-performing formats
    const topFormats      = ctx?.top_performing_formats ?? []
    const topFormatsNote  = topFormats.length > 0
      ? `\n\nTOP-PERFORMING FORMATS for this account: ${topFormats.join(', ')} — prioritise these when possible.`
      : ''

    // Trending topics
    const trendingNote = trendingTopics.length > 0
      ? `\n\nTRENDING NOW in ${currentApp.category}: ${trendingTopics.join(' | ')}\n(Reference if relevant — don't force it)`
      : ''

    const prompt = getPlatformPrompt(label, stratCtx, postStyle) + screenshotNote + historyBlock + topFormatsNote + trendingNote
    setChannelLoading(true)
    try {
      const raw = await callClaude(
        prompt,
        'You are an expert content strategist. Write only the requested content. No explanations or preamble.',
        2400,
        undefined,
        'sonnet',
        'content',
      )
      setChannelResults(prev => ({ ...prev, [activeChannel]: raw }))
      toast(`${label} content ready!`)
      // Append to post history
      const entry: PostHistoryEntry = { ts: new Date().toISOString(), channel: activeChannel, format: label, excerpt: raw.slice(0, 120).trim() }
      const prev = (currentApp.post_history as PostHistoryEntry[] | null) ?? []
      updateApp(currentApp.id, { post_history: [...prev, entry].slice(-30) } as any)
    } catch (e: any) {
      toast('Generation failed: ' + (e?.message ?? 'Unknown'))
    }
    setChannelLoading(false)
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

  if (editingContext) {
    return (
      <ContentContextSetup
        existing={contentContext}
        onSave={saveContentContext}
        onCancel={() => setEditingContext(false)}
      />
    )
  }

  const recommendedIds = getRecommendedChannelIds(currentApp)
  const landingScore   = currentApp.url_analysis?.overall ?? null

  return (
    <div>
      {/* ── Channel selector ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>Channel</span>
          {recommendedIds.size > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginRight: 4, verticalAlign: 'middle' }} />
              Recommended by Marketing module
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CHANNELS.map(ch => {
            const isActive = activeChannel === ch.id
            const isRec    = recommendedIds.has(ch.id)
            return (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch.id)}
                title={ch.desc}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  border: isActive ? 'none' : '1px solid var(--surface3)',
                  background: isActive ? 'var(--accent)' : isRec ? 'rgba(124,111,247,.08)' : 'var(--surface2)',
                  color: isActive ? '#fff' : isRec ? 'var(--accent2)' : 'var(--text2)',
                  position: 'relative',
                  transition: 'all .15s',
                }}
              >
                <span style={{ fontSize: 13 }}>{ch.emoji}</span>
                <span>{ch.label}</span>
                {isRec && !isActive && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                )}
              </button>
            )
          })}
        </div>
        {/* Active channel description */}
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
          {CHANNELS.find(c => c.id === activeChannel)?.desc}
          {recommendedIds.has(activeChannel) && (
            <span style={{ marginLeft: 8, color: 'var(--accent2)', fontWeight: 600 }}>· Recommended for your app</span>
          )}
        </div>
      </div>

      {/* ── Marketing warning — show when landing score < 7 ── */}
      {landingScore !== null && landingScore < 7 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'rgba(245,166,35,.06)', border: '1px solid rgba(245,166,35,.25)', borderRadius: 'var(--r)', marginBottom: 14 }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--amber)' }}>Your landing page score is {landingScore}/10</strong> — fix your landing page before promoting. Content is most effective when your page converts.
          </div>
        </div>
      )}

      {pt && !pt.error && (
        <div style={{ background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.25)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
          <span>🧪</span>
          <div style={{ flex:1, fontSize:12 }}>
            <strong style={{ color:'var(--green)' }}>AI Readiness Assessment active</strong> — posts are grounded in your assessment findings (score: {pt.overall_score}/100). Features: <span style={{ color:'var(--text2)' }}>{(pt.features_found??[]).map(f=>f.name).join(', ')}</span>
          </div>
        </div>
      )}

      {/* User context section */}
      {contentContext ? (
        <div style={{ marginBottom:16, padding:'12px 14px', borderRadius:'var(--r)', background:'var(--surface2)', border:'1px solid var(--surface3)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--text)', letterSpacing:'.02em' }}>User Context</span>
            <button
              onClick={() => setEditingContext(true)}
              style={{ fontSize:12, fontWeight:600, padding:'5px 14px', borderRadius:20, border:'1.5px solid var(--accent)', background:'transparent', color:'var(--accent)', cursor:'pointer', fontFamily:'DM Sans, sans-serif', whiteSpace:'nowrap' }}
            >
              Edit context
            </button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px' }}>
            {contentContext.typical_user && <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5 }}><span style={{ color:'var(--text2)', fontWeight:500 }}>User:</span> {contentContext.typical_user}</div>}
            {contentContext.real_result  && <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5 }}><span style={{ color:'var(--text2)', fontWeight:500 }}>Result:</span> {contentContext.real_result}</div>}
            {contentContext.before_state && <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5, gridColumn:'span 2' }}><span style={{ color:'var(--text2)', fontWeight:500 }}>Before:</span> {contentContext.before_state}</div>}
            {contentContext.user_quote   && <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5, gridColumn:'span 2', fontStyle:'italic' }}>"{contentContext.user_quote}"</div>}
            {contentContext.screenshots && contentContext.screenshots.length > 0 && (
              <div style={{ gridColumn:'span 2', display:'flex', gap:6, flexWrap:'wrap', marginTop:2, alignItems:'center' }}>
                <span style={{ fontSize:10, color:'var(--text3)', fontWeight:600 }}>📷</span>
                {contentContext.screenshots.map((src, i) => (
                  <img key={i} src={src} alt={`Screenshot ${i+1}`}
                    style={{ width:44, height:32, objectFit:'cover', borderRadius:4, border:'1px solid var(--surface3)' }} />
                ))}
                <span style={{ fontSize:10, color:'var(--accent2)', fontWeight:600 }}>Screenshots active</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditingContext(true)}
          style={{ display:'flex', alignItems:'center', gap:8, width:'100%', marginBottom:12, padding:'8px 12px', borderRadius:'var(--r)', background:'rgba(226,111,175,.06)', border:'1px dashed rgba(226,111,175,.3)', cursor:'pointer', textAlign:'left', fontFamily:'DM Sans, sans-serif' }}
        >
          <span style={{ fontSize:14 }}>✨</span>
          <span style={{ flex:1, fontSize:12, color:'rgba(226,111,175,.9)', lineHeight:1.4 }}>
            Add real user quotes and examples →
          </span>
        </button>
      )}

      {/* ── Post Style selector (all channels) ── */}
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

      {/* ── Instagram channel ── */}
      {activeChannel === 'instagram' ? (
        <>
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
        </>
      ) : (
        /* ── Non-Instagram channels ── */
        <div style={{ background:'var(--surface)', borderRadius:'var(--r2)', border:'1px solid var(--surface3)', overflow:'hidden' }}>
          {/* Header */}
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--surface2)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
                {CHANNELS.find(c => c.id === activeChannel)?.emoji}{' '}
                {CHANNELS.find(c => c.id === activeChannel)?.label} Content
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                {CHANNELS.find(c => c.id === activeChannel)?.desc}
              </div>
            </div>
            <button
              className="gen-btn"
              style={{ fontSize:12, padding:'8px 18px', flexShrink:0 }}
              onClick={generateForChannel}
              disabled={channelLoading}
            >
              {channelLoading ? '⏳ Generating…' : channelResults[activeChannel] ? '🔄 Regenerate' : '✨ Generate'}
            </button>
          </div>

          {/* Body */}
          <div style={{ padding:'16px' }}>
            {!channelResults[activeChannel] && !channelLoading && (
              <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--text3)', fontSize:13 }}>
                Click Generate to create {CHANNELS.find(c => c.id === activeChannel)?.label} content grounded in your app data and marketing strategy.
              </div>
            )}
            {channelLoading && (
              <div style={{ textAlign:'center', padding:'40px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
                <span className="spinner" style={{ color:'var(--accent)' }} />
                <div style={{ fontSize:12, color:'var(--text3)' }}>
                  Generating {CHANNELS.find(c => c.id === activeChannel)?.label} content…
                </div>
              </div>
            )}
            {channelResults[activeChannel] && !channelLoading && (
              <div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
                  <CopyButton text={channelResults[activeChannel]} label="Copy all" />
                </div>
                <div style={{
                  fontSize:13, lineHeight:1.9, color:'var(--text)',
                  background:'var(--surface2)', border:'1px solid var(--border)',
                  borderRadius:'var(--r)', padding:'14px 16px',
                  whiteSpace:'pre-wrap', fontFamily:"'DM Sans', sans-serif",
                }}>
                  {channelResults[activeChannel]}
                </div>
                {/* Platform timing advice */}
                {CHANNEL_TIMING[activeChannel] && (() => {
                  const t = CHANNEL_TIMING[activeChannel]
                  return (
                    <div style={{ marginTop:10, padding:'9px 13px', borderRadius:8, background:'rgba(124,111,247,.06)', border:'1px solid rgba(124,111,247,.18)', fontSize:11 }}>
                      <div style={{ fontWeight:700, color:'var(--accent)', marginBottom:3 }}>📅 Best time to post</div>
                      <div style={{ color:'var(--text2)' }}>{t.best} &nbsp;·&nbsp; <span style={{ color:'var(--text3)' }}>Best days: {t.days}</span></div>
                      <div style={{ color:'var(--text3)', marginTop:3 }}>💡 {t.tip}</div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Engagement feedback modal ── */}
      {feedbackModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', borderRadius:14, padding:24, maxWidth:480, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>Which post got the best engagement?</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16, lineHeight:1.5 }}>Select the post that performed best — Markr will prioritise similar formats in future generations.</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {feedbackPosts.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => handleFeedbackSubmit(entry)}
                  style={{ textAlign:'left', padding:'10px 14px', borderRadius:9, border:'1px solid var(--surface3)', background:'var(--surface2)', cursor:'pointer', fontSize:12, lineHeight:1.5, color:'var(--text)', fontFamily:'DM Sans, sans-serif' }}
                >
                  <span style={{ color:'var(--text3)', fontSize:10, display:'block', marginBottom:2 }}>{entry.channel} · {entry.format} · {new Date(entry.ts).toLocaleDateString()}</span>
                  "{entry.excerpt.slice(0, 100)}{entry.excerpt.length > 100 ? '…' : ''}"
                </button>
              ))}
            </div>
            <button
              onClick={() => handleFeedbackSubmit(null)}
              style={{ width:'100%', padding:'9px 0', borderRadius:9, border:'1px solid var(--surface3)', background:'transparent', color:'var(--text3)', fontSize:12, cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
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
