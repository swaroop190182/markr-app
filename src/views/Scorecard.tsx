import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const D = "'Inter', sans-serif"

interface ScorecardRow {
  id: string
  url: string
  overall: number
  headline: string
  category: string
  dimensions: { label: string; score: number; issue: string; verificationStatus?: string }[]
  bottleneck: { label: string; issue: string; isUnverifiable?: boolean }
  growth_teaser: string
  scraped: { title: string; h1: string; metaDesc: string }
  pages_read: string[]
  confidence: 'high' | 'medium' | 'low' | 'js-app'
  total_words: number
  created_at: string
}

export default function Scorecard({ scorecardId }: { scorecardId: string }) {
  const [sc, setSc] = useState<ScorecardRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    supabase
      .from('markr_scorecards')
      .select('*')
      .eq('id', scorecardId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true)
        else setSc(data as ScorecardRow)
        setLoading(false)
      })
  }, [scorecardId])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#08080a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: D }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff' }}>M</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.4)' }}>Loading scorecard…</div>
        </div>
      </div>
    )
  }

  if (notFound || !sc) {
    return (
      <div style={{ minHeight: '100vh', background: '#08080a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: D }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#f0f0f5', marginBottom: 8 }}>Scorecard not found</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', marginBottom: 24 }}>This scorecard may have expired or the link is incorrect.</div>
        <a href="/" style={{ padding: '10px 20px', background: 'linear-gradient(135deg,#7c6ff7,#9b8af4)', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Analyze your app →</a>
      </div>
    )
  }

  const domain = sc.url.replace(/^https?:\/\//, '').split('/')[0]
  const scoreColor = sc.overall >= 7 ? '#34c98a' : sc.overall >= 5 ? '#f5a623' : '#e55'

  // Derive confidence display from stored confidence field (confidencePercent not stored in DB)
  const unverifiableStored = (sc.dimensions ?? []).filter(d => d.verificationStatus === 'unverifiable_js').length
  const verifiedStored = (sc.dimensions ?? []).length - unverifiableStored
  const confidencePercent = (sc.dimensions ?? []).length > 0
    ? Math.round((verifiedStored + 0.5 * unverifiableStored) / sc.dimensions.length * 100)
    : sc.confidence === 'high' ? 95 : sc.confidence === 'medium' ? 78 : sc.confidence === 'js-app' ? 65 : 50
  const confidenceReason = sc.confidence === 'js-app'
    ? `JavaScript-rendered website — ${confidencePercent}% verified`
    : sc.confidence === 'high'   ? 'Full static HTML analysis'
    : sc.confidence === 'medium' ? 'Partial HTML analysis'
    : 'Limited signals detected'

  return (
    <div style={{ background: '#08080a', color: '#f0f0f5', fontFamily: D, minHeight: '100vh', lineHeight: 1.6 }}>
      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', height: 56, padding: '0 5%', background: 'rgba(8,8,10,.96)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,.06)', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flex: 1 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#7c6ff7,#e26faf)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>M</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#f0f0f5' }}>Markr</span>
        </a>
        <a href="/" style={{ padding: '6px 16px', borderRadius: 6, background: 'linear-gradient(135deg,#7c6ff7,#9b8af4)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Analyze your app →</a>
      </nav>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7c6ff7', letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Landing Page Scorecard</div>
          <h1 style={{ fontSize: 'clamp(22px,3vw,32px)', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', color: '#f5f5f7' }}>{domain}</h1>
          {sc.headline && <p style={{ fontSize: 15, color: 'rgba(255,255,255,.5)', margin: 0 }}>{sc.headline}</p>}
        </div>

        {/* Main card */}
        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.4)' }}>

          {/* Header with score */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 3 }}>Analysis for</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f0f0f5' }}>{domain}</div>
              {sc.confidence && (
                <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                  background: sc.confidence === 'high' ? 'rgba(52,201,138,.12)' : sc.confidence === 'medium' ? 'rgba(245,166,35,.12)' : 'rgba(144,144,176,.12)',
                  color: sc.confidence === 'high' ? '#34c98a' : sc.confidence === 'medium' ? '#f5a623' : '#9090b0'
                }}>
                  ● Confidence:{' '}
                  {sc.confidence === 'high' ? 'High' : sc.confidence === 'medium' ? 'Medium' : sc.confidence === 'js-app' ? `Partial (${confidencePercent}%)` : 'Low'}
                  <span style={{ fontWeight: 400, opacity: .75 }}> — {confidenceReason}</span>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: 52, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{sc.overall}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>/10</div>
            </div>
          </div>

          {/* Pages analyzed */}
          {sc.pages_read && sc.pages_read.length > 0 && (
            <div style={{ padding: '10px 24px', background: 'rgba(52,201,138,.04)', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 11, color: '#34c98a', fontWeight: 600 }}>✓ Analyzed:</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Home</span>
              {sc.pages_read.map(p => (
                <span key={p} style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>· {p.charAt(0).toUpperCase() + p.slice(1)}</span>
              ))}
            </div>
          )}

          {/* Dimensions */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.3)', letterSpacing: '.06em', textTransform: 'uppercase' as const, marginBottom: 14 }}>Score Breakdown</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {(sc.dimensions || []).map(d => {
                const c = d.score >= 7 ? '#34c98a' : d.score >= 5 ? '#f5a623' : '#e55'
                return (
                  <div key={d.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{d.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{d.score}/10</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${d.score * 10}%`, background: c, borderRadius: 3 }} />
                    </div>
                    {d.issue && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 4, lineHeight: 1.5 }}>{d.issue}</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottleneck / manual review */}
          {sc.bottleneck && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,.07)', background: sc.bottleneck.isUnverifiable ? 'rgba(245,166,35,.04)' : 'rgba(220,38,38,.04)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: sc.bottleneck.isUnverifiable ? '#f5a623' : '#fca5a5', letterSpacing: '.06em', textTransform: 'uppercase' as const, marginBottom: 6 }}>
                {sc.bottleneck.isUnverifiable
                  ? `⚠️ Needs Manual Review — Unable to fully evaluate ${sc.bottleneck.label} — JavaScript-rendered page`
                  : `🚨 Biggest Bottleneck — ${sc.bottleneck.label}`}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', lineHeight: 1.6 }}>{sc.bottleneck.issue}</div>
            </div>
          )}

          {/* Growth teaser */}
          {sc.growth_teaser && (
            <div style={{ padding: '16px 24px', background: 'rgba(124,111,247,.05)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a599ff', letterSpacing: '.06em', textTransform: 'uppercase' as const, marginBottom: 6 }}>
                💡 Growth Opportunity
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.6 }}>{sc.growth_teaser}</div>
            </div>
          )}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 40, padding: '32px 24px', background: 'rgba(124,111,247,.06)', border: '1px solid rgba(124,111,247,.15)', borderRadius: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f5f5f7', marginBottom: 8 }}>How does your app score?</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.5)', marginBottom: 20 }}>Get your free landing page audit in 60 seconds — no signup needed.</div>
          <a href="/" style={{ display: 'inline-block', padding: '12px 28px', background: 'linear-gradient(135deg,#7c6ff7,#9b8af4)', color: '#fff', borderRadius: 8, fontSize: 15, fontWeight: 600, textDecoration: 'none', letterSpacing: '-0.01em' }}>
            Analyze my app free →
          </a>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,.2)' }}>
          Generated by <a href="/" style={{ color: 'rgba(124,111,247,.6)', textDecoration: 'none' }}>Markr</a> · {new Date(sc.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}
