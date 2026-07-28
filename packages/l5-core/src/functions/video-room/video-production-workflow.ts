import { createHash } from 'node:crypto';
import type { BriefLogicBlock, VideoExecutionBrief } from './types';

export const VIDEO_PRODUCTION_ARTIFACTS = [
  '01_content_brief',
  '02_scene_plan',
  '02_slide_fragments',
  '03_media_manifest',
  '04_rough_cut_plan',
  '05_asset_manifest',
  '06_motion_plan',
  '07_sound_plan',
  '08_caption_plan',
  'storyboard_manifest',
  'storyboard',
  '09_factory_job',
  'pilot_qa',
  '10_qa_report',
] as const;

export type VideoProductionArtifactType = (typeof VIDEO_PRODUCTION_ARTIFACTS)[number];
export type VideoProductionSkillStatus = 'queued' | 'running' | 'completed' | 'blocked' | 'failed';
export type VideoProductionRunStatus =
  | 'planning'
  | 'storyboard_review'
  | 'pilot_rendering'
  | 'pilot_review'
  | 'final_rendering'
  | 'completed'
  | 'blocked'
  | 'failed';

export interface ProductionArtifactEnvelope<T = unknown> {
  schema_version: 'video_production_v1';
  artifact_type: VideoProductionArtifactType;
  project_id: string;
  run_id: string;
  version: number;
  source_versions: Record<string, number>;
  status: 'draft' | 'approved' | 'blocked';
  issues: string[];
  generated_by: string;
  checksum: string;
  data: T;
}

export interface VideoProductionRun {
  id: string;
  project_id: string;
  slug: string;
  source_media_ref: string;
  status: VideoProductionRunStatus;
  current_skill: string | null;
  progress: number;
  blocker: string | null;
  active_versions: Partial<Record<VideoProductionArtifactType, number>>;
  storyboard_approved_at: string | null;
  pilot_approved_at: string | null;
  factory_slug: string | null;
  created_at: string;
  updated_at: string;
}

export type StoryboardDecision = 'approved' | 'needs_revision' | 'hold';
export type FeedbackScope = 'scene' | 'project' | 'global';

export interface StoryboardSceneFeedback {
  scene_id: string;
  decision: StoryboardDecision;
  note?: string;
  scope?: FeedbackScope;
}

export interface StoryboardScene {
  scene_id: string;
  script_block_ids: string[];
  start_sec: number;
  end_sec: number;
  spoken_text: string;
  role: string;
  assertion: string;
  evidence: string;
  visual_mode: 'talking_head' | 'screen_recording' | 'screenshot' | 'broll' | 'image' | 'graphic' | 'caption_only';
  preferred_scene_type: string;
  composition: string;
  motion: { entrance: string; explain: string; hold: string; exit: string };
  transition: string;
  caption: string;
  asset_status: 'ready' | 'review' | 'blocked';
  asset_provenance: string;
  qa_risks: string[];
  slideability: number;
}

export interface StoryboardManifest {
  schema_version: 'storyboard_v1';
  run_id: string;
  project_id: string;
  title: string;
  source_media_ref: string;
  audio_ref?: string;
  duration_sec: number;
  coverage: number;
  blockers: string[];
  scenes: StoryboardScene[];
}

export interface ApprovalReceipt {
  run_id: string;
  artifact_type: 'storyboard' | 'pilot_qa';
  version: number;
  checksum: string;
  approved_at: string;
  approved_by: 'founder';
}

const ROLE_BY_TEXT: Array<[RegExp, string]> = [
  [/(훅|hook|문제 제기)/i, 'Hook'],
  [/(사례|example|case)/i, 'Example'],
  [/(증거|proof|근거)/i, 'Proof'],
  [/(과정|단계|process|step)/i, 'Process'],
  [/(cta|행동|신청|구매)/i, 'CTA'],
];

function sha(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nonEmpty(value: string, field: string): string {
  const clean = String(value ?? '').trim();
  if (!clean) throw new Error(`${field} must not be empty`);
  return clean;
}

function sceneRole(block: BriefLogicBlock, index: number, count: number): string {
  const haystack = `${block.role ?? ''} ${block.communication_goal ?? ''}`;
  const matched = ROLE_BY_TEXT.find(([pattern]) => pattern.test(haystack));
  if (matched) return matched[1];
  if (index === 0) return 'Hook';
  if (index === count - 1) return 'CTA';
  return 'Claim';
}

function visualMode(block: BriefLogicBlock): StoryboardScene['visual_mode'] {
  const hint = `${block.visual_intent_hint ?? ''} ${block.required_evidence?.join(' ') ?? ''}`.toLowerCase();
  if (/(화면|screen|ui)/.test(hint)) return 'screen_recording';
  if (/(스크린샷|screenshot)/.test(hint)) return 'screenshot';
  if (/(사례|사진|image)/.test(hint)) return 'image';
  if (/(영상|b-roll|broll)/.test(hint)) return 'broll';
  if (/(얼굴|talking)/.test(hint)) return 'talking_head';
  return 'graphic';
}

function preferredSceneType(block: BriefLogicBlock, role: string): string {
  const hint = `${block.visual_intent_hint ?? ''} ${block.role ?? ''}`.toLowerCase();
  if (/(비교|compare|vs)/.test(hint)) return 'comparison';
  if (/(과정|단계|flow|step)/.test(hint)) return 'steps';
  if (/(숫자|metric|data|통계)/.test(hint)) return 'metric_cards';
  if (role === 'Hook') return 'hero';
  if (role === 'CTA') return 'cta';
  return 'insight';
}

export function createVideoProductionRun(input: {
  id: string;
  project_id: string;
  slug: string;
  source_media_ref: string;
  now: string;
}): VideoProductionRun {
  return {
    id: nonEmpty(input.id, 'id'),
    project_id: nonEmpty(input.project_id, 'project_id'),
    slug: nonEmpty(input.slug, 'slug'),
    source_media_ref: nonEmpty(input.source_media_ref, 'source_media_ref'),
    status: 'planning',
    current_skill: 'video-content-brief',
    progress: 0,
    blocker: null,
    active_versions: {},
    storyboard_approved_at: null,
    pilot_approved_at: null,
    factory_slug: null,
    created_at: input.now,
    updated_at: input.now,
  };
}

export function makeProductionArtifact<T>(input: Omit<ProductionArtifactEnvelope<T>, 'schema_version' | 'checksum'>): ProductionArtifactEnvelope<T> {
  const base = { ...input, schema_version: 'video_production_v1' as const };
  return { ...base, checksum: sha(base) };
}

export function buildStoryboardManifest(input: {
  run: VideoProductionRun;
  brief: VideoExecutionBrief;
  secondsPerCharacter?: number;
}): StoryboardManifest {
  const blocks = input.brief.script.logic_blocks;
  if (!blocks.length) throw new Error('storyboard requires at least one logic block');
  const secondsPerCharacter = input.secondsPerCharacter ?? 1 / 5.5;
  let cursor = 0;
  const scenes = blocks.map((block, index): StoryboardScene => {
    const spoken = nonEmpty(block.speaker_text, `logic_blocks[${index}].speaker_text`);
    const duration = Math.max(3, Math.round(spoken.length * secondsPerCharacter * 10) / 10);
    const role = sceneRole(block, index, blocks.length);
    const mode = visualMode(block);
    const start = cursor;
    cursor += duration;
    const evidence = block.required_evidence?.filter(Boolean).join(' · ') || '승인 원고와 시각 구조';
    return {
      scene_id: `scene_${String(index + 1).padStart(2, '0')}`,
      script_block_ids: [block.block_id],
      start_sec: start,
      end_sec: cursor,
      spoken_text: spoken,
      role,
      assertion: nonEmpty(block.communication_goal, `logic_blocks[${index}].communication_goal`),
      evidence,
      visual_mode: mode,
      preferred_scene_type: preferredSceneType(block, role),
      composition: mode === 'talking_head' ? '발표자 가로 프레임 유지 + 핵심어 최소 강조' : `${evidence}를 하나의 관계 구조로 시각화`,
      motion: {
        entrance: '0.25–0.6초 안에 핵심 구조 진입',
        explain: '발화 의미 beat에 맞춰 한 단계씩 설명',
        hold: '설명 완료 후 정지 상태 유지',
        exit: '다음 의미 전환에서만 짧게 퇴장',
      },
      transition: index === blocks.length - 1 ? 'cut' : 'fade_scale 0.5s',
      caption: spoken,
      asset_status: mode === 'graphic' || mode === 'talking_head' ? 'ready' : 'review',
      asset_provenance: mode === 'talking_head' ? input.run.source_media_ref : 'Factory component or reviewed source asset',
      qa_risks: mode === 'graphic' ? [] : ['asset relevance review'],
      slideability: Math.min(100, 70 + (block.required_evidence?.length ?? 0) * 10),
    };
  });
  const covered = new Set(scenes.flatMap((scene) => scene.script_block_ids));
  return {
    schema_version: 'storyboard_v1',
    run_id: input.run.id,
    project_id: input.run.project_id,
    title: input.brief.title,
    source_media_ref: input.run.source_media_ref,
    duration_sec: cursor,
    coverage: covered.size / blocks.length,
    blockers: scenes.filter((scene) => scene.asset_status === 'blocked').map((scene) => `${scene.scene_id}: asset blocked`),
    scenes,
  };
}

export function approvalReceipt(input: Omit<ApprovalReceipt, 'approved_by'>): ApprovalReceipt {
  return { ...input, approved_by: 'founder' };
}

export function assertCanAssembleFactoryJob(receipt: ApprovalReceipt | null | undefined, artifact: ProductionArtifactEnvelope): void {
  if (!receipt || receipt.artifact_type !== 'storyboard') throw new Error('storyboard approval is required before factory assembly');
  if (receipt.run_id !== artifact.run_id || receipt.version !== artifact.version || receipt.checksum !== artifact.checksum) {
    throw new Error('storyboard approval does not match the active artifact version');
  }
}

export function assertCanSubmitFinalRender(input: { storyboard: ApprovalReceipt | null | undefined; pilot: ApprovalReceipt | null | undefined; run_id: string }): void {
  if (!input.storyboard || input.storyboard.run_id !== input.run_id) throw new Error('storyboard approval is required before final render');
  if (!input.pilot || input.pilot.run_id !== input.run_id || input.pilot.artifact_type !== 'pilot_qa') {
    throw new Error('pilot approval is required before final render');
  }
}

export function routeStoryboardFeedback(feedback: StoryboardSceneFeedback): string[] {
  const note = `${feedback.note ?? ''}`.toLowerCase();
  if (/(자막|caption|줄바꿈)/.test(note)) return ['video-caption-designer', 'storyboard-composer'];
  if (/(음악|효과음|sound|소리)/.test(note)) return ['video-sound-designer', 'storyboard-composer'];
  if (/(모션|전환|animation|motion)/.test(note)) return ['video-motion-graphics', 'storyboard-composer'];
  if (/(이미지|영상|자산|asset|b-roll)/.test(note)) return ['video-asset-director', 'storyboard-composer'];
  if (/(원고|의미|주장|구조)/.test(note)) return ['video-scene-planner', 'video-slide-worker', 'storyboard-composer'];
  return ['video-slide-worker', 'storyboard-composer'];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function timecode(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function composeStoryboardHtml(manifest: StoryboardManifest): string {
  const scenes = manifest.scenes.map((scene) => `
    <article class="scene" id="${escapeHtml(scene.scene_id)}" data-scene-id="${escapeHtml(scene.scene_id)}">
      <header><span>${escapeHtml(scene.scene_id)} · ${escapeHtml(scene.role)}</span><b>${timecode(scene.start_sec)}–${timecode(scene.end_sec)}</b></header>
      <div class="preview ${escapeHtml(scene.preferred_scene_type)}">
        <small>${escapeHtml(scene.visual_mode)}</small><h2>${escapeHtml(scene.assertion)}</h2><p>${escapeHtml(scene.evidence)}</p><i></i>
      </div>
      <button type="button" class="replay">모션 다시보기</button>
      <dl><dt>읽히는 원고</dt><dd>${escapeHtml(scene.spoken_text)}</dd><dt>화면 구성</dt><dd>${escapeHtml(scene.composition)}</dd><dt>모션</dt><dd>${escapeHtml(scene.motion.entrance)} → ${escapeHtml(scene.motion.explain)} → ${escapeHtml(scene.motion.hold)}</dd><dt>전환</dt><dd>${escapeHtml(scene.transition)}</dd><dt>자산 출처</dt><dd>${escapeHtml(scene.asset_provenance)}</dd></dl>
      <div class="caption">${escapeHtml(scene.caption)}</div>
    </article>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(manifest.title)} Storyboard</title><style>
  :root{color-scheme:dark;--cream:#dcdbce;--orange:#e5511f;--muted:rgba(220,219,206,.62)}*{box-sizing:border-box}body{margin:0;background:#090909;color:var(--cream);font-family:Pretendard,system-ui,sans-serif}.wrap{width:min(1120px,94vw);margin:auto;padding:48px 0 96px}.hero{padding:20px 0 36px;border-bottom:1px solid #333}.hero h1{font-size:clamp(32px,6vw,72px);line-height:1.02;margin:8px 0}.meta{color:var(--muted)}.scene{position:relative;padding:44px 0 64px;border-bottom:1px solid #292929}.scene header{display:flex;justify-content:space-between;font:13px ui-monospace;color:var(--muted);margin-bottom:12px}.preview{aspect-ratio:16/9;background:#000;border:1px solid #333;padding:9%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;overflow:hidden;position:relative}.preview small{font:12px ui-monospace;text-transform:uppercase;color:var(--muted)}.preview h2{font-size:clamp(28px,5vw,64px);max-width:850px;margin:22px 0 10px;word-break:keep-all}.preview p{font-size:clamp(15px,2vw,24px);color:var(--muted);max-width:700px}.preview i{position:absolute;width:44px;height:44px;background:var(--orange);left:8%;bottom:9%;animation:pulse 1.2s ease-out both}.scene.play .preview h2{animation:rise .55s ease-out both}.scene.play .preview p{animation:rise .55s .22s ease-out both}.scene.play .preview i{animation:sweep .8s .42s ease-out both}.replay{margin:12px 0 4px;border:1px solid #555;background:transparent;color:var(--cream);padding:8px 12px;cursor:pointer}dl{display:grid;grid-template-columns:130px 1fr;gap:8px 18px;font-size:14px}dt{color:var(--muted)}dd{margin:0}.caption{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);background:rgba(0,0,0,.86);padding:8px 14px;border-radius:6px;max-width:76%;text-align:center;font-weight:700;word-break:keep-all}@keyframes rise{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}@keyframes sweep{from{transform:translateX(-30px) scaleX(.4);opacity:0}to{transform:none;opacity:1}}@keyframes pulse{from{opacity:0}to{opacity:1}}@media(max-width:640px){dl{grid-template-columns:1fr}.caption{font-size:12px}}
  </style></head><body><main class="wrap"><section class="hero"><span class="meta">ANIMATED STORYBOARD · ${Math.round(manifest.duration_sec)}초 · COVERAGE ${Math.round(manifest.coverage * 100)}%</span><h1>${escapeHtml(manifest.title)}</h1><p class="meta">승인 전에는 Factory job과 렌더가 생성되지 않습니다.</p></section>${scenes}</main><script>
  const replay=(scene)=>{scene.classList.remove('play');void scene.offsetWidth;scene.classList.add('play')};document.querySelectorAll('.replay').forEach(b=>b.addEventListener('click',()=>replay(b.closest('.scene'))));const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)replay(e.target)}),{threshold:.45});document.querySelectorAll('.scene').forEach(s=>io.observe(s));
  </script></body></html>`;
}
