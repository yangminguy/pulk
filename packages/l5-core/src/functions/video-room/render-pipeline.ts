// CMO Video Room — Render pipeline domain logic (M4: 영상 제작 파이프라인 잔여).
//
// Covers the post-handoff segment of the video pipeline:
//   1. buildSlideDeckSpecFromBrief — VideoExecutionBrief를 "직접 참조"해 슬라이드덱 생성.
//   2. buildFactoryJobFromSlideDeck — 슬라이드덱 → factory 렌더 잡(jobs/<slug>.json 프로토콜).
//   3. deriveRenderJobStatus / reconcileRenderJob — 파일 기반 관찰값 → 렌더 잡 상태 폴링.
//   4. evaluateRenderArtifacts — 렌더 산출물(QA: 파일 존재·길이·해상도·메타) 검증.
//   5. buildYoutubeUploadDraftFromBrief — 업로드 "초안"(메타데이터)까지만.
//      실제 YouTube 업로드는 절대 수행하지 않는다(외부 액션 승인 게이트, visibility=private).
//
// Factory 파일 프로토콜 (ai-slide-video-factory, briefs/와 대칭):
//   - 입력 인박스:  ${VIDEO_FACTORY_DIR}/jobs/<file>.json   (transport.submitJob이 기록)
//   - 렌더 실행:    factory 쪽 `npm run render -- --job jobs/<file>.json` (사람/오케스트레이터)
//   - 출력:        ${VIDEO_FACTORY_DIR}/outputs/<job.slug>/
//                    video.mp4 · thumbnail.png · render_report.json · qa_report.md
//                    · youtube_metadata.json
//   상태는 별도 큐 없이 위 파일들의 존재로 도출한다(파일 기반 폴링).
//
// Pure functions; no internal randomUUID/Date. Filesystem 관찰은 plugin transport가
// 수행하고, 여기서는 관찰값(RenderJobObservation)만 받아 판단한다(도메인 로직 = l5-core).

import type {
  VideoExecutionBrief,
  BriefLogicBlock,
  VideoRoomSlideDeckSpec,
  SlideSpec,
  SlideVisualType,
  RenderJob,
  UploadDraft,
} from './types';
import { buildSlideDeckSpec } from './production';
import { completeRenderJob, failRenderJob } from './production';
import { createUploadDraft } from './review-publish';
import {
  buildFactoryVideoJob,
  FACTORY_MIN_SCENE_SECONDS,
  FACTORY_MAX_SCENE_SECONDS,
  type ScriptBeat,
  type FactoryVideoJob,
} from './script-factory';

// ── 1. Brief → SlideDeckSpec ─────────────────────────────────────────────────

export interface BuildSlideDeckSpecFromBriefIds {
  /** SlideDeckSpec id (caller-generated UUID). */
  id: string;
  video_project_id: string;
  /** Script draft record id (placeholder UUID 허용). */
  script_draft_id: string;
  /** Voice recording record id (placeholder UUID 허용). */
  voice_recording_id: string;
  design_theme?: string;
}

/** visual_intent_hint / role 텍스트에서 SlideVisualType을 결정론적으로 추론. */
export function inferSlideVisualType(block: BriefLogicBlock): SlideVisualType {
  const hint = `${block.visual_intent_hint ?? ''} ${block.role ?? ''}`.toLowerCase();
  if (/(compar|비교|vs)/.test(hint)) return 'comparison';
  if (/(quote|인용|후기)/.test(hint)) return 'quote';
  if (/(check|step|단계|체크)/.test(hint)) return 'checklist';
  if (/(framework|flow|구조|프레임)/.test(hint)) return 'framework';
  if (/(cta|행동|구매)/.test(hint)) return 'cta';
  return 'text';
}

/**
 * VideoExecutionBrief를 직접 참조해 VideoRoomSlideDeckSpec을 만든다.
 *
 * 슬라이드 구성(결정론):
 *   [0] 인트로 — headline=title, speaker_text=intro_30s(비면 core_message)
 *   [1..n] 논리블록별 1장 — headline=communication_goal, speaker_text=speaker_text,
 *          body=required_evidence 요약, visual_type=visual_intent_hint 추론
 *   [n+1] (pulling이고 bridge가 있으면) 브릿지 슬라이드
 *
 * aspect_ratio는 brief.constraints.format에서 매핑(youtube_16_9→16:9, shorts_9_16→9:16).
 * 검증은 기존 buildSlideDeckSpec을 그대로 통과시킨다(인덱스/headline/speaker_text).
 */
export function buildSlideDeckSpecFromBrief(
  brief: VideoExecutionBrief,
  ids: BuildSlideDeckSpecFromBriefIds,
): VideoRoomSlideDeckSpec {
  if (!brief.script?.logic_blocks || brief.script.logic_blocks.length === 0) {
    throw new Error('buildSlideDeckSpecFromBrief: brief.script.logic_blocks must not be empty');
  }

  const introSpeaker =
    (brief.script.intro_30s ?? '').trim() || (brief.strategy?.core_message ?? '').trim();
  if (!introSpeaker) {
    throw new Error(
      'buildSlideDeckSpecFromBrief: brief에 intro_30s/core_message가 모두 비어 있어 인트로 슬라이드를 만들 수 없습니다',
    );
  }

  const slides: SlideSpec[] = [
    {
      index: 0,
      headline: brief.title,
      body: brief.strategy?.core_message,
      visual_type: 'text',
      speaker_text: introSpeaker,
    },
  ];

  for (const block of brief.script.logic_blocks) {
    slides.push({
      index: slides.length,
      headline: (block.communication_goal ?? '').trim() || block.block_id,
      body:
        block.required_evidence && block.required_evidence.length > 0
          ? block.required_evidence.join(' · ')
          : undefined,
      visual_type: inferSlideVisualType(block),
      speaker_text: block.speaker_text,
      animation_hint: block.visual_intent_hint,
    });
  }

  const bridge = brief.strategy?.bridge_to_key_content?.trim();
  if (brief.content_type === 'pulling' && bridge) {
    slides.push({
      index: slides.length,
      headline: '다음 영상으로',
      body: bridge,
      visual_type: 'bridge',
      speaker_text: bridge,
    });
  }

  return buildSlideDeckSpec({
    id: ids.id,
    video_project_id: ids.video_project_id,
    script_draft_id: ids.script_draft_id,
    voice_recording_id: ids.voice_recording_id,
    aspect_ratio: brief.constraints?.format === 'shorts_9_16' ? '9:16' : '16:9',
    design_theme: ids.design_theme ?? 'default_deck',
    slides,
  });
}

// ── 2. SlideDeckSpec → Factory 렌더 잡 ────────────────────────────────────────

/** 한국어 나레이션 기준 글자수→초 추정(≈5.5자/초), factory 허용범위 [3,20]로 클램프. */
export function estimateSlideDurationSeconds(speakerText: string): number {
  const chars = (speakerText ?? '').trim().length;
  const raw = Math.round(chars / 5.5);
  return Math.min(FACTORY_MAX_SCENE_SECONDS, Math.max(FACTORY_MIN_SCENE_SECONDS, raw));
}

const VISUAL_TYPE_TO_SCENE_TYPE: Record<SlideVisualType, string> = {
  text: 'insight',
  comparison: 'comparison',
  framework: 'flow',
  quote: 'quote',
  checklist: 'steps',
  bridge: 'section',
  cta: 'cta',
};

/** SlideDeckSpec 슬라이드들을 factory ScriptBeat 목록으로 변환(첫 장은 hero). */
export function slideDeckSpecToScriptBeats(spec: VideoRoomSlideDeckSpec): ScriptBeat[] {
  return spec.slides.map((slide, i) => ({
    scene_id: `slide_${String(i + 1).padStart(2, '0')}`,
    scene_type: i === 0 ? 'hero' : VISUAL_TYPE_TO_SCENE_TYPE[slide.visual_type] ?? 'insight',
    rhythm_role: i === 0 ? ('hook' as const) : slide.visual_type === 'cta' ? ('cta' as const) : ('explain' as const),
    headline: slide.headline,
    speaker_text: slide.speaker_text,
    duration: estimateSlideDurationSeconds(slide.speaker_text),
    ...(slide.body ? { body: slide.body, subtitle: slide.body } : {}),
  }));
}

export interface BuildFactoryJobFromSlideDeckInput {
  /** Factory job slug base (예: slide_deck_spec_id). buildFactoryVideoJob이 l5- 접두어를 붙인다. */
  slug: string;
  title: string;
  format?: 'youtube_16_9' | 'shorts_9_16';
  theme?: string;
}

/**
 * SlideDeckSpec을 factory 호환 렌더 잡(plain object)으로 변환한다.
 * transport.submitJob이 이 객체를 ${VIDEO_FACTORY_DIR}/jobs/에 기록하고 validate한다.
 */
export function buildFactoryJobFromSlideDeck(
  spec: VideoRoomSlideDeckSpec,
  input: BuildFactoryJobFromSlideDeckInput,
): FactoryVideoJob {
  const beats = slideDeckSpecToScriptBeats(spec);
  return buildFactoryVideoJob({
    slug: input.slug,
    title: input.title,
    beats,
    format: input.format ?? (spec.aspect_ratio === '9:16' ? 'shorts_9_16' : 'youtube_16_9'),
    theme: input.theme,
  });
}

// ── 3. 파일 기반 렌더 상태 폴링 ───────────────────────────────────────────────

/** render_report.json에서 상태/QA 판단에 필요한 요약 필드만. */
export interface RenderReportSummary {
  totalSeconds?: number;
  sceneCount?: number;
  width?: number;
  height?: number;
  fps?: number;
  renderedAt?: string;
}

/** Plugin transport가 factory 디렉토리에서 수집한 파일 사실(facts). 판단은 여기서. */
export interface RenderJobObservation {
  job_file_exists: boolean;
  output_dir_exists: boolean;
  video_file_exists: boolean;
  video_size_bytes?: number;
  render_report_exists: boolean;
  render_report?: RenderReportSummary | null;
  qa_report_exists?: boolean;
  youtube_metadata_exists?: boolean;
  thumbnail_exists?: boolean;
  /** factory 렌더 실패 마커(outputs/<slug>/render_error.txt 등)가 있으면 true. */
  error_file_exists?: boolean;
  error_message?: string;
  /** 관찰 시점의 절대경로들(레퍼런스 기록용). */
  paths?: {
    job?: string;
    output_dir?: string;
    video?: string;
    thumbnail?: string;
    render_report?: string;
    qa_report?: string;
    youtube_metadata?: string;
  };
}

export type ObservedRenderStatus = 'not_found' | 'queued' | 'rendering' | 'completed' | 'failed';

/**
 * 관찰값 → 렌더 상태 도출(파일 기반 프로토콜).
 *   failed     에러 마커가 있을 때
 *   completed  video.mp4(>0 bytes) + render_report.json 둘 다 존재
 *   rendering  outputs/<slug>/ 디렉토리는 생겼지만 산출물이 아직 불완전
 *   queued     jobs/ 인박스에 잡 파일만 존재
 *   not_found  아무 흔적도 없음
 */
export function deriveRenderJobStatus(obs: RenderJobObservation): ObservedRenderStatus {
  if (obs.error_file_exists || (obs.error_message ?? '').trim() !== '') return 'failed';
  if (obs.video_file_exists && (obs.video_size_bytes ?? 0) > 0 && obs.render_report_exists) {
    return 'completed';
  }
  if (obs.output_dir_exists) return 'rendering';
  if (obs.job_file_exists) return 'queued';
  return 'not_found';
}

/** queued → rendering 전이(transport.submitJob 성공 직후 호출). */
export function markRenderJobSubmitted(job: RenderJob): RenderJob {
  if (job.status !== 'queued') {
    throw new Error('only queued jobs can be marked submitted');
  }
  return { ...job, status: 'rendering' };
}

/**
 * 폴링 관찰값을 RenderJob 상태머신에 반영한 새 RenderJob을 반환한다(입력 불변).
 *   - completed 관찰: queued/rendering → completed (산출물 ref들을 기록)
 *   - failed 관찰:    queued/rendering → failed
 *   - rendering 관찰: queued → rendering
 *   - 그 외(queued/not_found 관찰, 이미 terminal): 변경 없음
 */
export function reconcileRenderJob(
  job: RenderJob,
  obs: RenderJobObservation,
  now: string,
): RenderJob {
  if (job.status === 'completed' || job.status === 'failed') return job;

  const observed = deriveRenderJobStatus(obs);
  const asRendering: RenderJob = job.status === 'queued' ? { ...job, status: 'rendering' } : job;

  switch (observed) {
    case 'completed':
      return completeRenderJob(asRendering, {
        output_video_ref: obs.paths?.video ?? 'video.mp4',
        thumbnail_ref: obs.thumbnail_exists ? obs.paths?.thumbnail ?? 'thumbnail.png' : undefined,
        qa_report_ref: obs.qa_report_exists ? obs.paths?.qa_report ?? 'qa_report.md' : undefined,
        youtube_metadata_ref: obs.youtube_metadata_exists
          ? obs.paths?.youtube_metadata ?? 'youtube_metadata.json'
          : undefined,
        completed_at: now,
      });
    case 'failed':
      return failRenderJob(asRendering, obs.error_message ?? 'factory render failed');
    case 'rendering':
      return asRendering;
    default:
      return job;
  }
}

// ── 4. 렌더 산출물 QA ─────────────────────────────────────────────────────────

export interface RenderArtifactExpectation {
  format?: 'youtube_16_9' | 'shorts_9_16';
  /** 영상 총 길이 허용범위(초). 기본 10초~30분. */
  min_total_seconds?: number;
  max_total_seconds?: number;
}

export type RenderArtifactCheck = 'pass' | 'fail';

export interface RenderArtifactQa {
  result: 'pass' | 'fail';
  checks: {
    video_file: RenderArtifactCheck;
    render_report: RenderArtifactCheck;
    duration_in_range: RenderArtifactCheck;
    resolution_matches_format: RenderArtifactCheck;
    upload_metadata_present: RenderArtifactCheck;
  };
  issues: string[];
}

/**
 * 렌더 결과 파일들을 검증한다(영상 QA — 결정론):
 *   video_file               video.mp4 존재 + 0바이트 아님
 *   render_report            render_report.json 존재 + 파싱됨
 *   duration_in_range        report.totalSeconds가 기대범위 안
 *   resolution_matches_format report width/height가 format과 일치
 *   upload_metadata_present  youtube_metadata.json 존재
 */
export function evaluateRenderArtifacts(
  obs: RenderJobObservation,
  expected: RenderArtifactExpectation = {},
): RenderArtifactQa {
  const issues: string[] = [];

  const videoOk = obs.video_file_exists && (obs.video_size_bytes ?? 0) > 0;
  if (!videoOk) issues.push('video.mp4가 없거나 0바이트입니다');

  const report = obs.render_report ?? null;
  const reportOk = obs.render_report_exists && report !== null;
  if (!reportOk) issues.push('render_report.json이 없거나 파싱되지 않았습니다');

  const min = expected.min_total_seconds ?? 10;
  const max = expected.max_total_seconds ?? 1800;
  const total = report?.totalSeconds ?? 0;
  const durationOk = reportOk && total >= min && total <= max;
  if (reportOk && !durationOk) {
    issues.push(`영상 길이 ${total}s가 허용범위 [${min}s, ${max}s]를 벗어났습니다`);
  }

  let resolutionOk: boolean;
  if (!reportOk) {
    resolutionOk = false;
  } else if (expected.format === 'shorts_9_16') {
    resolutionOk = report!.width === 1080 && report!.height === 1920;
  } else if (expected.format === 'youtube_16_9') {
    resolutionOk = report!.width === 1920 && report!.height === 1080;
  } else {
    resolutionOk = (report!.width ?? 0) > 0 && (report!.height ?? 0) > 0;
  }
  if (reportOk && !resolutionOk) {
    issues.push(
      `해상도 ${report!.width}x${report!.height}가 format(${expected.format ?? 'any'})과 맞지 않습니다`,
    );
  }

  const metadataOk = obs.youtube_metadata_exists === true;
  if (!metadataOk) issues.push('youtube_metadata.json이 없습니다');

  const checks: RenderArtifactQa['checks'] = {
    video_file: videoOk ? 'pass' : 'fail',
    render_report: reportOk ? 'pass' : 'fail',
    duration_in_range: durationOk ? 'pass' : 'fail',
    resolution_matches_format: resolutionOk ? 'pass' : 'fail',
    upload_metadata_present: metadataOk ? 'pass' : 'fail',
  };

  return {
    result: Object.values(checks).every((c) => c === 'pass') ? 'pass' : 'fail',
    checks,
    issues,
  };
}

// ── 5. YouTube 업로드 "초안" (실제 업로드 절대 금지) ──────────────────────────

export interface BuildUploadDraftFromBriefIds {
  id: string;
  video_project_id: string;
  render_job_id: string;
}

export interface BuildUploadDraftFromBriefOptions {
  thumbnail_ref?: string;
}

/** 제목에서 결정론적으로 태그 후보를 뽑는다(2자 이상 토큰, 최대 8개). */
function tagsFromTitle(title: string): string[] {
  return (title ?? '')
    .split(/[\s,/|·\-—:!?()[\]{}"']+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 8);
}

/**
 * VideoExecutionBrief에서 YouTube 업로드 초안(제목/설명/태그)을 생성한다.
 *
 * 초안 생성까지만 — 실제 업로드는 외부 고객 대상 액션이라 승인 게이트 뒤에서
 * 사람이 수행한다. createUploadDraft가 visibility='private', approval_status='pending'
 * 을 강제하므로 이 함수의 산출물로는 어떤 외부 전송도 일어나지 않는다.
 */
export function buildYoutubeUploadDraftFromBrief(
  brief: VideoExecutionBrief,
  ids: BuildUploadDraftFromBriefIds,
  opts: BuildUploadDraftFromBriefOptions = {},
): UploadDraft {
  const lines: string[] = [brief.strategy?.core_message ?? ''];
  const intro = (brief.script?.intro_30s ?? '').trim();
  if (intro) lines.push('', intro);
  const bridge = (brief.strategy?.bridge_to_key_content ?? '').trim();
  if (bridge) lines.push('', `다음 영상: ${bridge}`);

  const tags = Array.from(
    new Set([
      brief.content_type === 'key' ? '키콘텐츠' : '풀링콘텐츠',
      ...(brief.strategy?.covered_stages ?? []),
      ...tagsFromTitle(brief.title),
    ]),
  ).slice(0, 15);

  return createUploadDraft({
    id: ids.id,
    video_project_id: ids.video_project_id,
    render_job_id: ids.render_job_id,
    title: brief.title,
    description: lines.join('\n').trim(),
    tags,
    thumbnail_ref: opts.thumbnail_ref,
  });
}
