import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { AppData, ViewType } from '../types'
import { COLORS } from './data'
import { supabase } from './supabase'

// ── Plan config ────────────────────────────────────────────────────────────────
const PRO_EMAILS = ['swaroop.raghu@gmail.com']

export const PLAN_CONFIG = {
  pro: {
    callsPerDay:    200,
    appLimit:       Infinity,
    trialDays:      null,       // no trial — always Pro
    productTest:    true,
    fullInsights:   true,
  },
  free: {
    callsPerDay:    5,          // reduced from 20 — protects margins
    appLimit:       1,
    trialDays:      7,          // 7 days then locked
    productTest:    false,      // Pro only — most expensive call
    fullInsights:   true,       // competitive/BMC/SWOT/growth/pricing still free
  },
}

export function getUserPlan(email: string): 'pro' | 'free' {
  return PRO_EMAILS.includes(email.toLowerCase()) ? 'pro' : 'free'
}

export function getAppLimit(plan: 'pro' | 'free'): number {
  return PLAN_CONFIG[plan].appLimit
}

// Check if trial has expired (based on account created_at from Supabase)
export function isTrialExpired(createdAt: string, plan: 'pro' | 'free'): boolean {
  if (plan === 'pro') return false
  const trialDays = PLAN_CONFIG.free.trialDays
  if (!trialDays) return false
  const created  = new Date(createdAt).getTime()
  const now      = Date.now()
  const daysPassed = (now - created) / (1000 * 60 * 60 * 24)
  return daysPassed > trialDays
}

interface AppStore {
  apps: AppData[]
  currentApp: AppData
  view: ViewType
  loading: boolean
  plan: 'pro' | 'free'
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
  const [dbPlan,        setDbPlan]        = useState<'pro'|'free'|null>(null)

  // Plan: hardcoded pro emails always win, otherwise read from DB
  const emailPlan = getUserPlan(userEmail)
  const plan: 'pro'|'free' = emailPlan === 'pro' ? 'pro' : (dbPlan ?? 'free')

  const appLimit          = getAppLimit(plan)
  const canAddApp         = apps.length < appLimit
  const canUseProductTest = PLAN_CONFIG[plan].productTest
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
        if (data?.plan === 'pro' && data?.status === 'active') {
          // Check if subscription is still valid
          const periodEnd = data.current_period_end
          if (!periodEnd || new Date(periodEnd) > new Date()) {
            setDbPlan('pro')
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
        ...(updates.analyzed    !== undefined && { analyzed:       updates.analyzed }),
        ...(updates.color       !== undefined && { color:          updates.color }),
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
      plan, canAddApp, canUseProductTest, trialExpired, daysLeftInTrial,
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
