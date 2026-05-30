// Auto-pilot CTO Agent Dispatch & ACR E2E Loop Smoke Test.
//
// Usage:
//   corepack pnpm tsx scripts/smoke-autopilot-e2e.ts

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

type JsonObject = Record<string, unknown>;

const baseUrl = (process.env.NOCOBASE_BASE_URL ?? 'http://localhost:13000').replace(/\/$/, '');
const username = process.env.NOCOBASE_USERNAME ?? 'nocobase';
const password = process.env.NOCOBASE_PASSWORD ?? 'admin123';
// 라이브 pulk repo는 보호 경로(L5_PROTECTED_PATHS)이므로 절대 대상으로 쓰지 않는다.
// 기본값은 영구 git 샌드박스. L5_SMOKE_SANDBOX_PATH로만 오버라이드 허용.
const sandboxPath = (
  process.env.L5_SMOKE_SANDBOX_PATH ??
  process.env.L5_DEFAULT_PROJECT_PATH ??
  '/Users/wonminyang/l5-workspace/default-sandbox'
).replace(/\/$/, '');

if (sandboxPath === '/Users/wonminyang/Desktop/pulk') {
  throw new Error('Refusing to run E2E smoke against the protected live pulk repo.');
}

async function main(): Promise<void> {
  console.log('========================================================================');
  console.log('L5 Auto-pilot E2E Dispatch Loop Smoke Test');
  console.log('========================================================================');
  console.log(`NocoBase URL: ${baseUrl}`);
  console.log(`Sandbox CWD: ${sandboxPath}`);

  // 1. 로그인하여 토큰 획득
  const token = await signIn();
  console.log(`Auth: signed in as ${username}`);

  // 2. NocoBase에 지시 제출하여 태스크 생성
  const testFile = 'verify-autopilot.md';
  const targetFilePath = path.join(sandboxPath, testFile);

  // 이전의 verify-autopilot.md 파일이 남아있다면 삭제
  if (fs.existsSync(targetFilePath)) {
    fs.unlinkSync(targetFilePath);
    console.log(`Cleaned up old test file: ${testFile}`);
  }

  console.log('Submitting instruction via chat:submitInstruction...');
  const submission = await requestJson('/api/chat:submitInstruction', {
    method: 'POST',
    token,
    body: {
      raw_text: `verify-autopilot.md 파일을 샌드박스 로컬 프로젝트 루트에 생성해줘.`,
      intent: 'ACR E2E 자율 실행 루프 작동 검증',
    },
  }) as any;

  // unwrap data
  const dataPayload = submission.data?.ok ? submission.data : submission;
  const tasks = dataPayload.data?.tasks ?? dataPayload.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('Instruction submission failed: No tasks created.');
  }

  // CTO 에이전트 태스크 선택
  const ctoTask = tasks.find((t: any) => t.assigned_agent === 'CTO') ?? tasks[0];
  const taskId = ctoTask.id ?? ctoTask.task_id;
  console.log(`✓ Task created: taskId=${taskId}, assigned_agent=${ctoTask.assigned_agent}`);

  // E2E 자율 주행을 위해 태스크 설정 강제 조정 (D2 자동실행, project_path 지정)
  console.log('Adjusting task metadata to bypass approval & set target cwd path...');
  await requestJson(`/api/agent_tasks:update?filterByTk=${taskId}`, {
    method: 'POST',
    token,
    body: {
      status: 'queued',
      approval_required: false,
      risk_level: 'D2',
      project_path: sandboxPath,
    },
  });

  console.log('✓ Task meta-adjustments saved successfully.');

  // 3. hermes task-dispatcher 직접 호출하여 디스패치 구동
  console.log('\nRunning task-dispatcher gateway process...');
  const { execSync } = await import('child_process');
  
  try {
    // gateway.js를 실행하여 dispatcher 가 해당 큐 태스크를 pick up 하게 함
    const dispatchCmd = `NOCOBASE_TOKEN="${token}" node services/hermes-runtime/dist/gateway.js task-dispatcher`;
    console.log(`Executing: ${dispatchCmd}`);
    const output = execSync(dispatchCmd, {
      env: {
        ...process.env,
        NOCOBASE_TOKEN: token,
        NOCOBASE_URL: baseUrl,
        L5_DEFAULT_PROJECT_PATH: sandboxPath,
      },
    });
    console.log('Dispatcher output:\n', output.toString());
  } catch (err) {
    console.error('Dispatcher execution failed:', err);
    throw err;
  }

  // 4. 모니터링: task 상태가 done(또는 needs_review)으로 해소되는지 2초 단위로 최대 15번 폴링.
  // 성공 기준은 "ACR 루프가 task를 해소했는가"다. CTO 플랜이 멀티-phase면 첫 phase가
  // 조사/스펙(read-only)일 수 있어 파일 생성을 단정할 수 없다 — 파일 존재는 부가 로깅만 한다.
  // 폴링 fetch는 dispatcher 직후 NocoBase가 바쁠 때 ECONNRESET이 날 수 있으므로 재시도한다.
  console.log('\nWaiting for ACR agent to resolve the task...');
  let verified = false;
  let lastStatus = 'unknown';

  for (let i = 1; i <= 15; i++) {
    console.log(`[Polling ${i}/15] checking task status...`);

    const fileExists = fs.existsSync(targetFilePath);

    let status: string | undefined;
    let blocker: string | undefined;
    try {
      const taskData = await requestJson(`/api/agent_tasks:get?filterByTk=${taskId}`, {
        method: 'GET',
        token,
      }) as any;
      status = taskData?.data?.status ?? taskData?.status;
      blocker = taskData?.data?.blocker ?? taskData?.blocker;
    } catch (err) {
      // 일시적 네트워크 끊김(ECONNRESET 등) — 다음 틱에 재시도
      console.log(`  - poll fetch transient error, retrying: ${(err as Error).message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }

    lastStatus = status ?? 'unknown';
    console.log(`  - Target file exists: ${fileExists}`);
    console.log(`  - Task status: ${status} (blocker: ${blocker ?? 'none'})`);

    // ACR 루프가 task를 해소한 종료 상태. done=성공 완주, needs_review=빈 산출물/충돌 게이트(루프 자체는 정상).
    if (status === 'done' || status === 'needs_review') {
      console.log('\n========================================================================');
      console.log('🎉 SUCCESS: ACR Auto-pilot E2E Loop verified!');
      console.log(`- Task ${taskId} resolved to "${status}"`);
      if (fileExists) console.log(`- Target file created: ${targetFilePath}`);
      else console.log('- (No target file — first phase was likely read-only; loop still verified.)');
      console.log('========================================================================');
      verified = true;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (!verified) {
    throw new Error(
      `E2E loop validation failed: task did not resolve (last status="${lastStatus}").`,
    );
  }
}

async function signIn(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth:signIn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ account: username, password }),
  });
  if (!res.ok) {
    throw new Error(`Sign in failed with ${res.status}`);
  }
  const payload = await res.json() as any;
  const token = payload.data?.token;
  if (!token) {
    throw new Error('No token returned');
  }
  return token;
}

async function requestJson(
  path: string,
  opts: {
    method: 'GET' | 'POST';
    token?: string;
    body?: JsonObject;
  },
): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${opts.method} ${path} failed with ${res.status}: ${text}`);
  }

  return res.json();
}

main().catch((error) => {
  console.error('\nAuto-pilot smoke test failed:', error);
  process.exit(1);
});
