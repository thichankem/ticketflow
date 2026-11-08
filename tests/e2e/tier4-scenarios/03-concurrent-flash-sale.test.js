import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 4: Scenario 03 - 20-Client Concurrent Flash Sale (Anti-Overbooking)', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('20 simultaneous checkout requests for last 3 seats: exactly 3 succeed, 17 receive 409 Conflict, strictly zero overbooking', async () => {
    const clientSetup = await createTestClient();
    // Organizer creates a flash sale tier with strictly 3 tickets
    const loginOrg = await clientSetup.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    clientSetup.setToken(loginOrg.body.token);

    const tierRes = await clientSetup.post('/events/1/tiers', {
      name: 'Flash Sale Limited Tier',
      price: 9900,
      total_quantity: 3,
      min_per_order: 1,
      max_per_order: 1,
    });
    assertStatus(tierRes, 201);
    const flashTierId = tierRes.body.tier.id;
    clientSetup.clearToken();

    // 20 concurrent clients compete simultaneously
    const concurrencyCount = 20;
    const clientPromises = Array.from({ length: concurrencyCount }).map(async (_, idx) => {
      const client = await createTestClient();
      return client.post('/public/events/1/order', {
        items: [{ ticket_tier_id: flashTierId, quantity: 1 }],
      });
    });

    const responses = await Promise.all(clientPromises);

    const successfulOrders = responses.filter(r => r.status === 201);
    const rejectedOrders = responses.filter(r => r.status === 409);

    assert.strictEqual(
      successfulOrders.length,
      3,
      `Expected exactly 3 successful reservations, got ${successfulOrders.length}`
    );
    assert.strictEqual(
      rejectedOrders.length,
      17,
      `Expected exactly 17 rejected requests with 409 Conflict, got ${rejectedOrders.length}`
    );

    // Verify all 17 rejections returned InventoryExhaustedError
    for (const rej of rejectedOrders) {
      assert.strictEqual(rej.body.error, 'InventoryExhaustedError');
    }

    // Inspect database/event tier inventory: remaining_quantity must be strictly 0
    const evRes = await clientSetup.get('/events/1');
    const tier = evRes.body.event.ticket_tiers.find(t => t.id === flashTierId);
    assert.strictEqual(tier.remaining_quantity, 0, 'Inventory must be exactly 0 (no overbooking)');
  });
});
