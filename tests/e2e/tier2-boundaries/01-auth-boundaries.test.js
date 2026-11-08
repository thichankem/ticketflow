import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 2: Boundary 01 - Auth Edge Cases & Negative Tests', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.1.1: Registration with empty password returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const res = await client.post('/auth/register', {
      name: 'No Password User',
      email: `nopass_${Date.now()}@test.local`,
      password: '',
    });

    assertError(res, 400);
  });

  test('2.1.2: Registration with duplicate email (case-insensitive) returns 409 Conflict', async () => {
    const client = await createTestClient();
    const email = `duplicate_${Date.now()}@test.local`;
    const firstRes = await client.post('/auth/register', {
      name: 'First User',
      email: email.toLowerCase(),
      password: 'password123',
    });
    assertStatus(firstRes, 201);

    const dupRes = await client.post('/auth/register', {
      name: 'Second User',
      email: email.toUpperCase(),
      password: 'differentPassword',
    });
    assertError(dupRes, 409);
  });

  test('2.1.3: Login with non-existent email returns 401 Unauthorized', async () => {
    const client = await createTestClient();
    const res = await client.post('/auth/login', {
      email: 'nonexistent_user_9999@test.local',
      password: 'password123',
    });

    assertError(res, 401);
  });

  test('2.1.4: Malformed or missing Bearer token in Authorization header returns 401 Unauthorized', async () => {
    const client = await createTestClient();
    client.setToken('invalid-non-base64-garbage-token');
    const res = await client.get('/auth/me');

    assertError(res, 401);
  });

  test('2.1.5: Refresh endpoint with invalid/tampered cookie returns 401 Unauthorized', async () => {
    const client = await createTestClient();
    client.setCookie('refreshToken', 'tampered_refresh_cookie_value');
    const res = await client.post('/auth/refresh', {});

    assertError(res, 401);
  });
});
