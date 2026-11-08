import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 2: Boundary 02 - RBAC Edge Cases & Permissions Escalation', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.2.1: Tampered role string in forged token is rejected with 401', async () => {
    const client = await createTestClient();
    // Forged token claiming ADMIN role
    const forgedToken = Buffer.from(JSON.stringify({ id: 999999, email: 'fake@test.local', role: 'ADMIN' })).toString('base64');
    client.setToken(forgedToken);

    const res = await client.get('/admin/stats');
    assertError(res, 401, 'Unauthorized');
  });

  test('2.2.2: Attendee attempting to access organizer tiers management returns 403', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/tiers', {
      name: 'Hacked Tier',
      price: 0,
      total_quantity: 10,
    });
    assertError(res, 403, 'Forbidden');
  });

  test('2.2.3: Suspended user attempting authenticated actions returns 403 Forbidden', async () => {
    const clientAdmin = await createTestClient();
    const adminLogin = await clientAdmin.post('/auth/login', {
      email: 'admin@ticketflow.local',
      password: 'password123',
    });
    clientAdmin.setToken(adminLogin.body.token);

    // Register a user to suspend
    const clientUser = await createTestClient();
    const userEmail = `suspendme_${Date.now()}@test.local`;
    const regRes = await clientUser.post('/auth/register', {
      name: 'To Be Suspended',
      email: userEmail,
      password: 'password123',
      role: 'ORGANIZER',
    });
    const targetUserId = regRes.body.user.id;
    clientUser.setToken(regRes.body.token);

    // Admin suspends user
    const suspendRes = await clientAdmin.post(`/admin/users/${targetUserId}/suspend`, {});
    assertStatus(suspendRes, 200);

    // User attempts to make an authenticated request
    const actionRes = await clientUser.post('/events', {
      title: 'Suspended Event',
    });
    assertError(actionRes, 401);
  });

  test('2.2.4: Organizer attempting to access /api/admin/stats is denied with 403 Forbidden', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.get('/admin/stats');
    assertError(res, 403, 'Forbidden');
  });

  test('2.2.5: User without Bearer header attempting organizer mutation returns 401 Unauthorized', async () => {
    const client = await createTestClient();
    client.clearToken();

    const res = await client.post('/events/1/tiers', {
      name: 'Anonymous Tier',
      price: 100,
      total_quantity: 5,
    });
    assertError(res, 401, 'Unauthorized');
  });
});
