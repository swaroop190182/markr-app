import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { AppData, ViewType, ContentContext } from '../types'
import { COLORS } from './data'
import { supabase } from './supabase'

// ── Plan config ────────────────────────────────────────────────────────────────
const PRO_EMAILS = ['swaroop.raghu@gmail.com', 'swaroop.82@gmail.com']  // admin override: appLimit=10

export type PlanType = 'free' | 'analysis' | 'content' | 'pro' | 'guest_pro'

export const PLAN_CONFIG: Record<PlanType, {
  callsPerDay: number
  appLimit:    number
  features:    string[]
  trialDays:   number | null
  oneTime:     boolean
}> = {
  free: {
    callsPerDay: 5,
    appLimit:    1,
    features:    ['score'],
    trialDays:   7,
    oneTime:     false,
  },
  analysis: {
    callsPerDay: 10,
    appLimit:    1,
    features:    ['score','competitive','swot','bmc','growth','pricing','ai_recommendations'],
    trialDays:   null,
    oneTime:     true,   // one-time purchase — never expires
  },
  content: {
    callsPerDay: 30,
    appLimit:    2,
    features:    ['score','content_studio','pillars'],
    trialDays:   null,
    oneTime:     false,
  },
  guest_pro: {
    callsPerDay: 30,
    appLimit:    3,
    features:    ['all'],
    trialDays:   null,
    oneTime:     false,
  },
  pro: {
    callsPerDay: 50,
    appLimit:    3,
    features:    ['all'],
    trialDays:   null,
    oneTime:     false,
  },
}

export function planHasFeature(plan: PlanType, feature: string): boolean {
  const { features } = PLAN_CONFIG[plan]
  return features.includes('all') || features.includes(feature)
}

export function getUserPlan(email: string): PlanType {
  return PRO_EMAILS.includes(email.toLowerCase()) ? 'pro' : 'free'
}

export function getAppLimit(plan: PlanType, email?: string): number {
  if (email && PRO_EMAILS.includes(email.toLowerCase())) return 10
  return PLAN_CONFIG[plan].appLimit
}

// Check if trial has expired (only free plan has a trial)
export function isTrialExpired(createdAt: string, plan: PlanType): boolean {
  if (plan !== 'free') return false
  const trialDays = PLAN_CONFIG.free.trialDays
  if (!trialDays) return false
  const daysPassed = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  return daysPassed > trialDays
}

interface AppStore {
  apps: AppData[]
  currentApp: AppData
  view: ViewType
  loading: boolean
  plan: PlanType
  userEmail: string
  canAddApp: boolean
  canUseProductTest: boolean
  trialExpired: boolean
  daysLeftInTrial: number
  setView: (v: ViewType) => void
  setCurrentApp: (id: number) => void
  addApp: (app: AppData) => Promise<void>
  updateApp: (id: number, updates: Partial<AppData>) => Promise<void>
  removeApp: (id: number) => Promise<void>
}

const StoreContext = createContext<AppStore | null>(null)

const FALLBACK_APP: AppData = {
  id: 0, name: 'My App', platform: 'Web', color: '#7c6ff7',
  stage: 'Launch', category: 'Productivity', url: '', desc: '',
  brand: '', pillars: [], features: []
}

export function StoreProvider({ children, userId, userEmail }: { children: React.ReactNode; userId: string; userEmail: string }) {
  const [apps,          setApps]          = useState<AppData[]>([])
  const [currentAppId,  setCurrentAppId]  = useState<number>(0)
  const [view,          setView]          = useState<ViewType>('overview')
  const [loading,       setLoading]       = useState(true)
  const [userCreatedAt, setUserCreatedAt] = useState<string>(new Date().toISOString())
  const [dbPlan,        setDbPlan]        = useState<PlanType | null>(null)

  // Plan: hardcoded pro emails always win, otherwise read from DB
  const emailPlan = getUserPlan(userEmail)
  const plan: PlanType = emailPlan === 'pro' ? 'pro' : (dbPlan ?? 'free')

  const appLimit          = getAppLimit(plan, userEmail)
  const canAddApp         = apps.length < appLimit
  const canUseProductTest = planHasFeature(plan, 'product_test')  // only 'pro' (features:['all'])
  const trialExpired      = isTrialExpired(userCreatedAt, plan)
  const daysLeftInTrial   = plan === 'free'
    ? Math.max(0, Math.ceil((PLAN_CONFIG.free.trialDays! - (Date.now() - new Date(userCreatedAt).getTime()) / (1000*60*60*24))))
    : 999

  // Load user metadata + subscription
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.created_at) setUserCreatedAt(data.user.created_at)
    })
    // Load subscription plan from DB
    supabase.from('markr_subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        const validPlans: PlanType[] = ['pro', 'analysis', 'content', 'free']
        if (data?.status === 'active' && validPlans.includes(data?.plan)) {
          const loadedPlan = data.plan as PlanType
          const periodEnd  = data.current_period_end
          // oneTime plans (analysis) never expire; others check period_end
          if (PLAN_CONFIG[loadedPlan].oneTime || !periodEnd || new Date(periodEnd) > new Date()) {
            setDbPlan(loadedPlan)
          }
        }
      })
  }, [userId])

  useEffect(() => {
    loadApps()
  }, [userId])

  async function loadApps() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('markr_apps')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

      if (error) throw error

      if (data && data.length > 0) {
        const loaded: AppData[] = data.map(row => ({
          id:          row.id,
          name:        row.name,
          platform:    row.platform,
          color:       row.color,
          stage:       row.stage,
          category:    row.category,
          url:         row.url ?? '',
          desc:        row.description ?? '',
          brand:       row.brand_voice ?? '',
          pillars:     row.pillars ?? [],
          features:    row.features ?? [],
          audience:    row.audience ?? '',
          problem:     row.problem ?? '',
          diff:        row.differentiator ?? '',
          testCreds:   row.test_creds ?? null,
          productTest: row.product_test ?? null,
          analyzed:    row.analyzed ?? false,
          recent_context: row.recent_context ?? null,
          // URL Analysis
          url_analysis:            row.url_analysis ?? null,
          competitor_url_analysis: row.competitor_url_analysis ?? null,
          // Analysis cache
          competitive_analysis: row.competitive_analysis ?? null,
          bmc_analysis:         row.bmc_analysis ?? null,
          swot_analysis:        row.swot_analysis ?? null,
          growth_analysis:      row.growth_analysis ?? null,
          pricing_analysis:     row.pricing_analysis ?? null,
          content_studio_cache: row.content_studio_cache ?? null,
          strategy_cache:       row.strategy_cache ?? null,
          post_style:           row.post_style ?? null,
          content_context:      row.content_context ?? null,
          // Analysis timestamps
          competitive_analyzed_at: row.competitive_analyzed_at ?? null,
          bmc_analyzed_at:         row.bmc_analyzed_at ?? null,
          swot_analyzed_at:        row.swot_analyzed_at ?? null,
          growth_analyzed_at:      row.growth_analyzed_at ?? null,
          pricing_analyzed_at:     row.pricing_analyzed_at ?? null,
        }))
        setApps(loaded)
        setCurrentAppId(loaded[0].id)
      }
      // No seeded apps for regular users — they start with empty state
    } catch (e) {
      console.error('Failed to load apps:', e)
    }
    setLoading(false)
  }

  const currentApp = apps.find(a => a.id === currentAppId) ?? apps[0] ?? FALLBACK_APP

  const setCurrentApp = useCallback((id: number) => setCurrentAppId(id), [])

  // ── Add app ───────────────────────────────────────────────────────────────
  const addApp = useCallback(async (app: AppData) => {
    const color = COLORS[apps.length % COLORS.length]
    const newApp = { ...app, color }

    const { data, error } = await supabase
      .from('markr_apps')
      .insert({
        user_id:       userId,
        name:          newApp.name,
        platform:      newApp.platform,
        color:         newApp.color,
        stage:         newApp.stage,
        category:      newApp.category,
        url:           newApp.url,
        description:   newApp.desc,
        brand_voice:   newApp.brand,
        pillars:       newApp.pillars,
        features:      newApp.features,
        audience:      newApp.audience ?? '',
        problem:       newApp.problem ?? '',
        differentiator:newApp.diff ?? '',
        test_creds:    newApp.testCreds ?? null,
        product_test:  newApp.productTest ?? null,
        analyzed:      newApp.analyzed ?? false,
      })
      .select()
      .single()

    if (error) { console.error('addApp error:', error); return }
    if (data) {
      const saved: AppData = { ...newApp, id: data.id }
      setApps(prev => [...prev, saved])
      setCurrentAppId(data.id)
    }
  }, [apps, userId])

  // ── Update app ────────────────────────────────────────────────────────────
  const updateApp = useCallback(async (id: number, updates: Partial<AppData>) => {
    // Optimistic update
    setApps(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))

    const { error } = await supabase
      .from('markr_apps')
      .update({
        ...(updates.name        !== undefined && { name:           updates.name }),
        ...(updates.platform    !== undefined && { platform:       updates.platform }),
        ...(updates.stage       !== undefined && { stage:          updates.stage }),
        ...(updates.category    !== undefined && { category:       updates.category }),
        ...(updates.url         !== undefined && { url:            updates.url }),
        ...(updates.desc        !== undefined && { description:    updates.desc }),
        ...(updates.brand       !== undefined && { brand_voice:    updates.brand }),
        ...(updates.pillars     !== undefined && { pillars:        updates.pillars }),
        ...(updates.features    !== undefined && { features:       updates.features }),
        ...(updates.audience    !== undefined && { audience:       updates.audience }),
        ...(updates.problem     !== undefined && { problem:        updates.problem }),
        ...(updates.diff        !== undefined && { differentiator: updates.diff }),
        ...(updates.testCreds   !== undefined && { test_creds:     updates.testCreds }),
        ...(updates.productTest !== undefined && { product_test:   updates.productTest }),
        ...(updates.analyzed    !== undefined && { analyzed:        updates.analyzed }),
        ...(updates.color       !== undefined && { color:           updates.color }),
        ...(updates.recent_context !== undefined && { recent_context: updates.recent_context }),
        // Analysis cache
        ...(updates.competitive_analysis !== undefined && { competitive_analysis: updates.competitive_analysis }),
        ...(updates.bmc_analysis         !== undefined && { bmc_analysis:         updates.bmc_analysis }),
        ...(updates.swot_analysis        !== undefined && { swot_analysis:        updates.swot_analysis }),
        ...(updates.growth_analysis      !== undefined && { growth_analysis:      updates.growth_analysis }),
        ...(updates.pricing_analysis     !== undefined && { pricing_analysis:     updates.pricing_analysis }),
        ...(updates.content_studio_cache !== undefined && { content_studio_cache: updates.content_studio_cache }),
        ...(updates.strategy_cache       !== undefined && { strategy_cache:       updates.strategy_cache }),
        ...(updates.post_style           !== undefined && { post_style:           updates.post_style }),
        ...(updates.content_context      !== undefined && { content_context:      updates.content_context }),
        ...(updates.competitive_analyzed_at !== undefined && { competitive_analyzed_at: updates.competitive_analyzed_at }),
        ...(updates.bmc_analyzed_at         !== undefined && { bmc_analyzed_at:         updates.bmc_analyzed_at }),
        ...(updates.swot_analyzed_at        !== undefined && { swot_analyzed_at:        updates.swot_analyzed_at }),
        ...(updates.growth_analyzed_at      !== undefined && { growth_analyzed_at:      updates.growth_analyzed_at }),
        ...(updates.pricing_analyzed_at     !== undefined && { pricing_analyzed_at:     updates.pricing_analyzed_at }),
      })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) console.error('updateApp error:', error)
  }, [userId])

  // ── Remove app ────────────────────────────────────────────────────────────
  const removeApp = useCallback(async (id: number) => {
    setApps(prev => {
      const next = prev.filter(a => a.id !== id)
      if (currentAppId === id && next.length > 0) setCurrentAppId(next[0].id)
      return next
    })
    const { error } = await supabase
      .from('markr_apps')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) console.error('removeApp error:', error)
  }, [currentAppId, userId])

  return (
    <StoreContext.Provider value={{
      apps, currentApp, view, loading,
      plan, userEmail, canAddApp, canUseProductTest, trialExpired, daysLeftInTrial,
      setView, setCurrentApp, addApp, updateApp, removeApp
    }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
