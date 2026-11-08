import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 1: Feature 06 - Concurrency & Atomic Hold', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('6.1: Reserving tickets atomically decrements remaining_quantity', async () => {
    const client = await createTestClient();
    const eventRes = await client.get('/events/1');
    const tier = eventRes.body.event.ticket_tiers.find(t => t.id === 1);
    const initialRemaining = tier.remaining_quantity;

    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 2 }],
    });
    assertStatus(reserveRes, 201);

    const updatedEventRes = await client.get('/events/1');
    const updatedTier = updatedEventRes.body.event.ticket_tiers.find(t => t.id === 1);
    assert.strictEqual(updatedTier.remaining_quantity, initialRemaining - 2);
  });

  test('6.2: Concurrent checkouts competing for remaining stock: successful orders strictly match available stock', async () => {
    const client = await createTestClient();
    // Login as organizer to create a limited tier with exactly 5 tickets
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const tierRes = await client.post('/events/1/tiers', {
      name: 'Limited Flash Tier',
      type: 'PAID',
      price: 2000,
      total_quantity: 5,
      min_per_order: 1,
      max_per_order: 1,
    });
    const limitedTierId = tierRes.body.tier.id;
    client.clearToken();

    // 10 concurrent requests for 1 ticket each
    const promises = Array.from({ length: 10 }).map(() =>
      client.post('/public/events/1/order', {
        items: [{ ticket_tier_id: limitedTierId, quantity: 1 }],
      })
    );

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.status === 201).length;
    const conflictCount = results.filter(r => r.status === 409).length;

    assert.strictEqual(successCount, 5, 'Exactly 5 orders should succeed');
    assert.strictEqual(conflictCount, 5, 'Remaining 5 orders should fail with 409 Conflict');

    const evRes = await client.get('/events/1');
    const tier = evRes.body.event.ticket_tiers.find(t => t.id === limitedTierId);
    assert.strictEqual(tier.remaining_quantity, 0, 'Remaining inventory must be exactly 0 (no negative/overbooking)');
  });

  test('6.3: Reservation request exceeding remaining quantity returns 409 Conflict / InventoryExhaustedError', async () => {
    const client = await createTestClient();
    // Organizer creates tier with 2 tickets
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const tierRes = await client.post('/events/1/tiers', {
      name: 'Two Seats Only',
      type: 'PAID',
      price: 1000,
      total_quantity: 2,
      min_per_order: 1,
      max_per_order: 5,
    });
    const tierId = tierRes.body.tier.id;
    client.clearToken();

    // Try reserving 5 tickets when only 2 exist
    const res = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: tierId, quantity: 5 }],
    });

    assertError(res, 409, 'InventoryExhaustedError');
  });

  test('6.4: Order cancellation restores remaining ticket quantity', async () => {
    const client = await createTestClient();
    const eventRes = await client.get('/events/1');
    const initialRemaining = eventRes.body.event.ticket_tiers.find(t => t.id === 1).remaining_quantity;

    // Reserve 2 tickets
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 2 }],
    });
    const orderId = reserveRes.body.orderId;

    // Cancel the reservation
    const cancelRes = await client.post(`/orders/${orderId}/cancel`, {});
    assertStatus(cancelRes, 200);

    // Verify remaining inventory restored
    const updatedRes = await client.get('/events/1');
    const updatedRemaining = updatedRes.body.event.ticket_tiers.find(t => t.id === 1).remaining_quantity;
    assert.strictEqual(updatedRemaining, initialRemaining);
  });

  test('6.5: Zero overbooking: When remaining = 1, two simultaneous requests yield exactly 1 success and 1 failure', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const tierRes = await client.post('/events/1/tiers', {
      name: 'Single Last Seat',
      type: 'PAID',
      price: 9900,
      total_quantity: 1,
      min_per_order: 1,
      max_per_order: 1,
    });
    const lastSeatTierId = tierRes.body.tier.id;
    client.clearToken();

    // Fire 2 concurrent requests
    const [res1, res2] = await Promise.all([
      client.post('/public/events/1/order', { items: [{ ticket_tier_id: lastSeatTierId, quantity: 1 }] }),
      client.post('/public/events/1/order', { items: [{ ticket_tier_id: lastSeatTierId, quantity: 1 }] }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepStrictEqual(statuses, [201, 409], 'Must have exactly one 201 Created and one 409 Conflict');
  });
});
