export interface TestCreds {
  user: string
  password?: string
  loginUrl: string
  flows: string
}

export interface ProductTestFlow {
  name: string
  status: 'Pass' | 'Partial' | 'Fail'
  score: number
  steps_tested: string[]
  observation: string
  friction_point: string | null
}

export interface ProductTestFeature {
  name: string
  description: string
  quality: 'Excellent' | 'Good' | 'Average' | 'Poor'
  tested?: boolean
}

export interface ProductTestBug {
  title: string
  description: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  location: string
  reproducible?: boolean
}

export interface ProductTest {
  // Legacy AI format
  overall_score?: number
  verdict?: string
  verdict_emoji?: string
  executive_summary?: string
  tester_recommendation?: string
  first_impression?: string
  tested_flows?: ProductTestFlow[]
  features_found?: ProductTestFeature[]
  bugs_and_issues?: ProductTestBug[]
  ux_ratings?: {
    onboarding: number
    navigation: number
    visual_design: number
    performance: number
    mobile_responsiveness: number
    error_handling: number
  }
  what_works_well?: string[]
  what_needs_fixing?: string[]
  content_implications?: string[]
  ux_observations?: string
  onboarding_verdict?: string
  competitive_edge_from_test?: string
  // New rule-based format
  score?: number
  loadTime?: number
  runAt?: string
  checks?: Array<{
    id: string; category: string; label: string
    status: 'pass'|'warn'|'fail'; detail: string; impact: 'High'|'Medium'|'Low'
  }>
  byCategory?: Record<string, any[]>
  summary?: { pass: number; warn: number; fail: number; total: number; highFails: number }
  // Shared
  error?: string
  url?: string
  appName?: string
}

export interface AppData {
  id: number
  name: string
  platform: 'Web' | 'Mobile' | 'Both'
  color: string
  stage: 'Idea' | 'Early' | 'Launch' | 'Growth'
  category: string
  url: string
  desc: string
  brand: string
  pillars: string[]
  features: string[]
  audience?: string
  problem?: string
  diff?: string
  testCreds?: TestCreds | null
  productTest?: ProductTest | null
  analyzed?: boolean
  recent_context?: string | null  // user-provided recent data: reviews, metrics, feedback
  // Persisted analysis cache
  competitive_analysis?: string | null
  bmc_analysis?:         string | null
  swot_analysis?:        string | null
  growth_analysis?:      string | null
  pricing_analysis?:     string | null
  content_studio_cache?: string | null
  strategy_cache?:       string | null
  // Competitor URL Analysis
  competitor_url_analysis?: {
    name: string
    url: string
    overall: number
    headline: string
    dimensions: Array<{ label: string; score: number; issue: string }>
    bottleneck: { label: string; issue: string }
    analyzed_at: string
    closestCompetitor?: { name: string; url: string; reason?: string } | null
  } | null
  // URL Analysis (from analyze-url API)
  url_analysis?: {
    overall: number
    headline: string
    category: string
    dimensions: Array<{ label: string; score: number; issue: string }>
    bottleneck: { label: string; issue: string }
    growth_teaser: string
    pagesRead: string[]
    analyzed_at: string
  } | null
  // Pillar post suggestions (generated weekly)
  pillar_suggestions?:    Record<string, string[]> | null
  pillar_suggestions_at?: string | null
  // Analysis timestamps
  competitive_analyzed_at?: string | null
  bmc_analyzed_at?:         string | null
  swot_analyzed_at?:        string | null
  growth_analyzed_at?:      string | null
  pricing_analyzed_at?:     string | null
}

export type ViewType = 'overview' | 'studio' | 'strategy' | 'calendar' | 'insights' | 'admin'

export interface AgentPost {
  caption: string
  hashtags: string[]
  image_prompt: string
  best_posting_time: string
  pillar: string
  save_hook?: string
  share_hook?: string
  comment_hook?: string
  insight_headline?: string
  poll_options?: string[]
  post_idea: string
  journal_prompt?: string
  engagement_type: string
}

export interface SlotConfig {
  label: string
  time: string
  emoji: string
  color: string
  bg: string
  border: string
  metricLabel: string
  metricColor: string
  metricBg: string
  metricReason: string
  timeReason: string
  bestDays: string
}
