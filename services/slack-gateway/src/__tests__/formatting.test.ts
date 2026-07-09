/**
 * formatSlackText — Markdown → Slack mrkdwn 래퍼 unit tests.
 * spec: docs/specs/slack-message-formatting-spec.md (AC-1 ~ AC-5①)
 *
 * slackify-markdown은 jest.unstable_mockModule로 감싸되 기본 구현은 실 라이브러리에
 * 위임한다(변환 커버리지 검증). fail-open 테스트(AC-4)에서만 throw로 스왑한다.
 */
import { jest } from '@jest/globals';

const SLACK_TEXT_LIMIT = 40_000;
const TRUNCATION_SUFFIX = '\n… (truncated)';

type Slackify = (md: string) => string;

const slackify = jest.fn<Slackify>();
let realSlackify: Slackify;
let formatSlackText: (markdown: string) => string;

beforeAll(async () => {
  // 실 라이브러리를 먼저 로드해 두고, mock의 기본 구현으로 위임한다.
  realSlackify = ((await import('slackify-markdown')) as unknown as { default: Slackify }).default;
  slackify.mockImplementation(realSlackify);

  jest.unstable_mockModule('slackify-markdown', () => ({ default: slackify }));
  ({ formatSlackText } = await import('../formatting.js'));
});

afterEach(() => {
  slackify.mockImplementation(realSlackify);
});

describe('formatSlackText — 변환 커버리지 (FR-1/FR-2)', () => {
  it('AC-1: bold와 link를 mrkdwn으로 변환하고 **를 남기지 않는다', () => {
    const out = formatSlackText('**bold** and [link](https://x.com)');
    expect(out).toContain('*bold*');
    expect(out).toContain('<https://x.com|link>');
    expect(out).not.toContain('**');
  });

  it('AC-2: heading은 # 리터럴 없이 볼드 라인으로 변환된다', () => {
    const out = formatSlackText('# 제목');
    expect(out).not.toContain('#');
    expect(out).toContain('*제목*');
  });

  it('AC-2b①: unordered list는 • 불릿으로 변환된다', () => {
    const out = formatSlackText('- item');
    expect(out).toContain('• item');
  });

  it('AC-2b②: 인라인 코드는 그대로 보존된다', () => {
    const out = formatSlackText('use `inline` here');
    expect(out).toContain('`inline`');
  });

  it('AC-2b③: 펜스 코드블록은 펜스와 내부 코드가 보존된다', () => {
    const out = formatSlackText('```\nconst a = 1;\n```');
    expect(out).toContain('```');
    expect(out).toContain('const a = 1;');
  });
});

// spec AC-3/AC-4가 명시한 41,000자 초과 입력 (6×6,833 + 2 = 41,000)
const OVERSIZED_INPUT = '**b** '.repeat(6_833) + 'aa';

describe('formatSlackText — truncation (FR-5, AC-3)', () => {
  it('AC-3: 41,000자 입력은 변환 후 40,000자 이하로 잘리고 truncated 접미사로 끝난다', () => {
    const input = OVERSIZED_INPUT;
    expect(input.length).toBe(41_000);

    const out = formatSlackText(input);
    expect(out.length).toBeLessThanOrEqual(SLACK_TEXT_LIMIT);
    expect(out.endsWith(TRUNCATION_SUFFIX)).toBe(true);
    // truncation 이전 본문은 "변환된" 텍스트다 — 원본의 **가 남아 있으면 안 된다.
    expect(out).not.toContain('**');
  });

  it('AC-3 경계: 한도 미만(39,999자) 입력은 truncation이 발생하지 않는다', () => {
    const input = 'a'.repeat(39_999);
    const out = formatSlackText(input);
    expect(out.endsWith(TRUNCATION_SUFFIX)).toBe(false);
    expect(out).toContain('a'.repeat(1_000));
  });
});

describe('formatSlackText — fail-open (FR-6, AC-4)', () => {
  beforeEach(() => {
    slackify.mockImplementation(() => {
      throw new Error('converter boom');
    });
  });

  it('AC-4①: 변환기가 throw하면 짧은 입력은 원본 그대로 반환된다 (예외 전파 없음)', () => {
    const input = '**hello** [x](https://x.com)';
    let out = '';
    expect(() => {
      out = formatSlackText(input);
    }).not.toThrow();
    expect(out).toBe(input);
  });

  it('AC-4②: 변환기가 throw해도 41,000자 입력은 원본 기준 truncation이 적용된다', () => {
    const input = OVERSIZED_INPUT;
    let out = '';
    expect(() => {
      out = formatSlackText(input);
    }).not.toThrow();
    expect(out.length).toBeLessThanOrEqual(SLACK_TEXT_LIMIT);
    expect(out.endsWith(TRUNCATION_SUFFIX)).toBe(true);
    // 변환이 생략됐으므로 원본 마크다운(`**`)이 그대로 남아 있어야 한다.
    expect(out).toContain('**b**');
    expect(out.startsWith(input.slice(0, 100))).toBe(true);
  });
});

describe('formatSlackText — 이중 변환 회귀 (FR-4, AC-5①)', () => {
  it('AC-5①: 이미 mrkdwn인 입력을 통과시켜도 **가 생기지 않는다', () => {
    const out = formatSlackText('*CTO 계획 제안*');
    expect(out).not.toContain('**');
  });
});
