// image-sourcing.ts — 썸네일 9개 A/B PRD §5/§7: 이미지 소스 수집 + 위험도·출처.
// 사장님 결정: 외부 자동 수집(무료/구글/뉴스) + 출처·라이선스·위험도 기록. "내 영상 캡처" 제외.
// 실제 외부 스크래퍼/검색은 엣지에서 어댑터로 주입(미주입 시 manual 폴백 — viewtrap reference-adapters 선례).
// 도메인(위험도 분류·출처표기)은 순수·결정론.

import { z } from 'zod';

// 소스 유형(§7-1) — "내 영상 캡처(self video capture)"는 사장님 지시로 제외.
export const IMAGE_SOURCE_TYPES = ['self_photo', 'free_stock', 'cc_license', 'google_image', 'news_blog'] as const;
export type ImageSourceType = (typeof IMAGE_SOURCE_TYPES)[number];

// 위험도(§7-3).
export const IMAGE_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type ImageRiskLevel = (typeof IMAGE_RISK_LEVELS)[number];

export const ImageSourceSchema = z.object({
  image_id: z.string().min(1),
  source_type: z.enum(IMAGE_SOURCE_TYPES),
  source_url: z.string().min(1),
  source_page_title: z.string().optional(),
  creator_or_owner: z.string().optional(),
  license: z.string().optional(),
  commercial_use_allowed: z.boolean().optional(),
  modification_allowed: z.boolean().optional(),
  attribution_required: z.boolean().optional(),
  risk_level: z.enum(IMAGE_RISK_LEVELS),
  attribution_text: z.string().optional(),
  usage_note: z.string().optional(),
});
export type ImageSource = z.infer<typeof ImageSourceSchema>;

export interface ClassifyImageRiskInput {
  source_type: ImageSourceType;
  /** 상업 사용 명시 불가/금지면 위험도 상향. */
  commercial_use_allowed?: boolean;
  /** 사생활·미성년자·명백 침해 등 민감 신호 → Critical(사용 금지). */
  sensitive?: boolean;
}

/**
 * §7-3 위험도 분류(결정론).
 *  - critical: 민감 이미지 → 사용 금지.
 *  - low: 직접 촬영(self_photo).
 *  - medium: 무료/CC(상업 가능).  high: 무료/CC인데 상업 불가, 또는 구글/뉴스(권리 불명확).
 */
export function classifyImageRisk(input: ClassifyImageRiskInput): ImageRiskLevel {
  if (input.sensitive) return 'critical';
  switch (input.source_type) {
    case 'self_photo':
      return 'low';
    case 'free_stock':
    case 'cc_license':
      return input.commercial_use_allowed === false ? 'high' : 'medium';
    case 'google_image':
    case 'news_blog':
      return 'high';
    default:
      return 'high';
  }
}

/** §7-4 출처 표기 블록 — 영상 설명란 하단에 자동 삽입. Critical(사용 금지)은 제외. */
export function buildAttributionBlock(sources: ImageSource[]): string {
  const usable = sources.filter((s) => s.risk_level !== 'critical');
  const lines = usable.map((s, i) => {
    const owner = s.creator_or_owner ?? '출처 미상';
    const note = s.license ?? s.source_page_title ?? '';
    return `- Image ${i + 1}: ${owner} / ${s.source_url}${note ? ` / ${note}` : ''}`;
  });
  return [
    '[이미지 출처]',
    ...lines,
    '',
    '본 영상의 썸네일 및 자료 이미지는 출처를 확인하여 사용했으며, 문제가 있을 경우 확인 후 즉시 수정하겠습니다.',
  ].join('\n');
}

// ── 수집 어댑터(외부 스크래퍼/검색 주입) ────────────────────────────────────

export interface RawImageHit {
  source_type: ImageSourceType;
  source_url: string;
  source_page_title?: string;
  creator_or_owner?: string;
  license?: string;
  commercial_use_allowed?: boolean;
  modification_allowed?: boolean;
  sensitive?: boolean;
}

export interface ImageSearchAdapter {
  /** 쿼리로 후보 이미지를 검색. 실 구현(구글/뉴스/무료 사이트)은 엣지에서 주입. */
  search(query: string, limit: number): Promise<RawImageHit[]>;
}

export interface CollectImageSourcesDeps {
  adapter?: ImageSearchAdapter;
  /** 결정론 id 부여용 prefix(테스트). 미지정 시 index 기반. */
  idPrefix?: string;
}

/**
 * 쿼리로 이미지 소스를 수집하고, 각 후보에 위험도·출처표기를 자동 부여한다.
 * 어댑터 미주입 시 빈 배열(manual 입력 흐름으로 폴백). Critical은 attribution에서 제외되지만
 * 기록은 남긴다(usage_note에 사용 금지 표시).
 */
export async function collectImageSources(
  query: string,
  limit: number,
  deps: CollectImageSourcesDeps = {},
): Promise<ImageSource[]> {
  if (!deps.adapter) return [];
  const hits = await deps.adapter.search(query, limit);
  const prefix = deps.idPrefix ?? 'img';
  return hits.map((h, i) => {
    const risk = classifyImageRisk({
      source_type: h.source_type,
      commercial_use_allowed: h.commercial_use_allowed,
      sensitive: h.sensitive,
    });
    const src: ImageSource = {
      image_id: `${prefix}-${i + 1}`,
      source_type: h.source_type,
      source_url: h.source_url,
      source_page_title: h.source_page_title,
      creator_or_owner: h.creator_or_owner,
      license: h.license,
      commercial_use_allowed: h.commercial_use_allowed,
      modification_allowed: h.modification_allowed,
      attribution_required: h.source_type === 'google_image' || h.source_type === 'news_blog' || h.source_type === 'cc_license',
      risk_level: risk,
      usage_note: risk === 'critical' ? '사용 금지(민감 이미지). 대체 후보 필요.' : undefined,
    };
    return ImageSourceSchema.parse(src);
  });
}
