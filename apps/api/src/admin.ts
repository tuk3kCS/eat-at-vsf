import { Prisma } from './generated/prisma/client.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { newUserSchema } from '@vsf/shared';
import { hashPassword } from './auth.js';
import { admin, conflict, dateRange, dayBounds, dbNow, forbidden, id, localDay, pagination, requireFound, search, selectUser, type Db, type Tx } from './core.js';
import { card, orderInclude, removeParticipants } from './orders.js';

const updateUser = z.strictObject({ role: z.enum(['ADMIN', 'USER']).optional(), password: newUserSchema.shape.password.optional() });

async function lockAdmin(tx: Tx, actorId: string) {
  // Serialize changes to admin access and recheck the current actor under the lock.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(291841)::text`;
  const actor = await tx.user.findUnique({ where: { id: actorId, deletedAt: null }, select: { role: true } });
  if (actor?.role !== 'ADMIN') throw forbidden();
}

export function adminRoutes(app: FastifyInstance, db: Db) {
  app.get('/admin/users', async request => {
    admin(request);
    const { page, size, q } = z.object({ ...pagination, q: search }).parse(request.query);
    const where: Prisma.UserWhereInput = {
      deletedAt: null, username: q ? { contains: q, mode: 'insensitive' } : undefined,
    };
    const [items, total] = await db.$transaction([
      db.user.findMany({ where, select: selectUser, orderBy: { username: 'asc' }, skip: (page - 1) * size, take: size }),
      db.user.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items, total, page, size };
  });

  app.post('/admin/users', async (request, reply) => {
    const actor = admin(request);
    const { users } = z.object({ users: z.array(newUserSchema).min(1).max(25) }).parse(request.body);
    if (new Set(users.map(user => user.username)).size !== users.length) throw conflict('Danh sách có tên đăng nhập trùng.');
    const data: Prisma.UserCreateManyInput[] = [];
    for (const { username, password } of users) data.push({ username, passwordHash: await hashPassword(password) });
    const result = await db.$transaction(async tx => {
      await lockAdmin(tx, actor.id);
      return tx.user.createMany({ data });
    });
    return reply.code(201).send(result);
  });

  app.patch('/admin/users/:id', async request => {
    const actor = admin(request);
    const userId = id(request.params);
    const { role, password } = updateUser.parse(request.body);
    if (actor.id === userId && role === 'USER') throw conflict('Bạn không thể tự đổi vai trò.');
    const passwordHash = password === undefined ? undefined : await hashPassword(password);
    return db.$transaction(async tx => {
      await lockAdmin(tx, actor.id);
      requireFound(await tx.user.findUnique({ where: { id: userId, deletedAt: null }, select: { id: true } }));
      const user = await tx.user.update({ where: { id: userId }, data: { role, passwordHash }, select: selectUser });
      if (passwordHash !== undefined) await tx.session.deleteMany({ where: { userId } });
      return user;
    });
  });

  app.delete('/admin/users/:id', async (request, reply) => {
    const actor = admin(request);
    const userId = id(request.params);
    if (actor.id === userId) throw conflict('Bạn không thể tự xóa tài khoản.');
    await db.$transaction(async tx => {
      await lockAdmin(tx, actor.id);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const target = requireFound(await tx.user.findUnique({ where: { id: userId }, select: { deletedAt: true } }));
      if (target.deletedAt) return;

      // Lock closed orders too because they can be reopened.
      await tx.$queryRaw`SELECT o.id FROM "Order" o
        WHERE o.status IN ('OPEN', 'CLOSED') AND (o."createdById" = ${userId}::uuid OR EXISTS (
          SELECT 1 FROM "OrderParticipant" p WHERE p."orderId" = o.id AND p."userId" = ${userId}::uuid
        )) ORDER BY o.id FOR UPDATE OF o`;
      const now = await dbNow(tx);
      const accepting = { status: 'OPEN', deadline: { gt: now } } as const;
      await tx.order.updateMany({
        where: { createdById: userId, ...accepting }, data: { status: 'CANCELLED', cancelledAt: now },
      });
      await removeParticipants(tx, { userId, order: accepting });
      await tx.user.update({ where: { id: userId }, data: { deletedAt: now, passwordHash: '' } });
      await tx.session.deleteMany({ where: { userId } });
    });
    return reply.code(204).send();
  });

  app.get('/admin/dashboard', async request => {
    admin(request);
    const input = dateRange.parse(request.query);
    return db.$transaction(async tx => {
      const now = await dbNow(tx);
      const from = input.from ?? localDay(new Date(now.getTime() - 13 * 86_400_000));
      const to = input.to ?? localDay(now);
      dateRange.parse({ from, to });
      const { gte, lt } = dayBounds(from, to);
      const createdAt = { gte, lt };
      const range = Prisma.sql`o."createdAt" >= ${gte} AND o."createdAt" < ${lt}`;
      const users = await tx.user.count({ where: { deletedAt: null } });
      const restaurants = await tx.restaurant.count({ where: { deletedAt: null } });
      const menuItems = await tx.menuItem.count({ where: { deletedAt: null, restaurant: { deletedAt: null } } });
      const open = await tx.order.count({ where: { createdAt, status: 'OPEN', deadline: { gt: now } } });
      const closed = await tx.order.count({ where: { createdAt, status: 'CLOSED' } });
      const recent = await tx.order.findMany({ where: { createdAt }, include: orderInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 8 });
      const days = await tx.$queryRaw<{ day: string; count: number }[]>`SELECT to_char(o."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day,
        count(*)::int AS count FROM "Order" o WHERE ${range} GROUP BY 1 ORDER BY 1`;
      const popular = await tx.$queryRaw<{ name: string; count: number }[]>`SELECT r.name, count(*)::int AS count FROM "Order" o
        JOIN "Restaurant" r ON r.id = o."restaurantId" WHERE ${range} AND o.status <> 'CANCELLED'
        GROUP BY r.id, r.name ORDER BY count DESC, r.name ASC LIMIT 8`;
      const value = await tx.$queryRaw<{ total: bigint }[]>`SELECT COALESCE(sum(i.quantity::bigint * i."unitPriceSnapshot"), 0)::bigint AS total
        FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE ${range} AND o.status <> 'CANCELLED'`;
      return { users, restaurants, menuItems, open, closed, recent: recent.map(row => card(row, now)), days, popular, total: Number(value[0]?.total ?? 0n) };
    }, { isolationLevel: 'RepeatableRead' });
  });
}
