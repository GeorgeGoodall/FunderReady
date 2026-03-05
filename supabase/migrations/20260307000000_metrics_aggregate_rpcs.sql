-- Aggregate AI usage logs server-side to avoid fetching all rows
-- Used by the admin metrics endpoint

-- All-time aggregates grouped by pipeline_step and model
create or replace function aggregate_ai_usage()
returns table(
  pipeline_step text,
  model text,
  total_calls bigint,
  total_input_tokens bigint,
  total_output_tokens bigint,
  total_cost_usd numeric,
  total_cost_gbp numeric
)
language sql
security definer
stable
as $$
  select
    pipeline_step,
    model,
    count(*)::bigint as total_calls,
    coalesce(sum(input_tokens), 0)::bigint as total_input_tokens,
    coalesce(sum(output_tokens), 0)::bigint as total_output_tokens,
    coalesce(sum(cost_usd), 0) as total_cost_usd,
    coalesce(sum(cost_gbp), 0) as total_cost_gbp
  from ai_usage_logs
  group by pipeline_step, model;
$$;

-- Aggregates since a given date
create or replace function aggregate_ai_usage_since(since_date timestamptz)
returns table(
  pipeline_step text,
  model text,
  total_calls bigint,
  total_input_tokens bigint,
  total_output_tokens bigint,
  total_cost_usd numeric,
  total_cost_gbp numeric
)
language sql
security definer
stable
as $$
  select
    pipeline_step,
    model,
    count(*)::bigint as total_calls,
    coalesce(sum(input_tokens), 0)::bigint as total_input_tokens,
    coalesce(sum(output_tokens), 0)::bigint as total_output_tokens,
    coalesce(sum(cost_usd), 0) as total_cost_usd,
    coalesce(sum(cost_gbp), 0) as total_cost_gbp
  from ai_usage_logs
  where created_at >= since_date
  group by pipeline_step, model;
$$;

-- Scraping-specific aggregates (filter_links + check_criteria_relevance)
create or replace function aggregate_scraping_usage()
returns table(
  pipeline_step text,
  total_calls bigint,
  total_input_tokens bigint,
  total_output_tokens bigint,
  total_cost_usd numeric,
  total_cost_gbp numeric
)
language sql
security definer
stable
as $$
  select
    pipeline_step,
    count(*)::bigint as total_calls,
    coalesce(sum(input_tokens), 0)::bigint as total_input_tokens,
    coalesce(sum(output_tokens), 0)::bigint as total_output_tokens,
    coalesce(sum(cost_usd), 0) as total_cost_usd,
    coalesce(sum(cost_gbp), 0) as total_cost_gbp
  from ai_usage_logs
  where pipeline_step in ('filter_links', 'check_criteria_relevance')
  group by pipeline_step;
$$;

-- Scraping-specific aggregates since a given date
create or replace function aggregate_scraping_usage_since(since_date timestamptz)
returns table(
  pipeline_step text,
  total_calls bigint,
  total_input_tokens bigint,
  total_output_tokens bigint,
  total_cost_usd numeric,
  total_cost_gbp numeric
)
language sql
security definer
stable
as $$
  select
    pipeline_step,
    count(*)::bigint as total_calls,
    coalesce(sum(input_tokens), 0)::bigint as total_input_tokens,
    coalesce(sum(output_tokens), 0)::bigint as total_output_tokens,
    coalesce(sum(cost_usd), 0) as total_cost_usd,
    coalesce(sum(cost_gbp), 0) as total_cost_gbp
  from ai_usage_logs
  where pipeline_step in ('filter_links', 'check_criteria_relevance')
    and created_at >= since_date
  group by pipeline_step;
$$;
