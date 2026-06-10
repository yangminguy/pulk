import { EventEmitter } from 'events';
import {
  createClaudeCLIClient,
  __setSpawnForTest,
  __clearCacheForTest,
} from './claude-cli-client';

// Minimal fake ChildProcess that we can drive synchronously from tests.
class FakeChild extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
  public stdin = {
    write: jest.fn(),
    end: jest.fn(),
  };
  public killed = false;
  kill(_sig?: string) {
    this.killed = true;
    return true;
  }
}

interface SpawnCall {
  command: string;
  args: readonly string[];
  options: unknown;
  child: FakeChild;
}

function installSpawnMock(): { calls: SpawnCall[]; next: (child: FakeChild) => void } {
  const calls: SpawnCall[] = [];
  const queue: FakeChild[] = [];
  const next = (child: FakeChild) => queue.push(child);
  const impl = ((command: string, args: readonly string[], options: unknown) => {
    const child = queue.shift() ?? new FakeChild();
    calls.push({ command, args, options, child });
    return child as unknown as ReturnType<typeof import('child_process').spawn>;
  }) as unknown as typeof import('child_process').spawn;
  __setSpawnForTest(impl);
  return { calls, next };
}

afterEach(() => {
  __setSpawnForTest(null);
  __clearCacheForTest();
  jest.useRealTimers();
});

function makeSuccessPayload(result: string) {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result,
  });
}

describe('createClaudeCLIClient', () => {
  it('returns the result field from CLI JSON output on success', async () => {
    const { calls, next } = installSpawnMock();
    const child = new FakeChild();
    next(child);

    const client = createClaudeCLIClient({ model: 'haiku' });
    const promise = client.complete({ system: 'sys', user: 'usr' });

    // Drive child lifecycle.
    setImmediate(() => {
      child.stdout.emit('data', makeSuccessPayload('hello world'));
      child.emit('close', 0);
    });

    await expect(promise).resolves.toBe('hello world');
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('claude');
    expect(calls[0].args.slice(0, 6)).toEqual([
      '-p',
      'sys\n\nusr',
      '--model',
      'claude-haiku-4-5',
      '--output-format',
      'json',
    ]);
    // MCP servers are forced off to avoid per-spawn cold-start + OAuth popups.
    expect(calls[0].args).toContain('--strict-mcp-config');
  });

  it('maps opus model alias to claude-opus-4-7', async () => {
    const { calls, next } = installSpawnMock();
    const child = new FakeChild();
    next(child);

    const client = createClaudeCLIClient({ model: 'opus' });
    const promise = client.complete({ system: 's', user: 'u' });
    setImmediate(() => {
      child.stdout.emit('data', makeSuccessPayload('ok'));
      child.emit('close', 0);
    });

    await promise;
    expect(calls[0].args).toContain('claude-opus-4-7');
  });

  it('maps sonnet model alias to claude-sonnet-4-6', async () => {
    const { calls, next } = installSpawnMock();
    const child = new FakeChild();
    next(child);

    const client = createClaudeCLIClient({ model: 'sonnet' });
    const promise = client.complete({ system: 's', user: 'u' });
    setImmediate(() => {
      child.stdout.emit('data', makeSuccessPayload('ok'));
      child.emit('close', 0);
    });

    await promise;
    expect(calls[0].args).toContain('claude-sonnet-4-6');
  });

  it('throws claude-cli failed on non-zero exit', async () => {
    const { next } = installSpawnMock();
    const child = new FakeChild();
    next(child);

    const client = createClaudeCLIClient({ model: 'haiku' });
    const promise = client.complete({ system: 'sys', user: 'usr' });

    setImmediate(() => {
      child.stderr.emit('data', 'boom');
      child.emit('close', 2);
    });

    await expect(promise).rejects.toThrow(/claude-cli failed: exit code 2/);
  });

  it('throws claude-cli failed on timeout', async () => {
    jest.useFakeTimers();
    const { next } = installSpawnMock();
    const child = new FakeChild();
    next(child);

    const client = createClaudeCLIClient({ model: 'haiku', timeoutMs: 1000 });
    const promise = client.complete({ system: 'sys', user: 'usr' });

    // Swallow rejection during the advance to avoid unhandled rejection warning.
    const assertion = expect(promise).rejects.toThrow(/timeout after 1000ms/);
    jest.advanceTimersByTime(1500);
    await assertion;
  });

  it('throws on invalid JSON output', async () => {
    const { next } = installSpawnMock();
    const child = new FakeChild();
    next(child);

    const client = createClaudeCLIClient({ model: 'haiku' });
    const promise = client.complete({ system: 'sys', user: 'usr' });

    setImmediate(() => {
      child.stdout.emit('data', 'not-json-at-all');
      child.emit('close', 0);
    });

    await expect(promise).rejects.toThrow(/claude-cli failed: invalid JSON output/);
  });

  it('caches identical prompts within TTL (second call hits cache, no spawn)', async () => {
    const { calls, next } = installSpawnMock();
    const child = new FakeChild();
    next(child);

    const client = createClaudeCLIClient({ model: 'haiku' });
    const p1 = client.complete({ system: 'sys', user: 'usr' });
    setImmediate(() => {
      child.stdout.emit('data', makeSuccessPayload('cached-value'));
      child.emit('close', 0);
    });
    await expect(p1).resolves.toBe('cached-value');

    // Second identical call — should NOT spawn again.
    const p2 = client.complete({ system: 'sys', user: 'usr' });
    await expect(p2).resolves.toBe('cached-value');
    expect(calls).toHaveLength(1);
  });

  it('misses cache when prompt differs', async () => {
    const { calls, next } = installSpawnMock();
    const child1 = new FakeChild();
    const child2 = new FakeChild();
    next(child1);
    next(child2);

    const client = createClaudeCLIClient({ model: 'haiku' });

    const p1 = client.complete({ system: 'sys', user: 'usr-1' });
    setImmediate(() => {
      child1.stdout.emit('data', makeSuccessPayload('one'));
      child1.emit('close', 0);
    });
    await expect(p1).resolves.toBe('one');

    const p2 = client.complete({ system: 'sys', user: 'usr-2' });
    setImmediate(() => {
      child2.stdout.emit('data', makeSuccessPayload('two'));
      child2.emit('close', 0);
    });
    await expect(p2).resolves.toBe('two');

    expect(calls).toHaveLength(2);
  });
});
