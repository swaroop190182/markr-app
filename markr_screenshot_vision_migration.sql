-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Per-screenshot structured vision analysis + combined product summary (text only, small).
-- Loaded with every app. Shape: ScreenshotVision in src/types/index.ts.
alter table markr_apps add column if not exists screenshot_vision jsonb;

-- Labeled base64 screenshot images. Large — NOT in the default markr_apps select;
-- fetched only when the screenshot setup UI opens.
alter table markr_apps add column if not exists screenshot_images jsonb;

-- Missing columns the code already used (read in loadApps, written by updateApp).
-- Previously invisible because select('*') tolerated their absence; the explicit
-- APP_COLUMNS list would fail the whole app load without them.
alter table markr_apps add column if not exists post_history jsonb;
alter table markr_apps add column if not exists gtm_analyzed_at timestamptz;
