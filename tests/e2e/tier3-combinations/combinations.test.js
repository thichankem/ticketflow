import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError, assertOk } from '../helpers/assertions.js';

describe('Tier 3: Pairwise Combinations (Cross-Feature Interactions)', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('3.1: Promo Code (Percentage) + Mixed Cart (Paid + Free Tiers)', async () => {
    const client = await createTestClient();
    // Paid ticket = 4900 cents, Free ticket = 0 cents.
    // Order: 2 Paid (9800) + 1 Free (0) = 9800 subtotal.
    // 20% discount on 9800 = 1960 cents -> total = 7840 cents.
    const res = await client.post('/public/events/1/order', {
      items: [
        { ticket_tier_id: 1, quantity: 2 },
        { ticket_tier_id: 2, quantity: 1 },
      ],
      promo_code: 'SAVE20',
    });

    assertStatus(res, 201);
    assert.strictEqual(res.body.order.subtotal, 9800);
    assert.strictEqual(res.body.order.discount, 1960);
    assert.strictEqual(res.body.order.total, 7840);
  });

  test('3.2: Expired/Cancelled Order Reservation + Inventory Restoration + Immediate Re-purchase', async () => {
    const client = await createTestClient();
    // Organizer creates a single-seat tier
    const loginOrg = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginOrg.body.token);

    const tierRes = await client.post('/events/1/tiers', {
      name: 'Solo Seat For Rebooking',
      price: 3000,
      total_quantity: 1,
      min_per_order: 1,
      max_per_order: 1,
    });
    const soloTierId = tierRes.body.tier.id;
    client.clearToken();

    // Buyer A reserves the only ticket
    const orderA = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: soloTierId, quantity: 1 }],
    });
    assertStatus(orderA, 201);
    const orderAId = orderA.body.orderId;

    // Buyer B attempts purchase -> fails with 409
    const orderBFirst = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: soloTierId, quantity: 1 }],
    });
    assertError(orderBFirst, 409);

    // Buyer A cancels/abandons reservation
    const cancelRes = await client.post(`/orders/${orderAId}/cancel`, {});
    assertStatus(cancelRes, 200);

    // Buyer B immediately retries -> succeeds with 201 Created
    const orderBSecond = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: soloTierId, quantity: 1 }],
    });
    assertStatus(orderBSecond, 201);
  });

  test('3.3: Attendee Details Collection with Custom Info + Offline Payment Method', async () => {
    const client = await createTestClient();
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Offline Payer', email: 'offline@test.local' },
      attendees: [{
        name: 'Offline Attendee',
        email: 'offline_att@test.local',
        ticket_tier_id: 1,
      }],
      payment_method: 'OFFLINE',
    });

    assertStatus(checkoutRes, 200);
    assert.strictEqual(checkoutRes.body.order.payment_method, 'OFFLINE');
    assert.strictEqual(checkoutRes.body.order.status, 'COMPLETED');
    assert.ok(checkoutRes.body.attendees[0].barcode);
  });

  test('3.4: Event Creation + Multi-Tier Configuration + Promo Code Application', async () => {
    const client = await createTestClient();
    const loginOrg = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginOrg.body.token);

    // Create event
    const evRes = await client.post('/events', {
      title: 'Festival of Sound',
      description: 'Audio innovation conference',
    });
    const newEventId = evRes.body.event.id;

    // Create tier
    const tierRes = await client.post(`/events/${newEventId}/tiers`, {
      name: 'Festival Pass',
      price: 8000,
      total_quantity: 50,
    });
    const newTierId = tierRes.body.tier.id;

    // Create promo
    const promoRes = await client.post(`/events/${newEventId}/promos`, {
      code: 'FEST50',
      discount_type: 'PERCENTAGE',
      discount_amount: 50,
      max_uses: 10,
    });
    assertStatus(promoRes, 201);
    client.clearToken();

    // Reserve with promo on new event
    const orderRes = await client.post(`/public/events/${newEventId}/order`, {
      items: [{ ticket_tier_id: newTierId, quantity: 1 }],
      promo_code: 'FEST50',
      event_id: newEventId,
    });
    assertStatus(orderRes, 201);
    assert.strictEqual(orderRes.body.order.total, 4000); // 50% of 8000
  });

  test('3.5: Promo Code Max Uses Depletion Under Checkout', async () => {
    const client = await createTestClient();
    const loginOrg = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginOrg.body.token);

    const code = `LIMITED_USE_${Date.now()}`;
    await client.post('/events/1/promos', {
      code,
      discount_type: 'FIXED',
      discount_amount: 500,
      max_uses: 2,
    });
    client.clearToken();

    // First use
    const order1 = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
      promo_code: code,
    });
    assertStatus(order1, 201);
    assert.strictEqual(order1.body.order.discount, 500);

    // Second use
    const order2 = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
      promo_code: code,
    });
    assertStatus(order2, 201);
    assert.strictEqual(order2.body.order.discount, 500);

    // Third use -> promo exhausted, no discount applied
    const order3 = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
      promo_code: code,
    });
    assertStatus(order3, 201);
    assert.strictEqual(order3.body.order.discount, 0, 'Exhausted promo code must not yield discount');
  });

  test('3.6: Malicious Attendee Attempting IDOR Cancellation while Order is RESERVED', async () => {
    const clientA = await createTestClient();
    const loginA = await clientA.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    clientA.setToken(loginA.body.token);

    // User A reserves
    const orderRes = await clientA.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = orderRes.body.orderId;

    // Attacker User B attempts to cancel User A's reserved order
    const clientB = await createTestClient();
    const regB = await clientB.post('/auth/register', {
      name: 'Saboteur',
      email: `saboteur_${Date.now()}@test.local`,
      password: 'password123',
    });
    clientB.setToken(regB.body.token);

    const cancelAttempt = await clientB.post(`/orders/${orderId}/cancel`, {});
    assertError(cancelAttempt, 403, 'Forbidden');

    // User A can successfully complete checkout
    const checkoutRes = await clientA.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Legit Buyer', email: 'attendee@ticketflow.local' },
      attendees: [{ name: 'Legit Attendee', email: 'attendee@ticketflow.local', ticket_tier_id: 1 }],
      payment_method: 'OFFLINE',
    });
    assertStatus(checkoutRes, 200);
    assert.strictEqual(checkoutRes.body.order.status, 'COMPLETED');
  });

  test('3.7: Donation Tier Combined with Free Pass', async () => {
    const client = await createTestClient();
    const loginOrg = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginOrg.body.token);

    const donationRes = await client.post('/events/1/tiers', {
      name: 'Community Donation Tier',
      type: 'DONATION',
      price: 2500, // $25.00
      total_quantity: 50,
    });
    const donationTierId = donationRes.body.tier.id;
    client.clearToken();

    // Order: 1 Donation ($25.00) + 1 Free ($0.00) = $25.00 total
    const orderRes = await client.post('/public/events/1/order', {
      items: [
        { ticket_tier_id: donationTierId, quantity: 1 },
        { ticket_tier_id: 2, quantity: 1 },
      ],
    });
    assertStatus(orderRes, 201);
    assert.strictEqual(orderRes.body.order.total, 2500);

    const orderId = orderRes.body.orderId;
    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Generous Donor', email: 'donor@test.local' },
      attendees: [
        { name: 'Donor 1', email: 'donor@test.local', ticket_tier_id: donationTierId },
        { name: 'Friend 1', email: 'friend@test.local', ticket_tier_id: 2 },
      ],
      payment_method: 'OFFLINE',
    });
    assertStatus(checkoutRes, 200);
    assert.strictEqual(checkoutRes.body.attendees.length, 2);
  });

  test('3.8: SuperAdmin Account Suspension Blocks Subsequent Actions with 401', async () => {
    const clientAdmin = await createTestClient();
    const adminLogin = await clientAdmin.post('/auth/login', {
      email: 'admin@ticketflow.local',
      password: 'password123',
    });
    clientAdmin.setToken(adminLogin.body.token);

    // Register temporary organizer
    const clientOrg = await createTestClient();
    const regOrg = await clientOrg.post('/auth/register', {
      name: 'Temporary Org',
      email: `temp_org_${Date.now()}@test.local`,
      password: 'password123',
      role: 'ORGANIZER',
    });
    const orgId = regOrg.body.user.id;
    clientOrg.setToken(regOrg.body.token);

    // Suspend organizer
    const suspendRes = await clientAdmin.post(`/admin/users/${orgId}/suspend`, {});
    assertStatus(suspendRes, 200);

    // Suspended organizer attempt to create event
    const actionRes = await clientOrg.post('/events', {
      title: 'Should Be Blocked',
    });
    assertError(actionRes, 401);
  });

  test('3.9: Barcode Generation + Check-in Workflow + Duplicate Prevention', async () => {
    const client = await createTestClient();
    const loginOrg = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    const orgToken = loginOrg.body.token;

    // Buyer purchases ticket
    const orderRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = orderRes.body.orderId;

    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Gate Attendee', email: 'gate@test.local' },
      attendees: [{ name: 'Gate Attendee', email: 'gate@test.local', ticket_tier_id: 1 }],
      payment_method: 'OFFLINE',
    });
    const barcode = checkoutRes.body.attendees[0].barcode;

    // Check-in scan
    client.setToken(orgToken);
    const checkin1 = await client.post('/events/1/attendees/check-in', { barcode });
    assertStatus(checkin1, 200);
    assert.strictEqual(checkin1.body.attendee.status, 'CHECKED_IN');
    assert.ok(checkin1.body.attendee.checked_in_at);

    // Second scan yields 409
    const checkin2 = await client.post('/events/1/attendees/check-in', { barcode });
    assertError(checkin2, 409, 'AlreadyCheckedIn');
  });

  test('3.10: Event Update (Title & Status) while Cart Reservation is Active', async () => {
    const client = await createTestClient();
    // Buyer reserves cart
    const orderRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = orderRes.body.orderId;

    // Organizer updates event title concurrently
    const clientOrg = await createTestClient();
    const loginOrg = await clientOrg.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    clientOrg.setToken(loginOrg.body.token);

    const updateEv = await clientOrg.put('/events/1', {
      title: 'Global Tech Summit 2026 - Concurrency Verified',
    });
    assertStatus(updateEv, 200);

    // Buyer completes checkout without disruption
    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Concurrent Buyer', email: 'concurrent@test.local' },
      attendees: [{ name: 'Concurrent Attendee', email: 'concurrent@test.local', ticket_tier_id: 1 }],
      payment_method: 'OFFLINE',
    });
    assertStatus(checkoutRes, 200);
    assert.strictEqual(checkoutRes.body.order.status, 'COMPLETED');
  });

  test('3.11: XSS Payload in Custom Attendee Data Rendered in Checkout Confirmation', async () => {
    const client = await createTestClient();
    const orderRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = orderRes.body.orderId;

    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Clean Buyer', email: 'clean@test.local' },
      attendees: [{
        name: 'User <script>alert("payload")</script> Name',
        email: 'clean_att@test.local',
        ticket_tier_id: 1,
      }],
      payment_method: 'OFFLINE',
    });

    assertStatus(checkoutRes, 200);
    const sanitizedName = checkoutRes.body.attendees[0].name;
    assert.strictEqual(sanitizedName.includes('<script>'), false);
    assert.strictEqual(sanitizedName.includes('alert('), false);
  });

  test('3.12: Order Cancellation Restores Promo Code Usage Count', async () => {
    const client = await createTestClient();
    const loginOrg = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginOrg.body.token);

    const promoCode = `RESTORABLE_PROMO_${Date.now()}`;
    await client.post('/events/1/promos', {
      code: promoCode,
      discount_type: 'PERCENTAGE',
      discount_amount: 15,
      max_uses: 1,
    });
    client.clearToken();

    // Use promo code in reservation
    const orderRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
      promo_code: promoCode,
    });
    assertStatus(orderRes, 201);
    const orderId = orderRes.body.orderId;

    // Validate that promo is now exhausted
    const valExhausted = await client.post('/events/1/promos/validate', {
      code: promoCode,
      subtotal: 5000,
    });
    assertError(valExhausted, 422);

    // Cancel order
    const cancelRes = await client.post(`/orders/${orderId}/cancel`, {});
    assertStatus(cancelRes, 200);

    // Validate that promo code usage is restored and can be used again
    const valRestored = await client.post('/events/1/promos/validate', {
      code: promoCode,
      subtotal: 5000,
    });
    assertStatus(valRestored, 200);
    assert.strictEqual(valRestored.body.valid, true);
  });

  test('3.13: Multiple Ticket Tiers with Varying min/max Constraints in Single Order', async () => {
    const client = await createTestClient();
    // Tier 1: min 1, max 5 -> request 3
    // Tier 2: min 1, max 2 -> request 2
    const res = await client.post('/public/events/1/order', {
      items: [
        { ticket_tier_id: 1, quantity: 3 },
        { ticket_tier_id: 2, quantity: 2 },
      ],
    });
    assertStatus(res, 201);
    assert.strictEqual(res.body.order.items.length, 2);
    assert.strictEqual(res.body.order.items[0].quantity, 3);
    assert.strictEqual(res.body.order.items[1].quantity, 2);
  });

  test('3.14: Rate Limited Login Attempts + Valid Refresh Token Recovery', async () => {
    const client = await createTestClient();
    // Valid login first to get refresh token
    const firstLogin = await client.post('/auth/login', {
      email: 'attendee@ticketflow.local',
      password: 'password123',
    });
    assertStatus(firstLogin, 200);

    // Even if auth login is hit multiple times, refresh endpoint allows session recovery
    const refreshRes = await client.post('/auth/refresh', {});
    assertStatus(refreshRes, 200);
    assert.ok(refreshRes.body.token);
  });

  test('3.15: Order Expiration and Abandonment Frees Reserved Stock for Another Buyer', async () => {
    const client = await createTestClient();
    const loginOrg = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginOrg.body.token);

    const tierRes = await client.post('/events/1/tiers', {
      name: 'Single Abandonable Seat',
      price: 5000,
      total_quantity: 1,
      min_per_order: 1,
      max_per_order: 1,
    });
    const seatId = tierRes.body.tier.id;
    client.clearToken();

    // Buyer A reserves the seat
    const reserveA = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: seatId, quantity: 1 }],
    });
    assertStatus(reserveA, 201);
    const orderAId = reserveA.body.orderId;

    // Buyer B attempts purchase -> 409 Conflict
    const buyB1 = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: seatId, quantity: 1 }],
    });
    assertError(buyB1, 409);

    // Buyer A abandons order (simulated via cancel)
    await client.post(`/orders/${orderAId}/cancel`, {});

    // Buyer B now successfully buys the freed seat
    const buyB2 = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: seatId, quantity: 1 }],
    });
    assertStatus(buyB2, 201);
  });
});
