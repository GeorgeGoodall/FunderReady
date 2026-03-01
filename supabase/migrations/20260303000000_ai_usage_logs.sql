-- AI usage logging: track token consumption and costs per API call
-- ================================================================

-- 1. ai_usage_logs table
create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  application_review_id uuid references public.application_reviews(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  pipeline_step text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_creation_input_tokens int not null default 0,
  cache_read_input_tokens int not null default 0,
  cost_usd numeric(10,6) not null default 0,
  cost_gbp numeric(10,6) not null default 0,
  is_retry boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes for common query patterns
create index idx_ai_usage_logs_review_id on public.ai_usage_logs(application_review_id);
create index idx_ai_usage_logs_user_id on public.ai_usage_logs(user_id);
create index idx_ai_usage_logs_created_at on public.ai_usage_logs(created_at);
create index idx_ai_usage_logs_pipeline_step on public.ai_usage_logs(pipeline_step);

-- RLS enabled but no user-facing policies (service client writes, admin reads via service client)
alter table public.ai_usage_logs enable row level security;

-- 2. Aggregate columns on application_reviews
alter table public.application_reviews
  add column total_input_tokens int not null default 0,
  add column total_output_tokens int not null default 0,
  add column total_cache_creation_tokens int not null default 0,
  add column total_cache_read_tokens int not null default 0,
  add column total_cost_usd numeric(10,6) not null default 0,
  add column total_cost_gbp numeric(10,6) not null default 0;
