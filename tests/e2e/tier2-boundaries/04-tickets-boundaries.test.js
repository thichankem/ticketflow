import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 2: Boundary 04 - Ticket Tiers Boundaries & Negative Scenarios', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.4.1: Ticket tier creation with negative price returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/tiers', {
      name: 'Negative Price Tier',
      price: -500,
      total_quantity: 10,
    });
    assertError(res, 400);
  });

  test('2.4.2: Ticket tier creation with 0 or negative total_quantity returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const resZero = await client.post('/events/1/tiers', {
      name: 'Zero Quantity Tier',
      price: 1000,
      total_quantity: 0,
    });
    assertError(resZero, 400);

    const resNeg = await client.post('/events/1/tiers', {
      name: 'Negative Quantity Tier',
      price: 1000,
      total_quantity: -10,
    });
    assertError(resNeg, 400);
  });

  test('2.4.3: Ticket tier creation with min_per_order > max_per_order returns 400 Bad Request', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/tiers', {
      name: 'Inverted Bounds Tier',
      price: 1000,
      total_quantity: 20,
      min_per_order: 5,
      max_per_order: 2,
    });
    assertError(res, 400);
  });

  test('2.4.4: Free ticket tier cannot have a price > 0 (price is coerced or validated to 0)', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/tiers', {
      name: 'Free Tier with Mistaken Price',
      type: 'FREE',
      price: 5000,
      total_quantity: 10,
    });
    assertStatus(res, 201);
    assert.strictEqual(res.body.tier.price, 0, 'FREE tier must have price = 0');
  });

  test('2.4.5: Creating tier on non-existent event ID returns 404 Not Found', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/999999/tiers', {
      name: 'Ghost Event Tier',
      price: 1000,
      total_quantity: 10,
    });
    assertError(res, 404);
  });
});
