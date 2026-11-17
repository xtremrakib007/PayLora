import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;
export const DB_TOKEN = Symbol('DB');
export const InjectDb = () => Inject(DB_TOKEN);

export function createPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX || 10) });
}

const pool = createPool();

@Global()
@Module({
  providers: [{ provide: DB_TOKEN, useFactory: () => drizzle(pool, { schema }) }],
  exports: [DB_TOKEN],
})
export class DbModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await pool.end();
  }
}
