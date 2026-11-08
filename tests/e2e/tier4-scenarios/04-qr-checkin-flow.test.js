import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 4: Scenario 04 - Attendee Door QR Check-in Flow', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('Full check-in lifecycle: order placement -> barcode issuance -> door scan -> CHECKED_IN status -> duplicate scan rejection', async () => {
    const client = await createTestClient();

    // Step 1: Attendee places order for 2 tickets
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 2 }],
    });
    assertStatus(reserveRes, 201);
    const orderId = reserveRes.body.orderId;

    // Step 2: Complete order with 2 distinct attendees
    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'VIP Guest', email: 'guest@vip.local' },
      attendees: [
        { name: 'VIP Guest Alpha', email: 'alpha@vip.local', ticket_tier_id: 1 },
        { name: 'VIP Guest Beta', email: 'beta@vip.local', ticket_tier_id: 1 },
      ],
      payment_method: 'CARD',
    });
    assertStatus(checkoutRes, 200);
    const [attendeeAlpha, attendeeBeta] = checkoutRes.body.attendees;

    assert.ok(attendeeAlpha.barcode, 'Attendee Alpha must have barcode');
    assert.ok(attendeeBeta.barcode, 'Attendee Beta must have barcode');
    assert.strictEqual(attendeeAlpha.status, 'ACTIVE');
    assert.strictEqual(attendeeBeta.status, 'ACTIVE');

    // Step 3: Event Organizer logs in to door scanning portal
    const clientScanner = await createTestClient();
    const loginOrg = await clientScanner.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    clientScanner.setToken(loginOrg.body.token);

    // Step 4: Scan Attendee Alpha's barcode at the door
    const scanAlphaRes = await clientScanner.post('/events/1/attendees/check-in', {
      barcode: attendeeAlpha.barcode,
    });
    assertStatus(scanAlphaRes, 200);
    assert.strictEqual(scanAlphaRes.body.attendee.status, 'CHECKED_IN');
    assert.ok(scanAlphaRes.body.attendee.checked_in_at);

    // Step 5: Duplicate scan of Attendee Alpha's barcode must be blocked
    const duplicateScanRes = await clientScanner.post('/events/1/attendees/check-in', {
      barcode: attendeeAlpha.barcode,
    });
    assertError(duplicateScanRes, 409, 'AlreadyCheckedIn');

    // Step 6: Scan Attendee Beta's barcode succeeds independently
    const scanBetaRes = await clientScanner.post('/events/1/attendees/check-in', {
      barcode: attendeeBeta.barcode,
    });
    assertStatus(scanBetaRes, 200);
    assert.strictEqual(scanBetaRes.body.attendee.status, 'CHECKED_IN');
  });
});
