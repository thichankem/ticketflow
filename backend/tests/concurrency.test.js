/**
 * TicketFlow - Concurrency Stress Test
 * File: backend/tests/concurrency.test.js
 *
 * Exercises atomic reservation concurrency and asserts zero overbooking.
 */

import assert from 'node:assert/strict';
import {
  query,
  withTransaction,
  reserveTickets,
  releaseTickets,
  InventoryExhaustedError,
  closePool,
} from '../src/config/db.js';

async function runConcurrencyStressTest() {
  console.log('============================================================');
  console.log('       TicketFlow Concurrency Stress Verification           ');
  console.log('============================================================');

  // 1. Fetch test account
  const { rows: [account] } = await query('SELECT id FROM accounts LIMIT 1;');
  assert.ok(account, 'Seeded account must exist');

  // 2. Create isolated test event
  const { rows: [event] } = await query(`
    INSERT INTO events (
      short_id, account_id, title, slug, status, type, category, currency, timezone
    ) VALUES (
      'stress-test-' || floor(random() * 1000000),
      $1, 'Stress Test Event', 'stress-test-event', 'LIVE', 'SINGLE', 'MUSIC', 'USD', 'UTC'
    ) RETURNING id;
  `, [account.id]);

  // 3. Create ticket tier with remaining_quantity = 10
  const initialStock = 10;
  const { rows: [tier] } = await query(`
    INSERT INTO ticket_tiers (
      event_id, title, price, type, initial_quantity, remaining_quantity
    ) VALUES ($1, 'Stress Tier', 15.00, 'PAID', $2, $2) RETURNING id;
  `, [event.id, initialStock]);

  console.log(`[SETUP] Event ID: ${event.id}, Tier ID: ${tier.id}, Stock: ${initialStock}`);

  try {
    // 4. Dispatch 50 concurrent checkout attempts requesting 1 ticket each
    const totalRequests = 50;
    console.log(`[STRESS] Launching ${totalRequests} concurrent checkout attempts for ${initialStock} tickets...`);

    const start = Date.now();
    const attempts = Array.from({ length: totalRequests }, async (_, i) => {
      try {
        await withTransaction(async (client) => {
          return reserveTickets(client, [{ ticket_tier_id: tier.id, quantity: 1 }]);
        });
        return { success: true, reqId: i };
      } catch (err) {
        if (err instanceof InventoryExhaustedError) {
          return { success: false, code: err.code, reqId: i };
        }
        throw err;
      }
    });

    const results = await Promise.all(attempts);
    const duration = Date.now() - start;

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    console.log(`[RESULTS] Completed in ${duration}ms:`);
    console.log(`  Successes: ${successes.length} / Expected: ${initialStock}`);
    console.log(`  Failures (409 Conflict): ${failures.length} / Expected: ${totalRequests - initialStock}`);

    assert.equal(successes.length, initialStock, `Exactly ${initialStock} reservations must succeed`);
    assert.equal(failures.length, totalRequests - initialStock, `Remaining ${totalRequests - initialStock} must be rejected`);

    // 5. Verify final remaining stock is exactly 0
    const { rows: [finalTier] } = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [tier.id]);
    console.log(`[VERIFY] Final remaining inventory: ${finalTier.remaining_quantity}`);
    assert.equal(finalTier.remaining_quantity, 0, 'Inventory must be exactly 0 (strictly zero overbooking)');

    // 6. Test inventory restoration
    console.log('[RESTORE] Testing release of 5 tickets...');
    const restored = await releaseTickets(null, [{ ticket_tier_id: tier.id, quantity: 5 }]);
    assert.equal(restored[0].remaining_quantity, 5);
    console.log(`[RESTORE] Successfully restored inventory to: ${restored[0].remaining_quantity}`);

    console.log('============================================================');
    console.log('    CONCURRENCY TEST PASSED: ZERO OVERBOOKING CONFIRMED     ');
    console.log('============================================================\n');
  } finally {
    // Cleanup test event and cascade delete tier
    await query('DELETE FROM events WHERE id = $1;', [event.id]);
    await closePool();
  }
}

runConcurrencyStressTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[FATAL] Concurrency stress test failed:', err);
    process.exit(1);
  });
