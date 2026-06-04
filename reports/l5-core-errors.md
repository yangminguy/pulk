# l5-core 타입스크립트 에러 수정 리포트

작업자: worker-2 (core-fixer)
패키지: `@l5/core` (`packages/l5-core`)
실행 환경: pnpm 9.15.0 (corepack), TypeScript ^5.3.0, strict 모드

## Phase B-1: typecheck 에러 수집 및 수정

### 명령어
```
pnpm --filter @l5/core typecheck   # tsc --noEmit
```

### 발견된 에러 (수정 전)

```
src/functions/brief-generation.ts(84,25): error TS1005: ',' expected.
src/functions/brief-generation.ts(84,27): error TS1005: ',' expected.
src/functions/brief-generation.ts(84,33): error TS1005: ',' expected.
src/functions/brief-generation.ts(84,43): error TS1005: ',' expected.
src/functions/brief-generation.ts(84,48): error TS1005: ',' expected.
src/functions/brief-generation.ts(84,51): error TS1002: Unterminated string literal.
src/functions/brief-generation.ts(85,3): error TS1005: ',' expected.
src/functions/brief-generation.ts(85,63): error TS1005: ')' expected.
```

### 근본 원인

`brief-generation.ts` line 84에서 작은따옴표 문자열 리터럴 내부의 apostrophe(`'`)가
escape되지 않아 문자열이 조기 종료되었다. 그 결과 `Daily Operating Brief` 부분이
식별자/구문으로 파싱되며 연쇄적인 구문 에러(TS1005, TS1002)가 발생했다.

같은 파일 line 102의 `'Today\'s Priority'`는 escape되어 있어 정상이었으나,
line 84만 escape 처리가 누락된 상태였다.

### 수정 내용

| 위치 | 수정 전 | 수정 후 |
|------|---------|---------|
| `brief-generation.ts:84` | `lines.push('# Founder's Daily Operating Brief');` | `lines.push("# Founder's Daily Operating Brief");` |

작은따옴표 대신 큰따옴표로 문자열을 감싸 apostrophe를 escape 없이 안전하게 포함했다.

### 다른 함수 파일 점검 결과

`founder-fit.ts`, `pmf-scoring.ts`, `approval.ts`, `tool-request.ts` 전체를 검토했으며
타입/구문 에러는 발견되지 않았다. 함수 디렉토리 구조(`functions/<name>.ts` flat 파일을
`functions/<name>/index.ts`가 re-export, 테스트는 `index.ts`를 import)는 일관적이며
타입 정의(`types/entities.ts`)와도 정렬되어 있다.

### 수정 후 typecheck 결과

```
> @l5/core@0.1.0 typecheck
> tsc --noEmit
(에러 없음 - 통과)
```

## Phase B-2: 빌드 및 테스트 검증

### 빌드
```
pnpm --filter @l5/core build   # tsc
```
성공. `dist/`에 `index.js`, `index.d.ts`, `functions/`, `types/` 정상 생성.

### 테스트 1차 실행 (실패 4건)

```
Test Suites: 2 failed, 3 passed, 5 total
Tests:       4 failed, 38 passed, 42 total
```

실패한 테스트와 근본 원인:

| # | 테스트 | 기대 | 실제 | 근본 원인 |
|---|--------|------|------|-----------|
| 1 | tool-request › should reject low PMF | false | true | PMF/반복/시간 조건이 단순 가점으로만 처리되어, 강한 다른 차원이 약점을 보상하며 게이트 역할을 못 함 |
| 2 | tool-request › should reject low repetition | false | true | 동일 (repetition_count=1인데도 후보로 판정) |
| 3 | tool-request › should reject low time investment | false | true | 동일 (time_to_complete=2분인데도 후보로 판정) |
| 4 | founder-fit › should return high score when idea matches founder strengths | score>60, interest_fit>50, skill_fit>50 | score=52, interest_fit=0, skill_fit=50 | 키워드 정확매칭만 수행해 "automated"↔"automation", "ai-powered"↔"ai" 같은 형태 변형을 못 잡음. skill 스케일도 단일 강점 매칭 시 정확히 50으로 경계값 미달 |

### 수정 내용 (B-2)

**tool-request.ts (`decideToolCandidate`)** — 코드 주석(line 16-21)에 이미 명시된
"PMF >= 60", "반복 3회 이상", "5분 이상"을 **hard gate**로 변경.
- `gatesPassed` 플래그 도입: 세 조건 중 하나라도 미달이면 `is_tool_candidate = false`.
- 최종 판정: `gatesPassed && score >= 40`.
- 게이트 통과 후에는 기존 score 기반으로 priority(high/medium/low) 결정 유지.
- 검증: strongInput은 모든 게이트 통과 → true/priority=high, "weight high error risk"
  케이스(pmf=60,rep=3,time=10,error=high)는 게이트 통과 → true 유지.

**founder-fit.ts (`calculateInterestFit`, `calculateSkillFit`)** — 의미적으로 관련된
키워드를 매칭하도록 stem 기반 매처 추가.
- `keywordsMatch(a, b)`: 소문자/영문자만 남긴 후 앞 4글자 stem이 같으면 매칭
  (예: automated↔automation, ai-powered↔ai).
- `countKeywordMatches(ideaKeywords, dnaKeywords)` 헬퍼로 두 계산식의 정확매칭(`.includes`)을 대체.
- skill 스케일 `strengthScore * 10` → `* 12`: confidence 5 강점 1개 매칭 시 60점 확보
  (단일 강점이 약하게 평가되던 경계값 문제 해소). weakness 페널티(`*5`)는 유지.
- 검증: high-match 케이스 interest_fit 0→100, skill_fit 50→60, 총점 52→약 76.
  low-skill 케이스(Healthcare/Medical)는 매칭 0건 → skill_fit 0 유지(여전히 <60).
  risk_fit 단조성 테스트(D3 > D5)도 영향 없음.

### 최종 테스트 결과

```
Test Suites: 5 passed, 5 total
Tests:       42 passed, 42 total
```

커버리지 대상 5개 모듈(founder-fit, pmf-scoring, approval, tool-request, brief-generation) 전부 통과.

### 최종 빌드 결과

```
> @l5/core@0.1.0 build
> tsc
(exit 0 - dist 정상 생성)
```

## Phase B-2 후속: dist 모듈 형식 명시화 (worker-5 demo 연동)

worker-5가 `pnpm demo` 실행 중 `@l5/core` import 실패를 보고했다
(`does not provide an export named 'calculatePmfScore'`, `ERR_MODULE_NOT_FOUND`,
`MODULE_TYPELESS_PACKAGE_JSON` 경고).

### 진단

- 루트 `package.json`에 `"type": "module"`이 있어 하위 패키지의 `.js`가 ESM으로 해석된다.
- 그러나 `tsc`는 CommonJS 형식(`require`/`exports`)으로 `dist`를 빌드한다.
- l5-core `package.json`에는 자체 `type` 필드가 없어 루트의 `type: module`을 상속 →
  CJS 산출물과 ESM 선언이 불일치(암묵적 interop에 의존).
- worker-5가 본 에러는 주로 **stale dist** 시점에 실행된 것으로 보이며, 최신
  클린 리빌드 후에는 `pnpm demo`/`node require`/`node ESM import` 모두 정상 동작했다.

### 수정 (견고성 확보)

| 파일 | 변경 | 이유 | 담당 |
|------|------|------|------|
| `packages/l5-core/tsconfig.json` | `module: ESNext` → `CommonJS` (moduleResolution:node 유지) | tsx/node ESM에서 named export 해석 실패 해소 | worker-5 |
| `packages/l5-core/package.json` | `"type": "commonjs"` 추가 | dist의 CJS 산출물과 선언을 명시적으로 일치시켜 루트 `type:module` 상속으로 인한 형식 불일치 제거 | worker-2 |
| `packages/l5-core/jest.config.js` | `export default {` → `module.exports = {` | `type:commonjs` 적용 후 ESM 문법 설정 파일이 CJS로 파싱되어 깨지는 것을 해소 | worker-2 |

세 변경 모두 CommonJS 방향으로 일관되며 상호 보강한다. tsconfig가 CJS dist를 생성하고,
package.json이 이를 CJS로 선언하며, jest.config도 CJS 문법을 사용한다.
(주의: 향후 module을 ESNext로 되돌리려면 package.json `"type": "module"` + 모든 상대
import에 `.js` 확장자 부여가 함께 필요하다.)

`functions/<name>/index.ts` ↔ `functions/<name>.ts` 공존은 src에만 존재하며, dist의
`index.js`는 `./functions/<name>`(파일)만 참조하므로 resolution 모호성은 없다.

### 수정 후 전체 검증 (클린 리빌드 포함)

```
typecheck   : 에러 0
build (clean): exit 0, dist 정상
test        : 5 suites / 42 tests 전부 PASS
pnpm demo   : exit 0 ("Demo complete.", 모듈/문법 에러 없음)
node ESM/CJS import : calculatePmfScore/scoreFounderFit 정상 resolve
```
