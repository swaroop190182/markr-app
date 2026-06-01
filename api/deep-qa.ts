import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'swaroop.raghu@gmail.com'
const PRO_EMAILS  = (process.env.PRO_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase())

function isPro(email: string): boolean {
  return PRO_EMAILS.includes(email.toLowerCase()) || email.toLowerCase() === ADMIN_EMAIL
}

// ── Screenshot a page using Playwright + Sparticuz Chromium ──────────────────
async function takeScreenshots(
  url: string,
  loginEmail: string,
  loginPassword: string,
  appName: string,
): Promise<{ step: string; b64: string; url: string }[]> {

  // Must set these BEFORE importing chromium
  process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs20.x'

  let chromium: any, playwrightChromium: any

  try {
    const chromiumPack = await import('@sparticuz/chromium')
    chromium = chromiumPack.default ?? chromiumPack
    // Disable graphics mode to prevent freezing on Lambda
    chromium.setGraphicsMode = false
    const pw = await import('playwright-core')
    playwrightChromium = pw.chromium
  } catch (e) {
    throw new Error(`Browser dependencies not available: ${(e as Error).message}`)
  }

  const executablePath = await chromium.executablePath()
  if (!executablePath) throw new Error('Chromium executable not found — check @sparticuz/chromium installation')

  const browser = await playwrightChromium.launch({
    args:           [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath,
    headless:       true,
  })

  const shots: { step: string; b64: string; url: string }[] = []

  try {
    // ── Desktop context ──────────────────────────────────────────────────────
    const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    const shot = async (label: string) => {
      await page.waitForTimeout(1200)
      const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false })
      shots.push({ step: label, b64: buf.toString('base64'), url: page.url() })
    }

    // Step 1 — Landing page
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await shot('Landing page — first impression')

    // Step 2 — Find and click primary CTA
    const ctaSelectors = [
      'a[href*="login"], a[href*="signin"], a[href*="signup"], a[href*="register"], a[href*="auth"]',
      'button:has-text("Get started"), button:has-text("Sign up"), button:has-text("Start free")',
      'button:has-text("Get"), button:has-text("Try"), button:has-text("Join")',
      'a:has-text("Get started"), a:has-text("Sign up"), a:has-text("Start free")',
    ]
    let clicked = false
    for (const sel of ctaSelectors) {
      try {
        const el = page.locator(sel).first()
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click()
          clicked = true
          break
        }
      } catch { continue }
    }
    if (clicked) {
      await page.waitForTimeout(2000)
      await shot('After clicking primary CTA')
    }

    // Step 3 — Try to log in
    const emailField = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first()
    const passField  = page.locator('input[type="password"]').first()

    if (await emailField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailField.fill(loginEmail)
      if (await passField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passField.fill(loginPassword)
        await shot('Login form filled')

        // Submit
        const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Continue")').first()
        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(3000)

          // ── Detect login failure ──────────────────────────────────────────
          const currentUrl = page.url()
          const pageContent = await page.textContent('body').catch(() => '')
          const loginFailed =
            // Still on login/auth page
            (currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('signin')) ||
            // Error message visible
            /invalid|incorrect|wrong|failed|error|not found|no account/i.test(pageContent ?? '')

          if (loginFailed) {
            await browser.close()
            throw new Error('Login failed — please check the test email and password are correct')
          }

          await shot('After login — home screen')
        }
      }
    } else {
      // Google OAuth or other — screenshot what we see
      await shot('Auth screen — login method detected')
    }

    // Step 4 — Explore inside the app
    const currentUrl = page.url()
    if (currentUrl !== url && !currentUrl.includes('login') && !currentUrl.includes('auth')) {
      // We're inside the app — explore
      await shot('App interior — initial state')

      // Click first interactive element that looks like a feature
      const featureBtns = page.locator('button:not([disabled])').all()
      const btns = await featureBtns
      if (btns.length > 0) {
        for (const btn of btns.slice(0, 3)) {
          try {
            const text = await btn.textContent()
            if (text && text.length > 2 && text.length < 40 && !/sign out|logout|close|cancel/i.test(text)) {
              await btn.click()
              await page.waitForTimeout(1500)
              await shot(`Feature: "${text.trim().slice(0,30)}"`)
              break
            }
          } catch { continue }
        }
      }

      // Check nav items
      const navLinks = page.locator('nav a, [role="navigation"] a').all()
      const links = await navLinks
      for (const link of links.slice(0, 3)) {
        try {
          const text = await link.textContent()
          if (text && text.length > 1) {
            await link.click()
            await page.waitForTimeout(1500)
            await shot(`Nav: "${text.trim().slice(0,30)}"`)
            break
          }
        } catch { continue }
      }
    }

    // Step 5 — Mobile viewport
    const mCtx  = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const mPage = await mCtx.newPage()
    await mPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 })
    await mPage.waitForTimeout(1500)
    const mBuf = await mPage.screenshot({ type: 'jpeg', quality: 60 })
    shots.push({ step: 'Mobile view (390px — iPhone)', b64: mBuf.toString('base64'), url: mPage.url() })
    await mCtx.close()

  } finally {
    await browser.close()
  }

  return shots
}

// ── Build Claude vision prompt ────────────────────────────────────────────────
function buildPrompt(appName: string, desc: string, features: string[], shots: { step: string; url: string }[]): string {
  return `You are a senior QA engineer and UX expert doing a real hands-on product test of "${appName}".

App description: ${desc || 'Not provided'}
Key features: ${features?.join(', ') || 'Not listed'}

You have just tested this app live in a real browser. You visited ${shots.length} screens.
Screens tested: ${shots.map((s, i) => `${i+1}. ${s.step}`).join(', ')}

Based on what you actually see in these screenshots, provide a brutally honest QA report.
Be specific — reference actual UI elements, text, layouts you can see. No generic advice.

Return ONLY valid JSON:
{
  "overall_score": 75,
  "verdict": "One sentence overall assessment",
  "first_impression": "What a real user thinks in the first 5 seconds",
  "screens_tested": ${shots.length},
  "ux_ratings": {
    "onboarding": 70,
    "navigation": 80,
    "visual_design": 75,
    "performance": 85,
    "mobile_responsiveness": 65,
    "error_handling": 60
  },
  "bugs_and_issues": [
    { "title": "Specific issue title", "description": "Exactly what you saw and why it's a problem", "severity": "Critical|High|Medium|Low", "location": "Which screen/step" }
  ],
  "what_works_well": ["Specific thing that works, referencing actual UI"],
  "what_needs_fixing": ["Specific fix needed, referencing actual UI"],
  "onboarding_verdict": "How smooth is the path from landing to first value?",
  "content_implications": ["How this finding should shape the app's marketing content"],
  "tester_recommendation": "The single most important thing to fix right now"
}`
}

// ── Call Claude Vision ─────────────────────────────────────────────────────
async function analyzeWithClaude(
  appName: string, desc: string, features: string[],
  shots: { step: string; b64: string; url: string }[]
): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('No Anthropic key configured')

  const content: any[] = []

  // Add each screenshot with its label
  for (const shot of shots) {
    content.push({ type: 'text', text: `\n--- Screen: ${shot.step} (URL: ${shot.url}) ---` })
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: shot.b64 }
    })
  }

  content.push({ type: 'text', text: buildPrompt(appName, desc, features, shots) })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content }]
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Claude API error: ${(err as any)?.error?.message ?? res.status}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''
  const cleaned = text.replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error('Failed to parse Claude response as JSON')
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.slice(7)
  if (!token) return res.status(401).json({ error: 'No token' })

  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid session' })

  // Pro gate
  if (!isPro(user.email ?? '')) {
    return res.status(403).json({ error: 'Deep QA is a Pro feature. Upgrade to run real browser tests.' })
  }

  const { url, loginEmail, loginPassword, appName, desc, features } = req.body
  if (!url)           return res.status(400).json({ error: 'App URL required' })
  if (!loginEmail)    return res.status(400).json({ error: 'Test email required' })
  if (!loginPassword) return res.status(400).json({ error: 'Test password required' })

  try {
    // Take real screenshots
    const shots = await takeScreenshots(url, loginEmail, loginPassword, appName || '')

    if (shots.length === 0) {
      return res.status(422).json({ error: 'Could not capture any screens — check the URL is accessible' })
    }

    // Send to Claude Vision
    const report = await analyzeWithClaude(appName || '', desc || '', features || [], shots)

    // Add metadata
    report.screens_captured = shots.length
    report.screens_list     = shots.map((s: any) => s.step)
    report.tested_at        = new Date().toISOString()
    report._type            = 'deep_qa'

    res.status(200).json(report)
  } catch (e) {
    const msg = (e as Error).message
    console.error('Deep QA error:', msg)
    if (msg.includes('Browser dependencies')) {
      res.status(503).json({ error: 'Headless browser not available — Vercel may need a moment to provision it. Try again in 30 seconds.' })
    } else if (msg.includes('Login failed')) {
      res.status(422).json({ error: msg })
    } else if (msg.includes('executablePath')) {
      res.status(503).json({ error: 'Browser binary not found — ensure @sparticuz/chromium is installed. Check Vercel function logs.' })
    } else {
      res.status(500).json({ error: `Deep QA failed: ${msg}` })
    }
  }
}
