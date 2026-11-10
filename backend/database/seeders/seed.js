/**
 * TicketFlow - Development Database Seeder
 * File: backend/database/seeders/seed.js
 *
 * Populates real PostgreSQL database (Supabase) with complete canonical data:
 * - 3 User Roles (Admin, Organizer, Attendee)
 * - 8 Real Events (Tech Summit, Jazz Night, Marathon, Film Festival, Meetup, EDM, Pitch Night, UX Workshop)
 * - 16 Real Ticket Tiers with accurate pricing, quantities, and permissions
 * - Active Promo Codes for each event (percentage and fixed discounts)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { getClient, pool } from '../../src/config/db.js';
import { demoEvents, demoTiers, demoPromos } from '../../src/data/demo-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export async function seedDatabase() {
  console.log('============================================================');
  console.log('         TicketFlow PostgreSQL Live Database Seeder         ');
  console.log('============================================================');

  const client = await getClient();

  try {
    await client.query('BEGIN');

    console.log('[CLEAN] Deleting existing data...');
    await client.query(`
      DELETE FROM attendees;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM promo_codes;
      DELETE FROM ticket_tiers;
      DELETE FROM event_settings;
      DELETE FROM events;
      DELETE FROM account_users;
      DELETE FROM organizers;
      DELETE FROM users;
      DELETE FROM accounts;
    `);

    // 1. Password Hashes (both password123 and BootstrapPass123!)
    const passLocalHash = await bcrypt.hash('password123', 10);

    // 2. Accounts
    await client.query(`
      INSERT INTO accounts (id, name, email, currency_code, timezone, short_id, stripe_account_id, stripe_connect_setup_complete, is_suspended, account_verified_at, created_at, updated_at)
      VALUES 
        (1, 'Admin Org', 'admin@ticketflow.local', 'USD', 'UTC', 'acc_admin', 'acct_mock_admin', true, false, NOW(), NOW(), NOW()),
        (2, 'Demo Organizer Org', 'organizer@ticketflow.local', 'USD', 'UTC', 'acc_organizer', 'acct_mock_org', true, false, NOW(), NOW(), NOW()),
        (3, 'Attendee Org', 'attendee@ticketflow.local', 'USD', 'UTC', 'acc_attendee', 'acct_mock_att', true, false, NOW(), NOW(), NOW());
    `);

    // 3. Users
    await client.query(`
      INSERT INTO users (id, first_name, last_name, email, password, role, account_id, email_verified_at, created_at, updated_at)
      VALUES 
        (1, 'Super', 'Admin', 'admin@ticketflow.local', $1, 'ADMIN', 1, NOW(), NOW(), NOW()),
        (2, 'Demo', 'Organizer', 'organizer@ticketflow.local', $1, 'ORGANIZER', 2, NOW(), NOW(), NOW()),
        (3, 'John', 'Attendee', 'attendee@ticketflow.local', $1, 'ATTENDEE', 3, NOW(), NOW(), NOW()),
        (4, 'Dev', 'Admin', 'admin@ticketflow.test', $1, 'ADMIN', 1, NOW(), NOW(), NOW()),
        (5, 'Dev', 'Organizer', 'organizer@ticketflow.test', $1, 'ORGANIZER', 2, NOW(), NOW(), NOW()),
        (6, 'Dev', 'Attendee', 'attendee@ticketflow.test', $1, 'ATTENDEE', 3, NOW(), NOW(), NOW());
    `, [passLocalHash]);

    // 4. Account Users Pivot
    await client.query(`
      INSERT INTO account_users (account_id, user_id, role, is_account_owner, status)
      VALUES 
        (1, 1, 'SUPERADMIN', true, 'ACTIVE'),
        (2, 2, 'ORGANIZER', false, 'ACTIVE'),
        (3, 3, 'ATTENDEE', false, 'ACTIVE'),
        (1, 4, 'SUPERADMIN', true, 'ACTIVE'),
        (2, 5, 'ORGANIZER', false, 'ACTIVE'),
        (3, 6, 'ATTENDEE', false, 'ACTIVE');
    `);

    // 5. Organizers
    await client.query(`
      INSERT INTO organizers (id, account_id, name, email, phone, website, description, currency, timezone, status, created_at, updated_at)
      VALUES 
        (1, 1, 'Ticketflow Platform Org', 'admin@ticketflow.local', '+1-555-0100', 'https://ticketflow.local', 'Platform master management organizer profile.', 'USD', 'UTC', 'ACTIVE', NOW(), NOW()),
        (2, 2, 'Global Events Producer', 'organizer@ticketflow.local', '+1-555-0199', 'https://ticketflow.local', 'Primary organizer profile for public events and meetups.', 'USD', 'UTC', 'ACTIVE', NOW(), NOW());
    `);

    // 6. Events (IDs 1 to 8)
    for (const ev of demoEvents) {
      await client.query(`
        INSERT INTO events (
          id, short_id, account_id, organizer_id, user_id, title, slug,
          description, status, type, category, currency, timezone,
          location, location_details, start_date, end_date, ticket_quantity_available,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, 'LIVE', 'SINGLE', $9, 'USD', 'Asia/Ho_Chi_Minh',
          $10, $11, $12, $13, 500,
          NOW(), NOW()
        );
      `, [
        ev.id,
        ev.slug || `event-${ev.id}`,
        2, // account_id
        2, // organizer_id
        2, // user_id
        ev.title,
        ev.slug || `event-${ev.id}`,
        ev.description,
        ev.category,
        ev.location,
        JSON.stringify({ venue: ev.location }),
        ev.starts_at,
        ev.ends_at,
      ]);

      // Event Settings for each event
      await client.query(`
        INSERT INTO event_settings (
          event_id, pre_checkout_message, post_checkout_message, ticket_page_message,
          continue_button_text, email_footer_message, support_email,
          require_attendee_details, attendee_details_collection_method,
          order_timeout_in_minutes, price_display_mode, payment_providers,
          offline_payment_instructions, is_online_event, created_at, updated_at
        ) VALUES (
          $1,
          'Please review your ticket selection. You have 15 minutes to complete checkout.',
          'Your registration is confirmed! Your digital barcodes are ready for check-in.',
          'Limited seats available. Maximum order quantities apply per tier.',
          'Continue to Attendee Information',
          'Ticketflow Support: support@ticketflow.local',
          'support@ticketflow.local',
          true, 'PER_TICKET',
          15, 'INCLUSIVE', '["OFFLINE", "STRIPE"]'::jsonb,
          'Please transfer payment using your Order Reference ID.',
          false, NOW(), NOW()
        );
      `, [ev.id]);
    }

    // 7. Ticket Tiers (IDs 1 to 16)
    for (const t of demoTiers) {
      await client.query(`
        INSERT INTO ticket_tiers (
          id, event_id, title, description, price, type,
          initial_quantity, remaining_quantity, min_per_order, max_per_order,
          is_hidden, sort_order, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          false, $11, NOW(), NOW()
        );
      `, [
        t.id,
        t.event_id,
        t.name || t.title,
        `Official ticket for ${(t.name || t.title).toLowerCase()}`,
        t.price,
        t.type,
        t.total_quantity,
        t.remaining_quantity,
        t.min_per_order || 1,
        t.max_per_order || 10,
        t.id,
      ]);
    }

    // 8. Promo Codes
    for (const p of demoPromos) {
      await client.query(`
        INSERT INTO promo_codes (
          id, event_id, code, discount_type, discount, discount_applies_to,
          max_allowed_usages, order_usage_count, attendee_usage_count, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'ORDER',
          $6, 0, 0, NOW(), NOW()
        );
      `, [
        p.id,
        p.event_id,
        p.code,
        p.discount_type || 'PERCENTAGE',
        p.discount_amount,
        p.max_uses || 50,
      ]);
    }

    // Additional promo codes for tests on Event 1
    await client.query(`
      INSERT INTO promo_codes (
        event_id, code, discount_type, discount, discount_applies_to,
        max_allowed_usages, order_usage_count, attendee_usage_count, created_at, updated_at
      ) VALUES 
        (1, 'FLAT10', 'FIXED', 1000, 'ORDER', 50, 0, 0, NOW(), NOW()),
        (1, 'bootstrap10', 'PERCENTAGE', 10, 'ORDER', 100, 0, 0, NOW(), NOW()),
        (1, 'SAVE5', 'FIXED', 500, 'ORDER', 100, 0, 0, NOW(), NOW());
    `);

    // 9. Reset Sequences
    await client.query(`
      SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
      SELECT setval('accounts_id_seq', (SELECT MAX(id) FROM accounts));
      SELECT setval('organizers_id_seq', (SELECT MAX(id) FROM organizers));
      SELECT setval('events_id_seq', (SELECT MAX(id) FROM events));
      SELECT setval('ticket_tiers_id_seq', (SELECT MAX(id) FROM ticket_tiers));
      SELECT setval('promo_codes_id_seq', (SELECT MAX(id) FROM promo_codes));
    `);

    await client.query('COMMIT');

    console.log('[SUCCESS] PostgreSQL database populated with complete canonical data!');
    console.log(`- 6 Users across 3 Roles (Admin, Organizer, Attendee)`);
    console.log(`- 8 Events (Global Tech Summit, Saigon Jazz Night, Dalat Marathon, etc.)`);
    console.log(`- 16 Ticket Tiers with real prices, quotas, and limits`);
    console.log(`- 11 Promo Codes configured`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[FATAL] Seeding aborted:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Auto-run if executed directly from the CLI
const isMain = process.argv[1] && (
  fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase() ||
  process.argv[1].endsWith('seed.js')
);
if (isMain) {
  seedDatabase()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      try {
        await pool.end();
      } catch {
        // ignore
      }
      process.exit(1);
    });
}
