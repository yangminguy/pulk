/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-core-to-nocobase',
      comment: 'A1/A2: l5-core must not depend on NocoBase',
      severity: 'error',
      from: { path: '^packages/l5-core/' },
      to: { path: '^apps/nocobase-app/' },
    },
    {
      name: 'plugin-must-use-core',
      comment: 'A3: plugins must delegate domain logic to l5-core, not duplicate it',
      severity: 'error',
      from: { path: '^apps/nocobase-app/packages/plugins/@l5/' },
      to: { path: '^services/' },
    },
    {
      name: 'no-agent-in-shell',
      comment: 'A5: agent runtime must be separated from UI shell',
      severity: 'error',
      from: { path: '^apps/nocobase-app/' },
      to: { path: '^services/agent-runtime/' },
    },
    {
      name: 'no-hermes-in-shell',
      comment: 'A6: hermes runtime must be separated from UI shell',
      severity: 'error',
      from: { path: '^apps/nocobase-app/' },
      to: { path: '^services/hermes-runtime/' },
    },
    {
      name: 'no-cross-runtime',
      comment: 'A5/A6: agent and hermes runtimes must not depend on each other',
      severity: 'error',
      from: { path: '^services/agent-runtime/' },
      to: { path: '^services/hermes-runtime/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
  },
};
