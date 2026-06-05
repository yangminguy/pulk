export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }]
  },
  extensionsToTreatAsEsm: ['.ts']
};
