import type { VercelRequest, VercelResponse } from '@vercel/node'

// Generate specific fix advice per dimension
function getDimFix(label: string, score: number): string {
  const fixes: Record<string, Record<'low'|'mid'|'high', string>> = {
    'Clarity': {
      low:  'Your headline likely talks about features, not outcomes. Rewrite your H1 to answer "what will I be able to do after using this?" in one sentence.',
      mid:  'Good headline but your sub-copy may be vague. Add one specific outcome with a number: "Save 2 hours/week" beats "save time".',
      high: 'Clarity is strong. Keep the headline tight and ensure every page uses the same core message.',
    },
    'User Journey': {
      low:  'Visitors don\'t know what to do next. Add a single primary CTA above the fold. Remove competing links. Every section should end with one clear action.',
      mid:  'CTA exists but may be weak. Replace generic "Sign Up" with outcome-driven text: "Get my growth insights →" or "Analyze my app free →".',
      high: 'Journey is clear. Consider adding a "What happens next" strip under your hero to set expectations before the click.',
    },
    'Emotional Pull': {
      low:  'Your copy speaks about the product, not the person. Count "we/our" vs "you/your" — flip every "we" to "you". Lead with the pain, not the solution.',
      mid:  'Good user focus but missing urgency. Add one specific fear or cost of inaction: "Every week without a strategy is a week of growth you can\'t get back."',
      high: 'Strong emotional connection. Add a specific number to anchor the emotion: "Founders waste 6 months guessing before finding their first 100 users."',
    },
    'Trust': {
      low:  'No social proof detected. Add even 1 real quote from a user, beta tester, or Discord member. A screenshot of a WhatsApp message converts better than polished testimonials.',
      mid:  'Some trust signals present. Add a founder story — "Built by [name] who faced this exact problem" creates emotional trust that logos can\'t.',
      high: 'Trust is solid. Consider adding specific numbers: "47 founders" beats "many founders".',
    },
    'Conversion Readiness': {
      low:  'No pricing or free tier visible. Visitors can\'t make a decision without knowing the cost. Add "Free to start" or pricing info above the fold.',
      mid:  'Pricing exists but CTA may only appear once. Repeat your CTA at every logical "yes" moment — after the problem, after the solution, after testimonials.',
      high: 'Conversion setup is strong. Test a more specific CTA: instead of "Get started", try "Analyze [AppName] free →" with their actual URL pre-filled.',
    },
  }
  const tier = score < 5 ? 'low' : score < 8 ? 'mid' : 'high'
  return fixes[label]?.[tier] ?? `Score: ${score}/10 — focus on improving this dimension.`
}

function getBenchmark(score: number): { label: string; desc: string; color: string } {
  if (score >= 8) return { label: 'Top 10% of apps analyzed', desc: 'Apps at this level typically convert 3-5x better than average. Focus on growth and content strategy.', color: '#34c98a' }
  if (score >= 7) return { label: 'Above average', desc: 'You\'re ahead of most apps. Fix the bottleneck identified above and you could reach top 10%.', color: '#34c98a' }
  if (score >= 5) return { label: 'Average — room to grow', desc: 'Most apps score in this range. 2-3 targeted fixes can push you to 7+ within a week.', color: '#f5a623' }
  if (score >= 3) return { label: 'Below average — needs work', desc: 'Don\'t worry — this is fixable. Focus on the #1 bottleneck first. One good fix can add 1-2 points.', color: '#f5a623' }
  return { label: 'Early stage — big opportunity', desc: 'The gap between where you are and where you could be is actually good news — small changes have huge impact at this stage.', color: '#e55555' }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, url, result } = req.body ?? {}
  if (!email || !result) return res.status(400).json({ error: 'Missing email or result' })

  const domain     = url?.replace(/^https?:\/\//, '').split('/')[0] ?? url
  const score      = result.overall ?? 0
  const scoreColor = score >= 7 ? '#34c98a' : score >= 5 ? '#f5a623' : '#e55555'
  const dims       = (result.dimensions ?? []) as any[]
  const bottleneck = result.bottleneck ?? { label: '', issue: '' }
  const teaser     = result.growth_teaser ?? ''
  const pagesRead  = result.pagesRead ?? []
  const benchmark  = getBenchmark(score)

  // Sort dims by score ascending — worst first
  const sortedDims = [...dims].sort((a, b) => a.score - b.score)

  // Top 3 priority actions
  const priorities = sortedDims.slice(0, 3).map((d, i) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f7;vertical-align:top;width:28px">
        <div style="width:24px;height:24px;border-radius:50%;background:${i===0?'#e55555':i===1?'#f5a623':'#7c6ff7'};color:#fff;font-size:12px;font-weight:700;text-align:center;line-height:24px">${i+1}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f0f7;vertical-align:top">
        <div style="font-size:13px;font-weight:600;color:#111;margin-bottom:4px">${d.label} — ${d.score}/10</div>
        <div style="font-size:12px;color:#666;line-height:1.6">${getDimFix(d.label, d.score)}</div>
      </td>
    </tr>
  `).join('')

  // Dimension score rows
  const dimRows = dims.map((d: any) => {
    const c = d.score >= 7 ? '#34c98a' : d.score >= 5 ? '#f5a623' : '#e55555'
    const barWidth = Math.round(d.score * 10)
    return `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f7;font-size:13px;color:#333;font-weight:500;width:160px">${d.label}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f0f0f7">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;height:6px;background:#f0f0f7;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${barWidth}%;background:${c};border-radius:3px"></div>
          </div>
          <span style="font-size:13px;font-weight:700;color:${c};min-width:36px;text-align:right">${d.score}/10</span>
        </div>
        <div style="font-size:11px;color:#999;margin-top:3px">${d.issue ?? ''}</div>
      </td>
    </tr>
  `}).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your Markr Score Report</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,'Segoe UI',Arial,sans-serif">
<div style="max-width:600px;margin:32px auto">

  <!-- Header -->
  <div style="background:#08080a;border-radius:14px 14px 0 0;padding:28px 32px;text-align:center">
    <div style="margin-bottom:16px">
      <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#7c6ff7,#e26faf);text-align:center;line-height:32px;font-weight:800;font-size:16px;color:#fff;vertical-align:middle">M</span>
      <span style="font-size:16px;font-weight:700;color:#f0f0f5;vertical-align:middle;margin-left:8px">Markr</span>
    </div>
    <div style="font-size:13px;color:rgba(255,255,255,.4);margin-bottom:4px">Landing Page Analysis Report</div>
    <div style="font-size:15px;font-weight:600;color:rgba(255,255,255,.8)">${domain}</div>
    ${pagesRead.length > 0 ? `<div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,.3)">Pages analyzed: ${pagesRead.join(' · ')}</div>` : ''}
  </div>

  <!-- Score hero -->
  <div style="background:#fff;padding:32px;text-align:center;border-left:1px solid #e4e4f0;border-right:1px solid #e4e4f0">
    <div style="font-size:72px;font-weight:800;color:${scoreColor};line-height:1">${score}</div>
    <div style="font-size:16px;color:#888;margin-top:4px">out of 10</div>
    <div style="margin:16px auto 0;display:inline-block;padding:8px 20px;border-radius:20px;background:${score>=7?'rgba(52,201,138,.1)':score>=5?'rgba(245,166,35,.1)':'rgba(229,85,85,.1)'};color:${scoreColor};font-size:13px;font-weight:600">
      ${benchmark.label}
    </div>
    <div style="margin-top:12px;font-size:13px;color:#666;line-height:1.6;max-width:400px;margin-left:auto;margin-right:auto">${benchmark.desc}</div>
  </div>

  <!-- Score breakdown with bars -->
  <div style="background:#fff;border-left:1px solid #e4e4f0;border-right:1px solid #e4e4f0;padding:0 32px 24px">
    <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.08em;padding:20px 0 12px">Score Breakdown</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #f0f0f7;border-radius:10px;overflow:hidden">
      <tbody>${dimRows}</tbody>
    </table>
  </div>

  <!-- Biggest bottleneck -->
  <div style="background:#fff;border-left:1px solid #e4e4f0;border-right:1px solid #e4e4f0;padding:0 32px 24px">
    <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:18px">
      <div style="font-size:11px;font-weight:700;color:#e55;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">🚨 Biggest Bottleneck — ${bottleneck.label}</div>
      <div style="font-size:13px;color:#333;line-height:1.7;margin-bottom:10px">${bottleneck.issue}</div>
      <div style="font-size:12px;color:#666;line-height:1.6;padding-top:10px;border-top:1px solid #fecaca">
        <strong style="color:#333">Fix:</strong> ${getDimFix(bottleneck.label, dims.find((d:any) => d.label === bottleneck.label)?.score ?? 3)}
      </div>
    </div>
  </div>

  <!-- Priority action plan -->
  <div style="background:#fff;border-left:1px solid #e4e4f0;border-right:1px solid #e4e4f0;padding:0 32px 24px">
    <div style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px">Your 3 Priority Fixes This Week</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #f0f0f7;border-radius:10px;overflow:hidden">
      <tbody>${priorities}</tbody>
    </table>
  </div>

  ${teaser ? `
  <!-- Growth opportunity -->
  <div style="background:#fff;border-left:1px solid #e4e4f0;border-right:1px solid #e4e4f0;padding:0 32px 24px">
    <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:18px">
      <div style="font-size:11px;font-weight:700;color:#7c6ff7;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">💡 Content Opportunity</div>
      <div style="font-size:13px;color:#333;line-height:1.7">${teaser}</div>
    </div>
  </div>
  ` : ''}

  <!-- What Markr does -->
  <div style="background:#fff;border-left:1px solid #e4e4f0;border-right:1px solid #e4e4f0;padding:0 32px 24px">
    <div style="background:#f8f8fc;border-radius:10px;padding:18px">
      <div style="font-size:12px;font-weight:700;color:#111;margin-bottom:10px">This is just the surface — here's what the full analysis includes:</div>
      <table style="width:100%;border-collapse:collapse">
        ${[
          ['🔍 Competitive Analysis', '5 named competitors, their gaps, your win condition'],
          ['📊 SWOT Analysis', 'Component scoring with specific action points'],
          ['🗺️ Business Model Canvas', 'Your full BMC mapped and analyzed'],
          ['🚀 Growth Playbook', 'AARRR framework with tactics for your stage'],
          ['💰 Pricing Strategy', 'Recommendations based on your category and competitors'],
          ['📱 Daily Instagram Posts', '3 posts delivered to your inbox every morning'],
        ].map(([title, desc]) => `
          <tr>
            <td style="padding:6px 0;vertical-align:top;width:200px">
              <span style="font-size:12px;font-weight:600;color:#333">${title}</span>
            </td>
            <td style="padding:6px 0 6px 12px">
              <span style="font-size:12px;color:#666">${desc}</span>
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
  </div>

  <!-- CTA -->
  <div style="background:#fff;border-left:1px solid #e4e4f0;border-right:1px solid #e4e4f0;border-bottom:1px solid #e4e4f0;border-radius:0 0 14px 14px;padding:24px 32px;text-align:center">
    <a href="https://markr.mindprintjournal.com/login?url=${encodeURIComponent(url)}"
      style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#7c6ff7,#9b8af4);color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:9px">
      Get my full analysis free →
    </a>
    <div style="font-size:11px;color:#aaa;margin-top:10px">Free to start · No credit card required · 2 minutes setup</div>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #f0f0f7;font-size:12px;color:#888;line-height:1.7">
      Sent by Markr — Growth Intelligence for App Founders<br>
      <a href="https://markr.mindprintjournal.com" style="color:#7c6ff7;text-decoration:none">markr.mindprintjournal.com</a>
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
        subject:  `${domain} scored ${score}/10 — your 3 priority fixes inside`,
        html,
      }),
    })
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      return res.status(500).json({ error: 'Email failed', detail: e })
    }
    return res.status(200).json({ sent: true })
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
