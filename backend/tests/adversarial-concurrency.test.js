/**
 * TicketFlow - Adversarial Concurrency & Stress Verification Harness
 * File: backend/tests/adversarial-concurrency.test.js
 *
 * Adversarial challenger tests for Milestone 1:
 * 1. High concurrency burst: 50 simultaneous checkout reservations against a tier with only 5 tickets.
 *    - Asserts strictly 5 succeed and 45 fail with 409 Conflict (InventoryExhaustedError).
 * 2. Zero overbooking & invariant verification:
 *    - remaining_quantity never dips below 0 under high concurrency.
 *    - PostgreSQL check constraint chk_ticket_tiers_remaining_quantity rejects any illegal negative update.
 * 3. Multi-tier deadlock stress test:
 *    - Cart A requesting [Tier 1, Tier 2] vs Cart B requesting [Tier 2, Tier 1] simultaneously.
 *    - Asserts 0 deadlocks (PostgreSQL error 40P01) due to ticket_tier_id sort ordering.
 * 4. Multi-item cart atomic rollback test:
 *    - Cart with 1 valid tier and 1 exhausted tier must roll back completely; 0 tickets deducted.
 * 5. Connection pool leak verification:
 *    - Verifies all checked-out clients are released back to the pool under concurrent load and errors.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  pool,
  query,
  withTransaction,
  reserveTickets,
  releaseTickets,
  InventoryExhaustedError,
  closePool,
} from '../src/config/db.js';

describe('Adversarial Concurrency & Stress Verification Suite', () => {
  let testAccountId;
  let testEventId;

  before(async () => {
    // Fetch or create test account
    const { rows: accounts } = await query('SELECT id FROM accounts LIMIT 1;');
    assert.ok(accounts.length > 0, 'Must have at least one account in DB');
    testAccountId = accounts[0].id;

    // Create a dedicated event for this stress test suite
    const { rows: [event] } = await query(`
      INSERT INTO events (
        short_id, account_id, title, slug, status, type, category, currency, timezone
      ) VALUES (
        'adversarial-test-' || floor(random() * 1000000),
        $1, 'Adversarial Stress Test Event', 'adversarial-stress-event', 'LIVE', 'SINGLE', 'TECH', 'USD', 'UTC'
      ) RETURNING id;
    `, [testAccountId]);
    testEventId = event.id;
  });

  after(async () => {
    if (testEventId) {
      await query('DELETE FROM events WHERE id = $1;', [testEventId]);
    }
    await closePool();
  });

  // --------------------------------------------------------------------------
  // Challenge 1: High Concurrency Burst (50 concurrent requests for 5 tickets)
  // --------------------------------------------------------------------------
  test('CHALLENGE 1: High Concurrency Burst — 50 simultaneous checkouts vs 5 remaining stock', async () => {
    const initialStock = 5;
    const totalConcurrentRequests = 50;

    // Create tier with exactly 5 tickets
    const { rows: [tier] } = await query(`
      INSERT INTO ticket_tiers (
        event_id, title, price, type, initial_quantity, remaining_quantity
      ) VALUES ($1, 'Burst Tier 5', 25.00, 'PAID', $2, $2) RETURNING id;
    `, [testEventId, initialStock]);

    const startTime = Date.now();

    // Fire 50 simultaneous checkout reservations
    const tasks = Array.from({ length: totalConcurrentRequests }, async (_, index) => {
      try {
        const reserved = await withTransaction(async (client) => {
          return reserveTickets(client, [{ ticket_tier_id: tier.id, quantity: 1 }]);
        });
        return { success: true, reqId: index, reserved };
      } catch (err) {
        if (err instanceof InventoryExhaustedError) {
          return {
            success: false,
            reqId: index,
            statusCode: err.statusCode,
            code: err.code,
            remainingAtRejection: err.remaining,
          };
        }
        return { success: false, reqId: index, unexpectedError: err.message, stack: err.stack };
      }
    });

    const results = await Promise.all(tasks);
    const durationMs = Date.now() - startTime;

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);
    const unexpectedErrors = results.filter((r) => r.unexpectedError);

    console.log(`[Burst Test] 50 concurrent requests processed in ${durationMs}ms`);
    console.log(`  Successes: ${successes.length} / Expected: ${initialStock}`);
    console.log(`  Failures (409 Conflict): ${failures.length} / Expected: ${totalConcurrentRequests - initialStock}`);
    console.log(`  Unexpected Errors: ${unexpectedErrors.length} / Expected: 0`);

    // Assert zero unexpected errors
    assert.equal(unexpectedErrors.length, 0, `Encountered unexpected errors: ${JSON.stringify(unexpectedErrors)}`);

    // Assert strictly 5 succeed
    assert.equal(successes.length, initialStock, `Expected strictly ${initialStock} successes, got ${successes.length}`);

    // Assert strictly 45 fail with 409 Conflict
    assert.equal(failures.length, totalConcurrentRequests - initialStock, `Expected strictly ${totalConcurrentRequests - initialStock} failures, got ${failures.length}`);

    for (const fail of failures) {
      assert.equal(fail.statusCode, 409, `Failed request ${fail.reqId} must have statusCode 409`);
      assert.equal(fail.code, 'INVENTORY_EXHAUSTED', `Failed request ${fail.reqId} must have code INVENTORY_EXHAUSTED`);
    }

    // Verify remaining inventory in database is strictly 0
    const { rows: [finalTier] } = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [tier.id]);
    assert.equal(finalTier.remaining_quantity, 0, 'Final remaining inventory must be strictly 0');
  });

  // --------------------------------------------------------------------------
  // Challenge 2: Assert Zero Overbooking & Strict Non-Negative Invariant
  // --------------------------------------------------------------------------
  test('CHALLENGE 2: Zero Overbooking & Database Check Constraint Invariant', async () => {
    // 1. Variable quantity concurrency burst: stock = 12, 30 concurrent checkouts requesting 1 to 4 tickets
    const initialStock = 12;
    const { rows: [tier] } = await query(`
      INSERT INTO ticket_tiers (
        event_id, title, price, type, initial_quantity, remaining_quantity
      ) VALUES ($1, 'Variable Burst Tier', 10.00, 'PAID', $2, $2) RETURNING id;
    `, [testEventId, initialStock]);

    const requestQuantities = [1, 2, 3, 4, 2, 1, 3, 2, 4, 1, 2, 3, 1, 4, 2, 3, 1, 2, 3, 4, 1, 2, 1, 3, 2, 4, 1, 2, 3, 1];
    assert.equal(requestQuantities.length, 30);

    const tasks = requestQuantities.map(async (qty, index) => {
      try {
        await withTransaction(async (client) => {
          return reserveTickets(client, [{ ticket_tier_id: tier.id, quantity: qty }]);
        });
        return { success: true, reqId: index, qty };
      } catch (err) {
        if (err instanceof InventoryExhaustedError) {
          return { success: false, reqId: index, qty, statusCode: err.statusCode };
        }
        throw err;
      }
    });

    const results = await Promise.all(tasks);
    const successes = results.filter((r) => r.success);
    const totalTicketsSold = successes.reduce((acc, s) => acc + s.qty, 0);

    // Fetch database remaining inventory
    const { rows: [currentTier] } = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [tier.id]);

    console.log(`[Variable Burst] Sold: ${totalTicketsSold}, Remaining in DB: ${currentTier.remaining_quantity}, Total: ${totalTicketsSold + currentTier.remaining_quantity}`);

    // Invariant: total tickets sold + remaining quantity must exactly equal initial stock
    assert.equal(
      totalTicketsSold + currentTier.remaining_quantity,
      initialStock,
      'Conservation of inventory invariant violated'
    );

    // Invariant: remaining_quantity must NEVER be negative
    assert.ok(currentTier.remaining_quantity >= 0, `Remaining quantity is negative: ${currentTier.remaining_quantity}`);

    // 2. Adversarial direct SQL violation: Verify that check constraint chk_ticket_tiers_remaining_quantity
    // rejects an explicit UPDATE attempting to set remaining_quantity to negative
    await assert.rejects(
      async () => {
        await query('UPDATE ticket_tiers SET remaining_quantity = -5 WHERE id = $1;', [tier.id]);
      },
      (err) => {
        assert.ok(
          err.code === '23514' || err.message.includes('chk_ticket_tiers_remaining_quantity'),
          `Expected check constraint 23514 violation, received: ${err.message}`
        );
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // Challenge 3: Multi-tier Deadlock Stress Test (Cart A vs Cart B)
  // --------------------------------------------------------------------------
  test('CHALLENGE 3: Multi-tier Deadlock Test — Cart A [Tier 1, Tier 2] vs Cart B [Tier 2, Tier 1]', async () => {
    // Create two tiers
    const { rows: [tier1] } = await query(`
      INSERT INTO ticket_tiers (
        event_id, title, price, type, initial_quantity, remaining_quantity
      ) VALUES ($1, 'Deadlock Test Tier 1', 20.00, 'PAID', 100, 100) RETURNING id;
    `, [testEventId]);

    const { rows: [tier2] } = await query(`
      INSERT INTO ticket_tiers (
        event_id, title, price, type, initial_quantity, remaining_quantity
      ) VALUES ($1, 'Deadlock Test Tier 2', 40.00, 'PAID', 100, 100) RETURNING id;
    `, [testEventId]);

    // Ensure IDs are strictly ordered
    const lowerTierId = Math.min(tier1.id, tier2.id);
    const higherTierId = Math.max(tier1.id, tier2.id);

    console.log(`[Deadlock Test Setup] Lower Tier ID: ${lowerTierId}, Higher Tier ID: ${higherTierId}`);

    // Fire 40 concurrent pairs:
    // Group A carts request [lowerTierId, higherTierId]
    // Group B carts request [higherTierId, lowerTierId] (deliberate reverse order)
    const pairCount = 20; // 20 pairs = 40 concurrent transactions
    const concurrentCarts = [];

    for (let i = 0; i < pairCount; i++) {
      // Cart A: [lower, higher]
      concurrentCarts.push(
        (async () => {
          return withTransaction(async (client) => {
            return reserveTickets(client, [
              { ticket_tier_id: lowerTierId, quantity: 1 },
              { ticket_tier_id: higherTierId, quantity: 1 },
            ]);
          });
        })()
      );

      // Cart B: [higher, lower] - REVERSE ORDER
      concurrentCarts.push(
        (async () => {
          return withTransaction(async (client) => {
            return reserveTickets(client, [
              { ticket_tier_id: higherTierId, quantity: 1 },
              { ticket_tier_id: lowerTierId, quantity: 1 },
            ]);
          });
        })()
      );
    }

    // Execute all 40 concurrent transactions simultaneously
    const start = Date.now();
    const results = await Promise.allSettled(concurrentCarts);
    const duration = Date.now() - start;

    const deadlocks = results.filter(
      (r) => r.status === 'rejected' && (r.reason?.code === '40P01' || r.reason?.message?.includes('deadlock'))
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const errors = results.filter((r) => r.status === 'rejected');

    console.log(`[Deadlock Test] 40 inverted-order concurrent carts processed in ${duration}ms:`);
    console.log(`  Fulfilled: ${fulfilled.length}`);
    console.log(`  Deadlocks detected (40P01): ${deadlocks.length}`);
    console.log(`  Other errors: ${errors.length - deadlocks.length}`);

    // ASSERT STRICTLY ZERO DEADLOCKS
    assert.equal(
      deadlocks.length,
      0,
      `Detected ${deadlocks.length} PostgreSQL deadlocks (40P01)! Tier ID sorting failed to prevent circular wait.`
    );

    // All 40 carts should succeed because both tiers had 100 stock
    assert.equal(fulfilled.length, 40, `All 40 carts should have succeeded, got ${fulfilled.length}`);

    // Check final remaining inventory
    const { rows: [t1Final] } = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [lowerTierId]);
    const { rows: [t2Final] } = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [higherTierId]);

    assert.equal(t1Final.remaining_quantity, 60, 'Tier 1 remaining stock must be exactly 60 (100 - 40)');
    assert.equal(t2Final.remaining_quantity, 60, 'Tier 2 remaining stock must be exactly 60 (100 - 40)');
  });

  // --------------------------------------------------------------------------
  // Challenge 4: Multi-item Cart Partial Exhaustion Rollback Test
  // --------------------------------------------------------------------------
  test('CHALLENGE 4: Rollback Test — 2-item cart with 1 valid tier and 1 exhausted tier rolls back completely', async () => {
    // Valid tier with 10 tickets remaining
    const { rows: [validTier] } = await query(`
      INSERT INTO ticket_tiers (
        event_id, title, price, type, initial_quantity, remaining_quantity
      ) VALUES ($1, 'Valid Tier', 30.00, 'PAID', 10, 10) RETURNING id;
    `, [testEventId]);

    // Exhausted tier with 0 tickets remaining
    const { rows: [exhaustedTier] } = await query(`
      INSERT INTO ticket_tiers (
        event_id, title, price, type, initial_quantity, remaining_quantity
      ) VALUES ($1, 'Exhausted Tier', 50.00, 'PAID', 10, 0) RETURNING id;
    `, [testEventId]);

    // Test Case A: Valid tier first, exhausted tier second
    await assert.rejects(
      async () => {
        await withTransaction(async (client) => {
          return reserveTickets(client, [
            { ticket_tier_id: validTier.id, quantity: 2 },
            { ticket_tier_id: exhaustedTier.id, quantity: 1 },
          ]);
        });
      },
      (err) => {
        assert.ok(err instanceof InventoryExhaustedError, 'Must throw InventoryExhaustedError');
        assert.equal(err.tierId, exhaustedTier.id, 'Error must point to exhausted tier ID');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // Verify validTier was NOT decremented (stock remains 10)
    let { rows: [checkValidA] } = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [validTier.id]);
    assert.equal(checkValidA.remaining_quantity, 10, 'Valid tier must remain at 10 after rollback (Case A)');

    // Test Case B: Exhausted tier first, valid tier second
    await assert.rejects(
      async () => {
        await withTransaction(async (client) => {
          return reserveTickets(client, [
            { ticket_tier_id: exhaustedTier.id, quantity: 1 },
            { ticket_tier_id: validTier.id, quantity: 2 },
          ]);
        });
      },
      (err) => {
        assert.ok(err instanceof InventoryExhaustedError);
        assert.equal(err.tierId, exhaustedTier.id);
        return true;
      }
    );

    // Verify validTier was NOT decremented (stock remains 10)
    let { rows: [checkValidB] } = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [validTier.id]);
    assert.equal(checkValidB.remaining_quantity, 10, 'Valid tier must remain at 10 after rollback (Case B)');

    // Test Case C: 3-item cart with 2 valid tiers and 1 middle exhausted tier
    const { rows: [validTier2] } = await query(`
      INSERT INTO ticket_tiers (
        event_id, title, price, type, initial_quantity, remaining_quantity
      ) VALUES ($1, 'Valid Tier 2', 15.00, 'PAID', 5, 5) RETURNING id;
    `, [testEventId]);

    await assert.rejects(
      async () => {
        await withTransaction(async (client) => {
          return reserveTickets(client, [
            { ticket_tier_id: validTier.id, quantity: 3 },
            { ticket_tier_id: exhaustedTier.id, quantity: 1 },
            { ticket_tier_id: validTier2.id, quantity: 2 },
          ]);
        });
      },
      InventoryExhaustedError
    );

    // Verify all tiers completely untouched
    const { rows: [checkValid1C] } = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [validTier.id]);
    const { rows: [checkValid2C] } = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [validTier2.id]);
    assert.equal(checkValid1C.remaining_quantity, 10, 'Valid tier 1 must still be 10');
    assert.equal(checkValid2C.remaining_quantity, 5, 'Valid tier 2 must still be 5');
  });

  // --------------------------------------------------------------------------
  // Challenge 5: Edge Cases & Connection Pool Health
  // --------------------------------------------------------------------------
  test('CHALLENGE 5: Edge Cases & Zero Connection Pool Leaks', async () => {
    // 1. Empty items array
    const emptyResult = await withTransaction(async (client) => {
      return reserveTickets(client, []);
    });
    assert.deepEqual(emptyResult, []);

    // 2. Null/undefined items
    const nullResult = await withTransaction(async (client) => {
      return reserveTickets(client, null);
    });
    assert.deepEqual(nullResult, []);

    // 3. Zero / negative quantity ignored safely
    const zeroResult = await withTransaction(async (client) => {
      return reserveTickets(client, [{ ticket_tier_id: 1, quantity: 0 }, { ticket_tier_id: 1, quantity: -2 }]);
    });
    assert.deepEqual(zeroResult, []);

    // 4. Non-existent ticket tier ID throws 409 and rolls back
    await assert.rejects(
      async () => {
        await withTransaction(async (client) => {
          return reserveTickets(client, [{ ticket_tier_id: 99999999, quantity: 1 }]);
        });
      },
      (err) => {
        assert.ok(err instanceof InventoryExhaustedError);
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // 5. Verify pool has not leaked connections
    // pool.waitingCount should be 0 (no queued clients blocked)
    console.log(`[Pool Health] totalCount: ${pool.totalCount}, idleCount: ${pool.idleCount}, waitingCount: ${pool.waitingCount}`);
    assert.equal(pool.waitingCount, 0, 'Connection pool must have 0 waiting connection requests');
  });
});
