import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const target = resolve(process.cwd(), 'storage/playwright/tests/auth.setup.ts');

const source = `import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test as setup } from '@playwright/test';

setup.setTimeout(60_000);

// Persist admin login state for NocoBase e2e tests.
setup('admin', async ({ request, baseURL }) => {
  const response = await request.post('/api/auth:signIn', {
    data: {
      account: process.env.NOCOBASE_USERNAME ?? 'admin@nocobase.com',
      password: process.env.NOCOBASE_PASSWORD ?? 'admin123',
    },
  });
  if (!response.ok()) {
    throw new Error(\`auth:signIn failed: \${response.status()} \${await response.text()}\`);
  }
  const payload = await response.json();
  const token = payload?.data?.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('auth:signIn response did not include data.token');
  }

  const origin = baseURL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:20000';
  mkdirSync(dirname(process.env.PLAYWRIGHT_AUTH_FILE!), { recursive: true });
  writeFileSync(process.env.PLAYWRIGHT_AUTH_FILE!, JSON.stringify({
    cookies: [],
    origins: [{
      origin,
      localStorage: [
        { name: 'NOCOBASE_TOKEN', value: token },
        { name: 'NOCOBASE_AUTH', value: 'basic' },
        { name: 'NOCOBASE_DESIGNABLE', value: 'true' },
      ],
    }],
  }));
});
`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, source);
console.log(`Prepared ${target}`);
