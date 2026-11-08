import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertOk, assertJsonStructure } from '../helpers/assertions.js';

describe('Tier 1: Feature 05 - Orders & Checkout Workflow', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('5.1: Reserve ticket order returns 201 Created with orderId, orderShortId, and 15m expiration', async () => {
    const client = await createTestClient();
    const res = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 2 }],
    });

    assertStatus(res, 201, 'Order reservation should return 201 Created');
    assertJsonStructure(res.body, ['orderId', 'orderShortId', 'expires_at', 'total', 'status']);
    assert.strictEqual(res.body.status, 'RESERVED');
    assert.strictEqual(res.body.total, 4900 * 2);

    const expiresAt = new Date(res.body.expires_at).getTime();
    const now = Date.now();
    assert.ok(expiresAt > now + 14 * 60 * 1000, 'Expiration must be at least 14 minutes in future');
  });

  test('5.2: Finalize/checkout order with buyer and attendee details returns 200 OK and COMPLETED status', async () => {
    const client = await createTestClient();
    // Step 1: Reserve order
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    // Step 2: Finalize checkout
    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Bob Buyer', email: 'bob@example.com' },
      attendees: [{ name: 'Bob Buyer', email: 'bob@example.com', ticket_tier_id: 1 }],
      payment_method: 'OFFLINE',
    });

    assertStatus(checkoutRes, 200, 'Checkout should return 200 OK');
    assert.strictEqual(checkoutRes.body.order.status, 'COMPLETED');
    assert.strictEqual(checkoutRes.body.order.buyer.email, 'bob@example.com');
  });

  test('5.3: Instant checkout for Free tickets completes without requiring payment', async () => {
    const client = await createTestClient();
    // Reserve free ticket (tier 2)
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 2, quantity: 1 }],
    });
    assertStatus(reserveRes, 201);
    assert.strictEqual(reserveRes.body.total, 0, 'Free ticket order total must be 0');

    // Instant checkout
    const orderId = reserveRes.body.orderId;
    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Carol Community', email: 'carol@example.com' },
      attendees: [{ name: 'Carol Community', email: 'carol@example.com', ticket_tier_id: 2 }],
      payment_method: 'FREE',
    });

    assertStatus(checkoutRes, 200, 'Free ticket checkout should instantly complete');
    assert.strictEqual(checkoutRes.body.order.status, 'COMPLETED');
    assert.strictEqual(checkoutRes.body.order.total, 0);
  });

  test('5.4: Barcodes are issued for each attendee upon order completion', async () => {
    const client = await createTestClient();
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 2 }],
    });
    const orderId = reserveRes.body.orderId;

    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Dave Buyer', email: 'dave@example.com' },
      attendees: [
        { name: 'Dave Attendee 1', email: 'dave1@example.com', ticket_tier_id: 1 },
        { name: 'Dave Attendee 2', email: 'dave2@example.com', ticket_tier_id: 1 },
      ],
      payment_method: 'OFFLINE',
    });

    assertStatus(checkoutRes, 200);
    assert.ok(Array.isArray(checkoutRes.body.attendees));
    assert.strictEqual(checkoutRes.body.attendees.length, 2);
    for (const attendee of checkoutRes.body.attendees) {
      assert.ok(attendee.barcode && attendee.barcode.startsWith('TKT-'), 'Attendee must have unique barcode');
      assert.strictEqual(attendee.status, 'ACTIVE');
    }
  });

  test('5.5: Cancel order returns 200 OK and transitions status to CANCELLED', async () => {
    const client = await createTestClient();
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    const cancelRes = await client.post(`/orders/${orderId}/cancel`, {});
    assertStatus(cancelRes, 200, 'Order cancellation should return 200 OK');
    assert.strictEqual(cancelRes.body.order.status, 'CANCELLED');
  });
});
