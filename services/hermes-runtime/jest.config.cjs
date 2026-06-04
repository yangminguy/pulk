module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Exclude auto-approve.test.ts — it is a standalone assertion script, not a jest suite
  testPathIgnorePatterns: ['/node_modules/', 'auto-approve\\.test\\.ts'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Strip .js extension for CommonJS module resolution
    '^(\\./|\\.\\./)(.*)\\.js$': '$1$2',
    '^@l5/core$': '<rootDir>/../../packages/l5-core/src/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'node',
      },
    }],
  },
};
