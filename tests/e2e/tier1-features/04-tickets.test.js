import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertOk, assertJsonStructure } from '../helpers/assertions.js';

describe('Tier 1: Feature 04 - Ticket Tiers & Pricing', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('4.1: Organizer creates a Paid ticket tier with price and quantity returning 201 Created', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/tiers', {
      name: 'VIP All-Access',
      type: 'PAID',
      price: 15000, // $150.00
      total_quantity: 25,
      min_per_order: 1,
      max_per_order: 4,
    });

    assertStatus(res, 201, 'Should create paid tier');
    assertJsonStructure(res.body, ['tier']);
    assert.strictEqual(res.body.tier.name, 'VIP All-Access');
    assert.strictEqual(res.body.tier.price, 15000);
    assert.strictEqual(res.body.tier.remaining_quantity, 25);
  });

  test('4.2: Organizer creates a Free ticket tier with price = 0 returning 201 Created', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/tiers', {
      name: 'Student Pass',
      type: 'FREE',
      price: 0,
      total_quantity: 30,
      min_per_order: 1,
      max_per_order: 1,
    });

    assertStatus(res, 201, 'Should create free tier');
    assert.strictEqual(res.body.tier.price, 0);
    assert.strictEqual(res.body.tier.type, 'FREE');
  });

  test('4.3: Organizer creates a Donation ticket tier returning 201 Created', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/tiers', {
      name: 'Open Source Patron Supporter',
      type: 'DONATION',
      price: 1000,
      total_quantity: 100,
      min_per_order: 1,
      max_per_order: 5,
    });

    assertStatus(res, 201, 'Should create donation tier');
    assert.strictEqual(res.body.tier.type, 'DONATION');
  });

  test('4.4: List ticket tiers for an event returns 200 OK with all configured tiers', async () => {
    const client = await createTestClient();
    const res = await client.get('/events/1/tiers');

    assertStatus(res, 200, 'Should return 200 OK');
    assert.ok(Array.isArray(res.body.tiers));
    assert.ok(res.body.tiers.length >= 2, 'Should list multiple configured tiers');
  });

  test('4.5: Hidden ticket tier is omitted from public event response', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    // Create a hidden tier
    const hiddenTierRes = await client.post('/events/1/tiers', {
      name: 'Staff Only Pass (Secret)',
      type: 'FREE',
      price: 0,
      total_quantity: 10,
      is_hidden: true,
    });
    assertStatus(hiddenTierRes, 201);
    const hiddenTierId = hiddenTierRes.body.tier.id;

    // Public event list should not include hidden tiers
    client.clearToken();
    const publicEventsRes = await client.get('/events');
    const ev1 = publicEventsRes.body.events.find(e => e.id === 1);
    assert.ok(ev1, 'Event 1 must be present');
    const hasHidden = ev1.ticket_tiers.some(t => t.id === hiddenTierId);
    assert.strictEqual(hasHidden, false, 'Hidden tier must not appear in public listing');
  });
});
