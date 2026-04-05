-- Drop legacy document-based review tables
-- These were part of the original .docx upload/parse/review/generate flow,
-- which was removed during the pivot to the application-based flow.
-- review_purchases and review_results must be dropped before reviews (FK deps).

drop table if exists public.review_purchases;
drop table if exists public.review_results;
drop table if exists public.reviews;
