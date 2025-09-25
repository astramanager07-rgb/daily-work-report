# Daily Work Report Web App

This is a ready-to-run starter:
- Next.js 14 + Tailwind CSS
- Supabase (Auth + Postgres)
- Staff Report form (with Status + Department dropdowns)
- Admin dashboard (filter by date/name/department + Excel export)

## Quick Start
1) Install Node.js LTS (18+), unzip this project, open terminal:
   ```bash
   cd dwreport
   npm install
   ```
2) Create a Supabase project → copy URL + anon key.
3) Copy `.env.example` to `.env.local` and fill the values.
4) In Supabase > SQL Editor, run `supabase/schema.sql` (creates tables, policies, trigger, etc.).
5) In Supabase > Auth > Users: create your accounts. In `profiles` table, set your email's `role` to `admin`.
6) Start dev server:
   ```bash
   npm run dev
   ```
7) Open `http://localhost:3000` → Sign in → Staff goes to `/report`, Admin goes to `/admin`.
