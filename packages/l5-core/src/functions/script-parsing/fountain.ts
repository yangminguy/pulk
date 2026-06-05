export type FountainBlock = { type: string; text: string };

const SCENE_HEADING_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*/i;
const CHARACTER_RE = /^[A-Z][A-Z0-9 .'\-]+$/;
const PARENTHETICAL_RE = /^\(.*\)$/;

export function parseFountain(text: string): FountainBlock[] {
  const lines = text.split('\n');
  const blocks: FountainBlock[] = [];
  let prevType = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      prevType = '';
      continue;
    }

    if (SCENE_HEADING_RE.test(trimmed)) {
      blocks.push({ type: 'scene-heading', text: trimmed });
      prevType = 'scene-heading';
      continue;
    }

    if (
      PARENTHETICAL_RE.test(trimmed) &&
      (prevType === 'character' || prevType === 'parenthetical')
    ) {
      blocks.push({ type: 'parenthetical', text: trimmed });
      prevType = 'parenthetical';
      continue;
    }

    if (CHARACTER_RE.test(trimmed) && !SCENE_HEADING_RE.test(trimmed)) {
      blocks.push({ type: 'character', text: trimmed });
      prevType = 'character';
      continue;
    }

    if (prevType === 'character' || prevType === 'parenthetical') {
      blocks.push({ type: 'dialogue', text: trimmed });
      prevType = 'dialogue';
      continue;
    }

    blocks.push({ type: 'action', text: trimmed });
    prevType = 'action';
  }

  return blocks;
}

export function serializeFountain(blocks: FountainBlock[]): string {
  const parts: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const prev = blocks[i - 1];

    if (
      i > 0 &&
      (block.type === 'scene-heading' || block.type === 'character') &&
      prev &&
      prev.type !== 'character' &&
      prev.type !== 'parenthetical'
    ) {
      parts.push('');
    }

    parts.push(block.text);
  }

  return parts.join('\n');
}
