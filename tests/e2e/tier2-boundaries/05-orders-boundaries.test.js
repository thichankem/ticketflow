import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 2: Boundary 05 - Orders & Cart Boundaries', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.5.1: Reserving order with empty items array returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const res = await client.post('/public/events/1/order', {
      items: [],
    });
    assertError(res, 400);
  });

  test('2.5.2: Reserving order with quantity = 0 returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const res = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 0 }],
    });
    assertError(res, 400);
  });

  test('2.5.3: Reserving order with quantity exceeding max_per_order returns 400 Bad Request', async () => {
    const client = await createTestClient();
    // Tier 1 has max_per_order: 5. Try 6.
    const res = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 6 }],
    });
    assertError(res, 400, 'exceeds maximum');
  });

  test('2.5.4: Reserving order with non-existent ticket_tier_id returns 404 Not Found', async () => {
    const client = await createTestClient();
    const res = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 999999, quantity: 1 }],
    });
    assertError(res, 404);
  });

  test('2.5.5: Finalizing order without buyer name or email returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    const res = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: '', email: '' },
      attendees: [],
    });
    assertError(res, 400);
  });
});
