import fs from 'fs';
import path from 'path';

import { expect, test as setup } from '@playwright/test';

setup.setTimeout(120_000);

// 保存登录状态，避免每次都要登录
setup('admin', async ({ baseURL }) => {
  const origin = baseURL ?? 'http://127.0.0.1:20000';
  const response = await fetch(`${origin}/api/auth:signIn`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account: 'admin@nocobase.com',
      password: 'admin123',
    }),
  });
  expect(response.ok).toBeTruthy();

  const payload = await response.json();
  const token = payload?.data?.token;
  expect(token).toBeTruthy();

  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  expect(authFile).toBeTruthy();
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  fs.writeFileSync(
    authFile,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin,
          localStorage: [
            { name: 'NOCOBASE_TOKEN', value: token },
            { name: 'NOCOBASE_DESIGNABLE', value: 'true' },
          ],
        },
      ],
    }),
  );
});
