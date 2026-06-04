-- L5 Business OS: Orchestration Tables Migration
-- Tables: founder_instructions, ceo_interpretations, agent_tasks, agent_handoffs
-- NocoBase db.sync() usually creates the tables first. This script also
-- bootstraps missing tables/columns so fresh DB and existing DB runs are safe.

CREATE TABLE IF NOT EXISTS founder_instructions (
  id uuid PRIMARY KEY,
  raw_text text,
  source text DEFAULT 'manual',
  intent text,
  constraints jsonb DEFAULT '[]'::jsonb,
  requested_phase text,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ceo_interpretations (
  id uuid PRIMARY KEY,
  instruction_id uuid,
  goal text,
  assumptions jsonb DEFAULT '[]'::jsonb,
  phase text,
  success_criteria jsonb DEFAULT '[]'::jsonb,
  risk_level text DEFAULT 'D1',
  approval_required boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id uuid PRIMARY KEY,
  instruction_id uuid,
  interpretation_id uuid,
  assigned_agent text,
  title text,
  rationale text,
  expected_output text,
  status text DEFAULT 'queued',
  approval_required boolean DEFAULT false,
  risk_level text,
  phase text,
  source_ref text,
  blocker text,
  next_output text,
  next_owner text,
  stop_reason text,
  due_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_handoffs (
  id uuid PRIMARY KEY,
  task_id uuid,
  from_agent text,
  to_agent text,
  context text,
  next_action text,
  blocker text,
  approval_required boolean DEFAULT false,
  what_was_completed text,
  what_remains_open text,
  why_next_agent_needed text,
  must_not_lose text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

-- ============================================================
-- 1. Timestamp Defaults
-- ============================================================

ALTER TABLE founder_instructions
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS constraints jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requested_phase text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

ALTER TABLE founder_instructions
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE ceo_interpretations
  ADD COLUMN IF NOT EXISTS instruction_id uuid,
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS assumptions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS success_criteria jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'D1',
  ADD COLUMN IF NOT EXISTS approval_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

ALTER TABLE ceo_interpretations
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS instruction_id uuid,
  ADD COLUMN IF NOT EXISTS interpretation_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_agent text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS rationale text,
  ADD COLUMN IF NOT EXISTS expected_output text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS approval_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocker text,
  ADD COLUMN IF NOT EXISTS next_output text,
  ADD COLUMN IF NOT EXISTS next_owner text,
  ADD COLUMN IF NOT EXISTS stop_reason text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS risk_level text,
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS source_ref text;

ALTER TABLE agent_tasks
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE agent_handoffs
  ADD COLUMN IF NOT EXISTS task_id uuid,
  ADD COLUMN IF NOT EXISTS from_agent text,
  ADD COLUMN IF NOT EXISTS to_agent text,
  ADD COLUMN IF NOT EXISTS context text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS blocker text,
  ADD COLUMN IF NOT EXISTS approval_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS what_was_completed text,
  ADD COLUMN IF NOT EXISTS what_remains_open text,
  ADD COLUMN IF NOT EXISTS why_next_agent_needed text,
  ADD COLUMN IF NOT EXISTS must_not_lose text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

ALTER TABLE agent_handoffs
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "updatedAt" SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- ============================================================
-- 2. Foreign Key Constraints
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ceo_interp_instruction'
  ) THEN
    ALTER TABLE ceo_interpretations
      ADD CONSTRAINT fk_ceo_interp_instruction
        FOREIGN KEY (instruction_id) REFERENCES founder_instructions(id)
        ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_task_instruction'
  ) THEN
    ALTER TABLE agent_tasks
      ADD CONSTRAINT fk_agent_task_instruction
        FOREIGN KEY (instruction_id) REFERENCES founder_instructions(id)
        ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_task_interpretation'
  ) THEN
    ALTER TABLE agent_tasks
      ADD CONSTRAINT fk_agent_task_interpretation
        FOREIGN KEY (interpretation_id) REFERENCES ceo_interpretations(id)
        ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_agent_handoff_task'
  ) THEN
    ALTER TABLE agent_handoffs
      ADD CONSTRAINT fk_agent_handoff_task
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id)
        ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

-- ============================================================
-- 3. Indexes
-- ============================================================

-- founder_instructions
CREATE INDEX IF NOT EXISTS idx_founder_instructions_status
  ON founder_instructions(status);
CREATE INDEX IF NOT EXISTS idx_founder_instructions_created_at
  ON founder_instructions("createdAt");

-- ceo_interpretations
CREATE INDEX IF NOT EXISTS idx_ceo_interpretations_instruction_id
  ON ceo_interpretations(instruction_id);
CREATE INDEX IF NOT EXISTS idx_ceo_interpretations_phase
  ON ceo_interpretations(phase);
CREATE INDEX IF NOT EXISTS idx_ceo_interpretations_created_at
  ON ceo_interpretations("createdAt");

-- agent_tasks
CREATE INDEX IF NOT EXISTS idx_agent_tasks_instruction_id
  ON agent_tasks(instruction_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_interpretation_id
  ON agent_tasks(interpretation_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_assigned_agent
  ON agent_tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status
  ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_risk_level
  ON agent_tasks(risk_level);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_phase
  ON agent_tasks(phase);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_source_ref
  ON agent_tasks(source_ref);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created_at
  ON agent_tasks("createdAt");

-- agent_handoffs
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_task_id
  ON agent_handoffs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_from_agent
  ON agent_handoffs(from_agent);
CREATE INDEX IF NOT EXISTS idx_agent_handoffs_created_at
  ON agent_handoffs("createdAt");

-- ============================================================
-- 4. RLS Policies (read-only for founder role)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'l5_agent') THEN
    CREATE ROLE l5_agent;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'l5_founder') THEN
    CREATE ROLE l5_founder;
  END IF;
END $$;

ALTER TABLE founder_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_interpretations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_handoffs ENABLE ROW LEVEL SECURITY;

-- agents can read/write all rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'founder_instructions'
      AND policyname = 'agent_full_access_founder_instructions'
  ) THEN
    CREATE POLICY agent_full_access_founder_instructions
      ON founder_instructions FOR ALL
      TO l5_agent
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ceo_interpretations'
      AND policyname = 'agent_full_access_ceo_interpretations'
  ) THEN
    CREATE POLICY agent_full_access_ceo_interpretations
      ON ceo_interpretations FOR ALL
      TO l5_agent
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_tasks'
      AND policyname = 'agent_full_access_agent_tasks'
  ) THEN
    CREATE POLICY agent_full_access_agent_tasks
      ON agent_tasks FOR ALL
      TO l5_agent
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_handoffs'
      AND policyname = 'agent_full_access_agent_handoffs'
  ) THEN
    CREATE POLICY agent_full_access_agent_handoffs
      ON agent_handoffs FOR ALL
      TO l5_agent
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- founder can only read (no write/delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'founder_instructions'
      AND policyname = 'founder_read_only_founder_instructions'
  ) THEN
    CREATE POLICY founder_read_only_founder_instructions
      ON founder_instructions FOR SELECT
      TO l5_founder
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ceo_interpretations'
      AND policyname = 'founder_read_only_ceo_interpretations'
  ) THEN
    CREATE POLICY founder_read_only_ceo_interpretations
      ON ceo_interpretations FOR SELECT
      TO l5_founder
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_tasks'
      AND policyname = 'founder_read_only_agent_tasks'
  ) THEN
    CREATE POLICY founder_read_only_agent_tasks
      ON agent_tasks FOR SELECT
      TO l5_founder
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_handoffs'
      AND policyname = 'founder_read_only_agent_handoffs'
  ) THEN
    CREATE POLICY founder_read_only_agent_handoffs
      ON agent_handoffs FOR SELECT
      TO l5_founder
      USING (true);
  END IF;
END $$;
