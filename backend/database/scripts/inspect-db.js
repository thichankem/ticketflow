import { query } from '../../src/config/db.js';

async function main() {
  const tablesRes = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('--- TABLE COUNTS ---');
  for (const row of tablesRes.rows) {
    const countRes = await query(`SELECT count(*) FROM "${row.table_name}"`);
    console.log(`${row.table_name.padEnd(25)}: ${countRes.rows[0].count}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
