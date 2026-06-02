import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import Admin from './views/Admin'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (window.location.pathname === '/admin') {
  root.render(
    <React.StrictMode>
      <Admin />
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
