-- ============================================================
-- FunderReady: Initial schema
-- Tables: profiles, reviews, review_results, usage, review_purchases
-- Plus: auto-profile trigger, RLS policies, storage buckets
-- ============================================================

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'pro')),
  subscription_status text not null default 'active'
    check (subscription_status in ('active', 'past_due', 'cancelled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- reviews ----------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'parsing', 'analysing', 'scoring', 'generating', 'completed', 'failed')),
  bid_file_name text not null,
  bid_file_path text not null,
  criteria_json jsonb,
  output_file_path text,
  error_message text,
  model_tier text not null default 'haiku'
    check (model_tier in ('haiku', 'sonnet', 'opus')),
  is_scorecard_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- review_results ----------
create table public.review_results (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade unique,
  progress jsonb not null default '{}',
  results jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- usage ----------
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period text not null,
  reviews_used integer not null default 0,
  reviews_limit integer not null default 3,
  bonus_reviews integer not null default 0,
  unique (user_id, period)
);

-- ---------- review_purchases ----------
create table public.review_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete set null,
  amount_pence integer not null,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index idx_reviews_user_id on public.reviews(user_id);
create index idx_reviews_status on public.reviews(status);
create index idx_usage_user_period on public.usage(user_id, period);
create index idx_review_purchases_user_id on public.review_purchases(user_id);

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Auto-update updated_at
-- ============================================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger set_updated_at before update on public.reviews
  for each row execute function public.update_updated_at();

create trigger set_updated_at before update on public.review_results
  for each row execute function public.update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

-- profiles: users can read/update their own profile
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- reviews: users can CRUD their own reviews
alter table public.reviews enable row level security;

create policy "Users can view own reviews"
  on public.reviews for select
  using (auth.uid() = user_id);

create policy "Users can insert own reviews"
  on public.reviews for insert
  with check (auth.uid() = user_id);

create policy "Users can update own reviews"
  on public.reviews for update
  using (auth.uid() = user_id);

-- review_results: users can read results for their own reviews
alter table public.review_results enable row level security;

create policy "Users can view own review results"
  on public.review_results for select
  using (
    exists (
      select 1 from public.reviews
      where reviews.id = review_results.review_id
      and reviews.user_id = auth.uid()
    )
  );

-- usage: users can read their own usage
alter table public.usage enable row level security;

create policy "Users can view own usage"
  on public.usage for select
  using (auth.uid() = user_id);

-- review_purchases: users can read their own purchases
alter table public.review_purchases enable row level security;

create policy "Users can view own purchases"
  on public.review_purchases for select
  using (auth.uid() = user_id);

-- ============================================================
-- Storage buckets
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('bid-uploads', 'bid-uploads', false, 10485760),    -- 10MB
  ('review-outputs', 'review-outputs', false, null);

-- Storage RLS: users can upload/read their own files (path: {userId}/*)
create policy "Users can upload own bids"
  on storage.objects for insert
  with check (
    bucket_id = 'bid-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own bids"
  on storage.objects for select
  using (
    bucket_id = 'bid-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own review outputs"
  on storage.objects for select
  using (
    bucket_id = 'review-outputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
