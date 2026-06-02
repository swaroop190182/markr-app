import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import Admin from './views/Admin'
import './index.css'

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: string|null}> {
  constructor(props: any) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (this.state.error) return (
      <div style={{ padding:40, fontFamily:'sans-serif' }}>
        <h2>Error loading page</h2>
        <pre style={{ background:'#f4f4f4', padding:16, borderRadius:8, marginTop:16, whiteSpace:'pre-wrap' }}>{this.state.error}</pre>
      </div>
    )
    return this.props.children
  }
}

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (window.location.pathname === '/admin') {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <Admin />
      </ErrorBoundary>
    </React.StrictMode>
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
      <Analytics />
    </React.StrictMode>
  )
}
