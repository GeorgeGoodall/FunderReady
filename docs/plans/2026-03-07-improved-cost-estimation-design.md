# Improved Credit Cost Estimation Design

## Problem

The current estimator uses hardcoded constants (0.7 credits per answer, 2.5 overhead) with a wide 0.8x–1.3x range. This is inaccurate because:
- Constants are guesses, not calibrated from real data
- All answers are treated as equal cost regardless of length
- The wide range reduces user confidence in the estimate

## Design

### Two-Layer Estimation

**Layer 1: Historical stats cache**
- Average cost per pipeline step (`answer_analysis`, `cross_reference`, `scoring`) computed from `ai_usage_logs`
- Average answer character length from `application_answers`
- Cached in-memory with 24h TTL — first request of the day pays query cost, rest are instant
- Requires minimum 10 completed reviews before stats are used

**Layer 2: Per-request adjustment**
- Count actual answer text characters for fresh answers in this review
- Compute `char_ratio = actual_avg_chars / historical_avg_chars`
- Scale the per-analysis cost by char_ratio to adjust for this review's answers being longer/shorter than average
- Apply 0.9x–1.2x range (narrower than current 0.8x–1.3x)

### Estimate Calculation

```
avg_cost_per_analysis = stats.answer_analysis.avg_cost_usd
avg_cost_cross_ref = stats.cross_reference.avg_cost_usd
avg_cost_scoring = stats.scoring.avg_cost_usd
avg_answer_chars = stats.avg_answer_chars

actual_avg_chars = mean(fresh_answer_char_lengths)
char_ratio = actual_avg_chars / avg_answer_chars

estimated_cost_usd = freshCount * avg_cost_per_analysis * char_ratio
                   + avg_cost_cross_ref
                   + avg_cost_scoring

credits = ceil(estimated_cost_usd / COST_PER_CREDIT_USD)
low = max(1, floor(credits * 0.9))
high = ceil(credits * 1.2)
```

### Stats Queries (run once per 24h)

**Per-step averages:**
```sql
SELECT
  l.pipeline_step,
  AVG(l.input_tokens) AS avg_input_tokens,
  AVG(l.output_tokens) AS avg_output_tokens,
  AVG(l.cost_usd) AS avg_cost_usd,
  COUNT(*) AS call_count
FROM ai_usage_logs l
WHERE l.is_retry = false
  AND l.pipeline_step IN ('answer_analysis', 'cross_reference', 'scoring')
GROUP BY l.pipeline_step
```

**Average answer character length:**
```sql
SELECT AVG(char_length(answer_text)) AS avg_answer_chars
FROM application_answers aa
JOIN application_reviews ar ON ar.application_id = aa.application_id
WHERE ar.status = 'completed'
  AND aa.is_disabled = false
  AND char_length(aa.answer_text) > 0
```

**Completed review count (for minimum threshold):**
```sql
SELECT COUNT(DISTINCT application_review_id) AS review_count
FROM ai_usage_logs
WHERE pipeline_step = 'scoring'
  AND is_retry = false
```

### Gating Behaviour

**When stats available (>= 10 reviews):**
- Show estimate range: "This review will cost approximately X-Y credits"
- Gate on `low` estimate (user needs >= low credits to start)

**When stats unavailable (< 10 reviews):**
- Don't show estimate to user
- Still check `remaining > 0` (must have some credits)
- Skip estimate-based gating -- review runs, actual credits deducted after completion
- Estimate endpoint returns `{ estimate: null, canAfford: true }` (as long as remaining > 0)
- UI shows simple "Submit?" confirmation without credit numbers

### No New Tables

All data comes from existing `ai_usage_logs` and `application_answers` tables. No migrations needed.
