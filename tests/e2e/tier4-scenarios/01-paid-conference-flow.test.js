import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertOk, assertJsonStructure } from '../helpers/assertions.js';

describe('Tier 4: Scenario 01 - Standard Paid Conference Ticket Purchase', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('Complete multi-step journey: browse -> select tickets -> apply promo -> attendee info -> mock payment -> QR confirmation', async () => {
    const client = await createTestClient();

    // Step 1: Browse public events
    const eventsRes = await client.get('/events');
    assertStatus(eventsRes, 200);
    const event = eventsRes.body.events[0];
    assert.ok(event, 'Event must exist');

    // Step 2: Select event and inspect ticket tiers
    const singleEventRes = await client.get(`/events/${event.id}`);
    assertStatus(singleEventRes, 200);
    const paidTier = singleEventRes.body.event.ticket_tiers.find(t => t.type === 'PAID');
    assert.ok(paidTier, 'Paid ticket tier must exist');
    const initialRemaining = paidTier.remaining_quantity;

    // Step 3: Validate promo code
    const promoValidateRes = await client.post(`/events/${event.id}/promos/validate`, {
      code: 'SAVE20',
      subtotal: paidTier.price * 2,
    });
    assertStatus(promoValidateRes, 200);
    assert.strictEqual(promoValidateRes.body.valid, true);

    // Step 4: Reserve 2 tickets with promo code
    const reserveRes = await client.post(`/public/events/${event.id}/order`, {
      items: [{ ticket_tier_id: paidTier.id, quantity: 2 }],
      promo_code: 'SAVE20',
      event_id: event.id,
    });
    assertStatus(reserveRes, 201);
    const orderId = reserveRes.body.orderId;
    assert.strictEqual(reserveRes.body.order.status, 'RESERVED');
    assert.strictEqual(reserveRes.body.order.discount > 0, true);

    // Verify inventory was held atomically
    const heldEventRes = await client.get(`/events/${event.id}`);
    const heldTier = heldEventRes.body.event.ticket_tiers.find(t => t.id === paidTier.id);
    assert.strictEqual(heldTier.remaining_quantity, initialRemaining - 2);

    // Step 5: Fill buyer information and 2 attendee details, proceed with payment
    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: {
        name: 'Jane Doe',
        email: 'jane.doe@enterprise.com',
      },
      attendees: [
        { name: 'Jane Doe', email: 'jane.doe@enterprise.com', ticket_tier_id: paidTier.id },
        { name: 'John Smith', email: 'john.smith@enterprise.com', ticket_tier_id: paidTier.id },
      ],
      payment_method: 'CARD',
      payment_intent_id: 'pi_test_1234567890',
    });

    assertStatus(checkoutRes, 200);
    assert.strictEqual(checkoutRes.body.order.status, 'COMPLETED');
    assert.strictEqual(checkoutRes.body.order.buyer.name, 'Jane Doe');
    assert.strictEqual(checkoutRes.body.attendees.length, 2);

    // Step 6: Verify ticket passes and barcodes generated
    for (const attendee of checkoutRes.body.attendees) {
      assert.ok(attendee.barcode && attendee.barcode.length > 5, 'Every attendee must receive a barcode');
      assert.strictEqual(attendee.status, 'ACTIVE');
    }
  });
});
