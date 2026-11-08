/**
 * TicketFlow - Milestone 1 Adversarial Challenger Test Suite
 * File: backend/tests/challenger-m1.test.js
 *
 * EMPIRICAL ADVERSARIAL VALIDATION OF:
 * Probe 1: Migration Idempotency (3 consecutive executions)
 * Probe 2: Foreign Key Constraint Enforcement (ON DELETE RESTRICT on ticket_tiers)
 * Probe 3: Check Constraint Enforcement (Negative/excess inventory & prices)
 * Probe 4: Supabase PgBouncer Immunity (Stripping named prepared statements)
 * Probe 5: Dev Seed Dataset & Bcrypt Authentication Integrity
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import {
  pool,
  query,
  getClient,
  withTransaction,
  closePool,
} from '../src/config/db.js';
import { seedDatabase } from '../database/seeders/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsScriptPath = path.resolve(__dirname, '../database/migrations/run-migrations.js');

describe('Milestone 1 Adversarial Challenger Suite', () => {

  // ==========================================================================
  // PROBE 1: Migration Idempotency (3 consecutive runs)
  // ==========================================================================
  describe('Probe 1: Migration Idempotency (3 consecutive runs)', () => {
    test('run-migrations.js executes 3 times consecutively with exit code 0 and zero duplicates', async () => {
      const outputs = [];

      for (let run = 1; run <= 3; run++) {
        const stdout = execFileSync('node', [migrationsScriptPath], {
          encoding: 'utf8',
          cwd: path.resolve(__dirname, '..'),
          env: process.env,
        });
        outputs.push({ run, stdout });

        // Assert no fatal crash output
        assert.ok(!stdout.includes('[FATAL]'), `Run ${run} had fatal error output: ${stdout}`);
        assert.ok(stdout.includes('Migrations completed:'), `Run ${run} did not complete properly: ${stdout}`);
      }

      // Verify the migrations journal table has exactly 1 entry for 001_initial_schema.sql
      const { rows: migrationRows } = await query('SELECT id, name, applied_at FROM migrations;');
      assert.equal(migrationRows.length, 1, 'There must be exactly 1 record in migrations table');
      assert.equal(migrationRows[0].name, '001_initial_schema.sql');

      // Verify no duplicate table definitions occurred
      const { rows: tableRows } = await query(`
        SELECT table_name, COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        GROUP BY table_name
        HAVING COUNT(*) > 1;
      `);
      assert.equal(tableRows.length, 0, 'No duplicate tables exist in public schema');

      // Verify total table count matches expected 12 (11 domain tables + migrations table)
      const { rows: allTables } = await query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `);
      const tableNames = new Set(allTables.map((t) => t.table_name));
      const requiredTables = [
        'migrations',
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
      for (const t of requiredTables) {
        assert.ok(tableNames.has(t), `Table ${t} must exist`);
      }
    });
  });

  // ==========================================================================
  // PROBE 2: Foreign Key Constraint Enforcement (ON DELETE RESTRICT)
  // ==========================================================================
  describe('Probe 2: Foreign Key Constraint Enforcement (ON DELETE RESTRICT)', () => {
    let testAccountId;
    let testEventId;
    let testTierId;
    let testOrderId;
    let testOrderItemId;
    let testAttendeeId;

    before(async () => {
      // Create isolated account
      const { rows: [acc] } = await query(`
        INSERT INTO accounts (name, email, short_id)
        VALUES ('FK Test Account', 'fk-test@ticketflow.test', 'acc_fk_' || floor(random() * 1000000))
        RETURNING id;
      `);
      testAccountId = acc.id;

      // Create isolated event
      const { rows: [ev] } = await query(`
        INSERT INTO events (account_id, short_id, title, slug)
        VALUES ($1, 'ev-fk-' || floor(random() * 1000000), 'FK Event', 'fk-event')
        RETURNING id;
      `, [testAccountId]);
      testEventId = ev.id;

      // Create isolated ticket tier
      const { rows: [tt] } = await query(`
        INSERT INTO ticket_tiers (event_id, title, price, initial_quantity, remaining_quantity)
        VALUES ($1, 'FK Test Tier', 50.00, 100, 100)
        RETURNING id;
      `, [testEventId]);
      testTierId = tt.id;

      // Create isolated order
      const { rows: [ord] } = await query(`
        INSERT INTO orders (
          event_id, short_id, public_id, status, payment_status,
          subtotal, total_before_additions, total_gross
        ) VALUES (
          $1, 'ord_fk_' || floor(random() * 1000000), 'pub_fk_' || floor(random() * 1000000),
          'COMPLETED', 'PAYMENT_RECEIVED', 50.00, 50.00, 50.00
        ) RETURNING id;
      `, [testEventId]);
      testOrderId = ord.id;
    });

    after(async () => {
      // Clean up in reverse dependency order
      if (testAttendeeId) {
        await query('DELETE FROM attendees WHERE id = $1;', [testAttendeeId]);
      }
      if (testOrderItemId) {
        await query('DELETE FROM order_items WHERE id = $1;', [testOrderItemId]);
      }
      if (testOrderId) {
        await query('DELETE FROM orders WHERE id = $1;', [testOrderId]);
      }
      if (testTierId) {
        await query('DELETE FROM ticket_tiers WHERE id = $1;', [testTierId]);
      }
      if (testEventId) {
        await query('DELETE FROM events WHERE id = $1;', [testEventId]);
      }
      if (testAccountId) {
        await query('DELETE FROM accounts WHERE id = $1;', [testAccountId]);
      }
    });

    test('ON DELETE RESTRICT blocks deleting ticket_tier referenced by order_item', async () => {
      // Insert order_item referencing ticket_tier
      const { rows: [oi] } = await query(`
        INSERT INTO order_items (
          order_id, ticket_tier_id, item_name, quantity, price,
          total_before_additions, total_gross
        ) VALUES (
          $1, $2, 'FK Test Tier', 1, 50.00, 50.00, 50.00
        ) RETURNING id;
      `, [testOrderId, testTierId]);
      testOrderItemId = oi.id;

      // Attempt to delete ticket_tier directly
      await assert.rejects(
        async () => {
          await query('DELETE FROM ticket_tiers WHERE id = $1;', [testTierId]);
        },
        (err) => {
          assert.equal(err.code, '23503', 'Expected PostgreSQL error code 23503 (foreign_key_violation)');
          assert.ok(
            err.message.includes('order_items') || err.message.includes('order_items_ticket_tier_id_fkey'),
            `Error message should reference order_items foreign key constraint: ${err.message}`
          );
          return true;
        }
      );

      // Clean up order item so next test can test attendee
      await query('DELETE FROM order_items WHERE id = $1;', [testOrderItemId]);
      testOrderItemId = null;
    });

    test('ON DELETE RESTRICT blocks deleting ticket_tier referenced by attendee', async () => {
      // Insert attendee referencing ticket_tier
      const { rows: [att] } = await query(`
        INSERT INTO attendees (
          order_id, ticket_tier_id, event_id, short_id, public_id, email, first_name, last_name
        ) VALUES (
          $1, $2, $3, 'att_' || floor(random() * 1000000), 'pub_att_' || floor(random() * 1000000),
          'challenger-attendee@ticketflow.test', 'Challenger', 'Tester'
        ) RETURNING id;
      `, [testOrderId, testTierId, testEventId]);
      testAttendeeId = att.id;

      // Attempt to delete ticket_tier directly
      await assert.rejects(
        async () => {
          await query('DELETE FROM ticket_tiers WHERE id = $1;', [testTierId]);
        },
        (err) => {
          assert.equal(err.code, '23503', 'Expected PostgreSQL error code 23503 (foreign_key_violation)');
          assert.ok(
            err.message.includes('attendees') || err.message.includes('attendees_ticket_tier_id_fkey'),
            `Error message should reference attendees foreign key constraint: ${err.message}`
          );
          return true;
        }
      );

      // Clean up attendee
      await query('DELETE FROM attendees WHERE id = $1;', [testAttendeeId]);
      testAttendeeId = null;
    });

    test('Deleting ticket_tier succeeds when no order_items or attendees reference it', async () => {
      // Now that both order_item and attendee are removed, deleting ticket_tier should succeed
      const deleteResult = await query('DELETE FROM ticket_tiers WHERE id = $1;', [testTierId]);
      assert.equal(deleteResult.rowCount, 1, 'Ticket tier should be deleted successfully');
      testTierId = null; // Marked deleted
    });
  });

  // ==========================================================================
  // PROBE 3: Check Constraint Enforcement (Negative/excess inventory & prices)
  // ==========================================================================
  describe('Probe 3: Check Constraint Enforcement', () => {
    let testTierId;
    let testEventId;

    before(async () => {
      const { rows: [ev] } = await query('SELECT id FROM events LIMIT 1;');
      assert.ok(ev, 'Event must exist');
      testEventId = ev.id;

      const { rows: [tier] } = await query(`
        INSERT INTO ticket_tiers (
          event_id, title, price, initial_quantity, remaining_quantity, min_per_order, max_per_order
        ) VALUES (
          $1, 'Check Constraint Probe Tier', 25.00, 100, 50, 1, 10
        ) RETURNING id;
      `, [testEventId]);
      testTierId = tier.id;
    });

    after(async () => {
      if (testTierId) {
        await query('DELETE FROM ticket_tiers WHERE id = $1;', [testTierId]);
      }
    });

    test('chk_ticket_tiers_remaining_quantity prevents negative remaining_quantity', async () => {
      await assert.rejects(
        async () => {
          await query('UPDATE ticket_tiers SET remaining_quantity = -1 WHERE id = $1;', [testTierId]);
        },
        (err) => {
          assert.equal(err.code, '23514', 'Expected code 23514 (check_violation)');
          assert.ok(
            err.message.includes('chk_ticket_tiers_remaining_quantity'),
            `Error should specify chk_ticket_tiers_remaining_quantity: ${err.message}`
          );
          return true;
        }
      );
    });

    test('chk_ticket_tiers_remaining_quantity prevents remaining_quantity > initial_quantity', async () => {
      await assert.rejects(
        async () => {
          await query('UPDATE ticket_tiers SET remaining_quantity = 101 WHERE id = $1;', [testTierId]);
        },
        (err) => {
          assert.equal(err.code, '23514', 'Expected code 23514 (check_violation)');
          assert.ok(
            err.message.includes('chk_ticket_tiers_remaining_quantity'),
            `Error should specify chk_ticket_tiers_remaining_quantity: ${err.message}`
          );
          return true;
        }
      );
    });

    test('chk_ticket_tiers_price prevents negative price', async () => {
      await assert.rejects(
        async () => {
          await query('UPDATE ticket_tiers SET price = -0.01 WHERE id = $1;', [testTierId]);
        },
        (err) => {
          assert.equal(err.code, '23514', 'Expected code 23514 (check_violation)');
          assert.ok(
            err.message.includes('chk_ticket_tiers_price'),
            `Error should specify chk_ticket_tiers_price: ${err.message}`
          );
          return true;
        }
      );
    });

    test('chk_ticket_tiers_min_max prevents min_per_order > max_per_order', async () => {
      await assert.rejects(
        async () => {
          await query('UPDATE ticket_tiers SET min_per_order = 11, max_per_order = 10 WHERE id = $1;', [testTierId]);
        },
        (err) => {
          assert.equal(err.code, '23514', 'Expected code 23514 (check_violation)');
          assert.ok(
            err.message.includes('chk_ticket_tiers_min_max'),
            `Error should specify chk_ticket_tiers_min_max: ${err.message}`
          );
          return true;
        }
      );
    });
  });

  // ==========================================================================
  // PROBE 4: Supabase PgBouncer Anonymous Query Protocol Immunity
  // ==========================================================================
  describe('Probe 4: Supabase PgBouncer Immunity', () => {
    test('query() strips statement name and leaves pg_prepared_statements clean', async () => {
      const stmtName = 'adversarial_pgbouncer_named_stmt_1';
      const result = await query({
        name: stmtName,
        text: 'SELECT $1::int AS val, $2::text AS txt;',
        values: [123, 'pgbouncer-safe'],
      });

      assert.equal(result.rows[0].val, 123);
      assert.equal(result.rows[0].txt, 'pgbouncer-safe');

      // Check PostgreSQL pg_prepared_statements catalog
      const catalogCheck = await query(
        'SELECT name, statement FROM pg_prepared_statements WHERE name = $1;',
        [stmtName]
      );
      assert.equal(
        catalogCheck.rows.length,
        0,
        `Statement "${stmtName}" must NOT exist in pg_prepared_statements`
      );
    });

    test('getClient() strips statement name from client.query with Promise and Callback', async () => {
      const client = await getClient();
      try {
        const stmtPromiseName = 'adversarial_client_named_stmt_promise';
        const resPromise = await client.query({
          name: stmtPromiseName,
          text: 'SELECT 777 AS num;',
        });
        assert.equal(resPromise.rows[0].num, 777);

        // Check catalog
        const checkPromise = await client.query(
          'SELECT name FROM pg_prepared_statements WHERE name = $1;',
          [stmtPromiseName]
        );
        assert.equal(checkPromise.rows.length, 0);

        // Callback style
        const stmtCallbackName = 'adversarial_client_named_stmt_callback';
        const callbackResult = await new Promise((resolve, reject) => {
          client.query(
            {
              name: stmtCallbackName,
              text: 'SELECT 888 AS num;',
            },
            (err, res) => {
              if (err) return reject(err);
              resolve(res);
            }
          );
        });
        assert.equal(callbackResult.rows[0].num, 888);

        const checkCallback = await client.query(
          'SELECT name FROM pg_prepared_statements WHERE name = $1;',
          [stmtCallbackName]
        );
        assert.equal(checkCallback.rows.length, 0);
      } finally {
        client.release();
      }
    });

    test('Executing repeated queries with identical text does not produce error 26000', async () => {
      const repeatedText = 'SELECT 1 AS loop_val;';
      for (let i = 0; i < 10; i++) {
        const res = await query({
          name: `loop_stmt_${i}`,
          text: repeatedText,
        });
        assert.equal(res.rows[0].loop_val, 1);
      }
    });
  });

  // ==========================================================================
  // PROBE 5: Seed Authentication Integrity & Bcrypt Verification
  // ==========================================================================
  describe('Probe 5: Seed Authentication Integrity', () => {
    test('SuperAdmin password hash authenticates "BootstrapPass123!" and rejects incorrect passwords', async () => {
      const { rows } = await query("SELECT * FROM users WHERE email = 'admin@ticketflow.test';");
      assert.equal(rows.length, 1, 'admin@ticketflow.test must exist in users table');

      const admin = rows[0];
      assert.equal(admin.role, 'ADMIN', 'admin user must have role ADMIN');
      assert.ok(admin.password.startsWith('$2'), 'Password must be bcrypt hash ($2a$ or $2b$)');

      // Valid password
      const valid = await bcrypt.compare('BootstrapPass123!', admin.password);
      assert.equal(valid, true, 'SuperAdmin password must match BootstrapPass123!');

      // Adversarial passwords
      const wrongPass = await bcrypt.compare('WrongPassword999!', admin.password);
      assert.equal(wrongPass, false, 'SuperAdmin must reject wrong password');

      const lowerPass = await bcrypt.compare('bootstrappass123!', admin.password);
      assert.equal(lowerPass, false, 'Bcrypt must be case-sensitive');

      const emptyPass = await bcrypt.compare('', admin.password);
      assert.equal(emptyPass, false, 'Empty string must not match');
    });

    test('Organizer password hash authenticates "BootstrapPass123!" and rejects incorrect passwords', async () => {
      const { rows } = await query("SELECT * FROM users WHERE email = 'organizer@ticketflow.test';");
      assert.equal(rows.length, 1, 'organizer@ticketflow.test must exist in users table');

      const organizer = rows[0];
      assert.equal(organizer.role, 'ORGANIZER', 'organizer user must have role ORGANIZER');
      assert.ok(organizer.password.startsWith('$2'), 'Password must be bcrypt hash ($2a$ or $2b$)');

      const valid = await bcrypt.compare('BootstrapPass123!', organizer.password);
      assert.equal(valid, true, 'Organizer password must match BootstrapPass123!');

      const invalid = await bcrypt.compare('IncorrectPass456!', organizer.password);
      assert.equal(invalid, false, 'Organizer must reject incorrect password');
    });

    test('Attendee password hash authenticates "BootstrapPass123!"', async () => {
      const { rows } = await query("SELECT * FROM users WHERE email = 'attendee@ticketflow.test';");
      assert.equal(rows.length, 1, 'attendee@ticketflow.test must exist in users table');

      const attendee = rows[0];
      assert.equal(attendee.role, 'ATTENDEE', 'attendee user must have role ATTENDEE');

      const valid = await bcrypt.compare('BootstrapPass123!', attendee.password);
      assert.equal(valid, true, 'Attendee password must match BootstrapPass123!');
    });

    test('Seeder idempotent execution maintains valid bcrypt credentials', async () => {
      // Re-run seedDatabase()
      await seedDatabase();

      // Re-verify both admin and organizer
      const { rows: adminRows } = await query("SELECT password FROM users WHERE email = 'admin@ticketflow.test';");
      assert.equal(await bcrypt.compare('BootstrapPass123!', adminRows[0].password), true);

      const { rows: orgRows } = await query("SELECT password FROM users WHERE email = 'organizer@ticketflow.test';");
      assert.equal(await bcrypt.compare('BootstrapPass123!', orgRows[0].password), true);
    });
  });

  after(async () => {
    await closePool();
  });
});
