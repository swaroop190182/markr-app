import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, url, result } = req.body ?? {}
  if (!email || !result) return res.status(400).json({ error: 'Missing email or result' })

  const domain = url?.replace(/^https?:\/\//, '').split('/')[0] ?? url
  const score  = result.overall ?? 0
  const scoreColor = score >= 7 ? '#34c98a' : score >= 5 ? '#f5a623' : '#e55555'
  const dims   = result.dimensions ?? []
  const bottleneck = result.bottleneck ?? { label: '', issue: '' }
  const teaser = result.growth_teaser ?? ''

  const dimRows = dims.map((d: any) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f7;font-size:13px;color:#333;font-weight:500">${d.label}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f7;text-align:right">
        <span style="font-size:14px;font-weight:700;color:${d.score>=7?'#34c98a':d.score>=5?'#f5a623':'#e55'}">${d.score}/10</span>
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f7;font-size:12px;color:#888">${d.issue ?? ''}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,'Segoe UI',Arial,sans-serif">
  <div style="max-width:580px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e4f0">

    <!-- Header -->
    <div style="background:#08080a;padding:28px 32px;text-align:center">
      <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:16px">
        <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#7c6ff7,#e26faf);display:inline-block;text-align:center;line-height:32px;font-weight:800;font-size:16px;color:#fff">M</div>
        <span style="font-size:16px;font-weight:700;color:#f0f0f5">Markr</span>
      </div>
      <div style="font-size:13px;color:rgba(255,255,255,.45)">Landing Page Analysis Report</div>
      <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,.7);margin-top:4px">${domain}</div>
    </div>

    <!-- Score -->
    <div style="padding:28px 32px;text-align:center;border-bottom:1px solid #f0f0f7">
      <div style="font-size:64px;font-weight:800;color:${scoreColor};line-height:1">${score}</div>
      <div style="font-size:14px;color:#888;margin-top:4px">out of 10</div>
      <div style="margin-top:12px;display:inline-block;padding:6px 16px;border-radius:20px;background:${score>=7?'rgba(52,201,138,.1)':score>=5?'rgba(245,166,35,.1)':'rgba(229,85,85,.1)'};color:${scoreColor};font-size:12px;font-weight:600">
        ${score >= 7 ? '🟢 Strong foundation' : score >= 5 ? '🟡 Room to improve' : '🔴 Needs attention'}
      </div>
    </div>

    <!-- Dimensions -->
    <div style="padding:20px 32px 0">
      <div style="font-size:13px;font-weight:700;color:#111;margin-bottom:12px;text-transform:uppercase;letter-spacing:.06em">Score Breakdown</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #f0f0f7;border-radius:10px;overflow:hidden">
        <thead>
          <tr style="background:#f8f8fc">
            <th style="padding:10px 16px;font-size:10px;font-weight:600;color:#888;text-align:left;text-transform:uppercase;letter-spacing:.06em">Dimension</th>
            <th style="padding:10px 16px;font-size:10px;font-weight:600;color:#888;text-align:right;text-transform:uppercase;letter-spacing:.06em">Score</th>
            <th style="padding:10px 16px;font-size:10px;font-weight:600;color:#888;text-align:left;text-transform:uppercase;letter-spacing:.06em">Finding</th>
          </tr>
        </thead>
        <tbody>${dimRows}</tbody>
      </table>
    </div>

    <!-- Bottleneck -->
    <div style="padding:20px 32px">
      <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:16px">
        <div style="font-size:11px;font-weight:700;color:#e55;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">🚨 Biggest Bottleneck — ${bottleneck.label}</div>
        <div style="font-size:13px;color:#333;line-height:1.6">${bottleneck.issue}</div>
      </div>
    </div>

    ${teaser ? `
    <!-- Growth Opportunity -->
    <div style="padding:0 32px 20px">
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px">
        <div style="font-size:11px;font-weight:700;color:#7c6ff7;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">💡 Growth Opportunity</div>
        <div style="font-size:13px;color:#333;line-height:1.6">${teaser}</div>
      </div>
    </div>
    ` : ''}

    <!-- CTA -->
    <div style="padding:20px 32px 28px;text-align:center;border-top:1px solid #f0f0f7">
      <div style="font-size:13px;color:#555;margin-bottom:16px;line-height:1.7">
        This is just the surface. Sign up free to get the full picture:<br>
        Competitive analysis · SWOT · Growth playbook · BMC · Pricing strategy + daily Instagram posts
      </div>
      <a href="https://markr.mindprintjournal.com/login?url=${encodeURIComponent(url)}" 
        style="display:inline-block;padding:13px 32px;background:#7c6ff7;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px">
        Get full analysis free →
      </a>
      <div style="font-size:11px;color:#aaa;margin-top:10px">Free to start · No credit card required</div>
    </div>

    <!-- Footer -->
    <div style="padding:14px 32px;border-top:1px solid #f0f0f7;text-align:center">
      <div style="font-size:11px;color:#aaa">
        Sent by Markr — Growth Intelligence for App Founders<br>
        <a href="https://markr.mindprintjournal.com" style="color:#aaa">markr.mindprintjournal.com</a>
      </div>
    </div>

  </div>
</body>
</html>`

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from:     'Swaroop from Markr <markr@journaljoy.org>',
        to:       [email],
        reply_to: 'swaroop.alwar@journaljoy.org',
        subject:  `Your ${domain} landing page scored ${score}/10 — here's what to fix`,
        html,
      }),
    })
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      return res.status(500).json({ error: 'Email failed', detail: e })
    }
    // Save to markr_url_leads if possible
    return res.status(200).json({ sent: true })
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
