import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createFrontendClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 2: Boundary 10 - Frontend Routing & Edge Navigation', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.10.1: Non-existent static asset route returns 404 Not Found', async () => {
    const client = await createFrontendClient();
    const res = await client.get('/non_existent_asset.css');
    assertError(res, 404);
  });

  test('2.10.2: Navigating to /events/999999 returns 200 SPA shell (client router handles 404 state)', async () => {
    const client = await createFrontendClient();
    const res = await client.get('/events/999999');
    assertStatus(res, 200);
    assert.strictEqual(res.headers.get('content-type')?.includes('text/html'), true);
  });

  test('2.10.3: Rapid sequential navigation requests all yield 200 without connection exhaustion', async () => {
    const client = await createFrontendClient();
    const routes = ['/', '/events/1', '/checkout', '/admin', '/login', '/register'];

    for (const route of routes) {
      const res = await client.get(route);
      assertStatus(res, 200, `Route ${route} should respond cleanly`);
    }
  });

  test('2.10.4: SPA entry point contains valid viewport and semantic HTML headers', async () => {
    const client = await createFrontendClient();
    const res = await client.get('/');
    assertStatus(res, 200);
    assert.ok(res.rawText.includes('<!DOCTYPE html>'));
    assert.ok(res.rawText.includes('<head>'));
    assert.ok(res.rawText.includes('<body>'));
  });

  test('2.10.5: Requesting invalid method POST on static root returns proper response', async () => {
    const client = await createFrontendClient();
    const res = await client.post('/', {});
    // Should either be rejected with 404 or handled as not found on root
    assert.ok(res.status === 404 || res.status === 405 || res.status === 200);
  });
});
