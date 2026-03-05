<p align="center">
  <img src="https://img.shields.io/badge/HackArena'26-404TeamNotFound!-blueviolet?style=for-the-badge" alt="HackArena'26" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Groq-AI-F55036?style=for-the-badge" alt="Groq AI" />
</p>

# 💰 Lumina Finance

> **A smart personal finance companion that turns boring expense tracking into an engaging, AI-powered experience.**

Built for **HackArena'26** by **Team 404TeamNotFound!** — VIT Pune, Software Engineering, 2nd Year.

---

## 🚀 What is Lumina Finance?

Most personal finance apps feel like chores. You forget to log expenses, statements pile up, and budgets go out the window within a week.

**Lumina Finance** fixes this with:
- 🤖 AI that reads your bank statements and receipts for you
- 🎮 Gamification that makes you *want* to track spending
- 💬 A conversational "interview" flow that categorizes transactions through simple questions
- 📊 Real-time analytics that actually help you understand where your money goes

---

## ✨ Features

### 📸 AI Receipt Scanner
Point your camera at any receipt — our AI extracts every line item, prices, and merchant info automatically. No manual entry needed.

### 📄 Smart Statement Import
Upload bank statements (screenshots or PDFs) and let the AI parse all transactions, detect duplicates, flag P2P transfers, and auto-categorize based on your history.

### 💬 Transaction Interview
Instead of a boring spreadsheet, Lumina asks you simple questions about each transaction — "Is this a shared bill?", "Should I ignore this duplicate?" — making categorization feel conversational.

### 🔥 Daily Budget Ring & Streaks
A visual ring shows your daily spending vs budget. Stay under budget to maintain your streak, earn XP, and level up — just like Duolingo but for your wallet.

### 🏆 Trophy Room
Unlock achievements for financial milestones: first week streak, categorizing 100 transactions, staying under budget for a month, and more.

### 📈 Analytics Dashboard
Visualize spending trends with interactive charts — category breakdowns, income vs expense tracking, monthly comparisons, and spending heat maps.

### 🔔 Push Notifications
Daily reminders to log expenses and maintain your streak. Never break a streak again.

### 📱 PWA Support
Install Lumina Finance as a native app on any device — works offline, feels native, no app store needed.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **UI Components** | shadcn/ui, Radix UI primitives |
| **Backend** | Supabase (PostgreSQL, Auth, Edge Functions, Storage) |
| **AI / ML** | Groq API with Llama 4 Scout (multimodal — vision + text) |
| **Charts** | Recharts |
| **Notifications** | Web Push API with VAPID keys |
| **PWA** | vite-plugin-pwa, Service Worker |
| **State Management** | TanStack React Query |
| **Form Handling** | React Hook Form + Zod validation |

---

## 📁 Project Structure

```
luminafinance/
├── public/                  # Static assets, PWA manifest, service worker
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # shadcn/ui base components
│   │   ├── SpendingRing.tsx  # Daily budget visualization
│   │   ├── TrophyRoom.tsx   # Gamification achievements
│   │   ├── BottomNav.tsx    # Mobile navigation
│   │   └── ...
│   ├── pages/
│   │   ├── Index.tsx        # Dashboard home
│   │   ├── Auth.tsx         # Login/Signup
│   │   ├── StatementUpload.tsx   # AI statement parser
│   │   ├── ReceiptScan.tsx  # Camera receipt scanner
│   │   ├── StatementInterview.tsx # Conversational review
│   │   ├── Analytics.tsx    # Spending analytics
│   │   ├── Profile.tsx      # User settings
│   │   └── ...
│   ├── hooks/               # Custom React hooks (auth, push notifications)
│   ├── integrations/        # Supabase client & types
│   └── lib/                 # Utility functions
├── supabase/
│   ├── functions/           # Edge Functions
│   │   ├── parse-receipt/   # AI receipt OCR
│   │   ├── parse-statement/ # AI statement parser
│   │   ├── ai-interview/    # Smart categorization
│   │   ├── get-vapid-key/   # Push notification keys
│   │   └── send-daily-reminders/ # Scheduled reminders
│   └── migrations/          # Database schema
└── package.json
```

---

## ⚡ Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works)
- A Groq API key (free at [console.groq.com](https://console.groq.com))

### Setup

```bash
# Clone the repo
git clone https://github.com/akhilhegde/luminafinance.git
cd luminafinance

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase and Groq credentials

# Start dev server
npm run dev
```

### Environment Variables

Create a `.env` file (see `.env.example`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_PROJECT_ID=your_project_id
```

The Groq API key is configured as a Supabase Edge Function secret (not in the frontend `.env`).

---

## 🗄️ Database Schema

Lumina Finance uses Supabase PostgreSQL with the following core tables:

- **profiles** — User settings, daily budget, streak data, XP, level
- **accounts** — Bank accounts with balances
- **categories** — Spending categories with icons
- **transactions** — Manually added transactions
- **statement_imports** — Upload tracking for AI processing
- **imported_transactions** — AI-parsed transactions with review status
- **mapping_rules** — Auto-categorization based on payee patterns
- **trophies / user_trophies** — Achievement system

Row-Level Security (RLS) is enabled on all tables.

---

## 🚢 Deployment

```bash
# Build for production
npm run build

# Output is in dist/ — deploy to Vercel, Netlify, or any static host
```

Edge Functions are deployed via:
```bash
supabase functions deploy parse-receipt
supabase functions deploy parse-statement
supabase functions deploy ai-interview
```

---

## 👥 Team — 404TeamNotFound!

| Name | Role |
|------|------|
| **Aditya Singh** | Team Lead |
| **Akhil Hegde** | Full-Stack Developer |
| **Kaustav Ashtikar** | Developer |
| **Aditya Mulle** | Developer |

🎓 **VIT Pune** — Software Engineering, 2nd Year

---

## 📄 License

MIT License — built with ❤️ at HackArena'26
