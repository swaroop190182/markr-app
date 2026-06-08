-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

create table if not exists markr_scorecards (
  id            uuid        primary key default gen_random_uuid(),
  url           text        not null,
  overall       numeric     not null,
  headline      text,
  category      text,
  dimensions    jsonb,
  bottleneck    jsonb,
  growth_teaser text,
  scraped       jsonb,
  pages_read    text[],
  confidence    text,
  total_words   integer,
  created_at    timestamptz default now()
);

-- Enable Row Level Security
alter table markr_scorecards enable row level security;

-- Allow anyone to read scorecards (public /scorecard/:id page)
create policy "Public read scorecards"
  on markr_scorecards for select
  using (true);

-- Allow anyone to insert scorecards (from landing page analysis, no login required)
create policy "Public insert scorecards"
  on markr_scorecards for insert
  with check (true);
