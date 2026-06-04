import type { Snapshot } from '../../schemas/snapshot';

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generateSnapshot(data: Snapshot): string {
  const title = escapeXml(data.title);
  const content = escapeXml(data.content);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400">
  <rect width="800" height="400" fill="${data.theme === 'dark' ? '#1a1a2e' : '#ffffff'}" />
  <text x="40" y="60" font-size="24" fill="${data.theme === 'dark' ? '#ffffff' : '#000000'}">${title}</text>
  <text x="40" y="100" font-size="16" fill="${data.theme === 'dark' ? '#cccccc' : '#333333'}">${content}</text>
</svg>`;
}
