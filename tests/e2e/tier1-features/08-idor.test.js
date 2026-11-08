import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 1: Feature 08 - Server-Side IDOR Defense', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('8.1: Authenticated user can fetch their own order with 200 OK', async () => {
    const client = await createTestClient();
    // Login as Attendee A
    const loginA = await client.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginA.body.token);

    // Create order associated with Attendee A
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    // Fetch own order
    const fetchRes = await client.get(`/orders/${orderId}`);
    assertStatus(fetchRes, 200, 'User should be allowed to view own order');
    assert.strictEqual(fetchRes.body.order.id, orderId);
  });

  test('8.2: Malicious user attempting to fetch another user order by ID is blocked with 403 Forbidden', async () => {
    const clientA = await createTestClient();
    const loginA = await clientA.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    clientA.setToken(loginA.body.token);

    // User A creates order
    const reserveRes = await clientA.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderAId = reserveRes.body.orderId;

    // Attacker registers as User B
    const clientB = await createTestClient();
    const attackerEmail = `attacker_${Date.now()}@test.local`;
    const regB = await clientB.post('/auth/register', {
      name: 'Eve Attacker',
      email: attackerEmail,
      password: 'password123',
    });
    clientB.setToken(regB.body.token);

    // User B attempts to read User A's order
    const idorRes = await clientB.get(`/orders/${orderAId}`);
    assertError(idorRes, 403, 'Forbidden');
  });

  test('8.3: Malicious user attempting to cancel another user order is blocked with 403 Forbidden', async () => {
    const clientA = await createTestClient();
    const loginA = await clientA.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    clientA.setToken(loginA.body.token);

    const reserveRes = await clientA.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderAId = reserveRes.body.orderId;

    // Attacker attempts cancellation
    const clientAttacker = await createTestClient();
    const attackerReg = await clientAttacker.post('/auth/register', {
      name: 'Malicious Canceller',
      email: `canceller_${Date.now()}@test.local`,
      password: 'password123',
    });
    clientAttacker.setToken(attackerReg.body.token);

    const cancelRes = await clientAttacker.post(`/orders/${orderAId}/cancel`, {});
    assertError(cancelRes, 403, 'Forbidden');
  });

  test('8.4: Admin can view any user order for moderation purposes', async () => {
    const clientUser = await createTestClient();
    const loginU = await clientUser.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    clientUser.setToken(loginU.body.token);

    const orderRes = await clientUser.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = orderRes.body.orderId;

    // Admin views order
    const clientAdmin = await createTestClient();
    const loginAdmin = await clientAdmin.post('/auth/login', {
      email: 'admin@ticketflow.local',
      password: 'password123',
    });
    clientAdmin.setToken(loginAdmin.body.token);

    const adminFetchRes = await clientAdmin.get(`/orders/${orderId}`);
    assertStatus(adminFetchRes, 200, 'Admin role overrides IDOR check');
    assert.strictEqual(adminFetchRes.body.order.id, orderId);
  });

  test('8.5: Cross-account event update is blocked with 403 Forbidden', async () => {
    // Register another organizer
    const clientOther = await createTestClient();
    const otherEmail = `other_org_${Date.now()}@test.local`;
    const regRes = await clientOther.post('/auth/register', {
      name: 'Other Org',
      email: otherEmail,
      password: 'password123',
      role: 'ORGANIZER',
    });
    clientOther.setToken(regRes.body.token);

    // Event 1 belongs to the demo organizer (account_id: 2). Other Org cannot modify it.
    const updateRes = await clientOther.put('/events/1', {
      title: 'Hijacked Event Title',
    });
    assertError(updateRes, 403, 'Forbidden');
  });
});
