// Unit tests (default `npm test`): Prisma is mocked and no database is required.
// Database-backed suites live in tests/integration and use jest.integration.config.js.
export const baseConfig = { preset: 'ts-jest/presets/default-esm', testEnvironment: 'node', extensionsToTreatAsEsm: ['.ts'], moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' }, transform: { '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.json' }] } };

export default {
  ...baseConfig,
  roots: ['<rootDir>/tests'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/integration/'],
  setupFiles: ['<rootDir>/tests/setup/unitEnv.js'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/scripts/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'html', 'lcov']
};
