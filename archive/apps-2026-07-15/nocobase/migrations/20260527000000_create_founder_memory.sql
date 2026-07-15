-- L5 Business OS: Founder Memory Table Migration
-- Table: founder_memory
-- Stores agent-generated insights after Founder approval.

CREATE TABLE IF NOT EXISTS founder_memory (
  id uuid PRIMARY KEY,
  source_task_id uuid,
  source_agent text,
  insight text NOT NULL,
  workflow_improvement text,
  approved_by text DEFAULT 'founder',
  approval_status text DEFAULT 'pending',
  pii_level text DEFAULT 'none',
  phase text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

-- ============================================================
-- 1. Column Addition Guards (idempotent)
-- ============================================================

ALTER TABLE founder_memory
  ADD COLUMN IF NOT EXISTS source_task_id uuid,
  ADD COLUMN IF NOT EXISTS source_agent text,
  ADD COLUMN IF NOT EXISTS insight text,
  ADD COLUMN IF NOT EXISTS workflow_improvement text,
  ADD COLUMN IF NOT EXISTS approved_by text DEFAULT 'founder',
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pii_level text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

ALTER TABLE founder_memory
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- ============================================================
-- 2. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_founder_memory_approval_status
  ON founder_memory(approval_status);

CREATE INDEX IF NOT EXISTS idx_founder_memory_source_agent
  ON founder_memory(source_agent);

CREATE INDEX IF NOT EXISTS idx_founder_memory_created_at
  ON founder_memory(created_at);

-- ============================================================
-- 3. RLS Policies
-- ============================================================

ALTER TABLE founder_memory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'l5_agent') THEN
    CREATE ROLE l5_agent;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'l5_founder') THEN
    CREATE ROLE l5_founder;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'founder_memory'
      AND policyname = 'agent_full_access_founder_memory'
  ) THEN
    CREATE POLICY agent_full_access_founder_memory
      ON founder_memory FOR ALL
      TO l5_agent
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'founder_memory'
      AND policyname = 'founder_read_only_founder_memory'
  ) THEN
    CREATE POLICY founder_read_only_founder_memory
      ON founder_memory FOR SELECT
      TO l5_founder
      USING (true);
  END IF;
END $$;
