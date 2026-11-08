import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertError } from '../helpers/assertions.js';

describe('Tier 4: Scenario 05 - IDOR Malicious Cancellation Defense', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('Malicious buyer attempts to snoop and cancel victim order: all unauthorized actions blocked with 403, victim order remains intact', async () => {
    // Step 1: Victim (User A) registers and logs in
    const clientVictim = await createTestClient();
    const victimEmail = `victim_${Date.now()}@victimcorp.local`;
    const regVictim = await clientVictim.post('/auth/register', {
      name: 'Victim User',
      email: victimEmail,
      password: 'VictimPassword123!',
      role: 'ATTENDEE',
    });
    assertStatus(regVictim, 201);
    clientVictim.setToken(regVictim.body.token);

    // Step 2: Victim reserves and checks out tickets
    const reserveRes = await clientVictim.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 2 }],
    });
    assertStatus(reserveRes, 201);
    const victimOrderId = reserveRes.body.orderId;

    const checkoutRes = await clientVictim.post(`/orders/${victimOrderId}/checkout`, {
      buyer: { name: 'Victim User', email: victimEmail },
      attendees: [
        { name: 'Victim Attendee 1', email: victimEmail, ticket_tier_id: 1 },
        { name: 'Victim Attendee 2', email: 'guest@victimcorp.local', ticket_tier_id: 1 },
      ],
      payment_method: 'CARD',
    });
    assertStatus(checkoutRes, 200);
    assert.strictEqual(checkoutRes.body.order.status, 'COMPLETED');

    // Step 3: Attacker (User B) registers and logs in
    const clientAttacker = await createTestClient();
    const attackerEmail = `attacker_${Date.now()}@darknet.local`;
    const regAttacker = await clientAttacker.post('/auth/register', {
      name: 'Darknet Attacker',
      email: attackerEmail,
      password: 'HackerPassword123!',
      role: 'ATTENDEE',
    });
    assertStatus(regAttacker, 201);
    clientAttacker.setToken(regAttacker.body.token);

    // Step 4: Attacker attempts to read Victim's order details by ID (IDOR probe)
    const readAttempt = await clientAttacker.get(`/orders/${victimOrderId}`);
    assertError(readAttempt, 403, 'Forbidden');

    // Step 5: Attacker attempts to forge cancellation request on Victim's order
    const cancelAttempt = await clientAttacker.post(`/orders/${victimOrderId}/cancel`, {});
    assertError(cancelAttempt, 403, 'Forbidden');

    // Step 6: Victim verifies order was not impacted
    const verifyRes = await clientVictim.get(`/orders/${victimOrderId}`);
    assertStatus(verifyRes, 200);
    assert.strictEqual(verifyRes.body.order.status, 'COMPLETED', 'Order status must remain COMPLETED');
    assert.strictEqual(verifyRes.body.order.buyer.email, victimEmail);
  });
});
