// ── Instagram handle helpers (shared by AddAppModal, EditAppModal, Overview) ──

// Normalizes "@yourbrand", "instagram.com/yourbrand", "https://www.instagram.com/yourbrand/"
// etc. down to the bare handle we store and use to build the profile URL.
export function normalizeInstagramHandle(input: string): string {
  let h = (input || '').trim()
  if (!h) return ''
  h = h.replace(/^@/, '')
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
  h = h.split(/[?#]/)[0]
  h = h.replace(/\/+$/, '')
  h = h.split('/')[0]
  return h.trim()
}

export function formatInstagramCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}
