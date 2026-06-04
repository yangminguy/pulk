# Review: VideoProject 모델 & API (CRUD + 상태 전환)

> 리뷰일: 2026-06-04 | 브랜치: acr/l5-...-task-4-20260604-1632

## 판정: 조건부 LGTM

B1/B2 수정 후 머지 가능. B3/D1은 후속 가능.

---

## 버그 (수정 필요)

### B1. `advance` 액션에서 `advanceToGenerating` 이중 호출

- **파일**: `plugin-orchestration/src/server/plugin.ts:1774,1806`
- **심각도**: Low (동작 정확, 의도 불명확)

```
1774: const advanced = advanceToGenerating(asPlainRecord(existing));     // 1차 — 상태 검증
...
1806: const generating = advanceToGenerating(asPlainRecord(existing), jobPath);  // 2차 — 원본에서 다시 전환
```

1차 호출로 draft→generating 상태 검증을 하고, 성공 경로에서 **원본 `existing`(draft)**에 대해 2차 호출한다. 결과는 동일하지만 불필요한 이중 전환이고 1차 결과 `advanced`를 버리므로 의도가 불분명하다.

**수정안**: 1차 결과 `advanced`에 job_path만 덮어쓰기:
```ts
const generating = { ...advanced, job_path: jobPath };
```

### B2. `createTrackedVideoFactoryTransport`에서도 동일 이중 호출

- **파일**: `plugin-orchestration/src/server/plugin.ts:1900,1911`
- **심각도**: Low (동작 정확, 코드 중복)

```
1900: const advanced = advanceToGenerating(draft);           // 1차
1911: const generating = advanceToGenerating(draft, jobPath); // 2차 — 같은 draft에 다시
```

B1과 동일 패턴. `advanced`에 job_path를 덮어쓰면 해결.

---

## 경미한 사항 (후속 가능)

### B3. tracked transport에서 generate 중 DB 상태 불일치

- **파일**: `plugin-orchestration/src/server/plugin.ts:1898-1912`
- **심각도**: Info

```
1898: await repo.create({ values: draft });          // DB에 draft 삽입
1900: const advanced = advanceToGenerating(draft);    // 메모리만 변경
1901: const result = await _videoFactoryTransport.generate(brief);  // 장시간 소요 가능
```

transport.generate() 실행 중 DB 상태가 `draft`로 남아, list 조회 시 `draft`로 보인다. 기능적 문제는 아니지만, generate 전에 DB를 `generating`으로 업데이트하면 정확해진다.

### D1. `fail` 액션에서 빈 error가 500으로 전파

- **파일**: `plugin-orchestration/src/server/plugin.ts:1844`
- **심각도**: Info

```ts
const failed = failVideoProject(asPlainRecord(existing), error ?? '');
```

`error` 미전달 시 `''`로 대체되어 l5-core `failVideoProject`가 throw → 500 응답. 기존 패턴(`create`의 topic 검증도 l5-core throw 의존)과 일관적이지만, 클라이언트 입장에서 400이 더 적절할 수 있다.

---

## LGTM 항목

| 파일 | 판정 | 비고 |
|------|------|------|
| `l5-core/functions/video-project/index.ts` | LGTM | consultation 패턴 정확 복제, I/O 없음, `requireNonEmpty` 깔끔 |
| `l5-core/functions/video-project/__tests__/video-project.test.ts` | LGTM | 16 테스트 — 정상 전환 + 잘못된 상태 throw + 빈 값 throw 전부 커버 |
| `l5-core/src/index.ts:35` | LGTM | `export * from './functions/video-project'` 재수출 |
| `plugin.ts:269-288` CREATE TABLE | LGTM | 기존 테이블 생성 패턴 일관, jsonb 타입 적절, camelCase timestamp |
| `plugin.ts:490-506` defineCollection | LGTM | SQL 스키마와 1:1 대응, 필드 타입 올바름 |
| `plugin.ts:1730-1853` REST API 5액션 | LGTM | list/create/advance/complete/fail 모두 존재, ACL `loggedIn` 설정 완료 |
| `plugin.ts:1856-1873` 헬퍼 함수 | LGTM | `asPlainRecord`(Sequelize→plain), `pickVideoProjectPersistedFields` 올바름 |
| `plugin.ts:1875-1916` tracked transport | LGTM | CMO 도구 루프에서 자동 DB 추적, 기존 transport 래핑 설계 적절 |
| `__tests__/video-project-contract.test.ts` | LGTM | 소스 문자열 기반 계약 테스트, 기존 패턴 따름 |
| `docs/DATA_MODEL.md` VideoProject 섹션 | LGTM | 엔티티 문서화 완료 |

## 검증 결과 확인

| 검증 | 결과 |
|------|------|
| `pnpm --filter @l5/core test -- video-project` | PASS (16 tests) |
| `pnpm --filter @l5/core typecheck` | PASS |
| `pnpm --filter @l5/core test -- --runInBand` | PASS (54 suites, 575 tests) |
| `pnpm --filter @l5/core build` | PASS |
| `git diff --check` | PASS |
