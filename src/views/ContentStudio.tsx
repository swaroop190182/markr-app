import { useState, useCallback } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader, CopyButton } from '../components/ui'
import { callClaude, getTestContext, safeParseJSON } from '../lib/claude'
import { SLOT_CONFIGS } from '../lib/data'
import { toast } from '../components/Toast'
import type { AgentPost } from '../types'

type SlotKey = 'morning' | 'midday' | 'evening'
type SlotState = 'idle' | 'generating' | 'ready' | 'error'

const POST_STYLES = [
  { id: 'educational',    emoji: '🎓', label: 'Educational',    desc: 'Tips, facts, how-tos',
    voice: 'Authoritative yet approachable. Lead with a concrete insight, actionable tip, or non-obvious fact. Use specific numbers and examples. Structure clearly. Avoid vague generalities.' },
  { id: 'conversational', emoji: '💬', label: 'Conversational', desc: 'Questions, polls, community',
    voice: 'Warm, casual, community-driven. Write like a real person talking to a friend. Use "you" and "we" freely. Invite participation. Keep sentences short and punchy.' },
  { id: 'story',          emoji: '📖', label: 'Story',          desc: 'Personal moments, behind the scenes',
    voice: 'Vulnerable, narrative, first-person. Open mid-action or with a specific moment. Build to a realisation or lesson. Sensory details welcome. Make the reader feel they were there.' },
  { id: 'bold',           emoji: '🔥', label: 'Bold',           desc: 'Strong opinions, contrarian takes',
    voice: 'Confident, direct, unapologetic. Open with a strong claim or counter-intuitive truth. No hedging language ("maybe", "kind of", "perhaps"). Challenge conventional wisdom. Take a clear side.' },
  { id: 'warm',           emoji: '😊', label: 'Warm',           desc: 'Nurturing, supportive, emotional',
    voice: 'Empathetic, encouraging, emotionally resonant. Acknowledge struggles before offering solutions. Use inclusive, affirming language. End with genuine encouragement or a heartfelt question.' },
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

export default function ContentStudio({ onUpgrade }: { onUpgrade?: () => void }) {
  const { currentApp, plan, updateApp } = useStore()
  const pillars = currentApp.pillars ?? ['Content','Education','Tips','Community','Stories','Wins']
  const todaysPillars = getTodaysPillars(pillars)
  const pt = currentApp.productTest

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

  const updateSlot = (key: SlotKey, update: Partial<SlotData>) =>
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], ...update } }))

  const generatePost = useCallback(async (type: SlotKey, style: StyleId) => {
    const c = SLOT_CONFIGS[type]
    const pillar = todaysPillars[type]
    updateSlot(type, { state:'generating', post:null })

    const brandVoice = currentApp.brand ?? `You are the Instagram content strategist for ${currentApp.name}, a ${currentApp.category} app.`
    const testCtx = getTestContext(currentApp)
    const styleConfig = POST_STYLES.find(s => s.id === style) ?? POST_STYLES[1]

    // Format assignment — each slot has a fixed content type
    const FORMAT = {
      morning: {
        label:       'EDUCATIONAL TIP OR FACT (Post 1 of 3)',
        instruction: 'Teach something concrete and specific — a tip, a stat, a non-obvious insight the reader can use today. NOT a personal story, NOT a question as the main hook, NOT a poll.',
        metric:      'SAVES',
        hook:        'save_hook',
      },
      midday: {
        label:       'STORY OR PERSONAL MOMENT (Post 2 of 3)',
        instruction: 'First-person narrative — a real challenge, moment, or win. Build emotional connection. NOT a listicle, NOT a pure tip, NOT a poll. Open mid-action or with vulnerability.',
        metric:      'SHARES',
        hook:        'share_hook',
      },
      evening: {
        label:       'QUESTION OR POLL (Post 3 of 3)',
        instruction: 'Pure engagement driver — spark conversation. Open with curiosity or a provocative take, then close with a clear question or two-option poll. NOT a tip, NOT a story.',
        metric:      'COMMENTS',
        hook:        'comment_hook',
      },
    }[type]

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

Content pillar today: ${pillar}
App: ${currentApp.name} — ${currentApp.desc ?? currentApp.category}

━━━ POST STYLE ━━━
Style: ${styleConfig.emoji} ${styleConfig.label.toUpperCase()} (${styleConfig.desc})
Voice direction: ${styleConfig.voice}
Every word of the caption must reflect this style. If bold, open boldly. If warm, open warmly. The style overrides any default tone.
━━━━━━━━━━━━━━━━━

━━━ FORMAT REQUIREMENT ━━━
This is the ${FORMAT.label}.
${FORMAT.instruction}
Optimised for ${FORMAT.metric}.
${uniquenessRules}
━━━━━━━━━━━━━━━━━━━━━━━━━

Output ONLY valid JSON:
{
  "caption": "max 250 chars — authentic Instagram caption about ${pillar}. Must match the format requirement above exactly. NO buzzwords.",
  "hashtags": ["12 hashtags without # — mix niche + broad"],
  "image_prompt": "Detailed Canva/DALL-E prompt — specific scene, lighting, mood, 1:1 format",
  "best_posting_time": "${c.time}",
  "pillar": "${pillar}",
  "${FORMAT.hook}": "3-6 words to drive ${FORMAT.metric.toLowerCase()}",
  ${type==='midday' ? '"insight_headline": "punchy 8-word headline for image overlay",' : ''}
  ${type==='evening' ? '"poll_options": ["Option A (2-4 words)", "Option B (2-4 words)"],' : ''}
  "post_idea": "one specific reel or carousel idea referencing a real feature",
  "engagement_type": "${type==='evening'?'poll_or_question':type==='midday'?'share_trigger':'save_trigger'}"
}`

    try {
      const raw = await callClaude(prompt, 'You are an expert Instagram content strategist. Output ONLY valid JSON. Follow both the POST STYLE and FORMAT REQUIREMENT exactly — both are mandatory.', 1800)
      const post = safeParseJSON<AgentPost>(raw)
      updateSlot(type, { state:'ready', post })
      toast(`${c.label} ready! ✓`)
    } catch(e) {
      updateSlot(type, { state:'error', error:(e as Error).message })
    }
  }, [currentApp, todaysPillars, postStyle])

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

      {/* Pillar strip */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <span style={{ fontSize:11, color:'var(--text3)', fontWeight:500 }}>Today's pillars →</span>
        {(['morning','midday','evening'] as SlotKey[]).map(t => {
          const c = SLOT_CONFIGS[t]
          return (
            <span key={t} style={{ fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:600, background:c.bg, color:c.color, border:`1px solid ${c.border}` }}>
              {c.emoji} {todaysPillars[t]}
            </span>
          )
        })}
        <button id="generate-all-btn" className="gen-btn" style={{ fontSize:11, padding:'5px 14px', marginLeft:'auto' }} onClick={generateAll}>
          ✨ Generate All 3
        </button>
      </div>

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
            pillar={todaysPillars[type]}
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
