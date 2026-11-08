/**
 * TicketFlow / Hi.Events - Database Migration Runner
 * File: backend/database/migrations/run-migrations.js
 *
 * Discovers and applies version-controlled .sql migrations idempotently
 * using the configured pg.Pool connection client from src/config/db.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getClient, pool } from '../../src/config/db.js';

// Resolve directory paths in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env or root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

/**
 * Executes all pending .sql migrations in lexicographical order.
 * @returns {Promise<{ applied: number, skipped: number }>}
 */
export async function runMigrations() {
  console.log('============================================================');
  console.log('         TicketFlow Database Migration Runner               ');
  console.log('============================================================');

  const client = await getClient();
  let appliedCount = 0;
  let skippedCount = 0;

  try {
    // 1. Ensure migrations journal table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    // 2. Query already applied migrations
    const { rows: appliedRows } = await client.query(
      'SELECT name FROM migrations ORDER BY id ASC;'
    );
    const appliedSet = new Set(appliedRows.map((row) => row.name));

    // 3. Scan migrations directory for versioned .sql files (e.g. 001_initial_schema.sql)
    const allFiles = fs.readdirSync(__dirname);
    const sqlFiles = allFiles
      .filter((file) => /^\d+.*\.sql$/.test(file) && !file.startsWith('.'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    if (sqlFiles.length === 0) {
      console.log(`[INFO] No versioned .sql migration files found in ${__dirname}`);
      return { applied: 0, skipped: 0 };
    }

    console.log(`[INFO] Discovered ${sqlFiles.length} versioned migration file(s) in ${__dirname}`);

    // 4. Sequentially process migrations
    for (const file of sqlFiles) {
      if (appliedSet.has(file)) {
        console.log(`  [SKIP] ${file} (already applied)`);
        skippedCount++;
        continue;
      }

      console.log(`  [APPLYING] ${file}...`);
      const filePath = path.join(__dirname, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      const startTime = Date.now();
      await client.query('BEGIN');
      try {
        // Execute multi-statement SQL migration
        await client.query(sqlContent);

        // Record in migrations journal
        await client.query(
          'INSERT INTO migrations (name, applied_at) VALUES ($1, CURRENT_TIMESTAMP);',
          [file]
        );

        await client.query('COMMIT');
        const duration = Date.now() - startTime;
        console.log(`  [SUCCESS] ${file} applied successfully in ${duration}ms`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  [FAILED] Migration ${file} failed: ${err.message}`);
        console.error(err);
        throw err;
      }
    }

    console.log('------------------------------------------------------------');
    console.log(`[RESULT] Migrations completed: ${appliedCount} applied, ${skippedCount} skipped.`);
    console.log('============================================================\n');

    return { applied: appliedCount, skipped: skippedCount };
  } finally {
    client.release();
  }
}

// Auto-run if executed directly from the CLI
const isMain = process.argv[1] && (
  fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase() ||
  process.argv[1].endsWith('run-migrations.js')
);
if (isMain) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[FATAL] Migration process terminated with error:', err.message);
      try {
        await pool.end();
      } catch {
        // ignore pool drainage error
      }
      process.exit(1);
    });
}
