import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export function makeDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  // Prisma's PostgreSQL adapter expects UTC when decoding timestamps with time zones.
  const url = new URL(connectionString);
  const options = url.searchParams.get('options');
  url.searchParams.set('options', options ? options + ' -c TimeZone=UTC' : '-c TimeZone=UTC');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href, connectionTimeoutMillis: 5000 }) });
}
