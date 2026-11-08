/**
 * TicketFlow - Milestone 1 Verification Test Suite
 * File: backend/tests/m1-database.test.js
 *
 * Verifies:
 * 1. Database schema (11 tables + tickets view + constraints)
 * 2. Supabase / PgBouncer anonymous query protocol (immunity to named statements)
 * 3. Atomic inventory reservation concurrency, deadlock prevention, rollback, and restoration
 * 4. Dev seed data integrity and bcrypt password verification
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {
  pool,
  query,
  getClient,
  withTransaction,
  reserveTickets,
  releaseTickets,
  InventoryExhaustedError,
  closePool,
} from '../src/config/db.js';

describe('Milestone 1: Database Infrastructure & Schema Verification', () => {

  // --------------------------------------------------------------------------
  // 1. Schema & Relational Integrity
  // --------------------------------------------------------------------------
  describe('1. Relational Schema & Tables', () => {
    const requiredTables = [
      'accounts',
      'users',
      'account_users',
      'organizers',
      'events',
      'event_settings',
      'ticket_tiers',
      'promo_codes',
      'orders',
      'order_items',
      'attendees',
    ];

    test('All 11 required relational tables exist in PostgreSQL public schema', async () => {
      const sql = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `;
      const { rows } = await query(sql);
      const existingTables = new Set(rows.map((r) => r.table_name));

      for (const table of requiredTables) {
        assert.ok(
          existingTables.has(table),
          `Missing required table: ${table}. Found tables: ${Array.from(existingTables).join(', ')}`
        );
      }
    });

    test('Backward-compatible view "tickets" exists and aliases "ticket_tiers"', async () => {
      const sql = `
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_schema = 'public' AND table_name = 'tickets';
      `;
      const { rows } = await query(sql);
      assert.equal(rows.length, 1, 'View "tickets" must exist');

      // Verify querying view works and matches ticket_tiers
      const viewResult = await query('SELECT COUNT(*) AS count FROM tickets;');
      const tableResult = await query('SELECT COUNT(*) AS count FROM ticket_tiers;');
      assert.equal(viewResult.rows[0].count, tableResult.rows[0].count);
    });

    test('Key columns and data types in ticket_tiers and orders', async () => {
      const tierCols = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'ticket_tiers';
      `);
      const colMap = new Map(tierCols.rows.map((r) => [r.column_name, r.data_type]));

      assert.ok(colMap.has('remaining_quantity'), 'ticket_tiers must have remaining_quantity');
      assert.ok(colMap.has('initial_quantity'), 'ticket_tiers must have initial_quantity');
      assert.ok(colMap.has('price'), 'ticket_tiers must have price');

      const orderCols = await query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'orders';
      `);
      const orderColMap = new Map(orderCols.rows.map((r) => [r.column_name, r.data_type]));
      assert.ok(orderColMap.has('short_id'), 'orders must have short_id');
      assert.ok(orderColMap.has('public_id'), 'orders must have public_id');
      assert.ok(orderColMap.has('status'), 'orders must have status');
      assert.ok(orderColMap.has('reserved_until'), 'orders must have reserved_until');
    });

    test('Check constraint chk_ticket_tiers_remaining_quantity prevents negative stock', async () => {
      // Find any event
      const { rows: events } = await query('SELECT id FROM events LIMIT 1;');
      assert.ok(events.length > 0, 'Must have at least one event');
      const eventId = events[0].id;

      // Create a temporary tier
      const insertResult = await query(`
        INSERT INTO ticket_tiers (
          event_id, title, price, type, initial_quantity, remaining_quantity
        ) VALUES (
          $1, 'Constraint Test Tier', 10.00, 'PAID', 10, 5
        ) RETURNING id;
      `, [eventId]);
      const testTierId = insertResult.rows[0].id;

      try {
        // Attempt to violate constraint directly with SQL UPDATE
        await assert.rejects(
          async () => {
            await query('UPDATE ticket_tiers SET remaining_quantity = -1 WHERE id = $1;', [testTierId]);
          },
          (err) => {
            assert.ok(
              err.message.includes('chk_ticket_tiers_remaining_quantity') || err.code === '23514',
              `Expected check constraint violation, got: ${err.message}`
            );
            return true;
          }
        );
      } finally {
        await query('DELETE FROM ticket_tiers WHERE id = $1;', [testTierId]);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Supabase / PgBouncer Anonymous Query Protocol Immunity
  // --------------------------------------------------------------------------
  describe('2. Supabase PgBouncer Anonymous Parse Compatibility', () => {
    test('query() strips named statements to avoid 26000 errors under PgBouncer', async () => {
      // Pass an object with a statement name
      const result = await query({
        name: 'forbidden_named_statement_m1_test',
        text: 'SELECT 42 AS answer;',
      });
      assert.equal(result.rows[0].answer, 42);

      // Verify that no named prepared statement was created on the PostgreSQL connection
      const prepResult = await query(
        "SELECT name FROM pg_prepared_statements WHERE name = 'forbidden_named_statement_m1_test';"
      );
      assert.equal(
        prepResult.rows.length,
        0,
        'Named prepared statement must NOT exist in pg_prepared_statements'
      );
    });

    test('getClient() checked-out client also strips statement names', async () => {
      const client = await getClient();
      try {
        const res = await client.query({
          name: 'client_forbidden_named_statement',
          text: 'SELECT 99 AS val;',
        });
        assert.equal(res.rows[0].val, 99);

        const checkRes = await client.query(
          "SELECT name FROM pg_prepared_statements WHERE name = 'client_forbidden_named_statement';"
        );
        assert.equal(checkRes.rows.length, 0);
      } finally {
        client.release();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Atomic Concurrency Control, Deadlock Prevention & Rollbacks
  // --------------------------------------------------------------------------
  describe('3. Atomic Inventory Concurrency & Concurrency Primitives', () => {
    let testEventId;
    let tierAId;
    let tierBId;

    before(async () => {
      const { rows: [account] } = await query('SELECT id FROM accounts LIMIT 1;');
      assert.ok(account, 'Seeded account must exist');

      const { rows: [event] } = await query(`
        INSERT INTO events (
          short_id, account_id, title, slug, status, type, category, currency, timezone
        ) VALUES (
          'test-concurrency-event-' || floor(random() * 100000),
          $1, 'Test Concurrency Event', 'test-concurrency-event', 'LIVE', 'SINGLE', 'MUSIC', 'USD', 'UTC'
        ) RETURNING id;
      `, [account.id]);
      testEventId = event.id;

      const { rows: [tA] } = await query(`
        INSERT INTO ticket_tiers (
          event_id, title, price, type, initial_quantity, remaining_quantity
        ) VALUES ($1, 'Concurrency Tier A', 20.00, 'PAID', 5, 5) RETURNING id;
      `, [testEventId]);
      tierAId = tA.id;

      const { rows: [tB] } = await query(`
        INSERT INTO ticket_tiers (
          event_id, title, price, type, initial_quantity, remaining_quantity
        ) VALUES ($1, 'Concurrency Tier B', 50.00, 'PAID', 10, 10) RETURNING id;
      `, [testEventId]);
      tierBId = tB.id;
    });

    after(async () => {
      if (testEventId) {
        await query('DELETE FROM events WHERE id = $1;', [testEventId]);
      }
    });

    test('reserveTickets decrements remaining_quantity atomically and returns updated row', async () => {
      const updated = await withTransaction(async (client) => {
        return reserveTickets(client, [{ ticket_tier_id: tierAId, quantity: 2 }]);
      });

      assert.equal(updated.length, 1);
      assert.equal(updated[0].remaining_quantity, 3);

      const check = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [tierAId]);
      assert.equal(check.rows[0].remaining_quantity, 3);
    });

    test('reserveTickets throws InventoryExhaustedError (409) when remaining_quantity < requested', async () => {
      // Remaining is currently 3. Requesting 4 must fail.
      await assert.rejects(
        async () => {
          await withTransaction(async (client) => {
            return reserveTickets(client, [{ ticket_tier_id: tierAId, quantity: 4 }]);
          });
        },
        (err) => {
          assert.ok(err instanceof InventoryExhaustedError, 'Error must be InventoryExhaustedError');
          assert.equal(err.statusCode, 409, 'Must have statusCode 409');
          assert.equal(err.code, 'INVENTORY_EXHAUSTED');
          assert.equal(err.tierId, tierAId);
          assert.equal(err.requested, 4);
          assert.equal(err.remaining, 3);
          return true;
        }
      );

      // Remaining must still be 3 (not decremented)
      const check = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [tierAId]);
      assert.equal(check.rows[0].remaining_quantity, 3);
    });

    test('Multi-item cart reservation rolls back completely if any item is exhausted', async () => {
      // Tier A has 3 remaining. Tier B has 10 remaining.
      // Requesting 1 from Tier A and 20 from Tier B (which will fail on Tier B).
      await assert.rejects(
        async () => {
          await withTransaction(async (client) => {
            return reserveTickets(client, [
              { ticket_tier_id: tierAId, quantity: 1 },
              { ticket_tier_id: tierBId, quantity: 20 },
            ]);
          });
        },
        InventoryExhaustedError
      );

      // Verify Tier A was NOT decremented because transaction rolled back
      const checkA = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [tierAId]);
      assert.equal(checkA.rows[0].remaining_quantity, 3, 'Tier A must remain at 3 due to transaction rollback');

      const checkB = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [tierBId]);
      assert.equal(checkB.rows[0].remaining_quantity, 10, 'Tier B must remain at 10');
    });

    test('High concurrency stress test: zero overbooking with 25 concurrent checkouts', async () => {
      // Tier A has 3 tickets remaining.
      // Launch 25 concurrent checkout transactions each requesting 1 ticket.
      const concurrentRequests = 25;
      const tasks = Array.from({ length: concurrentRequests }, async (_, index) => {
        try {
          await withTransaction(async (client) => {
            return reserveTickets(client, [{ ticket_tier_id: tierAId, quantity: 1 }]);
          });
          return { success: true, index };
        } catch (err) {
          if (err instanceof InventoryExhaustedError) {
            return { success: false, code: err.code, index };
          }
          throw err;
        }
      });

      const results = await Promise.all(tasks);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      assert.equal(successes.length, 3, 'Exactly 3 reservations must succeed');
      assert.equal(failures.length, 22, 'Exactly 22 reservations must fail with INVENTORY_EXHAUSTED');

      const checkFinal = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [tierAId]);
      assert.equal(checkFinal.rows[0].remaining_quantity, 0, 'Remaining inventory must be exactly 0, never negative');
    });

    test('releaseTickets restores inventory correctly upon cancellation/expiration', async () => {
      // Tier A currently has 0 remaining. Release 3 tickets.
      const restored = await releaseTickets(pool, [{ ticket_tier_id: tierAId, quantity: 3 }]);
      assert.equal(restored.length, 1);
      assert.equal(restored[0].remaining_quantity, 3);

      const check = await query('SELECT remaining_quantity FROM ticket_tiers WHERE id = $1;', [tierAId]);
      assert.equal(check.rows[0].remaining_quantity, 3);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Dev Seed Data Integrity & Bcrypt Authentication
  // --------------------------------------------------------------------------
  describe('4. Development Seed Dataset & Bcrypt Verification', () => {
    test('SuperAdmin user exists and password authenticates with bcrypt', async () => {
      const { rows } = await query("SELECT * FROM users WHERE email = 'admin@ticketflow.test';");
      assert.equal(rows.length, 1, 'admin@ticketflow.test must exist');

      const user = rows[0];
      assert.equal(user.role, 'ADMIN');
      assert.ok(user.password.startsWith('$2'), 'Password must be a bcrypt hash');

      const isMatch = await bcrypt.compare('BootstrapPass123!', user.password);
      assert.equal(isMatch, true, 'SuperAdmin password must match BootstrapPass123!');
    });

    test('Organizer user exists and password authenticates with bcrypt', async () => {
      const { rows } = await query("SELECT * FROM users WHERE email = 'organizer@ticketflow.test';");
      assert.equal(rows.length, 1, 'organizer@ticketflow.test must exist');

      const user = rows[0];
      assert.equal(user.role, 'ORGANIZER');

      const isMatch = await bcrypt.compare('BootstrapPass123!', user.password);
      assert.equal(isMatch, true, 'Organizer password must match BootstrapPass123!');
    });

    test('Live event "Tech Conference 2026" exists with settings, 3 tiers, and promo codes', async () => {
      const { rows: events } = await query("SELECT * FROM events WHERE short_id = 'tech-conf-2026';");
      assert.equal(events.length, 1, 'Tech Conference 2026 event must exist');
      const event = events[0];
      assert.equal(event.status, 'LIVE');
      assert.equal(event.ticket_quantity_available, 500);

      // Verify event settings (15m hold timer)
      const { rows: settings } = await query('SELECT * FROM event_settings WHERE event_id = $1;', [event.id]);
      assert.equal(settings.length, 1, 'Event settings must exist');
      assert.equal(settings[0].order_timeout_in_minutes, 15);
      assert.equal(settings[0].require_attendee_details, true);

      // Verify 3 ticket tiers
      const { rows: tiers } = await query(
        'SELECT title, price, remaining_quantity, initial_quantity FROM ticket_tiers WHERE event_id = $1 ORDER BY sort_order ASC;',
        [event.id]
      );
      assert.equal(tiers.length, 3, 'Must have exactly 3 ticket tiers');

      const tierTitles = tiers.map((t) => t.title);
      assert.deepEqual(tierTitles, ['Free Ticket', 'General Admission', 'VIP Pass']);
      assert.equal(Number(tiers[0].price), 0.00);
      assert.equal(Number(tiers[1].price), 25.00);
      assert.equal(Number(tiers[2].price), 99.00);

      // Verify promo codes
      const { rows: promos } = await query(
        'SELECT code, discount, discount_type FROM promo_codes WHERE event_id = $1 ORDER BY id ASC;',
        [event.id]
      );
      assert.equal(promos.length, 2, 'Must have 2 promo codes');
      const promo10 = promos.find((p) => p.code === 'bootstrap10');
      assert.ok(promo10, 'bootstrap10 promo code must exist');
      assert.equal(promo10.discount_type, 'PERCENTAGE');
      assert.equal(Number(promo10.discount), 10.00);

      const save5 = promos.find((p) => p.code === 'SAVE5');
      assert.ok(save5, 'SAVE5 promo code must exist');
      assert.equal(save5.discount_type, 'FIXED');
      assert.equal(Number(save5.discount), 5.00);
    });
  });

  after(async () => {
    await closePool();
  });
});
