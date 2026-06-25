import type { VercelRequest, VercelResponse } from '@vercel/node'

const CATEGORY_SUBREDDITS: Record<string, string> = {
  productivity:  'productivity',
  saas:          'SaaS',
  health:        'fitness',
  fitness:       'fitness',
  wellness:      'selfimprovement',
  finance:       'personalfinance',
  fintech:       'fintech',
  marketing:     'marketing',
  education:     'learnprogramming',
  mobile:        'androidapps',
  social:        'socialmedia',
  ecommerce:     'ecommerce',
  business:      'Entrepreneur',
  hr:            'humanresources',
  legal:         'legaladvice',
  travel:        'travel',
  food:          'food',
}

function getSubreddit(category: string): string {
  const c = category.toLowerCase()
  for (const [key, sub] of Object.entries(CATEGORY_SUBREDDITS)) {
    if (c.includes(key)) return sub
  }
  return 'startups'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { category = 'startups' } = req.body ?? {}
  const subreddit = getSubreddit(String(category))

  try {
    const url = `https://www.reddit.com/r/${subreddit}/top.json?limit=8&t=week`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'markr-content-tool/1.0 (content inspiration)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!resp.ok) return res.status(200).json({ topics: [], subreddit })
    const data = await resp.json() as any
    const posts = data?.data?.children ?? []
    const topics: string[] = posts
      .map((p: any) => p.data?.title as string)
      .filter((t: string) => t && t.length > 10 && t.length < 140)
      .slice(0, 5)
    return res.status(200).json({ topics, subreddit })
  } catch {
    return res.status(200).json({ topics: [], subreddit })
  }
}
