// Integration tests write to a real database. They run only via `npm run test:integration`
// and only when TEST_DATABASE_URL names a separate test database (see tests/setup/integrationEnv.js).
import { baseConfig } from './jest.config.js';

export default {
  ...baseConfig,
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.integration.test.ts'],
  setupFiles: ['<rootDir>/tests/setup/integrationEnv.js']
};
