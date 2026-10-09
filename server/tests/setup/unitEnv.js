// Unit tests must never reach a real database or external service.
// Runs before each test file and before src/config/env.ts loads server/.env;
// dotenv never overrides variables that are already set, so these values win.
// Prisma has to be mocked (see tests/analyticsPrismaMock.ts); any unmocked query
// fails against this unreachable address instead of writing to Neon.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://unit-tests-must-mock-prisma@127.0.0.1:9/none';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.GEOCODING_ENABLED = 'false';
