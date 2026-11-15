import type { AppData } from '../types'
import { readCompetitive } from './founder'
import { knownPricesFrom, fixCurrencyDeep, type KnownPrice } from './currency'
import { logCurrencyFixes } from './claude'

// Keep every price as given — the model sometimes swapped ₹ for $ or added its own "equivalent" prices
export const CURRENCY_RULE = `CURRENCY RULE: Quote every price exactly as it appears in the context above, with its original currency symbol (₹49/mo stays ₹49/mo — never $49/mo). Never convert between currencies or compute "equivalent" prices.`

// Prices as they appear in the app's data: its own (screenshot pricing) + sourced competitor pricing
export function knownPricesForApp(app: AppData, competitiveRaw?: string | null): KnownPrice[] {
  return knownPricesFrom([
    ...(app.screenshot_vision?.screenshots ?? []).flatMap(s => s.analysis?.extracted_copy.pricing ?? []),
    ...((readCompetitive(app, competitiveRaw)?.comps ?? []) as any[]).map(c => c?.facts?.pricing?.value),
  ])
}

// Restore original currency symbols / drop model-made conversions in a parsed analysis.
// Records the count as _currency_fixes (admin-only note) and logs each correction on the server.
export function fixAnalysisCurrency<T extends object>(app: AppData, analysis: string, obj: T, competitiveRaw?: string | null): T {
  const { value, fixes } = fixCurrencyDeep(obj, knownPricesForApp(app, competitiveRaw))
  if (fixes.length) { (value as any)._currency_fixes = fixes.length; logCurrencyFixes(app, analysis, fixes) }
  return value
}
