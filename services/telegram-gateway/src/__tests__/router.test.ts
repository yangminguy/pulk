import {
  routeMessage,
  helpText,
  EXECUTIVES,
  findExecutive,
  wantsFiles,
  isSendLastFilesRequest,
} from '../router.js';

describe('routeMessage', () => {
  it('routes a basic @cto mention and strips the mention from the instruction', () => {
    const r = routeMessage('@cto 지금 진행 중인 개발 정리해줘');
    expect(r?.executive.id).toBe('cto');
    expect(r?.instruction).toBe('지금 진행 중인 개발 정리해줘');
  });

  it('is case-insensitive and tolerates a trailing colon', () => {
    const r = routeMessage('@CMO: 키 콘텐츠 기획서 html로 뽑아줘');
    expect(r?.executive.id).toBe('cmo');
    expect(r?.instruction).toBe('키 콘텐츠 기획서 html로 뽑아줘');
  });

  it('resolves multi-token / aliased ids (chief-of-staff, risk-qa)', () => {
    expect(routeMessage('@chief-of-staff 정리')?.executive.id).toBe('chief-of-staff');
    expect(routeMessage('@cos 정리')?.executive.id).toBe('chief-of-staff');
    expect(routeMessage('@risk-qa 검토')?.executive.id).toBe('risk-qa');
    expect(routeMessage('@qa 검토')?.executive.id).toBe('risk-qa');
  });

  it('supports Korean aliases', () => {
    expect(routeMessage('@기술 상태 알려줘')?.executive.id).toBe('cto');
    expect(routeMessage('@마케팅 영상 만들어줘')?.executive.id).toBe('cmo');
  });

  it('finds the mention even when it is not the first token', () => {
    const r = routeMessage('급한데 @cfo 이번달 번레이트 분석해줘');
    expect(r?.executive.id).toBe('cfo');
    expect(r?.instruction).toBe('급한데 이번달 번레이트 분석해줘');
  });

  it('returns null for unknown mentions and empty/garbage input', () => {
    expect(routeMessage('@unknown 뭐해')).toBeNull();
    expect(routeMessage('안녕하세요')).toBeNull();
    expect(routeMessage('')).toBeNull();
    expect(routeMessage('   ')).toBeNull();
  });

  it('handles a mention with no instruction', () => {
    const r = routeMessage('@ceo');
    expect(r?.executive.id).toBe('ceo');
    expect(r?.instruction).toBe('');
  });

  it('covers all 9 executives', () => {
    const ids = EXECUTIVES.map((e) => e.id).sort();
    expect(ids).toEqual(
      ['ceo', 'cfo', 'chief-of-staff', 'cmo', 'coo', 'cpo', 'cro', 'cto', 'risk-qa'].sort(),
    );
  });
});

describe('findExecutive', () => {
  it('throws on an unknown id', () => {
    // @ts-expect-error intentional bad id
    expect(() => findExecutive('nope')).toThrow();
  });
});

describe('wantsFiles', () => {
  it('is true when a file/format/deliverable is explicitly requested', () => {
    expect(wantsFiles('키 콘텐츠 기획서 html로 뽑아줘')).toBe(true);
    expect(wantsFiles('영상 만들어줘')).toBe(true);
    expect(wantsFiles('그 보고서 pdf로 보내줘')).toBe(true);
    expect(wantsFiles('산출물 첨부해줘')).toBe(true);
  });

  it('is false for plain status/conversation asks (no auto-dump)', () => {
    expect(wantsFiles('지금 진행 중인 개발 정리해줘')).toBe(false);
    expect(wantsFiles('현황 알려줘')).toBe(false);
    expect(wantsFiles('다음에 뭐 착수할까')).toBe(false);
  });
});

describe('isSendLastFilesRequest', () => {
  it('detects "send me the previous files" style asks', () => {
    expect(isSendLastFilesRequest('방금 그 파일 보내줘')).toBe(true);
    expect(isSendLastFilesRequest('파일 보내줘')).toBe(true);
    expect(isSendLastFilesRequest('산출물 전송')).toBe(true);
  });

  it('does not fire on normal task instructions', () => {
    expect(isSendLastFilesRequest('키 콘텐츠 기획서 만들어줘')).toBe(false);
    expect(isSendLastFilesRequest('지금 진행상황 정리해줘')).toBe(false);
  });
});

describe('helpText', () => {
  it('lists every executive', () => {
    const t = helpText();
    for (const e of EXECUTIVES) expect(t).toContain(`@${e.id}`);
  });
});
