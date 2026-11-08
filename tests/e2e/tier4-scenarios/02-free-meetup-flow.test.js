import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertOk } from '../helpers/assertions.js';

describe('Tier 4: Scenario 02 - Free Community Meetup Instant Registration', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('Instant zero-payment checkout: free tier selection -> buyer details -> instant completion with barcodes', async () => {
    const client = await createTestClient();

    // Step 1: Browse event and find free pass tier
    const evRes = await client.get('/events/1');
    assertStatus(evRes, 200);
    const freeTier = evRes.body.event.ticket_tiers.find(t => t.type === 'FREE');
    assert.ok(freeTier, 'Free ticket tier must exist');
    assert.strictEqual(freeTier.price, 0);

    // Step 2: Reserve 1 Free pass
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: freeTier.id, quantity: 1 }],
    });
    assertStatus(reserveRes, 201);
    const orderId = reserveRes.body.orderId;
    assert.strictEqual(reserveRes.body.total, 0, 'Total for free ticket order must be 0');

    // Step 3: Complete instant checkout without payment step
    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: {
        name: 'Community Member',
        email: 'member@meetup.local',
      },
      attendees: [
        { name: 'Community Member', email: 'member@meetup.local', ticket_tier_id: freeTier.id },
      ],
      payment_method: 'FREE',
    });

    assertStatus(checkoutRes, 200);
    assert.strictEqual(checkoutRes.body.order.status, 'COMPLETED');
    assert.strictEqual(checkoutRes.body.order.total, 0);
    assert.strictEqual(checkoutRes.body.attendees.length, 1);
    assert.ok(checkoutRes.body.attendees[0].barcode.startsWith('TKT-'));
  });
});
