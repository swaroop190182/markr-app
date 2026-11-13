import { useState } from 'react'
import { Field } from './ui'
import type { FounderBrief } from '../types'

// Form-friendly draft: competitor lists edited as comma/newline-separated text
export interface FounderBriefDraft {
  intended_audience: string; focus_competitors: string
  excluded_competitors: string; vision: string; mission: string
}

export function draftFromBrief(b?: FounderBrief | null): FounderBriefDraft {
  return {
    intended_audience:    b?.intended_audience ?? '',
    focus_competitors:    (b?.focus_competitors ?? []).join(', '),
    excluded_competitors: (b?.excluded_competitors ?? []).join(', '),
    vision:               b?.vision ?? '',
    mission:              b?.mission ?? '',
  }
}

export default function FounderBriefFields({ value, onChange, defaultOpen = false }: {
  value: FounderBriefDraft
  onChange: (next: FounderBriefDraft) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const set = (k: keyof FounderBriefDraft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value })
  const filled = Object.values(value).filter(v => v.trim()).length

  return (
    <div style={{ border:'1px solid rgba(124,111,247,.3)', borderRadius:'var(--r)', overflow:'hidden', marginBottom:14 }}>
      <div onClick={() => setOpen(!open)}
        style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', cursor:'pointer', background:'rgba(124,111,247,.06)', userSelect:'none' }}>
        <span style={{ fontSize:15 }}>🎯</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--accent2)' }}>
            Founder brief <span style={{ fontSize:10, fontWeight:500, color:'var(--text3)', marginLeft:6 }}>optional</span>
          </div>
          <div style={{ fontSize:11, color: filled ? 'var(--green)' : 'var(--text3)', marginTop:2 }}>
            {filled ? `${filled} of 5 fields set · Markr compares your intent against what the product shows`
                    : 'Tell Markr what you intend — analyses will flag gaps vs. what the product shows'}
          </div>
        </div>
        <span style={{ color:'var(--text3)', fontSize:11, transition:'transform .2s', transform: open ? 'rotate(180deg)' : '' }}>▼</span>
      </div>
      {open && (
        <div style={{ padding:14, borderTop:'1px solid rgba(124,111,247,.2)' }}>
          <Field label="Intended audience" hint="Who you're building for — even if the site doesn't say it yet.">
            <textarea rows={2} maxLength={200} value={value.intended_audience} onChange={set('intended_audience')}
              placeholder="e.g. Solo indie founders shipping their first paid app" />
          </Field>
          <Field label="Focus competitors" hint="Up to 5 names or URLs, comma-separated. Analyzed first in Competitive.">
            <input value={value.focus_competitors} onChange={set('focus_competitors')} placeholder="e.g. Buffer, https://later.com" />
          </Field>
          <Field label="Excluded competitors" hint="Names or URLs Markr should never list as competitors.">
            <input value={value.excluded_competitors} onChange={set('excluded_competitors')} placeholder="e.g. Canva" />
          </Field>
          <Field label="Vision" hint="Where the product is going, in one sentence.">
            <input maxLength={200} value={value.vision} onChange={set('vision')} placeholder="e.g. The growth co-pilot every solo founder relies on" />
          </Field>
          <Field label="Mission" hint="What it does for users today, in one sentence.">
            <input maxLength={200} value={value.mission} onChange={set('mission')} placeholder="e.g. Turn a URL into a weekly, specific growth plan" />
          </Field>
        </div>
      )}
    </div>
  )
}
