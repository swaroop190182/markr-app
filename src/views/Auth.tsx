import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'signup' | 'reset'

export default function Auth() {
  const [mode,     setMode]     = useState<Mode>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [message,  setMessage]  = useState('')

  // Preserve URL param from landing page
  const urlParam = new URLSearchParams(window.location.search).get('url') ?? ''
  const appTarget = urlParam ? `/app?url=${encodeURIComponent(urlParam)}` : '/app'

  async function handleSubmit() {
    setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // Redirect preserving URL param
        window.location.href = appTarget
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}${appTarget}` }
        })
        if (error) throw error
        setMessage('Check your email for a confirmation link!')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email)
        if (error) throw error
        setMessage('Password reset email sent!')
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  async function handleGoogle() {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${appTarget}` }
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'DM Sans, sans-serif', padding: 20
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, var(--accent), var(--pink))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 800, color: '#fff'
          }}>M</div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Markr</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>AI Co-founder for app founders</div>
          {urlParam && (
            <div style={{ marginTop: 12, padding: '7px 14px', borderRadius: 8, background: 'rgba(124,111,247,.08)', border: '1px solid rgba(124,111,247,.2)', fontSize: 12, color: '#a599ff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚡</span>
              <span>Ready to analyze <strong>{urlParam.replace(/^https?:\/\//, '')}</strong></span>
            </div>
          )}
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r2)', padding: 28
        }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'var(--text)' }}>
            {mode === 'login' ? 'Sign in to your account' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </div>

          {/* Google */}
          {mode !== 'reset' && (
            <>
              <button
                onClick={handleGoogle}
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 16px', borderRadius: 8,
                  border: '1px solid var(--border2)', background: 'var(--surface2)',
                  color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  marginBottom: 16, transition: 'all .15s', fontFamily: 'DM Sans, sans-serif'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            </>
          )}

          {/* Email */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ width: '100%' }}
            />
          </div>

          {/* Password */}
          {mode !== 'reset' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" minLength={6}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={{ width: '100%' }}
              />
              {mode === 'signup' && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>Minimum 6 characters</div>
              )}
            </div>
          )}

          {/* Error / Message */}
          {error && (
            <div style={{ background: 'rgba(229,85,85,.1)', border: '1px solid rgba(229,85,85,.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--red)', marginBottom: 14 }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{ background: 'rgba(52,201,138,.1)', border: '1px solid rgba(52,201,138,.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--green)', marginBottom: 14 }}>
              {message}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit} disabled={loading}
            className="gen-btn"
            style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
          >
            {loading
              ? <><span className="spinner" style={{ color: '#fff' }} /> Loading…</>
              : mode === 'login' ? 'Sign in'
              : mode === 'signup' ? 'Create account'
              : 'Send reset email'
            }
          </button>

          {/* Footer links */}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            {mode === 'login' ? (
              <>
                <button onClick={() => { setMode('signup'); setError(''); setMessage('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}>
                  Create account
                </button>
                <button onClick={() => { setMode('reset'); setError(''); setMessage('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}>
                  Forgot password?
                </button>
              </>
            ) : (
              <button onClick={() => { setMode('login'); setError(''); setMessage('') }}
                style={{ background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontSize: 12, fontFamily: 'DM Sans, sans-serif' }}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
