-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

alter table markr_apps add column if not exists instagram_handle text;
