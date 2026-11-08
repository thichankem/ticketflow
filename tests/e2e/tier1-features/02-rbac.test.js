import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError, assertJsonStructure } from '../helpers/assertions.js';

describe('Tier 1: Feature 02 - Authorization & RBAC', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.1: Admin can access /api/admin/stats with 200 OK', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'admin@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.get('/admin/stats');
    assertStatus(res, 200, 'Admin should have access to admin stats');
    assertJsonStructure(res.body, ['total_users', 'total_events', 'total_orders']);
  });

  test('2.2: Attendee accessing /api/admin/stats is denied with 403 Forbidden', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.get('/admin/stats');
    assertError(res, 403, 'Forbidden');
  });

  test('2.3: Unauthenticated user accessing /api/admin/stats is denied with 401 Unauthorized', async () => {
    const client = await createTestClient();
    client.clearToken();

    const res = await client.get('/admin/stats');
    assertError(res, 401, 'Unauthorized');
  });

  test('2.4: Organizer can create a new event with 201 Created', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events', {
      title: 'DevOps Summit 2026',
      description: 'Continuous Delivery and Cloud Infrastructure',
      status: 'LIVE',
    });

    assertStatus(res, 201, 'Organizer should be allowed to create events');
    assertJsonStructure(res.body, ['event']);
    assert.strictEqual(res.body.event.title, 'DevOps Summit 2026');
  });

  test('2.5: Attendee attempting to create an event is denied with 403 Forbidden', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events', {
      title: 'Hacker Party',
      description: 'Unauthorized event',
    });

    assertError(res, 403, 'Forbidden');
  });
});
