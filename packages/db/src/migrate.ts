import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';

// Runs as its own job before deployment, never inside the app process.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
await client.end();
console.log('Migrations applied.');
