// R5 Viewtrap 자동화 — 1회 수동 로그인 → 세션 저장.
//
// Viewtrap 로그인은 카카오/구글 OAuth만 지원한다(이메일/비번 칸 없음). 따라서
// 코드가 비밀번호를 다루거나 OAuth를 자동화하지 않는다. 대신 헤드드 브라우저를 띄워
// 사장님이 직접 카카오/구글로 로그인하면, 그 로그인 세션(storageState)을 홈 디렉토리에
// 저장한다. 이후 scrape.mjs가 이 세션을 로드해 로그인 상태로 검색한다.
//
// 세션 파일에는 인증 쿠키(민감정보)가 들어가므로 절대 레포 안에 쓰지 않는다 — 홈(~/.l5)에 저장.
//
// 실행: corepack pnpm exec node e2e/viewtrap/login.mjs   (apps/founder-ui 에서)

import { chromium } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const LOGIN_URL = 'https://app.viewtrap.com/auth/login';
const SESSION_PATH =
  process.env.VIEWTRAP_SESSION ?? path.join(os.homedir(), '.l5', 'viewtrap-session.json');
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5분
const POLL_MS = 1500;

async function main() {
  console.log('Viewtrap 로그인 헬퍼를 시작합니다.');
  console.log('헤드드 브라우저가 열리면 카카오 또는 구글로 직접 로그인하세요.');
  console.log(`로그인 페이지: ${LOGIN_URL}`);
  console.log(`세션 저장 경로: ${SESSION_PATH}`);
  console.log('(코드는 OAuth를 자동화하지 않습니다 — 로그인 완료를 감지만 합니다.)\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.error('로그인 페이지 이동 실패:', String(e).slice(0, 160));
    await browser.close();
    process.exit(1);
  }

  // 성공 판정: URL이 /auth/login 을 벗어나 app.viewtrap.com 의 다른 경로로 이동.
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let loggedIn = false;
  while (Date.now() < deadline) {
    let url = '';
    try {
      url = page.url();
    } catch {
      // 페이지/컨텍스트가 닫힌 경우
      console.error('\n브라우저가 닫혔습니다. 로그인을 완료하지 못했습니다.');
      break;
    }
    const onViewtrap = url.includes('app.viewtrap.com');
    const stillOnLogin = url.includes('/auth/login');
    if (onViewtrap && !stillOnLogin) {
      loggedIn = true;
      break;
    }
    await page.waitForTimeout(POLL_MS);
  }

  if (!loggedIn) {
    console.error(
      '\n로그인 감지 실패 (타임아웃 5분 또는 브라우저 종료). 다시 login.mjs를 실행해 로그인하세요.',
    );
    await browser.close();
    process.exit(2);
  }

  fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true });
  await context.storageState({ path: SESSION_PATH });
  console.log(`\n로그인 감지 → 세션 저장 완료: ${SESSION_PATH}`);
  console.log('이제 scrape.mjs를 반복 실행할 수 있습니다. (세션 만료 시 이 스크립트를 재실행)');

  await browser.close();
}

main().catch((e) => {
  console.error('예기치 못한 오류:', e);
  process.exit(1);
});
