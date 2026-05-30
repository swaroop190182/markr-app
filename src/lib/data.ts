import type { AppData, SlotConfig } from '../types'

export const COLORS = ['#7c6ff7','#34c98a','#4f9cf7','#f5a623','#e26faf','#e55555','#34b4c9']

export const SLOT_CONFIGS: Record<string, SlotConfig> = {
  morning: {
    label: 'Morning Post', time: '7:00 – 9:00 AM', emoji: '🌅',
    color: 'var(--morning-c)', bg: 'var(--morning-bg)', border: 'var(--morning-b)',
    metricLabel: '📥 Optimised for Saves', metricColor: '#60a5fa', metricBg: 'rgba(59,130,246,.12)',
    metricReason: 'Morning content gets bookmarked — people save what they want to revisit later. Saves are the strongest algorithm signal.',
    timeReason: 'Audiences check feeds first thing in the morning. Hook them early.',
    bestDays: 'Mon & Wed — highest intent at start of week.'
  },
  midday: {
    label: 'Midday Post', time: '12:00 – 1:30 PM', emoji: '💡',
    color: 'var(--midday-c)', bg: 'var(--midday-bg)', border: 'var(--midday-b)',
    metricLabel: '🔁 Optimised for Shares', metricColor: '#a78bfa', metricBg: 'rgba(139,92,246,.12)',
    metricReason: 'Midday content gets shared when someone thinks "my friend needs this". Shares push you to entirely new audiences.',
    timeReason: 'Lunch break scrolling — insight content gets forwarded during the midday pause.',
    bestDays: 'Tue, Thu, Fri — mid-week sharing peaks.'
  },
  evening: {
    label: 'Evening Post', time: '7:00 – 9:00 PM', emoji: '🌙',
    color: 'var(--evening-c)', bg: 'var(--evening-bg)', border: 'var(--evening-b)',
    metricLabel: '💬 Optimised for Comments', metricColor: '#34d399', metricBg: 'rgba(16,185,129,.12)',
    metricReason: 'Evening is peak engagement. People unwind and respond to posts that make them feel seen. Comment volume amplifies reach.',
    timeReason: 'Emotional peak hour — people are most open and likely to engage.',
    bestDays: 'Sun & Thu evenings — highest engagement window.'
  }
}

export const SEEDED_APPS: AppData[] = [
  {
    id: 3,
    name: 'Mindprint',
    platform: 'Both',
    color: '#e26faf',
    stage: 'Launch',
    category: 'Health & Wellness',
    url: 'https://mindprintjournal.com',
    desc: 'Mindprint is a mental wellness and habit-building app combining daily journaling, addiction recovery support, spiritual practice (Sadhana), habit awareness tracking, and an AI companion called Mira — built for people seeking deeper self-awareness and lasting behaviour change.',
    audience: 'People in recovery, habit-builders, spiritual seekers, and anyone seeking self-awareness',
    problem: 'Fragmented wellness tools that don\'t understand the emotional and spiritual dimension of habit change',
    diff: 'The only wellness app combining addiction recovery, spiritual Sadhana practice, AI companionship via Mira, and habit tracking in one deeply personal experience',
    features: [
      'Daily journaling & reflection',
      'Addiction support & recovery tracking',
      'Habit Awareness tab',
      'Sadhana (spiritual practice) tab',
      'Mira AI companion chat',
      'Breaking bad habits module',
      'Loneliness & companionship support',
      'Streak & progress tracking'
    ],
    pillars: [
      'Daily journaling & reflection',
      'Breaking bad habits & addiction recovery',
      'Loneliness, companionship & connection',
      'Sadhana & spiritual practice',
      'Habit awareness & behaviour change',
      'Mira AI — your inner companion'
    ],
    testCreds: {
      user: '[your test email]',
      loginUrl: 'https://mindprintjournal.com/login',
      flows: 'Onboarding flow, Daily journaling entry, Addiction Support section, Habit Awareness tab, Sadhana tab, Mira AI chat responses, Streak tracking, Breaking bad habits module, Loneliness companionship section, Profile and settings'
    },
    brand: `You are the Instagram content strategist for Mindprint, a mental wellness app combining daily journaling, addiction recovery, spiritual Sadhana practice, habit tracking, and Mira — an AI companion.

TARGET AUDIENCE: People in recovery, spiritual seekers, habit-builders, and anyone craving deeper self-awareness. They are tired of toxic positivity and want something real.

CORE PROBLEM SOLVED: The fragmented, surface-level wellness space ignores the emotional and spiritual roots of habit change. Mindprint goes deeper.

UNIQUE ANGLE: The only app that combines addiction recovery support, Sadhana practice, Mira AI companionship, and habit awareness in one deeply personal daily ritual.

BRAND TONE: Warm, raw, and grounding. Speak to the person at 2am who is struggling — not the person who has it figured out. No toxic positivity. Acknowledge the darkness before offering the light.

BRAND VOICE GUIDELINES:
• Always lead with the human experience — the struggle, the quiet moment, the 2am feeling
• Reference specific features by name: Sadhana tab, Mira, Habit Awareness, the journal
• Evening posts should invite people to open the app right now — it's their wind-down ritual
• Morning posts should feel like a gentle hand on the shoulder, not a motivational shout
• NEVER use: mindfulness buzzwords, hustle, grind, toxic positivity, "just", "simply", "easy"
• NEVER say the app "fixes" or "cures" anything — it walks alongside you`,
    analyzed: true,
    productTest: null
  },
  {
    id: 1,
    name: 'TaskFlow Pro',
    platform: 'Web',
    color: '#7c6ff7',
    stage: 'Growth',
    category: 'Productivity',
    url: 'https://taskflowpro.app',
    desc: 'Task management for solo founders and small teams with AI prioritization.',
    brand: `You are the Instagram content strategist for TaskFlow Pro, an AI-powered task management tool for solo founders and small teams.\n\nTONE: Empowering but grounded. Speak to builders who are overwhelmed, not lazy. No hustle-porn.\n\nNEVER use: synergy, crush it, game-changer, revolutionary, hustle.`,
    pillars: ['Focus & deep work', 'Founder overwhelm', 'Team productivity', 'Building in public', 'Work-life boundaries', 'Async communication'],
    features: ['Task prioritization', 'AI suggestions', 'Team collaboration', 'Time tracking', 'Project templates', 'Integrations'],
  },
  {
    id: 2,
    name: 'SnapBudget',
    platform: 'Mobile',
    color: '#34c98a',
    stage: 'Launch',
    category: 'Finance',
    url: 'https://snapbudget.app',
    desc: 'Personal budgeting app with smart spend categorization and savings goals.',
    brand: `You are the Instagram content strategist for SnapBudget, a personal finance app that makes budgeting visual and effortless.\n\nTONE: Warm, non-judgmental, encouraging. People are ashamed of money struggles — meet them where they are.\n\nNEVER use: financial freedom, wealth mindset, hustle, passive income.`,
    pillars: ['Spending awareness', 'Savings habits', 'Financial anxiety', 'Budget wins', 'Mindful spending', 'Money & mental health'],
    features: ['Spend categorization', 'Savings goals', 'Budget tracking', 'Visual reports', 'Bill reminders', 'Export data'],
  }
]
