import { createDb } from '@factory/db';
import { createEmailHandler, EMAIL_JOB } from './email';
import { runOnce } from './runner';

const url = process.env.DATABASE_URL;
const server = process.env.EMAIL_SERVER;
const from = process.env.EMAIL_FROM;
if (!url) throw new Error('DATABASE_URL is required');
if (!server || !from) throw new Error('EMAIL_SERVER and EMAIL_FROM are required');

const { db, close } = createDb(url);
const handlers = { [EMAIL_JOB]: createEmailHandler({ from, transport: server }) };
let stop = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stop = true; });

console.log('Worker started');
while (!stop) {
  const result = await runOnce(db, handlers);
  if (result === 'idle') await new Promise((r) => setTimeout(r, 2000));
  else console.log(`job ${result}`);
}
await close();
