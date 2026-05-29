-- =============================================================================
-- truncate-orchestration-tables.sql
--
-- PURPOSE: One-time operational script to clear orchestration tables before
--          enabling multi-business support (business_id column migration).
--
-- WARNING: MANUAL EXECUTION ONLY. DO NOT automate or include in any migration
--          pipeline, CI/CD, or application startup sequence.
--
-- WHEN TO RUN: Once, by an operator, after confirming that existing task/
--              interpretation/instruction data is no longer needed in production.
--
-- HOW TO RUN (example):
--   psql "$DATABASE_URL" -f scripts/truncate-orchestration-tables.sql
--
-- =============================================================================

BEGIN;

TRUNCATE TABLE agent_handoffs RESTART IDENTITY CASCADE;
TRUNCATE TABLE agent_tasks    RESTART IDENTITY CASCADE;
TRUNCATE TABLE ceo_interpretations RESTART IDENTITY CASCADE;
TRUNCATE TABLE founder_instructions RESTART IDENTITY CASCADE;

COMMIT;
