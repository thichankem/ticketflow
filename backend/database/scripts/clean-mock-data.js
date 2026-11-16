import { query } from '../../src/config/db.js';

async function cleanMockData() {
  console.log('============================================================');
  console.log('       TicketFlow - Purge Mock & Test Data Script           ');
  console.log('============================================================');

  // Deletion order respecting foreign key constraints
  const tables = [
    'seat_reservations',
    'announcements',
    'notifications',
    'support_messages',
    'support_tickets',
    'event_favorites',
    'escrow_payouts',
    'escrow_accounts',
    'payouts',
    'attendees',
    'order_items',
    'orders',
    'tickets',
    'promo_codes',
    'ticket_tiers',
    'event_settings',
    'events'
  ];

  for (const tbl of tables) {
    try {
      const res = await query(`DELETE FROM "${tbl}";`);
      console.log(`[PURGE] Deleted from ${tbl.padEnd(20)}: ${res.rowCount} rows removed`);
    } catch (err) {
      console.error(`[ERROR] Failed to delete from ${tbl}:`, err.message);
    }
  }

  // Clean non-canonical users and accounts
  try {
    const pRes = await query('DELETE FROM account_users WHERE user_id > 7 OR account_id > 3;');
    console.log(`[PURGE] Deleted non-canonical account_users pivots: ${pRes.rowCount} rows removed`);
  } catch (err) {
    console.error('[ERROR] Failed to clean account_users:', err.message);
  }

  try {
    const uRes = await query('DELETE FROM users WHERE id > 7;');
    console.log(`[PURGE] Deleted non-canonical users (> ID 7): ${uRes.rowCount} rows removed`);
  } catch (err) {
    console.error('[ERROR] Failed to clean users:', err.message);
  }

  try {
    const aRes = await query('DELETE FROM accounts WHERE id > 3;');
    console.log(`[PURGE] Deleted non-canonical accounts (> ID 3): ${aRes.rowCount} rows removed`);
  } catch (err) {
    console.error('[ERROR] Failed to clean accounts:', err.message);
  }

  // Reset sequence counters
  console.log('\n[RESETS] Resetting sequence counters...');
  const seqResets = [
    { table: 'events', start: 1 },
    { table: 'ticket_tiers', start: 1 },
    { table: 'orders', start: 1 },
    { table: 'order_items', start: 1 },
    { table: 'attendees', start: 1 },
    { table: 'promo_codes', start: 1 },
    { table: 'notifications', start: 1 },
    { table: 'support_tickets', start: 1 },
    { table: 'support_messages', start: 1 },
    { table: 'payouts', start: 1 },
    { table: 'seat_reservations', start: 1 },
    { table: 'users', start: 8 },
    { table: 'accounts', start: 4 },
  ];

  for (const { table, start } of seqResets) {
    try {
      const lookup = await query(`SELECT pg_get_serial_sequence($1, 'id') AS seq;`, [table]);
      const seqName = lookup.rows[0]?.seq;
      if (seqName) {
        await query(`ALTER SEQUENCE ${seqName} RESTART WITH ${start};`);
        console.log(`[RESET] ${table.padEnd(20)} sequence (${seqName}) restarted at ${start}`);
      } else {
        // Fallback default naming convention
        await query(`ALTER SEQUENCE ${table}_id_seq RESTART WITH ${start};`);
        console.log(`[RESET] ${table.padEnd(20)} sequence (${table}_id_seq) restarted at ${start}`);
      }
    } catch (seqErr) {
      // Sequence might have different name or not be serial
    }
  }

  console.log('\n--- VERIFICATION: REMAINING TABLE COUNTS ---');
  const verifyTables = [
    'accounts',
    'users',
    'account_users',
    'organizers',
    'events',
    'ticket_tiers',
    'promo_codes',
    'orders',
    'order_items',
    'attendees',
    'notifications',
    'payouts',
    'support_tickets',
    'support_messages',
    'event_favorites',
    'seat_reservations'
  ];

  for (const tbl of verifyTables) {
    try {
      const cRes = await query(`SELECT count(*) FROM "${tbl}"`);
      console.log(`${tbl.padEnd(25)}: ${cRes.rows[0].count}`);
    } catch (e) {
      console.log(`${tbl.padEnd(25)}: [skipped / not found]`);
    }
  }

  console.log('============================================================');
  process.exit(0);
}

cleanMockData().catch((err) => {
  console.error(err);
  process.exit(1);
});
