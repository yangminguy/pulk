import fs from 'fs';
import path from 'path';

import { expect, test as setup } from '@playwright/test';

// 保存登录状态，避免每次都要登录
setup('admin', async ({ request, baseURL }) => {
  const response = await request.post('/api/auth:signIn', {
    data: {
      account: 'admin@nocobase.com',
      password: 'admin123',
    },
  });
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  const token = payload?.data?.token;
  expect(token).toBeTruthy();

  const authFile = process.env.PLAYWRIGHT_AUTH_FILE;
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  fs.writeFileSync(
    authFile,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: baseURL ?? 'http://127.0.0.1:20000',
          localStorage: [
            { name: 'NOCOBASE_TOKEN', value: token },
            { name: 'NOCOBASE_DESIGNABLE', value: 'true' },
          ],
        },
      ],
    }),
  );
});
