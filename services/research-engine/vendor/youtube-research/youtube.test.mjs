import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendWithoutRollingOverlap,
  buildTranscriptChunks,
  extractVideoId,
  parseJson3,
  parseVtt,
} from './youtube.mjs';

test('extractVideoId accepts ids and common YouTube URLs', () => {
  assert.equal(extractVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('rolling auto-caption overlap is removed without deleting new text', () => {
  assert.equal(appendWithoutRollingOverlap('콘텐츠는 고객 문제에서', '콘텐츠는 고객 문제에서 시작합니다'), '시작합니다');
  assert.equal(appendWithoutRollingOverlap('start with the customer problem', 'customer problem before choosing a format'), 'before choosing a format');
});

test('parseVtt preserves timestamps and creates source links', () => {
  const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n콘텐츠는 고객 문제에서\n\n00:00:03.000 --> 00:00:05.500\n콘텐츠는 고객 문제에서 시작합니다\n\n00:00:06.000 --> 00:00:08.000\n그리고 메시지를 검증합니다\n`;
  const segments = parseVtt(vtt, 'dQw4w9WgXcQ');
  assert.equal(segments.length, 3);
  assert.equal(segments[0].startTimestamp, '00:00:01');
  assert.equal(segments[1].text, '시작합니다');
  assert.equal(segments[1].sourceUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3s');
});

test('parseJson3 preserves event timing', () => {
  const json3 = JSON.stringify({
    events: [
      { tStartMs: 1500, dDurationMs: 2000, segs: [{ utf8: 'first claim' }] },
      { tStartMs: 3500, dDurationMs: 1500, segs: [{ utf8: 'second claim' }] },
    ],
  });
  const segments = parseJson3(json3, 'dQw4w9WgXcQ');
  assert.equal(segments.length, 2);
  assert.equal(segments[0].startSeconds, 1.5);
  assert.equal(segments[0].endSeconds, 3.5);
});

test('buildTranscriptChunks keeps all segments and timestamp ranges', () => {
  const segments = [
    { index: 0, startSeconds: 0, endSeconds: 2, startTimestamp: '00:00:00', endTimestamp: '00:00:02', text: 'a'.repeat(700), sourceUrl: 'u0' },
    { index: 1, startSeconds: 2, endSeconds: 4, startTimestamp: '00:00:02', endTimestamp: '00:00:04', text: 'b'.repeat(700), sourceUrl: 'u1' },
    { index: 2, startSeconds: 4, endSeconds: 6, startTimestamp: '00:00:04', endTimestamp: '00:00:06', text: 'c'.repeat(700), sourceUrl: 'u2' },
  ];
  const chunks = buildTranscriptChunks(segments, 1000);
  assert.equal(chunks.length, 3);
  assert.equal(chunks.map((chunk) => chunk.text).join('').length, 2100);
  assert.equal(chunks[2].startTimestamp, '00:00:04');
});
