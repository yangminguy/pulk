// 호랑이 실시간 복구 상태머신 단위테스트.
// 핵심 경계: 4회 루프(4회 실패 → escalated, 중간 통과 → resolved), 승인 게이트(detected는 dispatch 금지).

import {
  decideRecoveryAction,
  startFix,
  applyTestResult,
  transitionRecovery,
  buildRecoveryFixIntent,
  MAX_RECOVERY_ATTEMPTS,
  type RecoveryIncident,
} from '../recovery';

const NOW = '2026-06-11T12:00:00.000Z';

function inc(over: Partial<RecoveryIncident> = {}): RecoveryIncident {
  return {
    id: 'i1',
    status: 'approved',
    attempt_count: 0,
    target_repo: '/abs/repo',
    task_label: '키 콘텐츠 보고서',
    incident_type: 'failed',
    error_summary: 'TypeError: cannot read x of undefined',
    ...over,
  };
}

describe('decideRecoveryAction', () => {
  it('detected → none (승인 전 코딩 금지 게이트)', () => {
    expect(decideRecoveryAction(inc({ status: 'detected' }))).toBe('none');
  });
  it('approved → dispatch_fix', () => {
    expect(decideRecoveryAction(inc({ status: 'approved' }))).toBe('dispatch_fix');
  });
  it('fixing → run_test', () => {
    expect(decideRecoveryAction(inc({ status: 'fixing' }))).toBe('run_test');
  });
  it('testing/resolved/escalated → none', () => {
    expect(decideRecoveryAction(inc({ status: 'testing' }))).toBe('none');
    expect(decideRecoveryAction(inc({ status: 'resolved' }))).toBe('none');
    expect(decideRecoveryAction(inc({ status: 'escalated' }))).toBe('none');
  });
});

describe('startFix', () => {
  it('approved → fixing + attempt_count 증가', () => {
    const t = startFix(inc({ status: 'approved', attempt_count: 0 }));
    expect(t.next_status).toBe('fixing');
    expect(t.attempt_count).toBe(1);
    expect(t.patch).toEqual({ status: 'fixing', attempt_count: 1 });
    expect(t.notify).toBe('none');
  });
  it('detected → no-op (승인 전 dispatch 금지)', () => {
    const t = startFix(inc({ status: 'detected', attempt_count: 0 }));
    expect(t.next_status).toBe('detected');
    expect(t.attempt_count).toBe(0);
  });
});

describe('applyTestResult', () => {
  it('통과 → resolved + notify resolved', () => {
    const t = applyTestResult(inc({ status: 'testing', attempt_count: 1 }), {
      passed: true,
      evidence: 'verify exit 0',
    });
    expect(t.next_status).toBe('resolved');
    expect(t.notify).toBe('resolved');
  });

  it('실패하지만 상한 미만 → fixing 재시도 (notify none)', () => {
    const t = applyTestResult(inc({ status: 'testing', attempt_count: 2 }), {
      passed: false,
      evidence: 'verify exit 1',
    });
    expect(t.next_status).toBe('fixing');
    expect(t.notify).toBe('none');
    expect(t.attempt_count).toBe(2);
  });

  it('상한(4) 도달 후 실패 → escalated + notify escalated', () => {
    const t = applyTestResult(inc({ status: 'testing', attempt_count: MAX_RECOVERY_ATTEMPTS }), {
      passed: false,
      evidence: 'still failing',
    });
    expect(t.next_status).toBe('escalated');
    expect(t.notify).toBe('escalated');
  });
});

describe('4회 루프 경계(통합 시뮬레이션)', () => {
  // 한 사이클 = startFix(attempt++) → applyTestResult. 매번 실패 → 4회째 escalated.
  function simulate(passOnAttempt: number | null) {
    let current: RecoveryIncident = inc({ status: 'approved', attempt_count: 0 });
    const trail: string[] = [];
    for (let i = 0; i < 10; i++) {
      // 안전상한
      if (current.status === 'resolved' || current.status === 'escalated') break;
      // dispatch 시작.
      const started = startFix(current);
      current = { ...current, status: started.next_status, attempt_count: started.attempt_count };
      // 테스트.
      const passed = passOnAttempt !== null && current.attempt_count === passOnAttempt;
      const after = applyTestResult(current, {
        passed,
        evidence: `attempt ${current.attempt_count} ${passed ? 'pass' : 'fail'}`,
      });
      trail.push(`${current.attempt_count}:${after.next_status}`);
      current = { ...current, status: after.next_status, attempt_count: after.attempt_count };
    }
    return { final: current, trail };
  }

  it('매번 실패 → 4회 시도 후 escalated', () => {
    const { final, trail } = simulate(null);
    expect(final.status).toBe('escalated');
    expect(final.attempt_count).toBe(MAX_RECOVERY_ATTEMPTS);
    // 1~3회는 fixing 재시도, 4회째 escalated.
    expect(trail).toEqual(['1:fixing', '2:fixing', '3:fixing', '4:escalated']);
  });

  it('3회째 통과 → resolved (escalated 안 됨)', () => {
    const { final, trail } = simulate(3);
    expect(final.status).toBe('resolved');
    expect(final.attempt_count).toBe(3);
    expect(trail).toEqual(['1:fixing', '2:fixing', '3:resolved']);
  });

  it('1회째 통과 → 즉시 resolved', () => {
    const { final, trail } = simulate(1);
    expect(final.status).toBe('resolved');
    expect(trail).toEqual(['1:resolved']);
  });
});

describe('transitionRecovery (위임)', () => {
  it('test 없으면 startFix 위임', () => {
    const t = transitionRecovery(inc({ status: 'approved', attempt_count: 0 }));
    expect(t.next_status).toBe('fixing');
  });
  it('test 있으면 applyTestResult 위임', () => {
    const t = transitionRecovery(inc({ status: 'testing', attempt_count: 1 }), {
      passed: true,
      evidence: 'ok',
    });
    expect(t.next_status).toBe('resolved');
  });
  it('never-throw: attempt_count NaN이어도 안전', () => {
    const t = transitionRecovery(inc({ status: 'testing', attempt_count: NaN as unknown as number }), {
      passed: false,
      evidence: 'x',
    });
    // NaN → 0으로 보정되어 재시도(fixing).
    expect(['fixing', 'escalated']).toContain(t.next_status);
  });
});

describe('buildRecoveryFixIntent', () => {
  it('오류 컨텍스트를 prompt로 + verify_command 묶음 + project_path = target_repo', () => {
    const intent = buildRecoveryFixIntent({
      incident: inc({ id: 'i9', attempt_count: 1, target_repo: '/x/y' }),
      now: NOW,
      verify_command: 'npx jest foo',
    });
    expect(intent.project_path).toBe('/x/y');
    expect(intent.l5_approved).toBe(true);
    expect(intent.created_at).toBe(NOW);
    expect(intent.phases).toHaveLength(1);
    const p = intent.phases[0];
    expect(p.runtime).toBe('claude'); // OpenAI 미사용
    expect(p.verify_command).toBe('npx jest foo');
    expect(p.prompt_packet).toContain('TypeError'); // error_summary 실림
    expect(p.prompt_packet).toContain('1/4'); // 시도 회차
  });

  it('verify_command 미지정 시 보수적 typecheck 기본', () => {
    const intent = buildRecoveryFixIntent({ incident: inc(), now: NOW });
    expect(intent.phases[0].verify_command).toBe('npx tsc --noEmit');
  });

  it('빈 입력이어도 never-throw', () => {
    const intent = buildRecoveryFixIntent({
      incident: { id: 'e', status: 'fixing', attempt_count: 0 },
      now: NOW,
    });
    expect(intent.phases).toHaveLength(1);
    expect(intent.l5_task_id).toContain('e');
  });
});
