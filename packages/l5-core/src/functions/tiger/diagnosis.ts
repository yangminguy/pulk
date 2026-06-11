// 호랑이 장애 정밀 진단 — 감지된 incident를 Claude로 분석해 diagnosis/proposed_fix를 생성한다.
// 순수 로직(프롬프트 빌드 + 출력 파싱 + 모델 선택). 실제 Claude 호출은 hermes watcher가 주입.
// 사장님이 승인 판단 시 "왜 멈췄고 어떻게 고칠지"를 제대로 보도록, 룰 기반 기본 문구를 대체한다.

import type { TigerModel } from './analysis';

export interface IncidentForDiagnosis {
  target_label: string;
  incident_type: 'failed' | 'stalled' | 'error';
  error_summary?: string;
  heartbeat_evidence?: string;
  target_repo: string;
}

export interface IncidentDiagnosis {
  diagnosis: string;
  proposed_fix: string;
}

/** 적응형(사장님 결정): failed거나 오류 발췌가 길면 깊은 추론(opus), 단순 정체는 sonnet. */
export function selectDiagnosisModel(inc: IncidentForDiagnosis): TigerModel {
  const errLen = (inc.error_summary ?? '').length;
  return inc.incident_type === 'failed' || errLen > 200 ? 'claude-opus-4-8' : 'claude-sonnet-4-6';
}

/** Claude에게 줄 진단 프롬프트. JSON만 출력하도록 강제. */
export function buildIncidentDiagnosisPrompt(inc: IncidentForDiagnosis): string {
  return [
    '너는 L5 운영 시스템(pulk)의 장애 진단 엔지니어다. 아래 장애를 분석해 JSON만 출력하라(코드펜스·설명 문장 없이).',
    '',
    `작업: ${inc.target_label}`,
    `장애 유형: ${inc.incident_type}`,
    `대상 repo: ${inc.target_repo}`,
    inc.heartbeat_evidence ? `감지 근거: ${inc.heartbeat_evidence}` : '',
    inc.error_summary ? `오류 발췌: ${inc.error_summary}` : '',
    '',
    '출력 형식(JSON만):',
    '{"diagnosis":"무엇이 왜 멈췄는지 근본원인 추정 — 한국어 2~3문장","proposed_fix":"CTO가 대상 repo에서 무엇을 어떻게 고쳐야 하는지 구체적으로 — 한국어 2~3문장"}',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Claude 출력에서 진단 JSON 추출. 코드펜스/잡텍스트 내성. 실패 시 null(호출측이 룰 기본값 유지). */
export function parseIncidentDiagnosis(raw: string): IncidentDiagnosis | null {
  if (!raw) return null;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const d = typeof o.diagnosis === 'string' ? o.diagnosis.trim() : '';
    const p = typeof o.proposed_fix === 'string' ? o.proposed_fix.trim() : '';
    if (!d || !p) return null;
    return { diagnosis: d, proposed_fix: p };
  } catch {
    return null;
  }
}
