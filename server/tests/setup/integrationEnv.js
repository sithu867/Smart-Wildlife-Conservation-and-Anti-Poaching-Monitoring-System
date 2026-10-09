// Integration tests write real rows, so they only run against an explicitly
// supplied, disposable test database (for example a Neon test branch) and
// never against the DATABASE_URL/DIRECT_URL configured in server/.env.
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    'Integration tests require TEST_DATABASE_URL pointing at a disposable test database. ' +
      'They never use the DATABASE_URL in server/.env.',
  );
}

// Compare host and database so pooled/direct variants of the same Neon database also match.
const databaseIdentity = (url) => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace('-pooler', '')}${parsed.pathname}`;
  } catch {
    return url;
  }
};
const envFile = new URL('../../.env', import.meta.url);
const configured = existsSync(envFile) ? parse(readFileSync(envFile)) : {};
const configuredDatabases = [configured.DATABASE_URL, configured.DIRECT_URL]
  .filter(Boolean)
  .map(databaseIdentity);
if (configuredDatabases.includes(databaseIdentity(testUrl))) {
  throw new Error(
    'TEST_DATABASE_URL points at the database configured in server/.env. Use a separate test database.',
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = process.env.TEST_DIRECT_URL || testUrl;
process.env.GEOCODING_ENABLED = 'false';
