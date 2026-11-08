import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 2: Boundary 08 - IDOR Boundaries & Resource Enumeration', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.8.1: Querying order with non-existent ID returns 404 Not Found', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.get('/orders/9999999');
    assertError(res, 404);
  });

  test('2.8.2: Attacker attempting to checkout another user reserved order returns 403 or 404', async () => {
    const clientA = await createTestClient();
    const loginA = await clientA.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    clientA.setToken(loginA.body.token);

    const reserveRes = await clientA.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    // Attacker client
    const clientB = await createTestClient();
    const regB = await clientB.post('/auth/register', {
      name: 'Hijacker',
      email: `hijacker_${Date.now()}@test.local`,
      password: 'password123',
    });
    clientB.setToken(regB.body.token);

    // Attempt to cancel/tamper User A's order
    const hijackRes = await clientB.post(`/orders/${orderId}/cancel`, {});
    assertError(hijackRes, 403, 'Forbidden');
  });

  test('2.8.3: Anonymous user accessing protected user order returns 403 or 401', async () => {
    const clientUser = await createTestClient();
    const loginU = await clientUser.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    clientUser.setToken(loginU.body.token);

    const reserveRes = await clientUser.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    // Anonymous client
    const anonClient = await createTestClient();
    anonClient.clearToken();

    const fetchRes = await anonClient.get(`/orders/${orderId}`);
    assertError(fetchRes, 403, 'Forbidden');
  });

  test('2.8.4: Organizer from Account X attempting to delete event belonging to Account Y returns 403 Forbidden', async () => {
    // Register Account Y
    const clientY = await createTestClient();
    const regY = await clientY.post('/auth/register', {
      name: 'Organizer Y',
      email: `org_y_${Date.now()}@test.local`,
      password: 'password123',
      role: 'ORGANIZER',
    });
    clientY.setToken(regY.body.token);

    // Account Y creates an event
    const createEv = await clientY.post('/events', {
      title: 'Organizer Y Private Event',
    });
    const eventYId = createEv.body.event.id;

    // Organizer X attempts deletion
    const clientX = await createTestClient();
    const loginX = await clientX.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    clientX.setToken(loginX.body.token);

    const delRes = await clientX.delete(`/events/${eventYId}`);
    assertError(delRes, 403, 'Forbidden');
  });

  test('2.8.5: Malicious organizer cannot check in attendee belonging to a different event', async () => {
    const client = await createTestClient();
    // Organizer login
    const loginOrg = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginOrg.body.token);

    // Scan non-existent barcode on Event 1
    const scanRes = await client.post('/events/1/attendees/check-in', {
      barcode: 'TKT-NON-EXISTENT-BARCODE',
    });
    assertError(scanRes, 404, 'not found');
  });
});
