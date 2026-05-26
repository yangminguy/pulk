-- L5 Business OS: Orchestration Tables Migration
-- Tables: founder_instructions, ceo_interpretations, agent_tasks, agent_handoffs
-- NocoBase db.sync() creates the tables; this script adds FK constraints, indexes, and RLS.
-- Run AFTER NocoBase has started and synced collections at least once.

-- ============================================================
-- 1. Foreign Key Constraints
-- ============================================================

ALTER TABLE ceo_interpretations
  ADD CONSTRAINT fk_ceo_interp_instruction
    FOREIGN KEY (instruction_id) REFERENCES founder_instructions(id)
    ON DELETE CASCADE;

ALTER TABLE agent_tasks
  ADD CONSTRAINT fk_agent_task_instruction
    FOREIGN KEY (instruction_id) REFERENCES founder_instructions(id)
    ON DELETE CASCADE;

ALTER TABLE agent_tasks
  ADD CONSTRAINT fk_agent_task_interpretation
    FOREIGN KEY (interpretation_id) REFERENCES ceo_interpretations(id)
    ON DELETE SET NULL;

ALTER TABLE agent_handoffs
  ADD CONSTRAINT fk_agent_handoff_task
    FOREIGN KEY (task_id) REFERENCES agent_tasks(id)
    ON DELETE CASCADE;

-- ============================================================
-- 2. Indexes
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
-- 3. RLS Policies (read-only for founder role)
-- ============================================================

ALTER TABLE founder_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceo_interpretations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_handoffs ENABLE ROW LEVEL SECURITY;

-- agents can read/write all rows
CREATE POLICY agent_full_access_founder_instructions
  ON founder_instructions FOR ALL
  TO l5_agent
  USING (true)
  WITH CHECK (true);

CREATE POLICY agent_full_access_ceo_interpretations
  ON ceo_interpretations FOR ALL
  TO l5_agent
  USING (true)
  WITH CHECK (true);

CREATE POLICY agent_full_access_agent_tasks
  ON agent_tasks FOR ALL
  TO l5_agent
  USING (true)
  WITH CHECK (true);

CREATE POLICY agent_full_access_agent_handoffs
  ON agent_handoffs FOR ALL
  TO l5_agent
  USING (true)
  WITH CHECK (true);

-- founder can only read (no write/delete)
CREATE POLICY founder_read_only_founder_instructions
  ON founder_instructions FOR SELECT
  TO l5_founder
  USING (true);

CREATE POLICY founder_read_only_ceo_interpretations
  ON ceo_interpretations FOR SELECT
  TO l5_founder
  USING (true);

CREATE POLICY founder_read_only_agent_tasks
  ON agent_tasks FOR SELECT
  TO l5_founder
  USING (true);

CREATE POLICY founder_read_only_agent_handoffs
  ON agent_handoffs FOR SELECT
  TO l5_founder
  USING (true);
