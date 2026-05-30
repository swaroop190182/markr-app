# Markr — AI Marketing Manager

AI-powered marketing platform for app makers. Generates Instagram content, strategy, competitive analysis, product testing, and growth strategies using Claude AI.

## Stack
- **React 18 + TypeScript** — Vite build
- **Tailwind CSS** — design system
- **Claude API (Sonnet)** — all AI features
- **React Context** — state management (no extra deps)

## Quick Start

```bash
# 1. Install
npm install

# 2. Set your Anthropic API key
cp .env.example .env
# Edit .env and add your key

# 3. Run locally
npm run dev
```

Open http://localhost:5173

## Deploy to Vercel (free)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add env variable in Vercel dashboard:
# VITE_ANTHROPIC_API_KEY = your key
```

Or connect your GitHub repo to Vercel for auto-deploy on every push.

## Environment Variables

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

**Important:** For production, move the API key to a Vercel API Route (server-side) so it's not exposed in the browser bundle. See `docs/securing-api-key.md` for instructions.

## Project Structure

```
src/
  components/     # Shared UI: Sidebar, Topbar, Modals, ui.tsx
  views/          # Page-level views: Overview, ContentStudio, Strategy, Calendar, Insights
    insights/     # ProductTest sub-component
  lib/
    claude.ts     # All Claude API calls + getTestContext
    data.ts       # Seeded apps (Mindprint, TaskFlow Pro, SnapBudget)
    store.tsx     # Global state (React Context)
  types/          # TypeScript types
```

## Adding / Editing Apps

- Click **+ Add app** in the sidebar — paste URL, optionally add test credentials
- Click the **✏️** pencil on any app to edit or re-run analysis
- For Gmail apps: create a separate `test@yourdomain.com` account with email+password

## Updating the App

Describe the change to Claude, copy the updated file, push to GitHub. Vercel auto-deploys in ~30 seconds.

```
"Add a dark/light mode toggle to the Topbar"
"Add an export to PDF button on the Insights page"  
"Make the sidebar collapsible on mobile"
```
