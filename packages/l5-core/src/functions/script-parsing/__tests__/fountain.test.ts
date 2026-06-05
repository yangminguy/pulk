import { parseFountain, serializeFountain } from '../fountain';

describe('Fountain Parsing', () => {
  it('parses standard Fountain text into structural blocks within 500ms', () => {
    const script = `INT. GARAGE - DAY

STEVE
(excitedly)
We're going to change the world, Woz!

WOZ
I just want to build a good computer.`;
    
    const startTime = performance.now();
    const blocks = parseFountain(script);
    const endTime = performance.now();
    
    expect(endTime - startTime).toBeLessThan(500);
    expect(blocks).toHaveLength(6); // Scene Heading, Character, Parenthetical, Dialogue, Character, Dialogue
    expect(blocks[0].type).toBe('scene-heading');
    expect(blocks[0].text).toBe('INT. GARAGE - DAY');
    
    expect(blocks[1].type).toBe('character');
    expect(blocks[1].text).toBe('STEVE');
    
    expect(blocks[2].type).toBe('parenthetical');
    expect(blocks[2].text).toBe('(excitedly)');
    
    expect(blocks[3].type).toBe('dialogue');
    expect(blocks[3].text).toBe("We're going to change the world, Woz!");
  });
  
  it('Data Round-trip Validation', () => {
    const blocks = [
      { type: 'character', text: 'STEVE' },
      { type: 'dialogue', text: 'Hello world.' }
    ];
    const text = serializeFountain(blocks);
    const parsedBlocks = parseFountain(text);
    expect(parsedBlocks).toEqual(blocks);
  });
});
