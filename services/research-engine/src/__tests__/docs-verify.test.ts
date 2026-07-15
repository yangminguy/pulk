import { EventEmitter } from 'node:events';
import { DocsVerifier, type SpawnFn } from '../adapters/docs-verify';

/** Fake ChildProcess: emits either an ENOENT error or stdout+close(0). */
function fakeChild(mode: { error?: string; stdout?: string; code?: number }): any {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  setImmediate(() => {
    if (mode.error) {
      child.emit('error', new Error(mode.error));
      return;
    }
    if (mode.stdout) child.stdout.emit('data', Buffer.from(mode.stdout));
    child.emit('close', mode.code ?? 0);
  });
  return child;
}

const NOW = () => new Date('2026-07-14T12:00:00.000Z');

describe('DocsVerifier.verifyClaims', () => {
  it('returns [] for no claims', async () => {
    const dv = new DocsVerifier({ spawnImpl: (() => fakeChild({})) as unknown as SpawnFn, now: NOW, log: () => {} });
    expect(await dv.verifyClaims([])).toEqual([]);
  });

  it('falls back to UNVERIFIED for every claim when the CLI is absent', async () => {
    const spawnImpl = (() => fakeChild({ error: 'spawn claude ENOENT' })) as unknown as SpawnFn;
    const dv = new DocsVerifier({ spawnImpl, now: NOW, log: () => {} });
    const res = await dv.verifyClaims([{ claim: 'A' }, { claim: 'B' }]);
    expect(res).toHaveLength(2);
    expect(res.every((r) => r.status === 'UNVERIFIED')).toBe(true);
    expect(res[0].checkedAt).toBe('2026-07-14T12:00:00.000Z');
  });

  it('falls back to UNVERIFIED on a timeout', async () => {
    // child never emits close → timeout fires.
    const spawnImpl = (() => {
      const c: any = new EventEmitter();
      c.stdout = new EventEmitter();
      c.stderr = new EventEmitter();
      c.kill = () => {};
      return c;
    }) as unknown as SpawnFn;
    const dv = new DocsVerifier({ spawnImpl, timeoutMs: 20, now: NOW, log: () => {} });
    const res = await dv.verifyClaims([{ claim: 'slow' }]);
    expect(res[0].status).toBe('UNVERIFIED');
  });

  it('maps a valid JSON envelope to per-claim statuses', async () => {
    const envelope = JSON.stringify({
      type: 'result',
      result: JSON.stringify([
        { claim: 'A', status: 'VERIFIED', sourceUrl: 'https://docs.dev/a', checkedVersion: '2.0' },
        { claim: 'B', status: 'outdated', conflict: 'removed in v3' },
      ]),
    });
    const spawnImpl = (() => fakeChild({ stdout: envelope, code: 0 })) as unknown as SpawnFn;
    const dv = new DocsVerifier({ spawnImpl, now: NOW, log: () => {} });
    const res = await dv.verifyClaims([{ claim: 'A' }, { claim: 'B' }]);
    expect(res[0]).toEqual({
      claim: 'A',
      status: 'VERIFIED',
      checkedAt: '2026-07-14T12:00:00.000Z',
      sourceUrl: 'https://docs.dev/a',
      checkedVersion: '2.0',
    });
    expect(res[1].status).toBe('OUTDATED');
    expect(res[1].conflict).toBe('removed in v3');
  });

  it('coerces unknown statuses to UNVERIFIED', async () => {
    const envelope = JSON.stringify({
      result: JSON.stringify([{ claim: 'A', status: 'DEFINITELY_TRUE' }]),
    });
    const spawnImpl = (() => fakeChild({ stdout: envelope, code: 0 })) as unknown as SpawnFn;
    const dv = new DocsVerifier({ spawnImpl, now: NOW, log: () => {} });
    const res = await dv.verifyClaims([{ claim: 'A' }]);
    expect(res[0].status).toBe('UNVERIFIED');
  });
});
