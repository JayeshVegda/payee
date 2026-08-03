import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type DatabaseRuntime } from '@payment-ledger/database';
import { createApp } from './app.js';

const runtimes: DatabaseRuntime[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'payment-ledger-server-test-'));
  directories.push(directory);
  const runtime = openDatabase({ databasePath: join(directory, 'ledger.sqlite3') });
  runtimes.push(runtime);
  return createApp({
    runtime,
    expectedHost: '127.0.0.1:4782',
    webBuildDirectory: directory,
    logLevel: 'silent'
  });
}

describe('server app', () => {
  it('reports application and database health', async () => {
    const response = await fixture().request('/api/health', {
      headers: { host: '127.0.0.1:4782' }
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      version: '0.1.0',
      database: 'ok'
    });
  });

  it('rejects unexpected hosts and origins', async () => {
    const app = fixture();
    const hostResponse = await app.request('/api/health', { headers: { host: 'evil.example' } });
    expect(hostResponse.status).toBe(403);
    const originResponse = await app.request('/api/missing', {
      method: 'POST',
      headers: { host: '127.0.0.1:4782', origin: 'https://evil.example' }
    });
    expect(originResponse.status).toBe(403);
  });

  it('accepts the configured HTTPS origin', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'payment-ledger-server-test-'));
    directories.push(directory);
    const runtime = openDatabase({ databasePath: join(directory, 'ledger.sqlite3') });
    runtimes.push(runtime);
    const app = createApp({
      runtime,
      expectedHost: 'ledger.local',
      expectedOrigin: 'https://ledger.local',
      webBuildDirectory: directory,
      logLevel: 'silent'
    });
    const response = await app.request('/api/missing', {
      method: 'POST',
      headers: { host: 'ledger.local', origin: 'https://ledger.local' }
    });
    expect(response.status).toBe(404);
  });

  it('returns a typed API 404', async () => {
    const response = await fixture().request('/api/missing', {
      headers: { host: '127.0.0.1:4782' }
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
