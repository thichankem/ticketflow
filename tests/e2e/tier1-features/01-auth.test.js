import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertOk, assertJsonStructure } from '../helpers/assertions.js';

describe('Tier 1: Feature 01 - Authentication', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('1.1: Attendee user registration issues 201 Created with Bearer access token and HttpOnly refresh cookie', async () => {
    const client = await createTestClient();
    const uniqueEmail = `attendee_${Date.now()}@example.com`;
    const res = await client.post('/auth/register', {
      name: 'Alice Attendee',
      email: uniqueEmail,
      password: 'SecurePassword123!',
      role: 'ATTENDEE',
    });

    assertStatus(res, 201, 'Registration should return 201 Created');
    assertJsonStructure(res.body, ['user', 'token']);
    assert.strictEqual(res.body.user.email, uniqueEmail.toLowerCase());
    assert.strictEqual(res.body.user.role, 'ATTENDEE');

    // Verify refresh token cookie is set
    const refreshCookie = client.getCookie('refreshToken');
    assert.ok(refreshCookie, 'refreshToken cookie must be stored in cookie jar');
  });

  test('1.2: Login with valid credentials returns 200 OK with access token and set-cookie', async () => {
    const client = await createTestClient();
    const res = await client.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });

    assertStatus(res, 200, 'Valid login should return 200 OK');
    assertJsonStructure(res.body, ['user', 'token']);
    assert.strictEqual(res.body.user.email, 'attendee@ticketflow.local');

    const refreshCookie = client.getCookie('refreshToken');
    assert.ok(refreshCookie, 'refreshToken cookie should be set after login');
  });

  test('1.3: Token refresh endpoint /api/auth/refresh accepts HttpOnly cookie and returns new valid access token', async () => {
    const client = await createTestClient();
    // Login first to populate cookie
    await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });

    // Request new token
    const refreshRes = await client.post('/auth/refresh', {});
    assertStatus(refreshRes, 200, 'Refresh endpoint should return 200 OK with cookie present');
    assertJsonStructure(refreshRes.body, ['token']);
    assert.ok(typeof refreshRes.body.token === 'string' && refreshRes.body.token.length > 0);
  });

  test('1.4: /api/auth/me with Bearer token successfully returns authenticated user profile', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'admin@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const meRes = await client.get('/auth/me');
    assertStatus(meRes, 200, '/auth/me should return 200 OK with valid token');
    assert.strictEqual(meRes.body.user.email, 'admin@ticketflow.local');
    assert.strictEqual(meRes.body.user.role, 'ADMIN');
  });

  test('1.5: Logout clears refresh token cookie and returns 200 OK', async () => {
    const client = await createTestClient();
    await client.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });

    const logoutRes = await client.post('/auth/logout', {});
    assertStatus(logoutRes, 200, 'Logout should return 200 OK');

    // After logout, cookie is emptied or expired
    const cookieVal = client.getCookie('refreshToken');
    assert.ok(!cookieVal || cookieVal === '', 'RefreshToken cookie should be cleared on logout');
  });
});
