import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 2: Boundary 07 - Promo Codes Edge Cases & Usage Limits', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.7.1: Promo code with discount percentage > 100 returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/promos', {
      code: 'OVER100',
      discount_type: 'PERCENTAGE',
      discount_amount: 150,
      max_uses: 10,
    });
    assertError(res, 400);
  });

  test('2.7.2: Promo code with discount amount <= 0 returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/promos', {
      code: 'ZERO_DISCOUNT',
      discount_type: 'FIXED',
      discount_amount: 0,
      max_uses: 10,
    });
    assertError(res, 400);
  });

  test('2.7.3: Validating non-existent promo code returns 404 Not Found', async () => {
    const client = await createTestClient();
    const res = await client.post('/events/1/promos/validate', {
      code: 'NON_EXISTENT_PROMO',
      subtotal: 5000,
    });
    assertError(res, 404);
  });

  test('2.7.4: Promo code usage exceeding max_uses returns 422 Unprocessable', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    // Create a single-use promo code
    const createPromoRes = await client.post('/events/1/promos', {
      code: `SINGLE_USE_${Date.now()}`,
      discount_type: 'PERCENTAGE',
      discount_amount: 10,
      max_uses: 1,
    });
    const promoCode = createPromoRes.body.promo.code;
    client.clearToken();

    // Use it once in an order
    const order1 = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
      promo_code: promoCode,
    });
    assertStatus(order1, 201);

    // Attempt second validation
    const validateRes = await client.post('/events/1/promos/validate', {
      code: promoCode,
      subtotal: 5000,
    });
    assertError(validateRes, 422, 'limit reached');
  });

  test('2.7.5: Promo code matching is case-insensitive (save20 matches SAVE20)', async () => {
    const client = await createTestClient();
    const res = await client.post('/events/1/promos/validate', {
      code: 'save20', // lowercase
      subtotal: 10000,
    });
    assertStatus(res, 200);
    assert.strictEqual(res.body.valid, true);
    assert.strictEqual(res.body.discount, 2000);
  });
});
