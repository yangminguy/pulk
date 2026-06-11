import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  uploadVideo,
  updateVideoMetadata,
  type UploadFetchLike,
} from '../upload.js';

const tokens = { getAccessToken: jest.fn(async () => 'upload-token') };

interface RecordedCall {
  url: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array };
}

function makeFetch(
  handler: (url: string, init?: RecordedCall['init']) => {
    ok?: boolean;
    status?: number;
    headers?: Record<string, string>;
    body?: unknown;
  },
) {
  const calls: RecordedCall[] = [];
  const fetchImpl: UploadFetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = handler(url, init);
    const headerMap = r.headers ?? {};
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      headers: {
        get: (name: string) =>
          headerMap[name] ?? headerMap[name.toLowerCase()] ?? null,
      },
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
    };
  };
  return { fetchImpl, calls };
}

describe('uploadVideo (videos.insert resumable — 자동 호출 금지, 승인⑥ 후 D3+)', () => {
  let dir: string;
  let filePath: string;
  const FILE_BYTES = Buffer.from('fake-video-bytes');

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'l5-upload-'));
    filePath = join(dir, 'video.mp4');
    await writeFile(filePath, FILE_BYTES);
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(() => tokens.getAccessToken.mockClear());

  it('① 세션 POST → ② Location으로 PUT 흐름, 기본 privacyStatus=private', async () => {
    const { fetchImpl, calls } = makeFetch((url) => {
      if (url.includes('uploadType=resumable')) {
        return { headers: { location: 'https://upload.example/session-1' } };
      }
      return { body: { id: 'vid-1', status: { privacyStatus: 'private' } } };
    });

    const r = await uploadVideo(
      { filePath, title: '제목', description: '설명', tags: ['a', 'b'] },
      tokens,
      fetchImpl,
    );

    expect(r).toEqual({ video_id: 'vid-1', privacy_status: 'private' });
    expect(calls).toHaveLength(2);

    // ① 세션 시작 요청
    const session = calls[0];
    const url = new URL(session.url);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/upload/youtube/v3/videos');
    expect(url.searchParams.get('uploadType')).toBe('resumable');
    expect(url.searchParams.get('part')).toBe('snippet,status');
    expect(session.init?.method).toBe('POST');
    expect(session.init?.headers?.Authorization).toBe('Bearer upload-token');
    expect(session.init?.headers?.['X-Upload-Content-Length']).toBe(String(FILE_BYTES.length));
    const meta = JSON.parse(session.init?.body as string);
    expect(meta.snippet).toEqual({ title: '제목', description: '설명', tags: ['a', 'b'] });
    expect(meta.status).toEqual({ privacyStatus: 'private' });

    // ② 세션 URL로 파일 PUT
    const put = calls[1];
    expect(put.url).toBe('https://upload.example/session-1');
    expect(put.init?.method).toBe('PUT');
    expect(put.init?.headers?.['Content-Length']).toBe(String(FILE_BYTES.length));
    expect(Buffer.from(put.init?.body as Uint8Array).equals(FILE_BYTES)).toBe(true);
  });

  it('publishAt 지정 시 privacyStatus=private 강제 + status.publishAt, 결과에 publish_at', async () => {
    const { fetchImpl, calls } = makeFetch((url) => {
      if (url.includes('uploadType=resumable')) {
        return { headers: { location: 'https://upload.example/session-2' } };
      }
      return {
        body: { id: 'vid-2', status: { privacyStatus: 'private', publishAt: '2026-06-20T09:00:00Z' } },
      };
    });

    const r = await uploadVideo(
      {
        filePath,
        title: 't',
        description: 'd',
        privacyStatus: 'public', // publishAt이 있으면 무시되고 private 강제
        publishAt: '2026-06-20T09:00:00Z',
        categoryId: '27',
        defaultLanguage: 'ko',
      },
      tokens,
      fetchImpl,
    );

    const meta = JSON.parse(calls[0].init?.body as string);
    expect(meta.status).toEqual({ privacyStatus: 'private', publishAt: '2026-06-20T09:00:00Z' });
    expect(meta.snippet.categoryId).toBe('27');
    expect(meta.snippet.defaultLanguage).toBe('ko');
    expect(r).toEqual({
      video_id: 'vid-2',
      privacy_status: 'private',
      publish_at: '2026-06-20T09:00:00Z',
    });
  });

  it('파일 미존재 시 fetch 호출 없이 친절한 에러', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({}));
    await expect(
      uploadVideo({ filePath: '/no/such/file.mp4', title: 't', description: 'd' }, tokens, fetchImpl),
    ).rejects.toThrow('Upload file not found or unreadable: /no/such/file.mp4');
    expect(calls).toHaveLength(0);
  });

  it('세션 시작 4xx — 상태코드만 노출(본문/토큰 비노출)', async () => {
    const { fetchImpl } = makeFetch(() => ({ ok: false, status: 403, body: { error: 'secret-detail' } }));
    await expect(
      uploadVideo({ filePath, title: 't', description: 'd' }, tokens, fetchImpl),
    ).rejects.toThrow('videos.insert resumable session failed: HTTP 403');
  });

  it('Location 헤더 누락 시 에러', async () => {
    const { fetchImpl } = makeFetch(() => ({ headers: {} }));
    await expect(
      uploadVideo({ filePath, title: 't', description: 'd' }, tokens, fetchImpl),
    ).rejects.toThrow('missing Location header');
  });

  it('PUT 5xx — 상태코드만 노출', async () => {
    const { fetchImpl } = makeFetch((url) =>
      url.includes('uploadType=resumable')
        ? { headers: { location: 'https://upload.example/s' } }
        : { ok: false, status: 500, body: { error: 'boom' } },
    );
    await expect(
      uploadVideo({ filePath, title: 't', description: 'd' }, tokens, fetchImpl),
    ).rejects.toThrow('videos.insert upload failed: HTTP 500');
  });
});

describe('updateVideoMetadata (videos.update — 제목 교체 7일 100회 룰 실행용)', () => {
  const existingSnippet = {
    title: '기존 제목',
    description: '기존 설명',
    tags: ['old'],
    categoryId: '27',
    defaultLanguage: 'ko',
  };

  it('videos.list로 기존 snippet 읽고 머지 후 PUT(title만 교체, categoryId 유지)', async () => {
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (init?.method === 'PUT') {
        return { body: { id: 'vid-9', snippet: JSON.parse(init.body as string).snippet } };
      }
      return { body: { items: [{ id: 'vid-9', snippet: existingSnippet }] } };
    });

    const r = await updateVideoMetadata({ videoId: 'vid-9', title: '새 제목' }, tokens, fetchImpl);

    // ① GET videos?part=snippet&id=
    const listUrl = new URL(calls[0].url);
    expect(listUrl.pathname).toBe('/youtube/v3/videos');
    expect(listUrl.searchParams.get('part')).toBe('snippet');
    expect(listUrl.searchParams.get('id')).toBe('vid-9');
    expect(calls[0].init?.headers?.Authorization).toBe('Bearer upload-token');

    // ② PUT — 머지된 전체 snippet(title 교체 + 나머지 기존 값 유지)
    const put = calls[1];
    expect(put.init?.method).toBe('PUT');
    const body = JSON.parse(put.init?.body as string);
    expect(body.id).toBe('vid-9');
    expect(body.snippet).toEqual({
      title: '새 제목',
      description: '기존 설명',
      tags: ['old'],
      categoryId: '27',
      defaultLanguage: 'ko',
    });

    expect(r).toEqual({
      video_id: 'vid-9',
      title: '새 제목',
      description: '기존 설명',
      tags: ['old'],
      category_id: '27',
    });
  });

  it('tags/categoryId 전달 시 해당 필드 교체', async () => {
    const { fetchImpl, calls } = makeFetch((url, init) => {
      if (init?.method === 'PUT') return { body: { id: 'vid-9' } };
      return { body: { items: [{ id: 'vid-9', snippet: existingSnippet }] } };
    });
    await updateVideoMetadata(
      { videoId: 'vid-9', tags: ['new1', 'new2'], categoryId: '22' },
      tokens,
      fetchImpl,
    );
    const body = JSON.parse(calls[1].init?.body as string);
    expect(body.snippet.tags).toEqual(['new1', 'new2']);
    expect(body.snippet.categoryId).toBe('22');
    expect(body.snippet.title).toBe('기존 제목'); // 미전달 필드는 유지
  });

  it('영상 미존재 시 친절한 에러(PUT 미호출)', async () => {
    const { fetchImpl, calls } = makeFetch(() => ({ body: { items: [] } }));
    await expect(
      updateVideoMetadata({ videoId: 'nope', title: 't' }, tokens, fetchImpl),
    ).rejects.toThrow('Video not found for metadata update: nope');
    expect(calls).toHaveLength(1);
  });

  it('PUT 실패 시 상태코드만 노출', async () => {
    const { fetchImpl } = makeFetch((url, init) => {
      if (init?.method === 'PUT') return { ok: false, status: 400, body: { error: 'secret' } };
      return { body: { items: [{ id: 'v', snippet: existingSnippet }] } };
    });
    await expect(
      updateVideoMetadata({ videoId: 'v', title: 't' }, tokens, fetchImpl),
    ).rejects.toThrow('videos.update failed: HTTP 400');
  });
});
