// Decision Ledger — 원장 엔트리 조립 + 델타 계산 + JSONL 직렬화/역직렬화.
// 부작용 없음. malformed 입력에는 throw 대신 graceful null/빈값으로 대응한다.

import type {
  DecisionDelta,
  DecisionLedgerEntry,
  DecisionObservation,
  DecisionPrediction,
} from './types';

/** 숫자 실측이 예측의 ±50% 이내면 match로 본다. 예측이 0이면 정확일치만 인정. */
const NUMERIC_TOLERANCE = 0.5;

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 단일 필드의 예측/실측이 일치하는지. 숫자는 허용오차, 그 외(문자열/불리언 등)는 정확일치. */
function fieldMatches(predicted: unknown, observed: unknown): boolean {
  if (isNumber(predicted) && isNumber(observed)) {
    if (predicted === 0) return observed === 0;
    return Math.abs(predicted - observed) <= Math.abs(predicted) * NUMERIC_TOLERANCE;
  }
  return predicted === observed;
}

/** 예측 맵과 실측 맵의 공통 필드만 비교해 델타 계산. */
export function computeDelta(
  predicted: Record<string, unknown>,
  observed: Record<string, unknown>
): DecisionDelta {
  const mismatches: DecisionDelta['mismatches'] = [];
  for (const field of Object.keys(predicted)) {
    if (!(field in observed)) continue; // 공통 필드만 비교
    if (!fieldMatches(predicted[field], observed[field])) {
      mismatches.push({ field, predicted: predicted[field], observed: observed[field] });
    }
  }
  return { matched: mismatches.length === 0, mismatches };
}

/** subject_id + kind + prediction.at 기반의 안정적 id(외부 crypto 의존 없음). */
function deriveId(prediction: DecisionPrediction): string {
  const raw = `${prediction.kind}:${prediction.subject_id}:${prediction.at}`;
  return raw.replace(/[^a-zA-Z0-9:_-]/g, '_');
}

/** 예측(필수) + 실측(선택)으로 원장 엔트리를 만든다. 실측이 있으면 델타를 채운다. */
export function buildLedgerEntry(
  prediction: DecisionPrediction,
  observation?: DecisionObservation
): DecisionLedgerEntry {
  const entry: DecisionLedgerEntry = {
    id: deriveId(prediction),
    kind: prediction.kind,
    subject_id: prediction.subject_id,
    prediction,
    at: observation?.at ?? prediction.at,
  };
  if (observation) {
    entry.observation = observation;
    entry.delta = computeDelta(prediction.predicted, observation.observed);
  }
  return entry;
}

/** 엔트리를 JSONL 한 줄로 직렬화. */
export function serializeEntry(entry: DecisionLedgerEntry): string {
  return JSON.stringify(entry);
}

/** JSONL 한 줄을 엔트리로 역직렬화. 파싱 실패/필수 필드 누락이면 null(graceful). */
export function parseEntry(line: string): DecisionLedgerEntry | null {
  if (typeof line !== 'string' || line.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.id !== 'string' ||
    typeof obj.kind !== 'string' ||
    typeof obj.subject_id !== 'string' ||
    typeof obj.prediction !== 'object' ||
    obj.prediction === null
  ) {
    return null;
  }
  return obj as unknown as DecisionLedgerEntry;
}
