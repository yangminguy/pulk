import { cleanInstruction, wantsFiles, EXECUTIVES } from '../router.js';

describe('cleanInstruction', () => {
  const BOT = 'U0BOT123';

  it('strips the bot mention and trims', () => {
    expect(cleanInstruction(`<@${BOT}> 이번 주 전략 정리해줘`, BOT)).toBe('이번 주 전략 정리해줘');
  });

  it('strips a display-name-qualified mention', () => {
    expect(cleanInstruction(`<@${BOT}|ceo> 우선순위 3개`, BOT)).toBe('우선순위 3개');
  });

  it('handles the mention appearing mid-text', () => {
    expect(cleanInstruction(`안녕 <@${BOT}> 보고해줘`, BOT)).toBe('안녕 보고해줘');
  });

  it('collapses whitespace', () => {
    expect(cleanInstruction(`<@${BOT}>   여러   공백  `, BOT)).toBe('여러 공백');
  });

  it('returns empty string when only the mention is present', () => {
    expect(cleanInstruction(`<@${BOT}>`, BOT)).toBe('');
  });

  it('leaves other users mentions intact', () => {
    expect(cleanInstruction(`<@${BOT}> <@U999> 확인`, BOT)).toBe('<@U999> 확인');
  });

  it('returns "" for non-strings', () => {
    // @ts-expect-error testing runtime guard
    expect(cleanInstruction(null, BOT)).toBe('');
  });
});

describe('wantsFiles', () => {
  it('detects explicit file/format requests', () => {
    expect(wantsFiles('키 콘텐츠 기획서 html로 뽑아줘')).toBe(true);
    expect(wantsFiles('산출물 파일 보내줘')).toBe(true);
    expect(wantsFiles('영상으로 만들어줘')).toBe(true);
  });

  it('is false for plain questions', () => {
    expect(wantsFiles('이번 주 우선순위 뭐야?')).toBe(false);
  });
});

describe('EXECUTIVES', () => {
  it('defines exactly ceo/cmo/cto with labels', () => {
    expect(Object.keys(EXECUTIVES).sort()).toEqual(['ceo', 'cmo', 'cto']);
    expect(EXECUTIVES.ceo.label).toBe('CEO');
    expect(EXECUTIVES.cmo.label).toBe('CMO');
    expect(EXECUTIVES.cto.label).toBe('CTO');
  });
});
