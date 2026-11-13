import type { AppData, ScreenLabel, ScreenshotAnalysis, ScreenshotVisionEntry } from '../types'
import { SCREEN_LABELS } from '../types'
import { callClaude, safeParseJSON } from './claude'

// ── Resize for vision: ≤1024px wide, ≤1568px tall (Anthropic's effective max long edge) ──
export async function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, 1024 / img.width, 1568 / img.height)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
}

// ── Enforce compactness regardless of what the model returns ──
const str  = (v: unknown, maxWords: number): string =>
  typeof v === 'string' ? v.trim().split(/\s+/).slice(0, maxWords).join(' ') : ''
const list = (v: unknown, maxItems: number, maxWords: number): string[] =>
  Array.isArray(v) ? v.map(x => str(x, maxWords)).filter(Boolean).slice(0, maxItems) : []

export function normalizeAnalysis(raw: any): ScreenshotAnalysis {
  const copy = raw?.extracted_copy ?? {}
  return {
    screen_type:      str(raw?.screen_type, 4) || 'unknown',
    features_visible: list(raw?.features_visible, 5, 6),
    extracted_copy: {
      headline: str(copy.headline, 15) || null,
      ctas:     list(copy.ctas, 3, 6),
      pricing:  list(copy.pricing, 3, 8),
    },
    ui_issues:       list(raw?.ui_issues, 3, 12),
    trust_signals:   list(raw?.trust_signals, 3, 8),
    friction_points: list(raw?.friction_points, 3, 12),
  }
}

// Map the model's screen_type onto a user label, for the dropdown default
export function guessLabel(a: ScreenshotAnalysis | null): ScreenLabel {
  const t = a?.screen_type.toLowerCase() ?? ''
  if (/paywall|pricing|subscri|checkout|upgrade/.test(t)) return 'paywall'
  if (/onboard|signup|sign up|welcome|login|tutorial/.test(t)) return 'onboarding'
  if (/result|report|output|summary|success/.test(t)) return 'results'
  if (/home|dashboard|landing|main|feed/.test(t)) return 'home'
  return SCREEN_LABELS.includes(t as ScreenLabel) ? t as ScreenLabel : 'other'
}

// ── One structured vision pass per screenshot (Anthropic-only via /api/claude) ──
export async function analyzeScreenshot(image: string, labelHint?: ScreenLabel): Promise<ScreenshotAnalysis | null> {
  const prompt = `Analyze this app screenshot${labelHint && labelHint !== 'other' ? ` (user says it is the ${labelHint} screen)` : ''}.
Copy text VERBATIM where asked. Only report what is visible — never guess. Empty arrays/null are fine.
Output ONLY this JSON:
{"screen_type":"≤4 words","features_visible":["≤5 items, ≤6 words each"],"extracted_copy":{"headline":"verbatim main headline or null","ctas":["verbatim button text, ≤3"],"pricing":["verbatim prices/trial terms, ≤3"]},"ui_issues":["≤3, ≤12 words each"],"trust_signals":["≤3, ≤8 words each: ratings, testimonials, logos, guarantees"],"friction_points":["≤3, ≤12 words each: things that slow or block the user"]}`
  try {
    const raw = await callClaude(prompt,
      'You are a precise UI/UX analyst. Output ONLY valid JSON. No markdown, no prose.',
      500, undefined, 'haiku', 'vision', [image])
    return normalizeAnalysis(safeParseJSON(raw))
  } catch (e) {
    console.warn('[vision] analyzeScreenshot failed:', e)
    return null
  }
}

// ── Combined product understanding — text-only, from the compact analyses ──
export async function summarizeProduct(app: AppData, entries: ScreenshotVisionEntry[]): Promise<string | null> {
  const analyzed = entries.filter(e => e.analysis)
  if (!analyzed.length) return null
  const compact = analyzed.map(e => ({ label: e.label, ...e.analysis }))
  try {
    const raw = await callClaude(
      `App: "${app.name}" (${app.category}, ${app.platform}). Structured analyses of its real screenshots:
${JSON.stringify(compact)}

In ≤60 words, state what the product does, its core user flow, how it monetizes (if visible), and its single biggest visible UX weakness. Plain prose, no lists, no preamble. Use only facts from the analyses.`,
      'You summarize products precisely from evidence. No speculation.',
      200, undefined, 'haiku', 'vision')
    return str(raw, 70) || null
  } catch (e) {
    console.warn('[vision] summarizeProduct failed:', e)
    return null
  }
}
