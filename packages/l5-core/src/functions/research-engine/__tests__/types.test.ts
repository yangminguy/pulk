import {
  ResearchParseError,
  requireArray,
  requireString,
  strictJsonObject,
  toFiniteNumber,
} from '../types';

describe('strictJsonObject', () => {
  it('strips a ```json code fence and parses', () => {
    expect(strictJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('tolerates surrounding prose', () => {
    expect(strictJsonObject('sure! {"a":2} done')).toEqual({ a: 2 });
  });
  it('throws (explicit error) on empty input', () => {
    expect(() => strictJsonObject('   ')).toThrow(ResearchParseError);
  });
  it('throws on invalid JSON', () => {
    expect(() => strictJsonObject('{not json')).toThrow(ResearchParseError);
  });
  it('throws when the value is an array, not an object', () => {
    expect(() => strictJsonObject('[1,2,3]')).toThrow(/expected a JSON object/);
  });
});

describe('requireArray / requireString', () => {
  it('returns the array when present', () => {
    expect(requireArray({ xs: [1, 2] }, 'xs')).toEqual([1, 2]);
  });
  it('throws when the field is not an array', () => {
    expect(() => requireArray({ xs: 'no' }, 'xs')).toThrow(ResearchParseError);
  });
  it('returns a trimmed non-empty string', () => {
    expect(requireString('  hi  ', 'f')).toBe('hi');
  });
  it('throws on empty / non-string', () => {
    expect(() => requireString('   ', 'f')).toThrow(ResearchParseError);
    expect(() => requireString(42, 'f')).toThrow(ResearchParseError);
  });
});

describe('toFiniteNumber', () => {
  it('passes through finite numbers and parses numeric strings', () => {
    expect(toFiniteNumber(3.5)).toBe(3.5);
    expect(toFiniteNumber('7')).toBe(7);
  });
  it('uses the fallback for NaN / non-numeric', () => {
    expect(toFiniteNumber('abc', -1)).toBe(-1);
    expect(toFiniteNumber(Infinity, 0)).toBe(0);
  });
});
