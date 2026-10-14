-- Read-only finance queries for the finance routine (Supabase project iqvrovjwoavvmhaithwn).
-- Run ONE statement per execute_sql call (only the last result set comes back).

-- Q1 unit cost per finished video, by tier / length / week
select date_trunc('week', created_at)::date wk, model_tier, target_duration_sec,
       count(*) jobs, round(avg(api_cost_usd)::numeric,4) avg_cost_usd,
       round(avg(charged_credits)::numeric) avg_credits
from render_jobs where status='done' and charged_credits > 0 group by 1,2,3 order by 1,2,3;

-- Q2 failures (cost of failed jobs is pure loss unless refunded upstream)
select status, count(*) jobs, round(sum(api_cost_usd)::numeric,3) cost_usd from render_jobs group by 1;

-- Q3 credits sold vs burned vs outstanding (breakage = margin)
select reason, count(*) n, sum(delta) credits from credit_transactions group by 1 order by 3 desc;

-- Q4 realised margin: cost vs credits, valued at Pro net $0.000262/credit (change per plan)
select count(*) jobs, round(sum(api_cost_usd)::numeric,3) cost_usd, sum(charged_credits) credits,
       round((sum(charged_credits)*0.000262)::numeric,2) net_rev_usd_at_pro_rate,
       round((sum(charged_credits)*0.000262/nullif(sum(api_cost_usd),0))::numeric,1) multiple
from render_jobs where status='done' and charged_credits > 0;

-- Q5 subscribers, trial burn, activation
select plan_id, status, count(*) from subscriptions group by 1,2;

-- Q6 per-user burn (heavy users vs plan price)
select user_id, count(*) jobs, round(sum(api_cost_usd)::numeric,2) cost_usd, sum(charged_credits) credits
from render_jobs where status='done' group by 1 order by 3 desc limit 20;

-- Q7 storage footprint per video (Supabase storage)
select bucket_id, count(*) files, round(sum((metadata->>'size')::bigint)/1048576.0,1) mb
from storage.objects group by 1;
