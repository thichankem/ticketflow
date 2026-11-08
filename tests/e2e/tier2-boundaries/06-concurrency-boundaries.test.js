import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 2: Boundary 06 - Concurrency Edge Cases & Double Mutations', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.6.1: Reserving when remaining_quantity is exactly 0 returns 409 Conflict', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const tierRes = await client.post('/events/1/tiers', {
      name: 'Zero Balance Tier',
      price: 1000,
      total_quantity: 1,
      min_per_order: 1,
      max_per_order: 1,
    });
    const tierId = tierRes.body.tier.id;
    client.clearToken();

    // Buy out the single ticket
    const buyRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: tierId, quantity: 1 }],
    });
    assertStatus(buyRes, 201);

    // Attempt second purchase on 0 remaining
    const failRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: tierId, quantity: 1 }],
    });
    assertError(failRes, 409, 'InventoryExhaustedError');
  });

  test('2.6.2: Reserving 10 tickets when only 9 remain fails cleanly with 409 without partial reservation', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const tierRes = await client.post('/events/1/tiers', {
      name: 'Nine Seat Tier',
      price: 1000,
      total_quantity: 9,
      min_per_order: 1,
      max_per_order: 10,
    });
    const tierId = tierRes.body.tier.id;
    client.clearToken();

    // Attempt to reserve 10
    const failRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: tierId, quantity: 10 }],
    });
    assertError(failRes, 409);

    // Verify all 9 remain (no partial deduction)
    const evRes = await client.get('/events/1');
    const tier = evRes.body.event.ticket_tiers.find(t => t.id === tierId);
    assert.strictEqual(tier.remaining_quantity, 9, 'Remaining quantity must remain untouched after failed reservation');
  });

  test('2.6.3: Double cancellation of the same order: first succeeds, second returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    // First cancellation
    const firstCancel = await client.post(`/orders/${orderId}/cancel`, {});
    assertStatus(firstCancel, 200);

    // Second cancellation
    const secondCancel = await client.post(`/orders/${orderId}/cancel`, {});
    assertError(secondCancel, 400, 'already cancelled');
  });

  test('2.6.4: Double cancellation does not restore inventory twice', async () => {
    const client = await createTestClient();
    const evBefore = await client.get('/events/1');
    const stockBefore = evBefore.body.event.ticket_tiers.find(t => t.id === 1).remaining_quantity;

    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    await client.post(`/orders/${orderId}/cancel`, {});
    await client.post(`/orders/${orderId}/cancel`, {}); // Repeat attempt

    const evAfter = await client.get('/events/1');
    const stockAfter = evAfter.body.event.ticket_tiers.find(t => t.id === 1).remaining_quantity;
    assert.strictEqual(stockAfter, stockBefore, 'Inventory must not be inflated by multiple cancellation attempts');
  });

  test('2.6.5: Rapid succession check-in: duplicate scans return 409 Conflict', async () => {
    const client = await createTestClient();
    // Setup organizer
    const loginOrg = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    const orgToken = loginOrg.body.token;

    // Order & complete
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;
    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Fast Attendee', email: 'fast@test.local' },
      attendees: [{ name: 'Fast Attendee', email: 'fast@test.local', ticket_tier_id: 1 }],
      payment_method: 'OFFLINE',
    });
    const barcode = checkoutRes.body.attendees[0].barcode;

    // Organizer performs first scan
    client.setToken(orgToken);
    const scan1 = await client.post('/events/1/attendees/check-in', { barcode });
    assertStatus(scan1, 200, 'First check-in should succeed');

    // Duplicate scan
    const scan2 = await client.post('/events/1/attendees/check-in', { barcode });
    assertError(scan2, 409, 'AlreadyCheckedIn');
  });
});
