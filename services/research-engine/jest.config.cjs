/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  // Unit suites only — the live-integration e2e/ scripts are plain .mjs run
  // manually by the orchestrator (they hit real YouTube/Notion/Slack).
  testMatch: ['**/src/__tests__/**/*.test.ts'],
};
