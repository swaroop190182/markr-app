-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Founder brief: intended audience, focus/excluded competitors, vision, mission.
-- Shape: FounderBrief in src/types/index.ts. Must exist before deploy —
-- founder_brief is in the explicit APP_COLUMNS select in src/lib/store.tsx.
alter table markr_apps add column if not exists founder_brief jsonb;
