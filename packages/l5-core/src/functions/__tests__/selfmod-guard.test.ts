import {
  checkSelfModDiffForbidden,
  checkSelfModIntentForbidden,
} from '../tool-request';

describe('checkSelfModDiffForbidden (path-level hard gate)', () => {
  it('blocks diffs touching the orchestration plugin (brain)', () => {
    const r = checkSelfModDiffForbidden('a/apps/.../plugin-orchestration/src/server/plugin.ts');
    expect(r.forbidden).toBe(true);
    expect(r.pattern).toBeTruthy();
  });
  it('blocks .env, launchd, SECURITY_, approval, selfmod', () => {
    expect(checkSelfModDiffForbidden('apps/nocobase-app/.env').forbidden).toBe(true);
    expect(checkSelfModDiffForbidden('com.l5.launchd.plist').forbidden).toBe(true);
    expect(checkSelfModDiffForbidden('docs/SECURITY_DATA.md').forbidden).toBe(true);
    expect(checkSelfModDiffForbidden('src/approval/queue.ts').forbidden).toBe(true);
    expect(checkSelfModDiffForbidden('functions/selfmod-guard.ts').forbidden).toBe(true);
  });
  it('allows an ordinary feature diff', () => {
    const r = checkSelfModDiffForbidden('services/secondbrain/src/search.ts');
    expect(r.forbidden).toBe(false);
    expect(r.pattern).toBeNull();
  });
});

describe('checkSelfModIntentForbidden (early NL gate)', () => {
  it('blocks Korean requests to touch the approval gate / secrets', () => {
    expect(checkSelfModIntentForbidden('승인 게이트 로직을 고쳐줘').forbidden).toBe(true);
    expect(checkSelfModIntentForbidden('환경 변수에 새 시크릿 추가').forbidden).toBe(true);
    expect(checkSelfModIntentForbidden('차단 목록을 완화해줘').forbidden).toBe(true);
    expect(checkSelfModIntentForbidden('승인 우회 경로를 만들어줘').forbidden).toBe(true);
  });
  it('blocks English equivalents', () => {
    expect(checkSelfModIntentForbidden('relax the deny-list').forbidden).toBe(true);
    expect(checkSelfModIntentForbidden('bypass approval gate').forbidden).toBe(true);
  });
  it('allows a normal tool request', () => {
    const r = checkSelfModIntentForbidden('CMO용 광고 성과 수집 도구를 만들어줘');
    expect(r.forbidden).toBe(false);
  });
});
