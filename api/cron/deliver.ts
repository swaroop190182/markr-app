import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const RESEND_API = 'https://api.resend.com/emails'
const FROM       = 'Markr <markr@journaljoy.org>'
const APP_URL    = 'https://markr.mindprintjournal.com'

// ── Generate content for a user ───────────────────────────────────────────────
async function generateContent(app: any): Promise<any[]> {
  const pillars: string[] = app.pillars ?? ['Content', 'Tips', 'Community']
  const posts = []

  const slots = [
    { type: 'morning', label: 'Morning Post', time: '7:00–9:00 AM', goal: 'SAVES',    emoji: '🌅' },
    { type: 'midday',  label: 'Midday Post',  time: '12:00–1:30 PM', goal: 'SHARES',  emoji: '💡' },
    { type: 'evening', label: 'Evening Post', time: '7:00–9:00 PM',  goal: 'COMMENTS',emoji: '🌙' },
  ]

  const day     = new Date().getDay()
  const pillarsForDay = [
    pillars[day % pillars.length],
    pillars[(day + 1) % pillars.length],
    pillars[(day + 2) % pillars.length],
  ]

  for (let i = 0; i < slots.length; i++) {
    const slot   = slots[i]
    const pillar = pillarsForDay[i]

    const prompt = `You are the Instagram content strategist for ${app.name}, a ${app.category} app.
${app.brand_voice ?? ''}

Content pillar: ${pillar}
Post type: ${slot.label} — optimised for ${slot.goal}

Output ONLY valid JSON:
{
  "caption": "authentic Instagram caption under 200 chars, ends with question",
  "hashtags": ["8 relevant hashtags without #"],
  "hook": "3-5 word hook to drive ${slot.goal.toLowerCase()}",
  "image_prompt": "specific visual prompt for Canva/DALL-E in 1 sentence"
}`

    try {
      const res = await fetch(`${APP_URL}/api/claude`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          'x-cron-job':    'true',
        },
        body: JSON.stringify({ prompt, maxTokens: 600, model: 'haiku' }),
      })

      const data  = await res.json()
      const text  = data.content?.map((b: any) => b.text ?? '').join('') ?? ''
      const post  = JSON.parse(text.replace(/```json|```/g, '').trim())
      posts.push({ ...slot, pillar, ...post })
    } catch {
      posts.push({ ...slot, pillar, caption: '', hashtags: [], hook: '', image_prompt: '' })
    }
  }
  return posts
}

// ── Build HTML email ──────────────────────────────────────────────────────────
function buildEmail(appName: string, posts: any[], userEmail: string): string {
  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })

  const postHTML = posts.map(p => `
    <div style="background:#1a1a2e;border:1px solid rgba(124,111,247,.3);border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span style="font-size:20px">${p.emoji}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:#a599ff;">${p.label}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.4);">${p.time} · Optimised for ${p.goal}</div>
        </div>
        <div style="margin-left:auto;font-size:11px;padding:3px 10px;border-radius:20px;background:rgba(124,111,247,.15);color:#a599ff;font-weight:600;">${p.pillar}</div>
      </div>

      ${p.caption ? `
      <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:14px;margin-bottom:10px;font-size:14px;color:rgba(255,255,255,.85);line-height:1.7;font-style:italic;">
        "${p.caption}"
      </div>` : ''}

      ${p.hook ? `
      <div style="font-size:12px;color:#f5a623;margin-bottom:8px;">💡 Hook: <strong>${p.hook}</strong></div>` : ''}

      ${p.hashtags?.length ? `
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
        ${p.hashtags.map((h: string) => `<span style="font-size:11px;padding:3px 8px;border-radius:20px;background:rgba(124,111,247,.1);color:#a599ff;">#${h}</span>`).join('')}
      </div>` : ''}

      ${p.image_prompt ? `
      <div style="background:rgba(254,249,195,.05);border:1px solid rgba(254,249,195,.15);border-radius:8px;padding:10px;font-size:11px;color:#fef9c3;font-style:italic;">
        📸 Image prompt: ${p.image_prompt}
      </div>` : ''}
    </div>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#08080a;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
      <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#7c6ff7,#e26faf);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;">M</div>
      <div>
        <div style="font-size:16px;font-weight:700;color:#f0f0f5;">Markr</div>
        <div style="font-size:11px;color:rgba(255,255,255,.4);">Your daily content plan</div>
      </div>
    </div>

    <!-- Title -->
    <h1 style="font-size:24px;font-weight:800;color:#f5f5f7;margin:0 0 6px;letter-spacing:-0.02em;">
      Today's content for ${appName}
    </h1>
    <p style="font-size:14px;color:rgba(255,255,255,.45);margin:0 0 28px;">${today} · 3 posts ready to publish</p>

    <!-- Posts -->
    ${postHTML}

    <!-- CTA -->
    <div style="text-align:center;margin:28px 0;">
      <a href="https://markr.mindprintjournal.com/app" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#7c6ff7,#9b8af4);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;">
        Open Markr →
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid rgba(255,255,255,.06);padding-top:20px;text-align:center;">
      <p style="font-size:11px;color:rgba(255,255,255,.25);margin:0 0 6px;">
        You're receiving this because you enabled daily content delivery in Markr.
      </p>
      <p style="font-size:11px;color:rgba(255,255,255,.25);margin:0;">
        <a href="https://markr.mindprintjournal.com/app" style="color:rgba(124,111,247,.6);text-decoration:none;">Manage preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader  = req.headers.authorization
  const cronSecret  = process.env.CRON_SECRET ?? 'markr_cron_2026'
  const isCron      = authHeader === `Bearer ${cronSecret}`
  const isManual    = req.headers['x-manual-trigger'] === cronSecret

  if (!isCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  // For manual test — only send to the requesting user
  const userToken = req.headers['x-user-token'] as string
  let filterUserId: string | null = null
  if (isManual && userToken) {
    const { data: { user } } = await supabase.auth.getUser(userToken)
    if (user) filterUserId = user.id
  }

  // Get delivery prefs — filter to specific user for manual tests
  let query = supabase
    .from('markr_delivery_prefs')
    .select('user_id, email, app_id, frequency')
    .eq('enabled', true)

  if (filterUserId) query = query.eq('user_id', filterUserId)

  const { data: prefs, error } = await query

  if (error) return res.status(500).json({ error: error.message })
  if (!prefs || prefs.length === 0) return res.status(200).json({ sent: 0 })

  let sent = 0
  const results = []

  for (const pref of prefs) {
    try {
      // Get app data
      const { data: app, error: appError } = await supabase
        .from('markr_apps')
        .select('*')
        .eq('id', pref.app_id)
        .eq('user_id', pref.user_id)
        .single()

      if (appError) { console.error('App fetch error:', appError.message); continue }
      if (!app) { console.error('No app found for id:', pref.app_id); continue }

      console.log(`Generating content for ${app.name}...`)

      // Generate content
      const posts = await generateContent(app)
      console.log(`Generated ${posts.length} posts, sending to ${pref.email}...`)

      // Send email
      const emailRes = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    FROM,
          to:      [pref.email],
          subject: `Your ${app.name} content plan for today 🚀`,
          html:    buildEmail(app.name, posts, pref.email),
        }),
      })

      const emailData = await emailRes.json()
      console.log('Resend response:', JSON.stringify(emailData))

      if (emailRes.ok) {
        sent++
        results.push({ user: pref.email, app: app.name, status: 'sent' })
      } else {
        results.push({ user: pref.email, status: 'error', error: JSON.stringify(emailData) })
      }
    } catch (e) {
      console.error('Delivery error for', pref.email, ':', (e as Error).message)
      results.push({ user: pref.email, status: 'error', error: (e as Error).message })
    }
  }

  console.log(`Delivery cron: sent ${sent}/${prefs.length} emails`, results)
  res.status(200).json({ sent, total: prefs.length, results })
}
