import { extractReadableText, MIN_READABLE_LEN } from '../index';

describe('extractReadableText', () => {
  it('returns empty for empty input', () => {
    expect(extractReadableText('')).toBe('');
  });

  it('strips inline tags and keeps readable prose', () => {
    const html = '<p>Claude 4.8 ships <b>faster output</b> for Opus and a new <a href="#">fast mode</a> toggle.</p>';
    const out = extractReadableText(html);
    expect(out).toContain('Claude 4.8 ships faster output for Opus');
    expect(out).not.toContain('<');
  });

  it('drops <script>/<style>/<head> blocks entirely', () => {
    const html =
      '<head><title>x</title></head><style>.a{color:red}</style>' +
      '<body><h1>Release notes: added retry on empty output and merge coordinator support today.</h1>' +
      '<script>window.__DATA__={secret:1}</script></body>';
    const out = extractReadableText(html);
    expect(out).toContain('Release notes: added retry on empty output');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('color:red');
  });

  it('returns empty for a JS app shell with no readable prose', () => {
    const shell =
      '<!DOCTYPE html><html class="h-screen antialiased __variable_8d1da5">' +
      '<head><meta charset="utf-8"></head><body><div id="__next"></div>' +
      '<script src="/_next/static/chunks/main.js"></script></body></html>';
    expect(extractReadableText(shell)).toBe('');
  });

  it('decodes named and numeric entities', () => {
    const html = '<p>Tom &amp; Jerry &#39;quote&#39; &lt;tag&gt; price &#8364;10 over a readable changelog line here.</p>';
    const out = extractReadableText(html);
    expect(out).toContain("Tom & Jerry 'quote' <tag>");
    expect(out).toContain('€10');
  });

  it('strips a trailing tag truncated without its closing bracket', () => {
    const html = 'A genuinely readable changelog summary line that exceeds the floor <meta name="x" content="y';
    const out = extractReadableText(html);
    expect(out).not.toContain('<meta');
    expect(out).toContain('readable changelog summary');
  });

  it('truncates to maxLen with an ellipsis', () => {
    const long = 'word '.repeat(200); // 1000 chars of readable text
    const out = extractReadableText(long, 100);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out.endsWith('…')).toBe(true);
  });

  it('treats sub-floor readable text as no content', () => {
    expect(extractReadableText('<p>ok</p>')).toBe('');
    expect('ok'.length).toBeLessThan(MIN_READABLE_LEN);
  });
});
