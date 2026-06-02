import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const secret = req.headers['x-webhook-secret']
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' })

  const { email, name } = req.body ?? {}
  if (!email) return res.status(400).json({ error: 'Email required' })

  const firstName = name
    ? name.split(' ')[0]
    : email.split('@')[0].replace(/[._]/g, ' ').split(' ')[0]
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const first = cap(firstName)

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Markr</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;background:#f4f4f8;color:#111}.wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e4f0}.hdr{background:#08080a;padding:28px 32px;text-align:center}.logo{display:inline-flex;align-items:center;gap:8px;margin-bottom:18px}.mark{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#7c6ff7,#e26faf);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#fff;font-family:sans-serif}.nm{font-size:16px;font-weight:700;color:#f0f0f5}.h1{font-size:21px;font-weight:700;color:#f5f5f7;line-height:1.3;margin-bottom:8px}.sub{font-size:13px;color:rgba(255,255,255,.45);line-height:1.6}.body{padding:28px 32px}.step{display:flex;gap:14px;padding:14px 16px;background:#f8f8fc;border-radius:10px;border:1px solid #eaeaf4;margin-bottom:10px}.num{width:26px;height:26px;border-radius:50%;background:#7c6ff7;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;margin-top:1px}.st{font-size:13px;font-weight:600;color:#111;margin-bottom:3px}.sd{font-size:12px;color:#666;line-height:1.6}.cta{text-align:center;margin:22px 0}.btn{display:inline-block;padding:12px 30px;background:#7c6ff7;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px}.note{border-top:1px solid #eaeaf0;padding-top:18px;margin-top:4px}.nt{font-size:13px;color:#555;line-height:1.8;margin-bottom:10px}.sig{font-size:13px;color:#111;font-weight:500}.ftr{padding:14px 32px;border-top:1px solid #eaeaf0;text-align:center;font-size:11px;color:#aaa}</style></head>
<body><div class="wrap">
<div class="hdr"><div class="logo"><div class="mark">M</div><span class="nm">Markr</span></div><div class="h1">Your app already knows how to grow.</div><div class="sub">You just needed someone to show you. Let's get started.</div></div>
<div class="body">
<p style="font-size:14px;color:#555;line-height:1.8;margin-bottom:18px">Hi ${first},</p>
<p style="font-size:14px;color:#111;line-height:1.8;margin-bottom:22px">Welcome to Markr. You're now part of a small group of founders who've decided to stop guessing and start knowing exactly why their app isn't growing.</p>
<p style="font-size:13px;color:#888;margin-bottom:14px">Here's how to get value in the next 5 minutes:</p>
<div class="step"><div class="num">1</div><div><div class="st">Add your app</div><div class="sd">Click <strong>Add App</strong> on your dashboard. Paste your URL, add a description and list your key features. Takes 2 minutes.</div></div></div>
<div class="step"><div class="num">2</div><div><div class="st">Run Deep Analysis</div><div class="sd">Go to <strong>Insights</strong> and click <strong>Run Deep AI Analysis</strong>. Markr generates your competitive landscape, SWOT, growth playbook, BMC and pricing strategy.</div></div></div>
<div class="step"><div class="num">3</div><div><div class="st">Generate your first 3 posts</div><div class="sd">Go to <strong>Content Studio</strong> and click <strong>Generate All 3</strong>. Get a morning, midday and evening post — each optimised for saves, shares and comments.</div></div></div>
<div class="step" style="border-color:#d1fae5"><div class="num" style="background:rgba(52,201,138,.85)">4</div><div><div class="st">Enable daily delivery <span style="font-size:10px;padding:1px 7px;border-radius:20px;background:rgba(52,201,138,.1);color:#16a870;font-weight:600;margin-left:4px">optional</span></div><div class="sd">Go to <strong>Overview</strong> and enable daily delivery. Markr sends 3 ready-to-post captions to this inbox every morning at 6:30am — automatically.</div></div></div>
<div class="cta"><a href="https://markr.mindprintjournal.com/app" class="btn">Go to my dashboard →</a></div>
<div class="note"><p class="nt">I built Markr because I spent years building apps that got lost — not because the products were bad, but because I didn't know how to market them. I hope Markr gives you the clarity I wish I had.</p><p class="nt">If you have any questions or feedback, just reply to this email. I read every one.</p><p class="sig">— Swaroop, Founder of Markr</p></div>
</div>
<div class="ftr">You're receiving this because you signed up at markr.mindprintjournal.com</div>
</div></body></html>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from:     'Swaroop from Markr <markr@journaljoy.org>',
        to:       [email],
        reply_to: 'swaroop.alwar@journaljoy.org',
        subject:  `Welcome to Markr, ${first} — your first step`,
        html,
      }),
    })
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      return res.status(500).json({ error: 'Resend error', detail: e })
    }
    return res.status(200).json({ sent: true, to: email })
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
