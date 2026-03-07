-- RPCs for credit cost estimation historical stats
-- ================================================

-- 1. Per-step average cost (non-retry calls only)
create or replace function get_estimation_step_stats()
returns table(
  pipeline_step text,
  avg_cost_usd numeric,
  call_count bigint
)
language sql stable
security definer
as $$
  select
    l.pipeline_step,
    avg(l.cost_usd)::numeric as avg_cost_usd,
    count(*)::bigint as call_count
  from ai_usage_logs l
  where l.is_retry = false
    and l.pipeline_step in ('answer_analysis', 'cross_reference', 'scoring')
  group by l.pipeline_step;
$$;

-- 2. Average answer character length from completed reviews
create or replace function get_avg_answer_chars()
returns table(avg_chars numeric)
language sql stable
security definer
as $$
  select coalesce(avg(char_length(aa.answer_text)), 500)::numeric as avg_chars
  from application_answers aa
  join application_reviews ar on ar.application_id = aa.application_id
  where ar.status = 'completed'
    and aa.is_disabled = false
    and char_length(aa.answer_text) > 0;
$$;

-- 3. Completed review count (for minimum threshold check)
create or replace function get_completed_review_count()
returns table(review_count bigint)
language sql stable
security definer
as $$
  select count(distinct application_review_id)::bigint as review_count
  from ai_usage_logs
  where pipeline_step = 'scoring'
    and is_retry = false;
$$;
