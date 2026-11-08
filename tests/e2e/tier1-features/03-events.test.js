import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertOk, assertJsonStructure } from '../helpers/assertions.js';

describe('Tier 1: Feature 03 - Events CRUD & Listing', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('3.1: Public event listing returns 200 OK with live events', async () => {
    const client = await createTestClient();
    const res = await client.get('/events');

    assertStatus(res, 200, 'Public events listing should return 200 OK');
    assert.ok(Array.isArray(res.body.events), 'Events should be an array');
    assert.ok(res.body.events.length > 0, 'Should return at least one event');
  });

  test('3.2: Single event lookup returns 200 OK with embedded ticket tiers (N+1 query elimination)', async () => {
    const client = await createTestClient();
    const res = await client.get('/events/1');

    assertStatus(res, 200, 'Single event lookup should return 200 OK');
    assertJsonStructure(res.body, ['event']);
    assert.strictEqual(res.body.event.id, 1);
    assert.ok(Array.isArray(res.body.event.ticket_tiers), 'Ticket tiers must be aggregated in single response');
    assert.ok(res.body.event.ticket_tiers.length > 0, 'Should contain associated ticket tiers');
  });

  test('3.3: Organizer creates event with title and description returning 201 Created', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events', {
      title: 'React & AI Conf 2026',
      description: 'The future of frontend and generative interfaces.',
      status: 'LIVE',
    });

    assertStatus(res, 201, 'Organizer should be able to create event');
    assert.strictEqual(res.body.event.title, 'React & AI Conf 2026');
  });

  test('3.4: Organizer updates event details returning 200 OK with updated fields', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.put('/events/1', {
      title: 'Global Tech Summit 2026 - Extended Edition',
    });

    assertStatus(res, 200, 'Update should return 200 OK');
    assert.strictEqual(res.body.event.title, 'Global Tech Summit 2026 - Extended Edition');
  });

  test('3.5: Organizer deletes event returning 200 OK', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    // Create a temporary event to delete
    const createRes = await client.post('/events', {
      title: 'Temporary Event to Delete',
      description: 'Will be removed',
    });
    const eventId = createRes.body.event.id;

    const delRes = await client.delete(`/events/${eventId}`);
    assertStatus(delRes, 200, 'Deletion should return 200 OK');

    // Confirm it is gone
    const fetchRes = await client.get(`/events/${eventId}`);
    assertStatus(fetchRes, 404, 'Deleted event should return 404');
  });
});
