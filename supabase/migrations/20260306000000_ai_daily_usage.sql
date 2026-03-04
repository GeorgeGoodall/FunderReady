-- Daily AI call rate limiting table
create table if not exists ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  call_count int not null default 0,
  primary key (user_id, usage_date)
);

alter table ai_daily_usage enable row level security;
-- No user-facing RLS policies — accessed only via service client

-- Atomic increment function with rate limit check
create or replace function increment_ai_daily_usage(p_user_id uuid, p_limit int)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  insert into ai_daily_usage (user_id, usage_date, call_count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date) do update
    set call_count = ai_daily_usage.call_count + 1
    where ai_daily_usage.call_count < p_limit
  returning call_count into v_count;

  if v_count is null then
    raise exception 'AI_RATE_LIMIT_EXCEEDED';
  end if;

  return v_count;
end;
$$;
