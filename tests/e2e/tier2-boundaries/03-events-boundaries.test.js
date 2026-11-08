import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 2: Boundary 03 - Events Boundaries & Negative Scenarios', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.3.1: Creating event with empty title returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events', {
      title: '',
      description: 'Valid description',
    });
    assertError(res, 400);
  });

  test('2.3.2: Querying non-existent event ID returns 404 Not Found', async () => {
    const client = await createTestClient();
    const res = await client.get('/events/99999999');
    assertError(res, 404);
  });

  test('2.3.3: Updating event with non-numeric event ID returns 404', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.put('/events/abc-invalid-id', {
      title: 'Updated Title',
    });
    assertError(res, 404);
  });

  test('2.3.4: Deleting non-existent event ID returns 404 Not Found', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.delete('/events/88888888');
    assertError(res, 404);
  });

  test('2.3.5: Event with empty string description is accepted and saved cleanly', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events', {
      title: 'Minimal Event Without Description',
      description: '',
    });
    assertStatus(res, 201);
    assert.strictEqual(res.body.event.title, 'Minimal Event Without Description');
  });
});
