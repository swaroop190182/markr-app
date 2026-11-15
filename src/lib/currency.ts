// Keep prices in AI analysis output in their original currency.
// Pure (no I/O) — unit-tested in tests/currency.test.ts.

const SYMBOLS = '$₹€£'
// "₹49/mo", "$69.99/year", "₹1,500 per month", "€9 a month"
const PRICE_SRC = `([${SYMBOLS}])\\s?(\\d[\\d,]*(?:\\.\\d+)?)(?:\\s*(?:\\/|per\\s+|a\\s+)\\s*(month|mo|year|yr|annum|week|wk|day))?`
// A model-made conversion straight after a price: " = ₹583/mo equiv.", " (≈ ₹583/mo)", " ~₹583/month equivalent"
const CONVERSION_SRC = `\\s*\\(?\\s*(?:=|≈|~|approx\\.?|approximately)\\s*([${SYMBOLS}])\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s*\\/\\s*[a-z]+)?(?:\\s*equiv(?:alent)?\\.?)?(?:\\s*\\))?`

type Period = 'mo' | 'yr' | 'wk' | 'day'
export interface KnownPrice { symbol: string; amount: string; period: Period }
export interface CurrencyFix { from: string; to: string }

const normPeriod = (p?: string): Period | null => {
  const s = (p ?? '').toLowerCase()
  return s === 'month' || s === 'mo' ? 'mo' : s === 'year' || s === 'yr' || s === 'annum' ? 'yr'
       : s === 'week' || s === 'wk' ? 'wk' : s === 'day' ? 'day' : null
}
const normAmount = (a: string) => String(Number(a.replace(/,/g, '')))   // "1,500" → "1500", "99.00" → "99"

// Prices with a period from the source data: the app's screenshot pricing, sourced competitor
// pricing. One-off prices (no /mo, /year…) are skipped — matching them would touch unrelated numbers.
export function knownPricesFrom(texts: Array<string | null | undefined>): KnownPrice[] {
  const out: KnownPrice[] = []
  for (const t of texts) {
    if (!t) continue
    for (const m of String(t).matchAll(new RegExp(PRICE_SRC, 'gi'))) {
      const period = normPeriod(m[3])
      if (period) out.push({ symbol: m[1], amount: normAmount(m[2]), period })
    }
  }
  return out
}

// Fix one string: remove model-made currency conversions, then restore the original symbol on a
// known price (same amount and period) written with a different symbol.
export function fixCurrencyText(text: string, known: KnownPrice[]): { text: string; fixes: CurrencyFix[] } {
  const fixes: CurrencyFix[] = []
  // 1) "$69.99/year = ₹583/mo equiv." → "$69.99/year" (only when the second symbol differs)
  let out = text.replace(new RegExp(`(${PRICE_SRC})(${CONVERSION_SRC})`, 'gi'),
    (all: string, price: string, sym1: string, _a: string, _p: string, _conv: string, sym2: string) => {
      if (sym1 === sym2) return all
      fixes.push({ from: all.trim(), to: price.trim() })
      return price
    })
  // 2) "$49/mo" → "₹49/mo" when only "₹49/mo" is known
  out = out.replace(new RegExp(PRICE_SRC, 'gi'), (all: string, sym: string, amount: string, period?: string) => {
    const p = normPeriod(period)
    if (!p) return all
    const a = normAmount(amount)
    const same = known.filter(k => k.amount === a && k.period === p)
    if (!same.length || same.some(k => k.symbol === sym)) return all          // unknown, or already correct
    const symbols = [...new Set(same.map(k => k.symbol))]
    if (symbols.length !== 1) return all                                       // ambiguous — leave it
    const fixed = symbols[0] + all.slice(all.indexOf(sym) + sym.length)
    fixes.push({ from: all, to: fixed })
    return fixed
  })
  return { text: out, fixes }
}

// Apply fixCurrencyText to every string in a parsed analysis (keys untouched)
export function fixCurrencyDeep<T>(value: T, known: KnownPrice[], fixes: CurrencyFix[] = []): { value: T; fixes: CurrencyFix[] } {
  const walk = (v: any): any => {
    if (typeof v === 'string') { const r = fixCurrencyText(v, known); fixes.push(...r.fixes); return r.text }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return { value: walk(value), fixes }
}
