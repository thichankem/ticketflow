import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createFrontendClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus } from '../helpers/assertions.js';

describe('Tier 1: Feature 10 - Frontend SPA & Core Routes', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('10.1: Home route / returns 200 OK HTML with SPA container', async () => {
    const client = await createFrontendClient();
    const res = await client.get('/');

    assertStatus(res, 200, 'Home route should return 200 OK');
    assert.strictEqual(res.headers.get('content-type')?.includes('text/html'), true);
    assert.ok(res.rawText.includes('<div id="root">') || res.rawText.includes('SPA Route: /'));
  });

  test('10.2: Event Details route /events/1 returns 200 OK HTML', async () => {
    const client = await createFrontendClient();
    const res = await client.get('/events/1');

    assertStatus(res, 200, 'Event details SPA route should return 200 OK');
    assert.strictEqual(res.headers.get('content-type')?.includes('text/html'), true);
  });

  test('10.3: Checkout route /checkout returns 200 OK HTML', async () => {
    const client = await createFrontendClient();
    const res = await client.get('/checkout');

    assertStatus(res, 200, 'Checkout route should return 200 OK');
    assert.strictEqual(res.headers.get('content-type')?.includes('text/html'), true);
  });

  test('10.4: Admin route /admin returns 200 OK HTML', async () => {
    const client = await createFrontendClient();
    const res = await client.get('/admin');

    assertStatus(res, 200, 'Admin route should return 200 OK');
    assert.strictEqual(res.headers.get('content-type')?.includes('text/html'), true);
  });

  test('10.5: Auth routes /login and /register return 200 OK HTML', async () => {
    const client = await createFrontendClient();
    const loginRes = await client.get('/login');
    const registerRes = await client.get('/register');

    assertStatus(loginRes, 200);
    assertStatus(registerRes, 200);
    assert.strictEqual(loginRes.headers.get('content-type')?.includes('text/html'), true);
    assert.strictEqual(registerRes.headers.get('content-type')?.includes('text/html'), true);
  });
});
