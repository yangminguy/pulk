import {
  createExecutionRun,
  getExecutionRun,
  submitExecutionResult,
  type ExecutionRunRequest,
} from './acr-execution-client.js';

const ORIG_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIG_FETCH;
  jest.restoreAllMocks();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  global.fetch = jest.fn(async (input: any, init?: any) =>
    impl(String(input), init),
  ) as unknown as typeof fetch;
}

const REQ: ExecutionRunRequest = {
  task_id: 't-1-pkg-0',
  repo_path: '/repo/pulk',
  base_branch: 'main',
  agent: 'claude-code',
  prompt: '# 1. ROLE\n...',
  acceptance_criteria: ['works'],
  allowed_files: ['apps/web/src/**'],
  blocked_files: ['.env'],
  complexity: 'C2',
  mode: 'implement_verify',
  risk_level: 'D1',
};

describe('createExecutionRun', () => {
  it('성공 응답을 파싱해 반환한다', async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({ run_id: 'run_1', status: 'queued', branch: 'agent/x' }),
        { status: 200 },
      ),
    );
    const res = await createExecutionRun(REQ);
    expect(res).toEqual({ run_id: 'run_1', status: 'queued', branch: 'agent/x' });
  });

  it('POST /api/execution-runs 로 요청 본문을 보낸다', async () => {
    let captured: any;
    mockFetch((url, init) => {
      captured = { url, body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ run_id: 'r', status: 'queued' }), { status: 200 });
    });
    await createExecutionRun(REQ);
    expect(captured.url).toMatch(/\/api\/execution-runs$/);
    expect(captured.body.task_id).toBe('t-1-pkg-0');
    expect(captured.body.risk_level).toBe('D1');
  });

  it('non-2xx 면 throw 없이 null', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    const res = await createExecutionRun(REQ);
    expect(res).toBeNull();
  });

  it('네트워크 예외 시 throw 없이 null (graceful fallback)', async () => {
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    const res = await createExecutionRun(REQ);
    expect(res).toBeNull();
  });
});

describe('getExecutionRun', () => {
  it('성공 시 본문을 반환한다', async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({ run_id: 'run_1', task_id: 't-1', status: 'verifying', agent: 'claude-code' }),
        { status: 200 },
      ),
    );
    const res = await getExecutionRun('run_1');
    expect(res?.status).toBe('verifying');
  });

  it('실패 시 null', async () => {
    mockFetch(() => new Response('', { status: 404 }));
    expect(await getExecutionRun('missing')).toBeNull();
  });
});

describe('submitExecutionResult', () => {
  it('성공 시 true', async () => {
    mockFetch(() => new Response('{}', { status: 200 }));
    const ok = await submitExecutionResult({ run_id: 'run_1', status: 'passed' });
    expect(ok).toBe(true);
  });

  it('실패 시 false', async () => {
    mockFetch(() => {
      throw new Error('down');
    });
    expect(await submitExecutionResult({ run_id: 'run_1', status: 'passed' })).toBe(false);
  });
});
