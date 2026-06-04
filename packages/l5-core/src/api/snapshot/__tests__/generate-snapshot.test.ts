import { generateSnapshot } from '../generate-snapshot';

describe('generateSnapshot', () => {
  it('should return SVG string for valid snapshot data', () => {
    const data = {
      title: 'Test PT',
      content: 'Test content',
      theme: 'light' as const
    };
    
    // We expect the result to be a string containing '<svg'
    const svgString = generateSnapshot(data);
    expect(typeof svgString).toBe('string');
    expect(svgString.trim().startsWith('<svg')).toBe(true);
  });
});
