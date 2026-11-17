/** Applies SQL migrations in ./drizzle. Pure Node — works on servers and in Termux. */
import 'dotenv/config';
import path from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createPool } from './db';

async function main() {
  const pool = createPool();
  await migrate(drizzle(pool), { migrationsFolder: path.join(__dirname, '../../drizzle') });
  await pool.end();
  console.log('✔ Migrations applied');
}
main().catch((e) => { console.error(e); process.exit(1); });
