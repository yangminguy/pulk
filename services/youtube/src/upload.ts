// upload.ts — YouTube Data API videos.insert(resumable) 실제 업로드 + videos.update 메타데이터 교체.
//
// ⚠️ 안전 규칙: 자동 호출 금지 — Founder 승인⑥ 이후에만 오케스트레이터가 호출한다(D3+ 외부 액션).
// 이 모듈은 실행 프리미티브일 뿐 승인 게이트 판단을 포함하지 않는다. 게이트는 오케스트레이터 책임.
//
// resumable 2단계 흐름:
//   ① POST {UPLOAD_API}?uploadType=resumable&part=snippet,status (본문=snippet/status JSON)
//      → 응답 Location 헤더가 업로드 세션 URL.
//   ② 세션 URL에 PUT으로 파일 바이트 전송(Content-Length 명시) → 영상 리소스 JSON 반환.
//
// 에러 메시지에는 토큰/응답 본문을 절대 포함하지 않는다(상태코드 + 단계명만).

import { readFile, stat } from 'node:fs/promises';
import type { TokenManager } from './token.js';

const UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3/videos';
const DATA_API = 'https://www.googleapis.com/youtube/v3';

/** token.ts FetchLike는 string body 전용이라, 바이너리 PUT용으로 확장한 fetch 시그니처. */
export type UploadFetchLike = (input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/** uploadVideo/updateVideoMetadata가 필요로 하는 최소 토큰 인터페이스. */
export type AccessTokenProvider = Pick<TokenManager, 'getAccessToken'>;

export type PrivacyStatus = 'private' | 'unlisted' | 'public';

export interface UploadVideoParams {
  filePath: string;
  title: string;
  description: string;
  tags?: string[];
  /** 기본 'private'. publishAt 지정 시 YouTube 규칙상 'private'로 강제된다. */
  privacyStatus?: PrivacyStatus;
  /** RFC3339 예약 공개 시각. 지정 시 privacyStatus='private' + status.publishAt. */
  publishAt?: string;
  categoryId?: string;
  defaultLanguage?: string;
  /** 업로드 본문 Content-Type. 기본 'video/*'. */
  mimeType?: string;
}

export interface UploadVideoResult {
  video_id: string;
  privacy_status: string;
  publish_at?: string;
}

interface RawVideoResource {
  id?: string;
  status?: { privacyStatus?: string; publishAt?: string };
  snippet?: {
    title?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    defaultLanguage?: string;
  };
}

/**
 * videos.insert resumable 업로드 — ① 세션 시작 → ② 파일 PUT.
 *
 * ⚠️ D3+ 외부 액션. 자동 호출 금지 — Founder 승인⑥ 이후에만 오케스트레이터가 호출.
 */
export async function uploadVideo(
  params: UploadVideoParams,
  tokens: AccessTokenProvider,
  fetchImpl: UploadFetchLike = fetch as unknown as UploadFetchLike,
): Promise<UploadVideoResult> {
  // 파일 존재/크기 확인 — 미존재 시 친절한 에러(경로만 노출, 민감정보 없음).
  let fileSize: number;
  try {
    const st = await stat(params.filePath);
    if (!st.isFile()) throw new Error('not a regular file');
    fileSize = st.size;
  } catch {
    throw new Error(`Upload file not found or unreadable: ${params.filePath}`);
  }
  if (fileSize === 0) {
    throw new Error(`Upload file is empty: ${params.filePath}`);
  }

  const accessToken = await tokens.getAccessToken();
  const mimeType = params.mimeType ?? 'video/*';
  // publishAt이 있으면 YouTube 예약 공개 규칙: privacyStatus는 반드시 'private'.
  const privacyStatus: PrivacyStatus = params.publishAt ? 'private' : (params.privacyStatus ?? 'private');
  const metadata = {
    snippet: {
      title: params.title,
      description: params.description,
      ...(params.tags ? { tags: params.tags } : {}),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.defaultLanguage ? { defaultLanguage: params.defaultLanguage } : {}),
    },
    status: {
      privacyStatus,
      ...(params.publishAt ? { publishAt: params.publishAt } : {}),
    },
  };

  // ① resumable 세션 시작 → Location 헤더 = 세션 URL.
  const sessionRes = await fetchImpl(`${UPLOAD_API}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(fileSize),
      'X-Upload-Content-Type': mimeType,
    },
    body: JSON.stringify(metadata),
  });
  if (!sessionRes.ok) {
    throw new Error(`videos.insert resumable session failed: HTTP ${sessionRes.status}`);
  }
  const sessionUrl = sessionRes.headers.get('location') ?? sessionRes.headers.get('Location');
  if (!sessionUrl) {
    throw new Error('videos.insert resumable session response missing Location header');
  }

  // ② 세션 URL에 파일 바이트 PUT (Content-Length 명시).
  const bytes = await readFile(params.filePath);
  const putRes = await fetchImpl(sessionUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType,
      'Content-Length': String(bytes.byteLength),
    },
    body: bytes,
  });
  if (!putRes.ok) {
    throw new Error(`videos.insert upload failed: HTTP ${putRes.status}`);
  }
  const video = (await putRes.json()) as RawVideoResource;
  if (!video.id) {
    throw new Error('videos.insert upload response missing video id');
  }
  const publishAt = video.status?.publishAt ?? params.publishAt;
  return {
    video_id: video.id,
    privacy_status: video.status?.privacyStatus ?? privacyStatus,
    ...(publishAt ? { publish_at: publishAt } : {}),
  };
}

export interface UpdateVideoMetadataParams {
  videoId: string;
  title?: string;
  description?: string;
  tags?: string[];
  /** 미지정 시 기존 snippet의 categoryId 유지(videos.update는 title+categoryId 필수). */
  categoryId?: string;
}

export interface UpdateVideoMetadataResult {
  video_id: string;
  title: string;
  description: string;
  tags: string[];
  category_id: string;
}

/**
 * videos.update part=snippet — 제목 교체(7일 100회 룰) 실행용.
 *
 * videos.update의 snippet은 title+categoryId가 필수라, 부분 변경이라도
 * 먼저 videos.list로 기존 snippet을 읽어 머지한 뒤 전체 snippet을 PUT한다.
 *
 * ⚠️ D3+ 외부 액션. 자동 호출 금지 — Founder 승인⑥ 이후에만 오케스트레이터가 호출.
 */
export async function updateVideoMetadata(
  params: UpdateVideoMetadataParams,
  tokens: AccessTokenProvider,
  fetchImpl: UploadFetchLike = fetch as unknown as UploadFetchLike,
): Promise<UpdateVideoMetadataResult> {
  const accessToken = await tokens.getAccessToken();

  // ① 기존 snippet 조회 (videos.list part=snippet).
  const listParams = new URLSearchParams({ part: 'snippet', id: params.videoId });
  const listRes = await fetchImpl(`${DATA_API}/videos?${listParams}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    throw new Error(`videos.list before update failed: HTTP ${listRes.status}`);
  }
  const listData = (await listRes.json()) as { items?: RawVideoResource[] };
  const existing = listData.items?.[0]?.snippet;
  if (!existing) {
    throw new Error(`Video not found for metadata update: ${params.videoId}`);
  }

  // ② 머지 — 전달된 필드만 교체, 나머지는 기존 값 유지.
  const merged = {
    title: params.title ?? existing.title ?? '',
    description: params.description ?? existing.description ?? '',
    tags: params.tags ?? existing.tags ?? [],
    categoryId: params.categoryId ?? existing.categoryId ?? '',
    ...(existing.defaultLanguage ? { defaultLanguage: existing.defaultLanguage } : {}),
  };
  if (!merged.title) {
    throw new Error('videos.update requires a non-empty title');
  }
  if (!merged.categoryId) {
    throw new Error('videos.update requires categoryId (none given and none on existing snippet)');
  }

  // ③ PUT videos?part=snippet.
  const putRes = await fetchImpl(`${DATA_API}/videos?part=snippet`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ id: params.videoId, snippet: merged }),
  });
  if (!putRes.ok) {
    throw new Error(`videos.update failed: HTTP ${putRes.status}`);
  }
  const updated = (await putRes.json()) as RawVideoResource;
  const snippet = updated.snippet ?? merged;
  return {
    video_id: updated.id ?? params.videoId,
    title: snippet.title ?? merged.title,
    description: snippet.description ?? merged.description,
    tags: snippet.tags ?? merged.tags,
    category_id: snippet.categoryId ?? merged.categoryId,
  };
}
