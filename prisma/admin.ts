import { makeDb } from '../apps/api/src/db.js';
import { newUserSchema } from '@vsf/shared';
import { hashPassword } from '../apps/api/src/auth.js';

const input = newUserSchema.safeParse({
  username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD,
});
if (!input.success) throw new Error('Set a valid ADMIN_USERNAME and a non-empty ADMIN_PASSWORD.');
const db = makeDb();
try {
  const { username, password } = input.data;
  await db.user.create({ data: { username, passwordHash: await hashPassword(password), role: 'ADMIN' }, select: { id: true } });
  console.log('Created an active admin.');
} catch {
  process.exitCode = 1;
  console.error('Could not create admin. Check the database and use an available username.');
} finally {
  await db.$disconnect();
}
