import { createContext, useContext, useState, useCallback, useEffect } from 'react'

interface ToastCtx {
  show: (msg: string, duration?: number) => void
}
const Ctx = createContext<ToastCtx>({ show: () => {} })

let globalShow: (msg: string, dur?: number) => void = () => {}

export function toast(msg: string, dur = 3000) {
  globalShow(msg, dur)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('')
  const [visible, setVisible] = useState(false)

  const show = useCallback((m: string, dur = 3000) => {
    setMsg(m); setVisible(true)
    setTimeout(() => setVisible(false), dur)
  }, [])

  useEffect(() => { globalShow = show }, [show])

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div
        style={{
          position: 'fixed', bottom: 22, right: 22,
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 'var(--r)', padding: '10px 16px',
          fontSize: 12, color: 'var(--text)', zIndex: 200,
          opacity: visible ? 1 : 0, transition: 'opacity .3s',
          pointerEvents: 'none', maxWidth: 320
        }}
      >
        {msg}
      </div>
    </Ctx.Provider>
  )
}

export default function Toast() {
  const [msg, setMsg] = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    globalShow = (m: string, dur = 3000) => {
      setMsg(m); setVisible(true)
      setTimeout(() => setVisible(false), dur)
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed', bottom: 22, right: 22,
        background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 'var(--r)', padding: '10px 16px',
        fontSize: 12, color: 'var(--text)', zIndex: 200,
        opacity: visible ? 1 : 0, transition: 'opacity .3s',
        pointerEvents: 'none', maxWidth: 320
      }}
    >
      {msg}
    </div>
  )
}
