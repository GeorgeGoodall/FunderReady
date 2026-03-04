-- Rollback usage when a review pipeline fails.
-- Decrements reviews_used for the user's most recent usage period.

CREATE OR REPLACE FUNCTION rollback_usage(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE usage
  SET reviews_used = GREATEST(0, reviews_used - 1)
  WHERE user_id = p_user_id
    AND period = (
      SELECT period FROM usage
      WHERE user_id = p_user_id
      ORDER BY period DESC
      LIMIT 1
    );
END;
$$;
