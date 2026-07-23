// CMO Video Room — Visual storyboard planner (음성-우선 컷 편집 1차 슬라이스).
//
// 오디오 EDL(narration-retake-edit.buildEditPlan)이 만든 "살릴 구간" 타임라인 위에
// 구간(문장)별 비주얼 계획을 얹는다. 각 씬은 다음 중 하나로 결정된다:
//   - source_footage   : 유튜브/웹에서 발굴한 소스 클립(섹션별 소스 풀에서 결정론적 라운드로빈)
//   - stock_ai_image   : 스톡/AI 이미지(무드·개념 컷)
//   - hyperframes_clip : 단계 라벨 등 고급 모션그래픽 (factory hyperframes-runner로 렌더할 클립)
//
// HyperFrames는 "엔진 교체"가 아니라 특정 씬에 삽입하는 모션그래픽 클립 생성기다
// (기존 ai-slide-video-factory/docs/HYPERFRAMES_INTEGRATION.md 설계 계승).
//
// 순수 함수 — no Date/randomUUID/fs. 전사·ffmpeg·소싱 fetch·HF 렌더는 스크립트(주입)가 한다.
// 내레이션 EDL 타임라인이 단일 진실이므로, 비주얼 duration은 여기 종속된다.

export type StoryboardVisualKind = 'source_footage' | 'stock_ai_image' | 'hyperframes_clip';

/** 발굴한 소스 영상(유튜브/웹). build_storyboard.py의 SOURCES와 동형. */
export interface StoryboardSource {
  id: string;
  channel: string;
  url: string;
  duration_sec: number;
}

/** 기획 입력 단위 씬(내레이션 EDL에서 파생된 문장). 타이밍은 EDL이 준다. */
export interface StoryboardInputScene {
  section: string;
  /** 사람이 읽는 원고 문장(정규화 전 원문). */
  script: string;
  start_sec: number;
  duration_sec: number;
  /** 원고의 굵은 단계 takeaway 라인 여부 → HyperFrames 모션그래픽. */
  is_step_label?: boolean;
  /** 단계 번호(1~5). is_step_label일 때. */
  step_index?: number;
  /** 원고 괄호 안 연출 지시(모션 노트). 그대로 화면에 쓰지 말라는 지시 포함 가능. */
  motion_note?: string;
  /** 개념/무드 컷 강제(스톡/AI 이미지). */
  prefer_stock_image?: boolean;
}

export interface BuildVisualStoryboardInput {
  title: string;
  scenes: StoryboardInputScene[];
  sources: StoryboardSource[];
  /** 섹션명 → 그 섹션에서 순서대로 돌려쓸 소스 id 풀. build_storyboard.py의 SECTION_IDS와 동형. */
  sectionSources: Record<string, string[]>;
  /** 소스 클립에서 잘라 쓸 시작점 후보(초). 없으면 2초 간격 결정론 생성. */
  sourceStarts?: Record<string, number[]>;
}

export interface StoryboardScene {
  index: number;
  section: string;
  script: string;
  start_sec: number;
  duration_sec: number;
  visual_kind: StoryboardVisualKind;
  /** source_footage일 때. */
  source_id?: string;
  source_channel?: string;
  source_url?: string;
  source_start_sec?: number;
  /** hyperframes_clip일 때. factory 템플릿(roadmap 계열 = 누적 단계 스택). */
  hyperframes_template?: string;
  step_index?: number;
  motion_note?: string;
  presenter_composite: boolean;
}

export interface VisualStoryboard {
  title: string;
  scenes: StoryboardScene[];
  total_sec: number;
  /** 이 스토리보드가 실제로 참조한 소스만. */
  sources: StoryboardSource[];
  /** 사람이 확인할 지점(저작권·미해결 소스 등). */
  flags: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 소스 클립 시작점을 결정론적으로 고른다. sourceStarts가 있으면 그 후보를 순환,
 * 없으면 2초 간격으로 (duration 안에서) 생성. pickIndex로 회차를 돌린다.
 */
function pickSourceStart(
  source: StoryboardSource,
  pickIndex: number,
  sourceStarts?: Record<string, number[]>,
): number {
  const explicit = sourceStarts?.[source.id];
  if (explicit && explicit.length > 0) {
    return explicit[pickIndex % explicit.length];
  }
  // 소스 앞 2초는 인트로일 확률 → 2초부터 2초 간격, duration-4까지.
  const span = Math.max(0, source.duration_sec - 4);
  const slots = Math.max(1, Math.floor(span / 2));
  const slot = pickIndex % slots;
  return round2(2 + slot * 2);
}

/**
 * 오디오 EDL 파생 씬들에 비주얼을 배정한다.
 *
 * 규칙:
 *  1. is_step_label → hyperframes_clip (누적 단계 스택 모션). 단계 텍스트를 화면에 그대로 쓰지
 *     않는다는 원고 지시는 motion_note로 보존(렌더러가 존중).
 *  2. prefer_stock_image → stock_ai_image.
 *  3. 그 외 → source_footage. 섹션 소스 풀에서 씬 등장 순서대로 라운드로빈(결정론).
 *     풀이 비었으면 stock_ai_image로 폴백하고 flag.
 *  타임라인 검증: 씬은 start_sec 오름차순이어야 하고 겹치면 flag(내레이션이 단일 진실).
 */
export function buildVisualStoryboard(input: BuildVisualStoryboardInput): VisualStoryboard {
  const byId = new Map(input.sources.map((s) => [s.id, s]));
  const usedSourceIds = new Set<string>();
  const flags: string[] = [];
  // 섹션별 라운드로빈 커서.
  const cursor = new Map<string, number>();

  let prevEnd = -Infinity;
  const scenes: StoryboardScene[] = input.scenes.map((sc, i) => {
    if (sc.start_sec < prevEnd - 0.05) {
      flags.push(`씬 ${i + 1} 타임라인 역행/겹침: start=${sc.start_sec}s < prevEnd=${round2(prevEnd)}s`);
    }
    prevEnd = sc.start_sec + sc.duration_sec;

    const base: StoryboardScene = {
      index: i + 1,
      section: sc.section,
      script: sc.script,
      start_sec: round2(sc.start_sec),
      duration_sec: round2(sc.duration_sec),
      visual_kind: 'source_footage',
      presenter_composite: false,
    };

    if (sc.is_step_label) {
      return {
        ...base,
        visual_kind: 'hyperframes_clip',
        hyperframes_template: 'roadmap', // 누적 단계 스택(이전 단계 위로, 새 단계 등장)
        step_index: sc.step_index,
        motion_note:
          sc.motion_note ??
          '누적 단계 스택 모션(이전 단계가 위로, 이번 단계 등장). 단계 문구를 화면에 그대로 적지 않음.',
      };
    }

    if (sc.prefer_stock_image) {
      return { ...base, visual_kind: 'stock_ai_image', motion_note: sc.motion_note };
    }

    const pool = input.sectionSources[sc.section] ?? [];
    if (pool.length === 0) {
      flags.push(`씬 ${i + 1} 섹션 '${sc.section}' 소스 풀 없음 → 스톡/AI 이미지 폴백`);
      return { ...base, visual_kind: 'stock_ai_image', motion_note: sc.motion_note };
    }
    const c = cursor.get(sc.section) ?? 0;
    cursor.set(sc.section, c + 1);
    const sourceId = pool[c % pool.length];
    const src = byId.get(sourceId);
    if (!src) {
      flags.push(`씬 ${i + 1} 소스 id '${sourceId}' 미상 → 스톡/AI 이미지 폴백`);
      return { ...base, visual_kind: 'stock_ai_image', motion_note: sc.motion_note };
    }
    usedSourceIds.add(src.id);
    return {
      ...base,
      source_id: src.id,
      source_channel: src.channel,
      source_url: src.url,
      source_start_sec: pickSourceStart(src, c, input.sourceStarts),
      motion_note: sc.motion_note,
    };
  });

  const total = scenes.reduce((m, s) => Math.max(m, s.start_sec + s.duration_sec), 0);
  return {
    title: input.title,
    scenes,
    total_sec: round2(total),
    sources: input.sources.filter((s) => usedSourceIds.has(s.id)),
    flags,
  };
}

/** 사람이 읽는 스토리보드 마크다운(기존 storyboard.md 포맷 계승). */
export function renderStoryboardMarkdown(sb: VisualStoryboard): string {
  const lines: string[] = [];
  lines.push(`# ${sb.title} — 비주얼 스토리보드`);
  lines.push('');
  lines.push('- 화면 소스 표기: `source_footage : 채널명` / `hyperframes_clip` / `stock_ai_image`');
  lines.push('- 타이밍은 rec10 내레이션 EDL(실측)에서 파생');
  lines.push(`- 총 길이(러프): ${sb.total_sec}초 · 씬 ${sb.scenes.length}개`);
  lines.push('');
  if (sb.flags.length > 0) {
    lines.push('## ⚠︎ 확인 필요');
    for (const f of sb.flags) lines.push(`- ${f}`);
    lines.push('');
  }
  let section = '';
  for (const s of sb.scenes) {
    if (s.section !== section) {
      section = s.section;
      lines.push(`## ${section}`);
      lines.push('');
    }
    lines.push(`### ${String(s.index).padStart(3, '0')} · ${s.start_sec}초 (${s.duration_sec}초)`);
    lines.push('');
    lines.push(`- 원고: ${s.script}`);
    if (s.visual_kind === 'hyperframes_clip') {
      lines.push(`- 화면: hyperframes_clip (템플릿: ${s.hyperframes_template}${s.step_index ? `, ${s.step_index}단계` : ''})`);
      if (s.motion_note) lines.push(`- 모션: ${s.motion_note}`);
    } else if (s.visual_kind === 'stock_ai_image') {
      lines.push('- 화면: stock_ai_image (스톡/AI 이미지)');
      if (s.motion_note) lines.push(`- 모션: ${s.motion_note}`);
    } else {
      lines.push(`- 화면: source_footage`);
      lines.push(`- 소스: ${s.source_channel}`);
      lines.push(`- 원본: ${s.source_url}`);
      lines.push(`- 원본 시작점: ${s.source_start_sec}초`);
    }
    lines.push(`- 진행자 합성: ${s.presenter_composite ? '예' : '아니오'}`);
    lines.push('');
  }
  return lines.join('\n');
}
