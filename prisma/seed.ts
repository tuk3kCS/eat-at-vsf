import { makeDb } from '../apps/api/src/db.js';
import { hashPassword } from '../apps/api/src/auth.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEV_SEED !== 'yes') {
  throw new Error('Development only. Set ALLOW_DEV_SEED=yes on a local or disposable database.');
}
const db = makeDb();
const adminId = '303e0ea0-b1cf-4ac0-9aca-2c5a55d63b8b';
const restaurantId = 'ab0a28bf-b8ed-4c2f-8b88-33adcf5e8fd7';

try {
  const admin = { username: 'tungnh33', role: 'ADMIN', passwordHash: await hashPassword('1'), deletedAt: null } as const;
  await db.user.upsert({ where: { id: adminId }, update: admin, create: { id: adminId, ...admin } });
  await db.restaurant.upsert({ where: { id: restaurantId }, update: {}, create: {
    id: restaurantId, name: 'Cơm Nhà', description: 'Cơm trưa và các món Việt quen thuộc.', address: 'Quầy ăn trưa tầng 1',
    menu: { create: [
      { name: 'Cơm rang dưa bò', price: 45_000, category: 'Cơm' },
      { name: 'Bún chả', price: 40_000, category: 'Bún' },
      { name: 'Trà đá', price: 5_000, category: 'Đồ uống' },
    ] },
  } });
  console.log('Development admin and menu are ready.');
} finally {
  await db.$disconnect();
}
