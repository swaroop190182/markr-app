import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const RESEND_API = 'https://api.resend.com/emails'
const FROM       = 'Swaroop from Markr <markr@journaljoy.org>'
const REPLY_TO   = 'swaroop.alwar@journaljoy.org'
const APP_URL    = 'https://markr.mindprintjournal.com'

function welcomeHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Markr</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; background: #f4f4f8; color: #111118; }
    .wrapper { max-width: 580px; margin: 32px auto; background: #fff; border-radius: 14px; overflow: hidden; border: 1px solid #e4e4f0; }
    .header { background: #08080a; padding: 32px; text-align: center; }
    .logo { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 20px; }
    .logo-mark { width: 34px; height: 34px; border-radius: 8px; background: linear-gradient(135deg,#7c6ff7,#e26faf); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 17px; color: #fff; }
    .logo-name { font-size: 17px; font-weight: 700; color: #f0f0f5; }
    .headline { font-size: 22px; font-weight: 700; color: #f5f5f7; line-height: 1.25; margin-bottom: 8px; }
    .subline { font-size: 14px; color: rgba(255,255,255,0.45); line-height: 1.7; }
    .body { padding: 28px 32px; }
    .greeting { font-size: 14px; color: #555; line-height: 1.8; margin-bottom: 20px; }
    .intro { font-size: 14px; color: #111; line-height: 1.8; margin-bottom: 24px; }
    .steps-label { font-size: 13px; color: #888; margin-bottom: 16px; }
    .step { display: flex; gap: 14px; align-items: flex-start; padding: 14px 16px; background: #f8f8fc; border-radius: 10px; border: 1px solid #eaeaf4; margin-bottom: 10px; }
    .step-num { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; margin-top: 1px; }
    .step-title { font-size: 13px; font-weight: 600; color: #111; margin-bottom: 3px; }
    .step-desc { font-size: 12px; color: #666; line-height: 1.6; }
    .step-badge { display: inline-block; font-size: 10px; padding: 1px 7px; border-radius: 20px; background: rgba(52,201,138,.1); color: #16a870; font-weight: 600; margin-left: 6px; vertical-align: middle; }
    .cta-wrap { text-align: center; margin: 24px 0; }
    .cta { display: inline-block; padding: 13px 32px; background: #7c6ff7; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; }
    .founder-note { border-top: 1px solid #eaeaf0; padding-top: 20px; margin-top: 4px; }
    .note-text { font-size: 13px; color: #555; line-height: 1.8; margin-bottom: 10px; }
    .note-sig { font-size: 13px; color: #111; font-weight: 500; }
    .footer { padding: 16px 32px; border-top: 1px solid #eaeaf0; text-align: center; }
    .footer-text { font-size: 11px; color: #aaa; line-height: 1.7; }
    .footer-text a { color: #aaa; }
    @media (max-width: 600px) { .body { padding: 20px; } .header { padding: 24px 20px; } }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">
        <div class="logo-mark">M</div>
        <span class="logo-name">Markr</span>
      </div>
      <div class="headline">Your app already knows how to grow.</div>
      <div class="subline">You just needed someone to show you.<br>Let's get started.</div>
    </div>

    <div class="body">
      <p class="greeting">Hi ${firstName},</p>
      <p class="intro">Welcome to Markr. You're now part of a small group of founders who've decided to stop guessing and start knowing exactly why their app isn't growing.</p>
      <p class="steps-label">Here's how to get value in the next 5 minutes:</p>

      <div class="step">
        <div class="step-num" style="background:#7c6ff7;">1</div>
        <div>
          <div class="step-title">Add your app</div>
          <div class="step-desc">Click <strong>Add App</strong> on your dashboard. Paste your URL, add a short description and list your key features. Takes 2 minutes.</div>
        </div>
      </div>

      <div class="step">
        <div class="step-num" style="background:#7c6ff7;">2</div>
        <div>
          <div class="step-title">Run Deep Analysis</div>
          <div class="step-desc">Go to <strong>Insights</strong> and click <strong>Run Deep AI Analysis</strong>. Markr will generate your competitive landscape, SWOT, growth playbook, BMC and pricing strategy.</div>
        </div>
      </div>

      <div class="step">
        <div class="step-num" style="background:#7c6ff7;">3</div>
        <div>
          <div class="step-title">Generate your first 3 posts</div>
          <div class="step-desc">Go to <strong>Content Studio</strong> and click <strong>Generate All 3</strong>. You'll get a morning, midday and evening post — each optimised for saves, shares and comments.</div>
        </div>
      </div>

      <div class="step">
        <div class="step-num" style="background:rgba(52,201,138,.85);">4</div>
        <div>
          <div class="step-title">Enable daily delivery <span class="step-badge">optional</span></div>
          <div class="step-desc">Go to <strong>Overview</strong> and enable daily delivery. Markr will send 3 ready-to-post captions to this inbox every morning at 6:30am — automatically.</div>
        </div>
      </div>

      <div class="cta-wrap">
        <a href="${APP_URL}/app" class="cta">Go to my dashboard →</a>
      </div>

      <div class="founder-note">
        <p class="note-text">I built Markr because I spent years building apps that got lost — not because the products were bad, but because I didn't know how to market them. I hope Markr gives you the clarity I wish I had.</p>
        <p class="note-text">If you have any questions or feedback, just reply to this email. I read every one.</p>
        <p class="note-sig">— Swaroop, Founder of Markr</p>
      </div>
    </div>

    <div class="footer">
      <p class="footer-text">
        You're receiving this because you signed up at markr.mindprintjournal.com<br>
        <a href="${APP_URL}">markr.mindprintjournal.com</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verify this is called from our own signup flow
  const secret = req.headers['x-webhook-secret']
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { email, name } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })

  // Derive first name from email or name field
  const firstName = name
    ? name.split(' ')[0]
    : email.split('@')[0].split('.')[0].charAt(0).toUpperCase() + email.split('@')[0].split('.')[0].slice(1)

  try {
    const emailRes = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:     FROM,
        to:       [email],
        reply_to: REPLY_TO,
        subject:  `Welcome to Markr, ${firstName} — your first step`,
        html:     welcomeHtml(firstName),
      }),
    })

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}))
      console.error('Resend error:', err)
      return res.status(500).json({ error: 'Failed to send welcome email' })
    }

    res.status(200).json({ sent: true, to: email })
  } catch (e) {
    res.status(500).json({ error: (e as Error).message })
  }
}
