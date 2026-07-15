// hyperframes-cto-run2.mjs — 2차 라운드: funnel / data-insight / product-update 템플릿 +
// Scene Router 자동판단을 Native Orchestrator로 자율 실행한다(사람 승인 게이트 없음).
//
//   node services/agent-runtime/scripts/hyperframes-cto-run2.mjs
//
// 타깃 레포는 hyperframes/templates 브랜치에 체크아웃되어 있어야 한다(worktree가 HEAD에서 분기).

import { dispatchToNativeOrchestrator } from '../dist/index.js';

const REPO = '/Users/wonminyang/ai-slide-video-factory';
const NM = `${REPO}/node_modules`;

// ★ 지난 라운드 함정 수정: worktree에 node_modules 심링크를 만들면 orchestrator의 git add -A가
//   그 심링크를 커밋해 머지 시 실제 node_modules를 파괴했다. 이번엔 tsc 실행 후 심링크를 즉시
//   제거하고 tsc의 exit code를 보존한다 → git add -A에 안 잡힌다.
const VERIFY = `ln -sfn ${NM} node_modules; npx tsc --noEmit; rc=$?; rm -f node_modules; exit $rc`;

const SPEC_REF = [
  '먼저 docs/HYPERFRAMES_INTEGRATION.md 와 기존 hyperframes-runner/templates/roadmap.ts, shared.ts 를 읽어라.',
  '그게 따라야 할 정본 패턴이다. 1차 라운드에서 roadmap/architecture 템플릿은 이미 구현·머지·E2E 검증됐다.',
  '',
  '확립된 패턴(반드시 재사용):',
  '- 템플릿 = hyperframes-runner/templates/<name>.ts 의 export function <name>Html(scene): string.',
  '- shared.ts 헬퍼 사용: hyperframesDocument({compositionId:"main", durationSec, bodyHtml, timelineScript, title}),',
  '  accentHex(scene.style?.accent), escapeHtml(...), toLabelHintList(...), HF_WIDTH/HF_HEIGHT/HF_FPS.',
  '- HyperFrames index.html 규칙: 타임드 엘리먼트 class="clip"+data-start/data-duration/data-track-index,',
  '  gsap.timeline({paused:true}) → window.__timelines["main"]=tl (hyperframesDocument가 골격 제공).',
  '- 새 템플릿은 hyperframes-runner/render.ts 의 htmlForScene() switch 에 case 한 줄을 추가해 연결한다.',
  '- src/lib/schema.ts 의 template enum 에는 이미 5종(roadmap/architecture/funnel/data_insight/product_update)이 있다 — 스키마 수정 불필요.',
  '- 1920x1080, 30fps, 한글 가독성 최우선, 다크 캔버스 기본, 과한 효과보다 정보 전달 우선, 느린 카메라/페이드/순차 등장.',
  '스킵 금지. node_modules는 이 worktree에 없을 수 있다 — tsc 전 `ln -sfn ' + NM + ' node_modules`.',
].join('\n');

const phase = (name, expected, body) => ({
  name,
  runtime: 'claude',
  risk_level: 'D2',
  release_gate_type: 'none',
  l5_approval_required: false,
  auto_execute: true,
  verify_command: VERIFY,
  expected_output: expected,
  prompt_packet: [SPEC_REF, '', body].join('\n'),
});

const phases = [
  phase(
    'P1 funnel 템플릿',
    'hyperframes-runner/templates/funnel.ts(funnelHtml) + render.ts htmlForScene에 funnel case. tsc 통과.',
    [
      '== Phase 1: funnel 템플릿 (PRD §3.4/§9, P1) ==',
      '마케팅 퍼널 — 노출→관심→클릭→신뢰→문의→구매→재구매 같은 고객 행동 흐름을 보여주는 클립.',
      'hyperframes-runner/templates/funnel.ts 에 export function funnelHtml(scene): string 작성:',
      '- 데이터: scene.data.stages = string[] 또는 {label, metric?}[] (toLabelHintList로 정규화; hint=metric).',
      '- 화면: 위가 넓고 아래로 갈수록 좁아지는 깔때기(funnel) 형태의 가로 띠/사다리꼴 단계들을 세로로 쌓고,',
      '  각 단계에 라벨과 (있으면) 지표 숫자. 단계가 위에서 아래로 GSAP로 순차 등장(폭이 점점 줄어드는 시각).',
      '  마지막에 "다음 콘텐츠로 연결" 또는 전체 퍼널 강조. 다크 캔버스 + accentHex 포인트.',
      '- render.ts htmlForScene() switch에 case "funnel": return funnelHtml(scene); 추가.',
      '검증: ' + VERIFY,
    ].join('\n'),
  ),
  phase(
    'P2 data-insight 템플릿',
    'hyperframes-runner/templates/dataInsight.ts(dataInsightHtml) + render.ts htmlForScene에 data_insight case. tsc 통과.',
    [
      '== Phase 2: data-insight 템플릿 (PRD §3.5/§9, P1) ==',
      'YouTube/키워드 데이터 시각화 — 조회수·경쟁도·노출확률·점수 비교 클립.',
      'hyperframes-runner/templates/dataInsight.ts 에 export function dataInsightHtml(scene): string 작성:',
      '- 데이터: scene.data.metrics = {label, value:number, unit?}[] (랭킹/막대), scene.data.keyword?, scene.data.score?(0~100 게이지).',
      '- 화면: 막대그래프(각 막대가 value 비율로 GSAP로 자라남), 랭킹 카드, score가 있으면 원형/막대 게이지,',
      '  keyword가 있으면 상단 키워드 헤드라인. 최댓값 막대는 accentHex로 하이라이트(추천 주제 강조).',
      '  숫자는 0→value 카운트업 또는 막대 width 트윈. 다크 캔버스, 한글 라벨 가독성.',
      '- render.ts htmlForScene() switch에 case "data_insight": return dataInsightHtml(scene); 추가.',
      '  (주의: enum 값은 언더스코어 data_insight 다. 파일명만 dataInsight.ts 카멜케이스.)',
      '검증: ' + VERIFY,
    ].join('\n'),
  ),
  phase(
    'P3 product-update 템플릿',
    'hyperframes-runner/templates/productUpdate.ts(productUpdateHtml) + render.ts htmlForScene에 product_update case. tsc 통과.',
    [
      '== Phase 3: product-update 템플릿 (PRD §3.6/§9, P2) ==',
      '기능 출시·MVP 업데이트 30~60초 런칭 티저 클립.',
      'hyperframes-runner/templates/productUpdate.ts 에 export function productUpdateHtml(scene): string 작성:',
      '- 데이터: scene.data.features = {title, desc?, icon?}[] (3~5개), scene.data.cta?(string), scene.data.version?(string).',
      '- 화면: 기능 카드 3~5개가 GSAP로 순차 등장(아이콘/이모지 + 제목 + 설명). 카드 강조선 accentHex.',
      '  마지막에 큰 CTA 텍스트(cta) 또는 version 배지. 깔끔/미니멀, 과한 효과 금지, 다크 캔버스.',
      '- render.ts htmlForScene() switch에 case "product_update": return productUpdateHtml(scene); 추가.',
      '검증: ' + VERIFY,
    ].join('\n'),
  ),
  phase(
    'P4 Scene Router 자동판단',
    'hyperframes-runner/recommend.ts(recommendHyperframeScenes, 키워드 룰) + README 갱신. tsc 통과.',
    [
      '== Phase 4: Scene Router 고도화 — 자동 판단 (PRD §8/Phase 4) ==',
      '대본/씬 제목·내용 텍스트를 읽고, 어떤 장면을 hyperframes로 빼고 어떤 템플릿을 쓸지 자동 추천하는 순수 함수.',
      'hyperframes-runner/recommend.ts 작성:',
      '- export interface HyperframeSuggestion { scene_id?: string; recommended_template: HyperFrameScene["template"]; matched_keywords: string[]; score: number; }',
      '- export function recommendTemplateForText(text: string): HyperframeSuggestion | null —',
      '  PRD §8 키워드 룰: ',
      '    "과정|로드맵|단계|흐름|파이프라인" → roadmap',
      '    "구조|시스템|에이전트|아키텍처|연결" → architecture',
      '    "퍼널|고객 행동|전환|funnel" → funnel',
      '    "조회수|데이터|비교|점수|지표|키워드" → data_insight',
      '    "출시|업데이트|기능|신규|런칭" → product_update',
      '  매칭된 키워드 수가 가장 많은 템플릿을 고르고(동점이면 위 우선순위), 매칭 0이면 null 반환. score=매칭수.',
      '- export function recommendHyperframeScenes(job): HyperframeSuggestion[] — job.scenes를 돌며 각 scene의 ',
      '  제목/헤드라인/캡션/텍스트 필드를 모아 recommendTemplateForText에 넣어 제안 배열 반환(이미 type==="hyperframes"인 건 제외).',
      '- 순수 함수(부작용 없음). 기존 파이프라인/타입 안 깨기.',
      'README.md "HyperFrames 클립" 섹션에 자동 추천 사용법 한 단락 추가.',
      '검증: ' + VERIFY,
    ].join('\n'),
  ),
];

const intent = {
  l5_task_id: 'hf-templates-round2-001',
  task_title: 'HyperFrames 템플릿 3종(funnel/data-insight/product-update) + Scene Router 자동판단',
  phases,
  created_at: new Date().toISOString(),
  project_path: REPO,
  l5_approved: true, // 자율 실행 — 사람 승인 게이트 없음
  complexity: 'C3',
  harness_mode: 'implement_verify',
  allowed_files: [],
  requires_approval: false,
};

console.log('[hf-cto2] dispatching:', intent.l5_task_id, '→', REPO);
console.log('[hf-cto2] phases:', phases.map((p) => p.name).join(' | '));
const summary = await dispatchToNativeOrchestrator(intent);
console.log('[hf-cto2] DONE. summary =', JSON.stringify(summary));
