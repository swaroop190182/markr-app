// Admin accounts (same list Insights and Marketing already use) — e.g. for the "N prices corrected" note
const ADMIN_EMAILS = ['swaroop.raghu@gmail.com']
export const isAdminEmail = (email: string | null | undefined) => !!email && ADMIN_EMAILS.includes(email.toLowerCase())
