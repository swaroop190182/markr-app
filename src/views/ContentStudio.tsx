import { useState, useCallback } from 'react'
import { useStore } from '../lib/store'
import { Card, CardHeader, CopyButton } from '../components/ui'
import { callClaude, getTestContext, safeParseJSON } from '../lib/claude'
import { SLOT_CONFIGS } from '../lib/data'
import { toast } from '../components/Toast'
import type { AgentPost } from '../types'

type SlotKey = 'morning' | 'midday' | 'evening'
type SlotState = 'idle' | 'generating' | 'ready' | 'error'

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

export default function ContentStudio() {
  const { currentApp } = useStore()
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

  const updateSlot = (key: SlotKey, update: Partial<SlotData>) =>
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], ...update } }))

  const generatePost = useCallback(async (type: SlotKey) => {
    const c = SLOT_CONFIGS[type]
    const pillar = todaysPillars[type]
    updateSlot(type, { state:'generating', post:null })

    const brandVoice = currentApp.brand ?? `You are the Instagram content strategist for ${currentApp.name}, a ${currentApp.category} app.`
    const testCtx = getTestContext(currentApp)
    const metricGoal = type==='morning' ? 'SAVES' : type==='midday' ? 'SHARES' : 'COMMENTS'
    const slotGuide = {
      morning: 'Morning post — grounding, valuable, bookmark-worthy. Optimised for SAVES.',
      midday:  'Midday post — insightful, shareable. Optimised for SHARES.',
      evening: 'Evening post — warm, relatable, community-building. Ask a question. Optimised for COMMENTS.',
    }[type]

    const prompt = `${brandVoice}
${testCtx}
${testCtx ? `CRITICAL: Reference specific features and real UX details from the product test. Caption must feel like it was written by someone who has actually used ${currentApp.name} deeply.` : ''}

Content pillar today: ${pillar}
App: ${currentApp.name} — ${currentApp.desc ?? currentApp.category}

Generate a ${slotGuide}

Output ONLY valid JSON:
{
  "caption": "max 250 chars — authentic Instagram caption about ${pillar}. End with a question. NO buzzwords.",
  "hashtags": ["12 hashtags without # — mix niche + broad"],
  "image_prompt": "Detailed Canva/DALL-E prompt — specific scene, lighting, mood, 1:1 format",
  "best_posting_time": "${c.time}",
  "pillar": "${pillar}",
  "${type==='morning'?'save_hook':type==='midday'?'share_hook':'comment_hook'}": "3-6 words to drive ${metricGoal.toLowerCase()}",
  ${type==='midday' ? '"insight_headline": "punchy 8-word headline for image overlay",' : ''}
  ${type==='evening' ? '"poll_options": ["Option A (2-4 words)", "Option B (2-4 words)"],' : ''}
  "post_idea": "one specific reel or carousel idea referencing a real feature",
  "engagement_type": "${type==='evening'?'poll_or_question':type==='midday'?'share_trigger':'save_trigger'}"
}`

    try {
      const raw = await callClaude(prompt, 'You are an expert Instagram content strategist. Output ONLY valid JSON.', 1800)
      const post = safeParseJSON<AgentPost>(raw)
      updateSlot(type, { state:'ready', post })
      toast(`${c.label} ready! ✓`)
    } catch(e) {
      updateSlot(type, { state:'error', error:(e as Error).message })
    }
  }, [currentApp, todaysPillars])

  const generateAll = () => {
    generatePost('morning')
    setTimeout(() => generatePost('midday'),  1800)
    setTimeout(() => generatePost('evening'), 3600)
  }

  return (
    <div>
      {pt && !pt.error && (
        <div style={{ background:'rgba(52,201,138,.06)', border:'1px solid rgba(52,201,138,.25)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
          <span>🧪</span>
          <div style={{ flex:1, fontSize:12 }}>
            <strong style={{ color:'var(--green)' }}>Product test active</strong> — posts are grounded in real QA findings (score: {pt.overall_score}/100). Features: <span style={{ color:'var(--text2)' }}>{(pt.features_found??[]).map(f=>f.name).join(', ')}</span>
          </div>
        </div>
      )}

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
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:14 }}>
        {(['morning','midday','evening'] as SlotKey[]).map(type => (
          <AgentCard
            key={type}
            type={type}
            slot={slots[type]}
            pillar={todaysPillars[type]}
            activeTab={activeTab[type]}
            onTabChange={tab => setActiveTab(prev => ({...prev, [type]:tab}))}
            onGenerate={() => generatePost(type)}
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
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'6px 10px', background:'rgba(255,220,60,.07)', border:'1px solid rgba(255,220,60,.15)', borderRadius:'var(--r)', fontSize:11, color:'#fbbf24' }}>
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
                <div style={{ fontSize:12, lineHeight:1.7, padding:'10px 12px', borderRadius:'var(--r)', border:'1px solid rgba(253,230,138,.15)', fontStyle:'italic', color:'#fef9c3', background:'rgba(254,249,195,.05)' }}>{post.image_prompt}</div>
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
