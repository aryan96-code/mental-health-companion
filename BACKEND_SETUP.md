# CampusCare Cloud Backend Setup (Supabase)

This app is local-first and will work without backend setup.  
To enable accounts + cloud sync across devices, configure Supabase.

## 1. Create a Supabase project

1. Go to https://supabase.com and create a new project.
2. In **Project Settings -> API**, copy:
   - Project URL
   - `anon` public key
3. Put those values in `config.js`:

```js
window.CAMPUSCARE_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
};
```

## 2. Create sync table

Run this SQL in **Supabase SQL Editor**:

```sql
create extension if not exists pgcrypto;

create table if not exists public.user_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('mood', 'journal', 'comfort')),
  entry_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, entry_type, entry_id)
);

alter table public.user_entries enable row level security;

create policy "Users can read own entries"
on public.user_entries
for select
using (auth.uid() = user_id);

create policy "Users can insert own entries"
on public.user_entries
for insert
with check (auth.uid() = user_id);

create policy "Users can update own entries"
on public.user_entries
for update
using (auth.uid() = user_id);
```

## 3. Enable email auth

1. In Supabase, open **Authentication -> Providers -> Email**.
2. Enable Email provider.
3. Save.

Optional for production:
- Configure custom SMTP for reliable email delivery.
- Set your GitHub Pages domain in **Authentication -> URL Configuration**.

## 4. Deploy

Commit and push all files, then your GitHub Pages site will use cloud auth + sync.

```bash
git add .
git commit -m "Add mobile/performance upgrades and Supabase cloud sync"
git push
```

## 5. How sync works

- App always writes locally first for responsiveness.
- When signed in, entries are upserted to `user_entries`.
- Manual sync button and automatic session/login sync merge by latest `updated_at`.
