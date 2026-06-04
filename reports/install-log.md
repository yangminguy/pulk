# pnpm Install Log — Phase A-2

생성일: 2026-05-26
담당: worker-1 (repo-doctor)

## 환경

| 항목 | 값 |
|------|-----|
| Node | v24.14.1 |
| pnpm | 9.15.0 (corepack 경유) |
| 설치 위치 | `$HOME/.corepack-bin/pnpm` (사용자 디렉토리 shim) |

## 진행 요약

1. `pnpm`이 시스템에 설치되어 있지 않음 → `corepack`은 존재.
2. `corepack enable pnpm` 시 `/usr/local/bin`에 대한 `EACCES` 권한 오류 발생.
   - 해결: `corepack enable --install-directory $HOME/.corepack-bin pnpm`로 사용자 디렉토리에 shim 생성. sudo 불필요.
3. 1차 `pnpm install` (pnpm@9.0.0) 실패.
   - 오류: `ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER  typescript@catalog: isn't supported by any available resolver` (services/agent-runtime).
   - 원인: `services/agent-runtime/package.json`이 `catalog:` 프로토콜을 사용하나, pnpm 9.0.0은 catalog를 지원하지 않음 (pnpm 9.5+ 필요).
   - 해결: 루트 `package.json`의 `packageManager`를 `pnpm@9.0.0` → `pnpm@9.15.0`으로 상향. catalog는 `pnpm-workspace.yaml`에 의도적으로 정의되어 있어 인프라를 유지하는 방향으로 수정.
4. 2차 `pnpm install` (pnpm@9.15.0) 성공.

## 최종 install 결과

- Scope: all 3 workspace projects (`l5-business-os`, `@l5/core`, `@l5/agent-runtime`)
- Packages: +281, Done in 5.4s, exit code 0
- 루트 devDependencies 설치: `@types/node 20.19.41`, `tsx 4.22.3`, `typescript 5.9.3`
- catalog 해소 확인: `services/agent-runtime/node_modules`에 `typescript`, `@types`, `@l5` (workspace 링크) 정상 생성
- `packages/l5-core/node_modules`: `jest`, `ts-jest`, `typescript`, `@types` 정상

## Warning (비차단)

- `DEP0169 url.parse() DeprecationWarning` — Node 내부 경고, 무해.
- `2 deprecated subdependencies: glob@7.2.3, inflight@1.0.6` — transitive, 현재 영향 없음.
- pnpm 업데이트 안내 (9.15.0 → 11.3.0) — 선택사항, MVP에서는 9.15.0 고정 유지.

## 후속 작업자 참고

- pnpm 호출 시 `export PATH="$HOME/.corepack-bin:$PATH"`가 필요할 수 있음 (shell 세션이 PATH를 상속하지 않는 경우).
- `packageManager`가 `pnpm@9.15.0`으로 변경됨. 향후 worker는 9.0.0 가정 금지.
