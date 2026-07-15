CREATE TABLE IF NOT EXISTS bpr_phases (
  id uuid PRIMARY KEY,
  phase text NOT NULL,
  started_at timestamptz DEFAULT now(),
  success_criteria jsonb DEFAULT '[]'::jsonb,
  completion_signal text,
  is_current boolean DEFAULT false,
  requires_founder_approval boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bpr_phases_is_current ON bpr_phases (is_current);
CREATE INDEX IF NOT EXISTS idx_bpr_phases_phase ON bpr_phases (phase);
CREATE INDEX IF NOT EXISTS idx_bpr_phases_created_at ON bpr_phases (created_at);

INSERT INTO bpr_phases (id, phase, is_current, requires_founder_approval, success_criteria)
VALUES (
  gen_random_uuid(),
  'direction_alignment',
  true,
  true,
  '["Founder와 CEO Agent 간 방향성 합의 완료", "핵심 비즈니스 아이디어 선정", "초기 타겟 고객 세그먼트 정의"]'::jsonb
)
ON CONFLICT DO NOTHING;
