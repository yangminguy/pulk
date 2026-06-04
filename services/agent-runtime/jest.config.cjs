/** Jest config for @l5/agent-runtime.
 * Uses ts-jest in CommonJS mode for tests; the production build still
 * targets ESNext via tsconfig. Tests only consume types from @l5/core, so we
 * tell ts-jest to load a CommonJS-compatible variant of the tsconfig.
 */
const path = require('node:path');
const L5_CORE_TYPES = path.join(__dirname, '..', '..', 'packages', 'l5-core', 'node_modules', '@types');
const LOCAL_TYPES = path.join(__dirname, 'node_modules', '@types');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: __dirname,
  roots: ['<rootDir>/src'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  // Treat @l5/core import as the built dist (CommonJS) so ts-jest can load it.
  moduleNameMapper: {
    '^@l5/core$': '<rootDir>/../../packages/l5-core/dist/index.js',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          target: 'ES2020',
          esModuleInterop: true,
          moduleResolution: 'node',
          strict: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          types: ['jest', 'node'],
          typeRoots: [LOCAL_TYPES, L5_CORE_TYPES],
        },
      },
    ],
  },
};
