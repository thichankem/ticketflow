import { query } from '../../src/config/db.js';

async function main() {
  const tablesRes = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('--- TABLE COUNTS & COLUMNS ---');
  for (const row of tablesRes.rows) {
    const countRes = await query(`SELECT count(*) FROM "${row.table_name}"`);
    console.log(`\n=== ${row.table_name} (${countRes.rows[0].count} rows) ===`);
    const colsRes = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [row.table_name]);
    for (const col of colsRes.rows) {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
