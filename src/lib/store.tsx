import React, { createContext, useContext, useState, useCallback } from 'react'
import type { AppData, ViewType } from '../types'
import { SEEDED_APPS, COLORS } from '../lib/data'

interface AppStore {
  apps: AppData[]
  currentApp: AppData
  view: ViewType
  setView: (v: ViewType) => void
  setCurrentApp: (id: number) => void
  addApp: (app: AppData) => void
  updateApp: (id: number, updates: Partial<AppData>) => void
  removeApp: (id: number) => void
}

const StoreContext = createContext<AppStore | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [apps, setApps] = useState<AppData[]>(SEEDED_APPS)
  const [currentAppId, setCurrentAppId] = useState<number>(SEEDED_APPS[0].id)
  const [view, setView] = useState<ViewType>('overview')

  const currentApp = apps.find(a => a.id === currentAppId) ?? apps[0]

  const setCurrentApp = useCallback((id: number) => {
    setCurrentAppId(id)
  }, [])

  const addApp = useCallback((app: AppData) => {
    setApps(prev => {
      const color = COLORS[prev.length % COLORS.length]
      return [...prev, { ...app, color }]
    })
    setCurrentAppId(app.id)
  }, [])

  const updateApp = useCallback((id: number, updates: Partial<AppData>) => {
    setApps(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }, [])

  const removeApp = useCallback((id: number) => {
    setApps(prev => {
      const next = prev.filter(a => a.id !== id)
      if (currentAppId === id && next.length > 0) setCurrentAppId(next[0].id)
      return next
    })
  }, [currentAppId])

  return (
    <StoreContext.Provider value={{
      apps, currentApp, view, setView,
      setCurrentApp, addApp, updateApp, removeApp
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
