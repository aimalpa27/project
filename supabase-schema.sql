create table if not exists public.profiles (
  id uuid primary key,
  email text not null unique,
  full_name text,
  role text not null default 'user',
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_codes (
  id bigint generated always as identity primary key,
  code text not null unique,
  credits integer not null,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  id bigint generated always as identity primary key,
  promo_code_id bigint not null references public.promo_codes(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (promo_code_id, user_id)
);

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  stripe_session_id text not null unique,
  user_id uuid not null,
  amount_total integer not null default 0,
  credits integer not null default 0,
  status text not null default 'paid',
  created_at timestamptz not null default now()
);
