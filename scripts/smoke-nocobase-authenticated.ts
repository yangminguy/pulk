// Authenticated NocoBase smoke test for L5 orchestration routes.
//
// Usage:
//   corepack pnpm smoke:nocobase-auth
//   NOCOBASE_USERNAME=... NOCOBASE_PASSWORD=... corepack pnpm smoke:nocobase-auth
//   NOCOBASE_API_TOKEN=... corepack pnpm smoke:nocobase-auth

type JsonObject = Record<string, unknown>;

const baseUrl = (process.env.NOCOBASE_BASE_URL ?? 'http://localhost:13000').replace(/\/$/, '');
const username = process.env.NOCOBASE_USERNAME ?? 'nocobase';
const password = process.env.NOCOBASE_PASSWORD ?? 'admin123';

async function main(): Promise<void> {
  heading('L5 NocoBase authenticated smoke');
  console.log(`Base URL: ${baseUrl}`);

  const token = process.env.NOCOBASE_API_TOKEN ?? await signIn();
  console.log(process.env.NOCOBASE_API_TOKEN ? 'Auth: using NOCOBASE_API_TOKEN' : `Auth: signed in as ${username}`);

  const submitted = await requestJson('/api/chat:submitInstruction', {
    method: 'POST',
    token,
    body: {
      raw_text: `Create a PMF message experiment and customer outreach proposal for a new founder workflow offer ${new Date().toISOString()}`,
      intent: 'Authenticated CEO chat orchestration smoke',
    },
  });
  assertChatSubmission(submitted);
  const createdTasks = getCreatedTasks(submitted);
  const createdTaskIds = new Set(createdTasks.map((task) => String(task.id ?? task.task_id)));
  const approvalRequiredTaskIds = new Set(
    createdTasks
      .filter((task) => task.approval_required === true)
      .map((task) => String(task.id ?? task.task_id)),
  );

  const currentTasksPayload = await requestJson('/api/monitor:currentTasks', { method: 'GET', token });
  const currentTasks = assertMonitorPayload(currentTasksPayload, '/api/monitor:currentTasks');
  assertContainsTaskIds(currentTasks, createdTaskIds, 'monitor current task data');

  const blockedTasksPayload = await requestJson('/api/monitor:blockedTasks', { method: 'GET', token });
  assertMonitorPayload(blockedTasksPayload, '/api/monitor:blockedTasks');

  const approvalQueuePayload = await requestJson('/api/monitor:approvalQueue', { method: 'GET', token });
  const approvalQueue = assertMonitorPayload(approvalQueuePayload, '/api/monitor:approvalQueue');
  if (approvalRequiredTaskIds.size === 0) {
    throw new Error('chat:submitInstruction must create at least one approval-required task for this regression');
  }
  assertContainsTaskIds(approvalQueue, approvalRequiredTaskIds, 'approval queue data');
  assertNoSilentRiskExecution(approvalQueue, approvalRequiredTaskIds);

  console.log('\nAll authenticated NocoBase smoke checks passed.');
}

function assertChatSubmission(payload: unknown): void {
  assertObjectLike(payload, 'chat:submitInstruction');
  const objectPayload = unwrapData(payload as JsonObject);

  if (objectPayload.ok !== true) {
    throw new Error('chat:submitInstruction response ok field must be true');
  }

  const data = objectPayload.data;
  assertObjectLike(data, 'chat:submitInstruction data');

  const tasks = (data as JsonObject).tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('chat:submitInstruction must create at least one AgentTask');
  }

  for (const task of tasks) {
    assertObjectLike(task, 'created AgentTask');
    for (const key of ['instruction_id', 'assigned_agent', 'rationale', 'expected_output', 'approval_required']) {
      if (!(key in task)) {
        throw new Error(`created AgentTask missing ${key}`);
      }
    }
  }
}

function getCreatedTasks(payload: unknown): JsonObject[] {
  assertObjectLike(payload, 'chat:submitInstruction');
  const objectPayload = unwrapData(payload as JsonObject);
  const data = objectPayload.data;
  assertObjectLike(data, 'chat:submitInstruction data');
  const tasks = (data as JsonObject).tasks;
  if (!Array.isArray(tasks)) {
    throw new Error('chat:submitInstruction data.tasks must be an array');
  }
  return tasks as JsonObject[];
}

async function signIn(): Promise<string> {
  const payload = await requestJson('/api/auth:signIn', {
    method: 'POST',
    body: { account: username, password },
  });

  const token = readPath<string>(payload, ['data', 'token']);
  if (!token) {
    throw new Error('Sign-in response did not include data.token');
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

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${opts.method} ${path} returned non-JSON ${res.status}: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(`${opts.method} ${path} failed with ${res.status}: ${JSON.stringify(json)}`);
  }

  console.log(`✓ ${opts.method} ${path} -> ${res.status}`);
  return json;
}

function assertObjectLike(payload: unknown, label: string): asserts payload is JsonObject {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${label} response must be a JSON object`);
  }
}

function assertMonitorPayload(payload: unknown, label: string): JsonObject[] {
  assertObjectLike(payload, label);
  const objectPayload = unwrapData(payload as JsonObject);

  if ('ok' in objectPayload && objectPayload.ok !== true) {
    throw new Error(`${label} response ok field must be true when present`);
  }

  if (!('data' in objectPayload)) {
    throw new Error(`${label} response must include data`);
  }

  if (!Array.isArray(objectPayload.data)) {
    throw new Error(`${label} data must be an array`);
  }

  return objectPayload.data as JsonObject[];
}

function assertContainsTaskIds(rows: JsonObject[], ids: Set<string>, label: string): void {
  const rowIds = new Set(rows.map((row) => String(row.task_id ?? row.id)));
  const missing = [...ids].filter((id) => !rowIds.has(id));
  if (missing.length > 0) {
    throw new Error(`${label} missing created task id(s): ${missing.join(', ')}`);
  }
}

function assertNoSilentRiskExecution(rows: JsonObject[], ids: Set<string>): void {
  for (const row of rows) {
    const id = String(row.task_id ?? row.id);
    if (!ids.has(id)) continue;

    if (row.approval_required !== true) {
      throw new Error(`approval queue task ${id} must keep approval_required=true`);
    }
    if (row.status === 'done') {
      throw new Error(`approval-required task ${id} was silently executed`);
    }
  }
}

function unwrapData(payload: JsonObject): JsonObject {
  const data = payload.data;
  if (data && typeof data === 'object' && !Array.isArray(data) && 'ok' in data) {
    return data as JsonObject;
  }
  return payload;
}

function readPath<T>(value: unknown, path: string[]): T | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) || !(key in cursor)) {
      return undefined;
    }
    cursor = (cursor as JsonObject)[key];
  }
  return typeof cursor === 'string' && cursor.length > 0 ? cursor as T : undefined;
}

function heading(text: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(text);
  console.log('='.repeat(72));
}

main().catch((error) => {
  console.error('\nAuthenticated NocoBase smoke failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
