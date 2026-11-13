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
  primary_market?: string | null  // user-set market override for competitor detection — 'Auto-detect' or a specific market
  instagram_handle?: string | null  // bare handle (no @, no URL) — used to pull follower/post counts into analysis
  // Persisted analysis cache
  competitive_analysis?: string | null
  bmc_analysis?:         string | null
  swot_analysis?:        string | null
  growth_analysis?:      string | null
  pricing_analysis?:     string | null
  gtm_analysis?:          string | null
  positioning_analysis?:  string | null
  content_studio_cache?:  string | null
  strategy_cache?:        string | null
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
    // Instagram metrics — populated when instagram_handle is set and the renderer
    // successfully resolves the profile. Bio and captions are never available.
    instagram?: {
      handle: string
      followers: number
      following: number
      posts: number
    } | null
  } | null
  // Pillar post suggestions (generated weekly)
  pillar_suggestions?:    Record<string, string[]> | null
  pillar_suggestions_at?: string | null
  // AI landing page recommendations
  ai_recommendations?: {
    headline_rewrites:         Array<{ text: string; angle: string }>
    cta_rewrite:               string
    priority_fixes:            Array<{ fix: string; how: string }>
    biggest_lever_explanation: string
    lever?:                    { name: string; score: number; recoverable: number }
  } | null
  ai_recommendations_at?: string | null
  // Analysis timestamps
  competitive_analyzed_at?: string | null
  bmc_analyzed_at?:         string | null
  swot_analyzed_at?:        string | null
  growth_analyzed_at?:      string | null
  pricing_analyzed_at?:     string | null
  gtm_analyzed_at?:          string | null
  positioning_analyzed_at?:  string | null
  // Analysis Pack one-time usage tracking
  analysis_used_at?:        string | null
  // Content Studio preferences
  post_style?:              string | null
  // Content Studio context
  content_context?: ContentContext | null
  // Post history — last 30 generated posts for context injection
  post_history?: PostHistoryEntry[] | null
  // Per-screenshot vision analysis + combined summary (text only). Images live in
  // the separate screenshot_images column and are never part of AppData.
  screenshot_vision?: ScreenshotVision | null
  // Founder-stated intent — injected as the goal that evidence is compared against
  founder_brief?: FounderBrief | null
}

export type ScreenLabel = 'home' | 'onboarding' | 'paywall' | 'results' | 'other'
export const SCREEN_LABELS: ScreenLabel[] = ['home', 'onboarding', 'paywall', 'results', 'other']

export interface ScreenshotAnalysis {
  screen_type: string               // model's read, ≤4 words
  features_visible: string[]        // ≤5
  extracted_copy: {
    headline: string | null         // verbatim
    ctas: string[]                  // verbatim button text, ≤3
    pricing: string[]               // verbatim price/trial text, ≤3
  }
  ui_issues: string[]               // ≤3
  trust_signals: string[]           // ≤3
  friction_points: string[]         // ≤3
}

// Stored in markr_apps.screenshot_vision — small, loaded with the app
export interface ScreenshotVisionEntry {
  id: string                        // matches ScreenshotImage.id
  label: ScreenLabel                // user-set; authoritative over screen_type
  analysis: ScreenshotAnalysis | null
  analyzed_at: string | null
}

export interface ScreenshotVision {
  screenshots: ScreenshotVisionEntry[]   // max 6
  product_understanding: string | null
  updated_at: string
}

// Stored in markr_apps.screenshot_images — large, loaded only by the setup UI
export interface ScreenshotImage {
  id: string
  label: ScreenLabel
  image: string                     // JPEG data URL, ≤1024px wide
}

// Stored in markr_apps.founder_brief. All fields optional; an empty brief is saved as null.
export interface FounderBrief {
  intended_audience?: string        // ≤200 chars
  focus_competitors?: string[]      // names or URLs, max 5 — analyzed first in Competitive
  excluded_competitors?: string[]   // names or URLs, max 10 — never listed as competitors
  vision?: string                   // ≤200 chars
  mission?: string                  // ≤200 chars
}

export interface ContentContext {
  typical_user: string
  real_result:  string
  user_quote:   string
  before_state: string
  /** @deprecated legacy 512px images — migrated to screenshot_images on next save */
  screenshots?: string[]
  top_performing_formats?: string[]  // formats the user marked as high-engagement
}

export interface PostHistoryEntry {
  ts:      string  // ISO timestamp
  channel: string  // channel id
  format:  string  // style:slot for instagram, channel label for others
  excerpt: string  // first 120 chars of generated content
  visuals?: string  // extracted VISUAL: lines, for Instagram anti-repetition
}

export type ViewType = 'overview' | 'marketing' | 'studio' | 'strategy' | 'calendar' | 'insights' | 'admin'

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
