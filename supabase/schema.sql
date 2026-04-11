create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'Europe/Istanbul',
  daily_summary_time text not null default '09:00',
  push_enabled boolean not null default false,
  last_summary_sent_local_date date
);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text not null default '',
  site_url text not null default '',
  brief_url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  series_id uuid references public.series (id) on delete cascade,
  title text not null,
  notes text not null default '',
  scheduled_date date not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'canceled')),
  type text not null check (type in ('task', 'stage')),
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.series enable row level security;
alter table public.entries enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles own rows" on public.profiles
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "series own rows" on public.series
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "entries own rows" on public.entries
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "subscriptions own rows" on public.push_subscriptions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
