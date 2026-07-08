import { looksRateLimited } from '../executor.js';

describe('looksRateLimited', () => {
  test('exact claude CLI rate-limit text is detected', () => {
    const out = '⏱️ The model provider is rate-limiting requests. Please wait a moment and try again.';
    expect(looksRateLimited(out, '')).toBe(true);
  });

  test('Anthropic 429 / overloaded_error in stderr is detected', () => {
    expect(looksRateLimited('', '429 too many requests')).toBe(true);
    expect(looksRateLimited('', 'overloaded_error: try again')).toBe(true);
    expect(looksRateLimited('', 'rate_limit_error')).toBe(true);
  });

  test('a long, otherwise-real reply that mentions rate limit is NOT flagged', () => {
    // 정상 답변 본문에 '분당 rate limit' 같은 어휘가 우연히 섞이는 경우.
    const reply =
      'CTO 보고: 오늘 진행은 X, Y, Z이고 분당 rate limit 정책도 점검했습니다. ' +
      '결과 파일을 deliverDir에 저장했고, 다음 단계는 …'.repeat(20);
    expect(looksRateLimited(reply, '')).toBe(false);
  });

  test('empty / missing input is safe (no false positive)', () => {
    expect(looksRateLimited('', '')).toBe(false);
    expect(looksRateLimited(undefined as unknown as string, undefined as unknown as string)).toBe(false);
  });

  test('plain success reply is not flagged', () => {
    expect(looksRateLimited('CTO: 작업 완료. 파일: /tmp/foo.html', '')).toBe(false);
  });
});
