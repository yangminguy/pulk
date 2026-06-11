// hyperframes-cto-run.mjs — CTO Brain이 만든 HyperFrames×Remotion 통합 Work Order를
// Native Orchestrator로 자율 실행한다(사람 승인 게이트 없음).
//
//   node scripts/hyperframes-cto-run.mjs
//
// 흐름: ACRIntent(project_path=ai-slide-video-factory, 3 phases, l5_approved=true)
//   → dispatchToNativeOrchestrator → phase마다 worktree에서 claude -p 실행 →
//   결정적 verify + verify_command(tsc) 통과해야 통합 브랜치로 merge.

// dist를 상대 import — @l5/core는 services/agent-runtime/node_modules/@l5/core로 resolve된다.
import { dispatchToNativeOrchestrator } from '../dist/index.js';

const REPO = '/Users/wonminyang/ai-slide-video-factory';
const NM = `${REPO}/node_modules`;

// worktree는 node_modules(gitignore)를 복사하지 않으므로, verify 전 main repo의
// node_modules를 심링크해 tsc가 deps를 resolve하게 한다(검증된 함정 회피).
const VERIFY = `ln -sfn ${NM} node_modules && npx tsc --noEmit`;

const SPEC_REF = [
  '먼저 docs/HYPERFRAMES_INTEGRATION.md 를 읽어라(이 worktree 루트에 있다). 그게 정본 스펙이다.',
  '이 레포는 jobs/<slug>.json 의 scenes[] 배열 + src/lib/schema.ts(discriminatedUnion) +',
  'src/compositions/SlideDeckVideo.tsx 의 renderScene switch(exhaustive)로 구동된다.',
  '기존 Remotion 파이프라인을 깨지 마라. HyperFrames는 선택적 scene type이다.',
  '스킵 금지: 명시된 파일을 실제로 생성/수정하고 npm run typecheck(tsc --noEmit)를 통과시켜라.',
  'node_modules는 이 worktree에 없을 수 있다 — tsc 실행 전 `ln -sfn ' + NM + ' node_modules`로 심링크하라.',
].join('\n');

/** @type {import('@l5/core').CTOPhase[]} */
const phases = [
  {
    name: 'P1 스키마+HyperFrameClip+라우팅',
    runtime: 'claude',
    risk_level: 'D2',
    release_gate_type: 'none',
    l5_approval_required: false,
    auto_execute: true,
    verify_command: VERIFY,
    expected_output:
      'src/lib/schema.ts에 HyperFrameSceneSchema 추가(union+Scene type), ' +
      'src/components/scenes/HyperFrameClip.tsx 신규(output 있으면 OffthreadVideo+fade, 없으면 fallback 슬라이드, throw 금지), ' +
      'SlideDeckVideo.tsx switch에 case "hyperframes" 추가. tsc 통과.',
    prompt_packet: [
      SPEC_REF,
      '',
      '== Phase 1: scene type "hyperframes" 삽입 구조 ==',
      '스펙 §3·§4 를 그대로 구현하라:',
      '1) src/lib/schema.ts: HyperFrameSceneSchema(zod) 추가 — type:"hyperframes", duration(positive),',
      '   template enum(roadmap|architecture|funnel|data_insight|product_update), title?, data(record, default {}),',
      '   style?(theme dark|light, accent), output?(public 기준 상대경로), status?, caption?, scene_id?.',
      '   SceneSchema 의 discriminatedUnion 배열과 Scene 유니온, export type HyperFrameScene 에 모두 반영.',
      '2) src/components/scenes/HyperFrameClip.tsx 신규: props {data:HyperFrameScene}.',
      '   data.output(빈문자 아님)이면 <AbsoluteFill style={{opacity}}><OffthreadVideo src={staticFile(data.output)} /></AbsoluteFill>,',
      '   opacity는 useCurrentFrame()+interpolate로 첫15·마지막15 프레임 페이드. durationFrames는',
      '   useVideoConfig().durationInFrames 사용.',
      '   data.output 없으면 fallback: data.title + (roadmap이면 data.steps, architecture면 data.modules)를',
      '   세로 카드 리스트로 보여주는 간단한 마크업. 어떤 경우에도 throw 금지(MP4 없어도 렌더 계속).',
      '   fs로 파일 존재확인 금지(브라우저 번들) — data.output/status 값으로만 분기.',
      '3) SlideDeckVideo.tsx renderScene switch에 case "hyperframes": return <HyperFrameClip data={scene} />; 추가하고 import.',
      '검증: ln -sfn ' + NM + ' node_modules && npx tsc --noEmit 가 통과해야 한다. 기존 씬 렌더 깨지 말 것.',
    ].join('\n'),
  },
  {
    name: 'P2 hyperframes-runner+템플릿+렌더스크립트',
    runtime: 'claude',
    risk_level: 'D2',
    release_gate_type: 'none',
    l5_approval_required: false,
    auto_execute: true,
    verify_command: VERIFY,
    expected_output:
      'hyperframes-runner/templates/{roadmap,architecture}.ts, hyperframes-runner/render.ts(renderHyperframeScene), ' +
      'hyperframes-runner/cli.ts, package.json 스크립트 hyperframes:render 추가. tsc 통과.',
    prompt_packet: [
      SPEC_REF,
      '',
      '== Phase 2: HyperFrames 클립 생성기(runner) ==',
      '스펙 §2(검증된 HyperFrames 렌더 경로)·§5 를 구현하라. 레포 루트 hyperframes-runner/ 에:',
      '1) templates/roadmap.ts: export function roadmapHtml(scene): string — §2 규칙(루트 data-composition-id/width/height/duration,',
      '   class="clip" 타임드 엘리먼트, gsap.timeline({paused:true}) → window.__timelines["main"]=tl) 지키는 index.html 문자열.',
      '   어두운 캔버스, 점선 경로, 원형 노드, data.steps 각 단계 카드가 GSAP로 순차 등장. 한글 가독성 우선, 1920x1080.',
      '2) templates/architecture.ts: export function architectureHtml(scene): string — data.modules/data.edges 기반 모듈 카드+연결선.',
      '3) render.ts: export async function renderHyperframeScene(scene, jobSlug, opts?) — ',
      '   (a) 임시 dir(os.tmpdir())에 hyperframes 프로젝트 구성: meta.json({id,name,createdAt}), package.json,',
      '       index.html(템플릿 결과). hyperframes init 대신 직접 파일 작성해도 됨(meta.json+index.html이면 render 가능).',
      '   (b) child_process로 `npx --yes hyperframes@latest render --output <ABS>.mp4` 실행(cwd=임시dir). 반드시 --output 절대경로.',
      '   (c) 성공 시 mp4를 <repo>/public/generated/hyperframes/<jobSlug>/<scene_id>.mp4 로 복사, ',
      '       HyperFrameRenderResult({scene_id,status:"rendered",output_path(public기준 상대), width:1920,height:1080,fps:30,duration_sec}) 반환.',
      '   (d) 실패 시 1회 재시도, 그래도 실패면 {scene_id,status:"failed",error_message} 반환. throw 금지.',
      '4) cli.ts: `tsx hyperframes-runner/cli.ts --job jobs/<slug>.json` 로 해당 job의 hyperframes 씬들을 렌더하는 진입점.',
      '5) package.json scripts에 "hyperframes:render": "tsx hyperframes-runner/cli.ts" 추가.',
      '검증: ln -sfn ' + NM + ' node_modules && npx tsc --noEmit 통과. (실제 mp4 렌더 검증은 통합 단계에서.)',
    ].join('\n'),
  },
  {
    name: 'P3 SceneRouter+파이프라인+샘플job+README',
    runtime: 'claude',
    risk_level: 'D2',
    release_gate_type: 'none',
    l5_approval_required: false,
    auto_execute: true,
    verify_command: VERIFY,
    expected_output:
      'hyperframes-runner/sceneRouter.ts(prepareHyperframeClips), render-final-v2.ts --with-hyperframes 옵션(비파괴), ' +
      'jobs/hyperframes-demo.json, README HyperFrames 섹션. tsc 통과 + 샘플 job validateJob 통과.',
    prompt_packet: [
      SPEC_REF,
      '',
      '== Phase 3: Scene Router + 파이프라인 통합 + 샘플 ==',
      '스펙 §6 을 구현하라:',
      '1) hyperframes-runner/sceneRouter.ts: export async function prepareHyperframeClips(job, jobSlug) — ',
      '   job.scenes 중 type==="hyperframes"만 render.ts로 렌더, 각 scene의 output/status를 채운 새 job 반환.',
      '   렌더 실패 scene은 status:"fallback", output 미설정(→ HyperFrameClip이 fallback 렌더).',
      '2) scripts/render-final-v2.ts: 비파괴 옵션 --with-hyperframes 추가. 지정 시 remotion 렌더 직전',
      '   prepareHyperframeClips(job, slug)를 호출해 job을 보강. 기본 off(미지정 시 기존 동작 완전 동일).',
      '3) jobs/hyperframes-demo.json 신규: hero(remotion) → hyperframes(template:"roadmap", duration 35,',
      '   data.steps = ["대본 입력","문단 단위 TTS 자동 합성","자막 싱크 생성","문맥 기반 B-roll 후보 추출",',
      '   "Remotion 슬라이드 생성","ffmpeg 최종 합성","YouTube API 업로드"]) → cta(remotion). fps30 1920x1080.',
      '   기존 jobs/*.json 스키마(validateJob)를 그대로 통과해야 한다 — 다른 job 하나를 참고해 필수 필드를 모두 채워라.',
      '4) README.md에 "HyperFrames 클립" 섹션 추가: hyperframes:render 및 render:v2 --with-hyperframes 실행법.',
      '검증: ln -sfn ' + NM + ' node_modules && npx tsc --noEmit 통과. 그리고 node로 validateJob(jobs/hyperframes-demo.json)이',
      'ok=true 여야 한다(src/lib/validateJob.ts 사용). 실패하면 job을 고쳐라.',
    ].join('\n'),
  },
];

/** @type {import('@l5/core').ACRIntent} */
const intent = {
  l5_task_id: 'hf-remotion-integration-001',
  task_title: 'HyperFrames×Remotion AI Slide Factory 통합',
  phases,
  created_at: new Date().toISOString(),
  project_path: REPO,
  l5_approved: true, // ★ 자율 실행 — 사람 승인 게이트 없음
  complexity: 'C3',
  harness_mode: 'implement_verify',
  allowed_files: [], // 제한 없음(통합이 여러 디렉토리에 걸침)
  requires_approval: false,
};

console.log('[hf-cto] dispatching intent:', intent.l5_task_id, '→', REPO);
console.log('[hf-cto] phases:', phases.map((p) => p.name).join(' | '));
const summary = await dispatchToNativeOrchestrator(intent);
console.log('[hf-cto] DONE. summary =', JSON.stringify(summary));
