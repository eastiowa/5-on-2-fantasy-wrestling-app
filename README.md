# 5 on 2 Fantasy Wrestling League

A full-stack web application for managing a 10-team NCAA Tournament fantasy wrestling league — complete with live snake draft, real-time chat, pick timer, wishlists, NCAA scoring, and standings.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend + API | Next.js 16 (App Router) |
| Database + Auth | Supabase (PostgreSQL + Auth + Realtime) |
| Styling | Tailwind CSS |
| Drag & Drop | @dnd-kit |
| Hosting | Vercel |

---

## Features

- 🏆 **Live Snake Draft** — real-time picks with Supabase Realtime subscriptions
- ⏱️ **Pick Timer** — configurable countdown with auto-skip
- 📋 **Pre-draft Wishlists** — drag-to-reorder queue with auto-pick support
- 💬 **Draft Chat** — live commentary feed with system pick notifications
- 📊 **NCAA Scoring** — advancement + bonus + placement point calculation
- 📁 **CSV + Google Sheets** score upload
- 🛡️ **Commissioner Dashboard** — full league management
- 📣 **Announcements** — league-wide broadcasts
- 🏅 **Live Standings** — public home page with team rankings

---

## Setup Guide

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`v

### 2. Run Database Migrations

In your Supabase dashboard, go to **SQL Editor** and run:

```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/001_initial_schema.sql
```

### 3. Create Commissioner Account

In Supabase dashboard → **Authentication → Users**, create a user:
- Email: your commissioner email
- Password: set a secure password

Then in the SQL Editor, run:

```sql
INSERT INTO public.profiles (id, email, role, display_name)
VALUES (
  '<paste-the-user-id-from-auth>',
  'commissioner@example.com',
  'commissioner',
  'Commissioner'
);
```

### 4. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

Required:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Optional (for Google Sheets score sync):
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 5. Run the App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Commissioner Quick Start

1. Sign in at `/login` with your commissioner account
2. Go to **Commissioner Dashboard** → **Manage Athletes**
   - Upload your CSV file: `name, weight, school, seed`
3. Go to **Manage Teams**
   - Create 10 teams and send invite emails to each manager
   - Drag to set the snake draft order
4. Go to **Draft Settings**
   - Set pick timer (default: 90 seconds)
   - Enable/disable auto-skip on timeout
5. When ready, go to **Draft Control** and click **Start Draft**

---

## Team Manager Quick Start

1. Check your email for the invite link from the Commissioner
2. Click the link and set your display name and password
3. You'll be redirected to your **Team Dashboard**
4. When the draft starts, go to the **Draft Room** to:
   - Add athletes to your **Wishlist** ahead of time
   - Make picks when it's your turn
   - Chat with other managers

---

## Scoring System

Points per athlete are the sum of three categories:

| Category | Details |
|----------|---------|
| **Advancement** | 1.0 pt per championship win, 0.5 pt per consolation win |
| **Bonus** | Fall/Forfeit: +2.0 · Tech Fall: +1.5 · Major Decision: +1.0 |
| **Placement** | 1st: 16 · 2nd: 12 · 3rd: 10 · 4th: 9 · 5th: 7 · 6th: 6 · 7th: 4 · 8th: 3 |

### Score Upload CSV Format

```csv
athlete_name,event,championship_wins,consolation_wins,bonus_points,placement
"John Smith","NCAA-2024",3,1,3.5,3
"Mike Jones","NCAA-2024",2,0,2.0,6
```

Download a template from **Commissioner → Score Management**.

---

## Draft Rules

- **10 teams, 10 rounds** = 100 total picks
- **One athlete per weight class** (125, 133, 141, 149, 157, 165, 174, 184, 197, 285)
- **One athlete per seed** per team
- **Snake draft**: odd rounds pick 1→10, even rounds pick 10→1

---

## Deployment to Vercel

1. Push this `app/` directory to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Add all environment variables from `.env.local`
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain
5. Deploy!

In Supabase, add your Vercel URL to:
- **Authentication → URL Configuration → Site URL**
- **Authentication → URL Configuration → Redirect URLs**: `https://yourdomain.vercel.app/**`

---

## Project Structure

```
app/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Home / standings
│   ├── login/              # Sign in
│   ├── dashboard/          # Team manager dashboard
│   ├── draft/              # Live draft room
│   ├── teams/[id]/         # Public team roster
│   ├── invite/[token]/     # Manager account setup
│   ├── commissioner/       # Commissioner dashboard & sub-pages
│   └── api/                # API routes
├── components/
│   ├── draft/              # Draft room components
│   ├── commissioner/       # Commissioner UI components
│   └── shared/             # Navbar, shared UI
├── lib/
│   ├── supabase/           # Server + browser clients
│   ├── draft-logic.ts      # Snake draft engine
│   ├── scoring.ts          # NCAA point calculations
│   ├── google-sheets.ts    # Sheets API integration
│   └── utils.ts            # Helpers
├── types/index.ts          # TypeScript types
└── supabase/migrations/    # SQL schema
```
