/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/simulator.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
};
