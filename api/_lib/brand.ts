// Brand voice text helpers shared by the server (api/cron/deliver.ts) and the client (Content Studio).
// Pure, no I/O — unit-tested in tests/brand.test.ts.

// Older versions of Add App / Edit App appended a block like
//   "PRODUCT TEST (72/100 — Good with gaps):\n• Works: …\n• Fix: …\n• Content: …"
// to the stored brand voice. It came from an AI simulation that never opened the app,
// so its "findings" are invented. Strip it wherever the brand voice reaches a prompt.
export function stripLegacyProductTest(brand: string | null | undefined): string {
  if (!brand) return ''
  return brand
    .replace(/\n*PRODUCT TEST \([^\n]*\):\n(?:• [^\n]*(?:\n|$))*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
