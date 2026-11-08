/**
 * TicketFlow / Hi.Events - Development Data Seeder
 * File: backend/database/seeders/seed.js
 *
 * Populates standard development data matching BootstrapDevDataCommand:
 * - Superadmin & Organizer users with bcrypt hashed passwords ('BootstrapPass123!')
 * - Verified Account & Organizer profile
 * - Single LIVE event ('Tech Conference 2026') with Event Settings
 * - 3 Ticket Tiers ('Free Ticket', 'General Admission' $25.00, 'VIP Pass' $99.00)
 * - Promo Codes ('bootstrap10' 10% discount, 'SAVE5' $5.00 discount)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { getClient, pool } from '../../src/config/db.js';

// Resolve directory paths in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

/**
 * Seeds initial development records idempotently.
 * Supports options.clean or --clean CLI flag to reset seed records.
 */
export async function seedDatabase(options = {}) {
  const isForceClean =
    options.clean ||
    process.argv.includes('--clean') ||
    process.argv.includes('--fresh') ||
    process.argv.includes('--force');

  console.log('============================================================');
  console.log('         TicketFlow Development Database Seeder             ');
  console.log(`         Mode: ${isForceClean ? 'CLEAN & RESEED' : 'IDEMPOTENT UPSERT'} `);
  console.log('============================================================');

  const client = await getClient();

  try {
    await client.query('BEGIN');

    if (isForceClean) {
      console.log('[CLEAN] Purging existing bootstrap seed records in reverse FK order...');
      await client.query(`
        DELETE FROM attendees WHERE email IN ('attendee@ticketflow.test', 'agent@dev.test');
        DELETE FROM order_items WHERE item_name IN ('Free Ticket', 'General Admission', 'VIP Pass');
        DELETE FROM orders WHERE short_id LIKE 'ord_boot_%';
        DELETE FROM promo_codes WHERE code IN ('bootstrap10', 'SAVE5');
        DELETE FROM ticket_tiers WHERE title IN ('Free Ticket', 'General Admission', 'VIP Pass');
        DELETE FROM event_settings WHERE support_email = 'support@ticketflow.test';
        DELETE FROM events WHERE short_id = 'tech-conf-2026';
        DELETE FROM organizers WHERE email = 'organizer@ticketflow.test';
        DELETE FROM account_users WHERE user_id IN (
          SELECT id FROM users WHERE email IN ('admin@ticketflow.test', 'organizer@ticketflow.test', 'attendee@ticketflow.test')
        );
        DELETE FROM users WHERE email IN ('admin@ticketflow.test', 'organizer@ticketflow.test', 'attendee@ticketflow.test');
        DELETE FROM accounts WHERE short_id = 'acc_bootstrap';
      `);
      console.log('[CLEAN] Existing bootstrap records removed.');
    }

    // 1. Common Password Hash (BootstrapPass123!)
    const rawPassword = 'BootstrapPass123!';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    // 2. Organization Account
    const accountShortId = 'acc_bootstrap';
    const { rows: [account] } = await client.query(`
      INSERT INTO accounts (
        name, email, currency_code, timezone, short_id,
        stripe_account_id, stripe_connect_setup_complete, is_suspended, account_verified_at,
        created_at, updated_at
      ) VALUES (
        'Dev Account', 'admin@ticketflow.test', 'USD', 'UTC', $1,
        'acct_mock_dev_123', true, false, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (short_id) DO UPDATE SET
        name = EXCLUDED.name,
        account_verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, short_id, name, email;
    `, [accountShortId]);
    console.log(`[SEED] Account: ${account.name} (ID: ${account.id}, short_id: ${account.short_id})`);

    // 3. User Identities
    // 3a. Superadmin User
    const { rows: [superadmin] } = await client.query(`
      INSERT INTO users (
        email, password, first_name, last_name, role, account_id,
        timezone, locale, email_verified_at, created_at, updated_at
      ) VALUES (
        'admin@ticketflow.test', $1, 'Super', 'Admin', 'ADMIN', $2,
        'UTC', 'en', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        role = 'ADMIN',
        account_id = EXCLUDED.account_id,
        email_verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, email, role, first_name, last_name;
    `, [passwordHash, account.id]);
    console.log(`[SEED] User (SuperAdmin): ${superadmin.email} (ID: ${superadmin.id})`);

    // 3b. Organizer User
    const { rows: [organizerUser] } = await client.query(`
      INSERT INTO users (
        email, password, first_name, last_name, role, account_id,
        timezone, locale, email_verified_at, created_at, updated_at
      ) VALUES (
        'organizer@ticketflow.test', $1, 'Dev', 'Organizer', 'ORGANIZER', $2,
        'UTC', 'en', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        role = 'ORGANIZER',
        account_id = EXCLUDED.account_id,
        email_verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, email, role, first_name, last_name;
    `, [passwordHash, account.id]);
    console.log(`[SEED] User (Organizer): ${organizerUser.email} (ID: ${organizerUser.id})`);

    // 3c. Attendee User (for testing attendee flows)
    const { rows: [attendeeUser] } = await client.query(`
      INSERT INTO users (
        email, password, first_name, last_name, role, account_id,
        timezone, locale, email_verified_at, created_at, updated_at
      ) VALUES (
        'attendee@ticketflow.test', $1, 'Alex', 'Attendee', 'ATTENDEE', $2,
        'UTC', 'en', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        role = 'ATTENDEE',
        account_id = EXCLUDED.account_id,
        email_verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, email, role, first_name, last_name;
    `, [passwordHash, account.id]);
    console.log(`[SEED] User (Attendee): ${attendeeUser.email} (ID: ${attendeeUser.id})`);

    // 4. Account Users Pivot
    await client.query(`
      INSERT INTO account_users (account_id, user_id, role, is_account_owner, status)
      VALUES ($1, $2, 'SUPERADMIN', true, 'ACTIVE')
      ON CONFLICT (account_id, user_id, role) DO UPDATE SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP;
    `, [account.id, superadmin.id]);

    await client.query(`
      INSERT INTO account_users (account_id, user_id, role, is_account_owner, status)
      VALUES ($1, $2, 'ORGANIZER', false, 'ACTIVE')
      ON CONFLICT (account_id, user_id, role) DO UPDATE SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP;
    `, [account.id, organizerUser.id]);

    // 5. Organizer Entity
    let organizerId;
    const { rows: existingOrganizers } = await client.query(
      'SELECT id FROM organizers WHERE account_id = $1 AND name = $2 LIMIT 1;',
      [account.id, 'Bootstrap Organizer']
    );

    if (existingOrganizers.length > 0) {
      organizerId = existingOrganizers[0].id;
    } else {
      const { rows: [newOrg] } = await client.query(`
        INSERT INTO organizers (
          account_id, name, email, phone, website, description,
          currency, timezone, status, created_at, updated_at
        ) VALUES (
          $1, 'Bootstrap Organizer', 'organizer@ticketflow.test', '+1-555-0199', 'https://ticketflow.test',
          'Primary organizer profile for development, automated verification, and demonstration events.',
          'USD', 'UTC', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING id;
      `, [account.id]);
      organizerId = newOrg.id;
    }
    console.log(`[SEED] Organizer: Bootstrap Organizer (ID: ${organizerId})`);

    // 6. Live Single Event ("Tech Conference 2026")
    const eventShortId = 'tech-conf-2026';
    const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();

    const { rows: [event] } = await client.query(`
      INSERT INTO events (
        short_id, account_id, organizer_id, user_id, title, slug,
        description, status, type, category, currency, timezone,
        location, location_details, start_date, end_date, ticket_quantity_available,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, 'Tech Conference 2026', 'tech-conference-2026',
        '<p>Join us at <strong>Tech Conference 2026</strong>, the premier gathering for developers, architects, and engineering leaders. Featuring deep-dive technical sessions, hands-on workshops, and world-class networking.</p>',
        'LIVE', 'SINGLE', 'TECHNOLOGY', 'USD', 'America/Los_Angeles',
        'Moscone Center, 747 Howard St, San Francisco, CA 94103',
        $5::jsonb, $6, $7, 500,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (short_id) DO UPDATE SET
        title = EXCLUDED.title,
        status = 'LIVE',
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        ticket_quantity_available = 500,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, short_id, title, status;
    `, [
      eventShortId,
      account.id,
      organizerId,
      organizerUser.id,
      JSON.stringify({
        venue: 'Moscone Center',
        address_line_1: '747 Howard St',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94103',
        country: 'US',
      }),
      startDate,
      endDate,
    ]);
    console.log(`[SEED] Event: ${event.title} (ID: ${event.id}, short_id: ${event.short_id}, status: ${event.status})`);

    // 7. Event Settings (15m hold timer, messages, payment options)
    await client.query(`
      INSERT INTO event_settings (
        event_id, pre_checkout_message, post_checkout_message, ticket_page_message,
        continue_button_text, email_footer_message, support_email,
        require_attendee_details, attendee_details_collection_method,
        order_timeout_in_minutes, price_display_mode, website_url, maps_url,
        homepage_background_color, homepage_primary_color,
        payment_providers, offline_payment_instructions, is_online_event,
        created_at, updated_at
      ) VALUES (
        $1,
        'Please review ticket selections carefully. You have 15 minutes to complete your reservation.',
        'Thank you for registering for Tech Conference 2026! We have emailed your digital ticket pass and invoice receipt.',
        'Early bird rates available until capacity is reached.',
        'Continue to Attendee Info',
        'Questions? Contact support@ticketflow.test',
        'support@ticketflow.test',
        true, 'PER_TICKET',
        15, 'INCLUSIVE', 'https://techconf2026.example.com', 'https://maps.google.com/?q=Moscone+Center+San+Francisco',
        '#ffffff', '#4f46e5',
        '["STRIPE", "OFFLINE"]'::jsonb,
        'Please remit bank transfer payment within 3 business days using your Order ID as reference.',
        false,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (event_id) DO UPDATE SET
        pre_checkout_message = EXCLUDED.pre_checkout_message,
        post_checkout_message = EXCLUDED.post_checkout_message,
        order_timeout_in_minutes = 15,
        updated_at = CURRENT_TIMESTAMP;
    `, [event.id]);
    console.log(`[SEED] Event Settings: Configured 15m hold timer, offline instructions & messages`);

    // 8. Ticket Tiers (Free Ticket, General Admission $25.00, VIP Pass $99.00)
    const tiersData = [
      {
        title: 'Free Ticket',
        description: 'Complimentary pass with access to community keynotes and open exhibition floor.',
        price: 0.0,
        type: 'FREE',
        initial_quantity: 100,
        remaining_quantity: 100,
        min_per_order: 1,
        max_per_order: 5,
        sort_order: 1,
      },
      {
        title: 'General Admission',
        description: 'Standard conference badge with full access to all track sessions, panel discussions, and developer networking lounges.',
        price: 25.0,
        type: 'PAID',
        initial_quantity: 300,
        remaining_quantity: 300,
        min_per_order: 1,
        max_per_order: 10,
        sort_order: 2,
      },
      {
        title: 'VIP Pass',
        description: 'All-access VIP badge including priority front-row seating, private speaker dinner invitation, VIP lounge access, and conference swag bag.',
        price: 99.0,
        type: 'PAID',
        initial_quantity: 100,
        remaining_quantity: 100,
        min_per_order: 1,
        max_per_order: 4,
        sort_order: 3,
      },
    ];

    const seededTiers = [];
    for (const tier of tiersData) {
      const { rows: existing } = await client.query(
        'SELECT id FROM ticket_tiers WHERE event_id = $1 AND title = $2 LIMIT 1;',
        [event.id, tier.title]
      );

      let tierId;
      if (existing.length > 0) {
        tierId = existing[0].id;
        await client.query(`
          UPDATE ticket_tiers SET
            description = $1,
            price = $2,
            type = $3,
            initial_quantity = $4,
            remaining_quantity = $5,
            min_per_order = $6,
            max_per_order = $7,
            sort_order = $8,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $9;
        `, [
          tier.description, tier.price, tier.type,
          tier.initial_quantity, tier.remaining_quantity,
          tier.min_per_order, tier.max_per_order, tier.sort_order,
          tierId,
        ]);
      } else {
        const { rows: [inserted] } = await client.query(`
          INSERT INTO ticket_tiers (
            event_id, title, description, price, type,
            initial_quantity, remaining_quantity, min_per_order, max_per_order,
            is_hidden, sort_order, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            false, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          ) RETURNING id;
        `, [
          event.id, tier.title, tier.description, tier.price, tier.type,
          tier.initial_quantity, tier.remaining_quantity, tier.min_per_order, tier.max_per_order,
          tier.sort_order,
        ]);
        tierId = inserted.id;
      }
      seededTiers.push({ id: tierId, ...tier });
      console.log(`[SEED] Ticket Tier: ${tier.title} (ID: ${tierId}, $${tier.price.toFixed(2)}, Stock: ${tier.remaining_quantity}/${tier.initial_quantity})`);
    }

    // 9. Promo Codes ("bootstrap10" 10% discount & "SAVE5" fixed $5 discount)
    const { rows: [promo10] } = await client.query(`
      INSERT INTO promo_codes (
        event_id, code, discount_type, discount, discount_applies_to,
        max_allowed_usages, order_usage_count, attendee_usage_count,
        created_at, updated_at
      ) VALUES (
        $1, 'bootstrap10', 'PERCENTAGE', 10.00, 'EACH_PRODUCT',
        500, 0, 0,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (event_id, code) DO UPDATE SET
        discount = 10.00,
        discount_type = 'PERCENTAGE',
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, code, discount, discount_type;
    `, [event.id]);
    console.log(`[SEED] Promo Code: '${promo10.code}' (${promo10.discount}% off) (ID: ${promo10.id})`);

    const { rows: [promoSave5] } = await client.query(`
      INSERT INTO promo_codes (
        event_id, code, discount_type, discount, discount_applies_to,
        max_allowed_usages, order_usage_count, attendee_usage_count,
        created_at, updated_at
      ) VALUES (
        $1, 'SAVE5', 'FIXED', 5.00, 'ORDER',
        100, 0, 0,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (event_id, code) DO UPDATE SET
        discount = 5.00,
        discount_type = 'FIXED',
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, code, discount, discount_type;
    `, [event.id]);
    console.log(`[SEED] Promo Code: '${promoSave5.code}' ($${promoSave5.discount} off) (ID: ${promoSave5.id})`);

    await client.query('COMMIT');

    // 10. Summary Verification Table
    console.log('\n============================================================');
    console.log('       TICKETFLOW DEVELOPMENT DATA BOOTSTRAP READY          ');
    console.log('============================================================');
    console.table([
      { Key: 'SuperAdmin Email', Value: superadmin.email },
      { Key: 'SuperAdmin Password', Value: rawPassword },
      { Key: 'Organizer Email', Value: organizerUser.email },
      { Key: 'Organizer Password', Value: rawPassword },
      { Key: 'Attendee Email', Value: attendeeUser.email },
      { Key: 'Account ID / short_id', Value: `${account.id} / ${account.short_id}` },
      { Key: 'Organizer ID', Value: String(organizerId) },
      { Key: 'Live Event ID / short_id', Value: `${event.id} / ${event.short_id}` },
      { Key: 'Free Ticket (Tier ID)', Value: `${seededTiers[0].id} ($0.00, Qty: 100)` },
      { Key: 'General Admission (Tier ID)', Value: `${seededTiers[1].id} ($25.00, Qty: 300)` },
      { Key: 'VIP Pass (Tier ID)', Value: `${seededTiers[2].id} ($99.00, Qty: 100)` },
      { Key: 'Promo Code (Percentage)', Value: `${promo10.code} (10% discount)` },
      { Key: 'Promo Code (Fixed)', Value: `${promoSave5.code} ($5.00 discount)` },
    ]);

    return {
      accountId: account.id,
      superadminId: superadmin.id,
      organizerUserId: organizerUser.id,
      organizerId,
      eventId: event.id,
      tiers: seededTiers,
      promoCodeId: promo10.id,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[FATAL] Seeding aborted due to error:', error);
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
