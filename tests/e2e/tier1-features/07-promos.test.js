import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertOk, assertJsonStructure } from '../helpers/assertions.js';

describe('Tier 1: Feature 07 - Promo Codes & Discounts', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('7.1: Organizer creates a percentage promo code returning 201 Created', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/promos', {
      code: 'SUMMER25',
      discount_type: 'PERCENTAGE',
      discount_amount: 25,
      max_uses: 200,
    });

    assertStatus(res, 201);
    assertJsonStructure(res.body, ['promo']);
    assert.strictEqual(res.body.promo.code, 'SUMMER25');
    assert.strictEqual(res.body.promo.discount_amount, 25);
  });

  test('7.2: Organizer creates a fixed discount promo code returning 201 Created', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/promos', {
      code: 'FLAT10',
      discount_type: 'FIXED',
      discount_amount: 1000, // $10.00
      max_uses: 50,
    });

    assertStatus(res, 201);
    assert.strictEqual(res.body.promo.code, 'FLAT10');
    assert.strictEqual(res.body.promo.discount_type, 'FIXED');
  });

  test('7.3: Validate promo code computes percentage discount using minor unit integer division', async () => {
    const client = await createTestClient();
    // Subtotal = $49.00 (4900 cents), 20% discount of 4900 = 980 cents
    const res = await client.post('/events/1/promos/validate', {
      code: 'SAVE20',
      subtotal: 4900,
    });

    assertStatus(res, 200);
    assert.strictEqual(res.body.valid, true);
    assert.strictEqual(res.body.discount, 980);
    assert.strictEqual(res.body.new_total, 3920);
  });

  test('7.4: Validate promo code computes fixed discount accurately against subtotal', async () => {
    const client = await createTestClient();
    const res = await client.post('/events/1/promos/validate', {
      code: 'FLAT10',
      subtotal: 4900,
    });

    assertStatus(res, 200);
    assert.strictEqual(res.body.discount, 1000);
    assert.strictEqual(res.body.new_total, 3900);
  });

  test('7.5: Applying promo code during reservation decreases order total', async () => {
    const client = await createTestClient();
    const res = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
      promo_code: 'SAVE20',
    });

    assertStatus(res, 201);
    assert.strictEqual(res.body.order.subtotal, 4900);
    assert.strictEqual(res.body.order.discount, 980);
    assert.strictEqual(res.body.order.total, 3920);
  });
});
