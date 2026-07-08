// CMO Insight Loop — Step 3: 텔레그램 발송.
// 토큰/chat_id는 launchd plist(telegram-gateway)에서 런타임에 읽는다(시크릿 하드코딩 금지).
//
// Usage: node scripts/send-telegram.mjs --html <path> [--caption "텍스트"]
//        node scripts/send-telegram.mjs --message "텍스트"

import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : undefined;
}

function expandHome(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

function plistEnv(key) {
  const plist = expandHome(CONFIG.telegramPlistPath);
  return execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', `Print :EnvironmentVariables:${key}`, plist],
    { encoding: 'utf8' },
  ).trim();
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || plistEnv('TELEGRAM_BOT_TOKEN');
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || plistEnv('TELEGRAM_CHAT_ID');
const API = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(text) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, disable_web_page_preview: true }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`sendMessage failed: ${JSON.stringify(data)}`);
}

async function sendDocument(path, caption) {
  const buf = readFileSync(path);
  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  if (caption) form.append('caption', caption.slice(0, 1024));
  form.append('document', new Blob([buf], { type: 'text/html' }), basename(path));
  const res = await fetch(`${API}/sendDocument`, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(`sendDocument failed: ${JSON.stringify(data)}`);
}

async function main() {
  const html = arg('html');
  const caption = arg('caption');
  const message = arg('message');
  if (!html && !message) throw new Error('--html <path> 또는 --message "텍스트" 필요');
  if (message) await sendMessage(message);
  if (html) await sendDocument(html, caption);
  console.log(JSON.stringify({ ok: true }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
