import { createDb } from '../src/index';
import { seedSynthetic } from './data';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed production');

const { db, close } = createDb(url);
await seedSynthetic(db);
await close();
console.log('Synthetic data seeded.');
