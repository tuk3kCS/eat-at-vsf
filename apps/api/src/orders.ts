import { Prisma } from './generated/prisma/client.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createOrderSchema, deadlineSchema, idSchema, isFinalized, quantitySchema, type Line } from '@vsf/shared';
import { ApiError, admin, conflict, dateRange, dayBounds, dbNow, forbidden, id, pagination, requireFound, search, signedIn, statusSchema, type Db, type Tx } from './core.js';
import { acceptsItems, groupLines, totals, transition } from './order-domain.js';

export const orderInclude = {
  restaurant: { select: { id: true, name: true, imageUrl: true } },
  createdBy: { select: { id: true, username: true } },
  _count: { select: { participants: true } },
  items: { select: { unitPriceSnapshot: true, quantity: true } },
} satisfies Prisma.OrderInclude;
type CardRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function card(order: CardRow, now: Date) {
  return {
    id: order.id, restaurant: order.restaurant,
    owner: { id: order.createdBy.id, name: order.createdBy.username },
    status: order.status, deadline: order.deadline, acceptingItems: acceptsItems(order.status, order.deadline, now),
    createdAt: order.createdAt, participantCount: order._count.participants,
    ...totals(order.items.map(line => ({ unitPrice: line.unitPriceSnapshot, quantity: line.quantity }))),
  };
}
const asLine = (line: Prisma.OrderItemGetPayload<object>): Line => ({
  id: line.id, menuItemId: line.menuItemId, name: line.itemNameSnapshot,
  unitPrice: line.unitPriceSnapshot, quantity: line.quantity, version: line.version,
  total: line.unitPriceSnapshot * line.quantity,
});

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
  return requireFound(await tx.order.findUnique({ where: { id: orderId } }));
}
async function lockOrderActor(tx: Tx, userId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User"
    WHERE id = ${userId}::uuid AND "deletedAt" IS NULL FOR SHARE`;
  if (!rows.length) throw forbidden();
}

export async function removeParticipants(tx: Tx, where: Prisma.OrderParticipantWhereInput) {
  await tx.orderItem.deleteMany({ where: { participant: where } });
  await tx.orderParticipant.deleteMany({ where });
}

export async function closeDueOrders(db: Db, orderId?: string) {
  await db.$transaction(async tx => {
    const due = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order"
      WHERE status = 'OPEN' AND deadline <= statement_timestamp()
        ${orderId ? Prisma.sql`AND id = ${orderId}::uuid` : Prisma.empty}
      ORDER BY deadline, id LIMIT 100
      FOR UPDATE ${orderId ? Prisma.empty : Prisma.sql`SKIP LOCKED`}
    `;
    if (!due.length) return;
    const ids = Prisma.join(due.map(order => Prisma.sql`${order.id}::uuid`));
    // Read items after acquiring the locks so a just-committed edit is included.
    await tx.$executeRaw`
      WITH closed AS (
        UPDATE "Order" SET status = 'CLOSED', "updatedAt" = clock_timestamp()
        WHERE id IN (${ids}) RETURNING id, deadline
      )
      UPDATE "OrderParticipant" p SET "confirmedAt" = closed.deadline
      FROM closed WHERE p."orderId" = closed.id AND p."confirmedAt" IS NULL
        AND EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."participantId" = p.id AND i."orderId" = p."orderId")
    `;
  }, { isolationLevel: 'ReadCommitted' });
}
function assertAcceptingItems(order: { status: CardRow['status']; deadline: Date }, now: Date) {
  if (!acceptsItems(order.status, order.deadline, now)) throw conflict('Đơn đã ngừng nhận món.');
}
function future(date: string, now: Date) {
  const deadline = new Date(date);
  if (deadline <= now) throw new ApiError(400, 'PAST_DEADLINE', 'Hạn chốt đơn phải ở trong tương lai.');
  return deadline;
}
const listFilters = z.object({
  ...pagination, q: search, scope: z.enum(['open', 'created', 'joined', 'history']).default('open'),
  status: statusSchema.optional(), restaurantId: idSchema.optional(), restaurantName: search,
}).and(dateRange);

async function snapshot(tx: Tx, orderId: string, actor: ReturnType<typeof signedIn>, exporting = false) {
  const order = requireFound(await tx.order.findUnique({
    where: { id: orderId },
    include: {
      ...orderInclude,
      participants: { orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], include: {
        user: { select: { username: true } }, items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      } },
    },
  }));
  const now = await dbNow(tx);
  const base = card(order, now);
  const member = order.participants.find(person => person.userId === actor.id);
  const owner = order.createdById === actor.id;
  const canReadPeople = owner || !!member || actor.role === 'ADMIN';
  if (exporting ? !owner : !canReadPeople && !base.acceptingItems) throw forbidden();
  if (exporting && !isFinalized(base.status)) throw conflict('Chỉ có thể xuất ảnh sau khi chốt đơn.');
  const people = order.participants.map(person => {
    const lines = person.items.map(asLine);
    return { id: person.id, name: person.user.username, userId: person.userId, lines, total: totals(lines).total, confirmed: !!person.confirmedAt };
  });
  const confirmedCount = people.filter(person => person.confirmed && person.lines.length > 0).length;
  const groups = groupLines(people.flatMap(person => person.lines));
  if (exporting) return { ...base, note: order.note, groups, people, exportedAt: now };
  const myLines = member?.items.map(asLine) ?? [];
  const menu = base.acceptingItems ? await tx.menuItem.findMany({
    where: { restaurantId: order.restaurantId, deletedAt: null, isAvailable: true, restaurant: { deletedAt: null } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, price: true, description: true, category: true, imageUrl: true, isAvailable: true },
  }) : [];
  return { ...base, note: order.note, joined: !!member, myLines, myTotal: totals(myLines).total, confirmedCount,
    myConfirmed: !!member?.confirmedAt, groups, people: canReadPeople ? people : null, menu };
}

export function orderRoutes(app: FastifyInstance, db: Db) {
  app.get('/orders', async request => {
    const actor = signedIn(request);
    const { page, size, scope, status, restaurantId, restaurantName, from, to, q } = listFilters.parse(request.query);
    await closeDueOrders(db);
    return db.$transaction(async tx => {
      const now = await dbNow(tx);
      const joined = { participants: { some: { userId: actor.id } } };
      const mine = { createdById: actor.id };
      const scopes: Record<typeof scope, Prisma.OrderWhereInput> = {
        open: { status: 'OPEN', deadline: { gt: now } },
        created: mine, joined: { ...joined, NOT: mine },
        history: { OR: [mine, joined], status: { not: 'OPEN' } },
      };
      const where: Prisma.OrderWhereInput = {
        status, restaurantId, createdAt: dayBounds(from, to), AND: [scopes[scope]],
        ...(restaurantName ? { restaurant: { name: { contains: restaurantName, mode: 'insensitive' } } } : {}),
        ...(q ? { OR: [{ createdBy: { username: { contains: q, mode: 'insensitive' } } }, { restaurant: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
      };
      return listOrders(tx, where, page, size, now);
    }, { isolationLevel: 'RepeatableRead' });
  });

  app.get('/admin/users/:id/orders', async request => {
    admin(request);
    const userId = id(request.params);
    const { page, size } = z.object(pagination).parse(request.query);
    await closeDueOrders(db);
    return db.$transaction(async tx => {
      requireFound(await tx.user.findUnique({ where: { id: userId, deletedAt: null }, select: { id: true } }));
      return listOrders(tx, { OR: [{ createdById: userId }, { participants: { some: { userId } } }] }, page, size, await dbNow(tx));
    }, { isolationLevel: 'RepeatableRead' });
  });

  app.post('/orders', async (request, reply) => {
    const actor = signedIn(request);
    const input = createOrderSchema.parse(request.body);
    const order = await db.$transaction(async tx => {
      await lockOrderActor(tx, actor.id);
      await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${input.restaurantId}::uuid FOR SHARE`;
      const restaurant = requireFound(await tx.restaurant.findFirst({
        where: { id: input.restaurantId, deletedAt: null },
      }));
      const now = await dbNow(tx);
      return tx.order.create({
        data: {
          restaurantId: restaurant.id, createdById: actor.id, note: input.note || null,
          deadline: future(input.deadline, now), participants: { create: { userId: actor.id } },
        }, select: { id: true },
      });
    });
    return reply.code(201).send(order);
  });

  app.get('/orders/:id', async request => {
    const actor = signedIn(request);
    const orderId = id(request.params);
    await closeDueOrders(db, orderId);
    return db.$transaction(tx => snapshot(tx, orderId, actor), { isolationLevel: 'RepeatableRead' });
  });
  app.get('/orders/:id/summary', async request => {
    const actor = signedIn(request);
    const orderId = id(request.params);
    await closeDueOrders(db, orderId);
    return db.$transaction(tx => snapshot(tx, orderId, actor, true), { isolationLevel: 'RepeatableRead' });
  });

  app.patch('/orders/:id', async (request, reply) => {
    const actor = signedIn(request);
    const orderId = id(request.params);
    const { deadline } = z.object({ deadline: deadlineSchema }).parse(request.body);
    await db.$transaction(async tx => {
      const order = await lockOrder(tx, orderId);
      if (order.createdById !== actor.id) throw forbidden();
      const now = await dbNow(tx);
      if (!acceptsItems(order.status, order.deadline, now)) throw conflict('Chỉ có thể đổi hạn khi đơn còn nhận món.');
      await tx.order.update({ where: { id: orderId }, data: { deadline: future(deadline, now) } });
    });
    return reply.code(204).send();
  });

  app.post('/orders/:id/join', async (request, reply) => {
    const actor = signedIn(request);
    const orderId = id(request.params);
    await db.$transaction(async tx => {
      await lockOrderActor(tx, actor.id);
      const order = await lockOrder(tx, orderId);
      assertAcceptingItems(order, await dbNow(tx));
      const key = { orderId, userId: actor.id };
      await tx.orderParticipant.upsert({ where: { orderId_userId: key }, create: key, update: {} });
    });
    return reply.code(204).send();
  });

  app.post('/orders/:id/leave', async (request, reply) => {
    const actor = signedIn(request);
    const orderId = id(request.params);
    await db.$transaction(async tx => {
      const order = await lockOrder(tx, orderId);
      if (order.createdById === actor.id) throw conflict('Chủ đơn không thể rời đơn.');
      if (!acceptsItems(order.status, order.deadline, await dbNow(tx))) throw conflict('Chỉ có thể rời đơn còn nhận món.');

      await removeParticipants(tx, { orderId, userId: actor.id });
    });
    return reply.code(204).send();
  });

  app.patch('/orders/:id/confirmation', async (request, reply) => {
    const actor = signedIn(request);
    const orderId = id(request.params);
    const { confirmed } = z.object({ confirmed: z.boolean() }).parse(request.body);
    await db.$transaction(async tx => {
      const order = await lockOrder(tx, orderId);
      const now = await dbNow(tx);
      if (!acceptsItems(order.status, order.deadline, now)) throw conflict('Đơn đã ngừng nhận xác nhận món.');
      const participant = await tx.orderParticipant.findUnique({
        where: { orderId_userId: { orderId, userId: actor.id } }, include: { _count: { select: { items: true } } },
      });
      if (!participant) throw forbidden();
      if (confirmed && participant._count.items === 0) throw conflict('Chọn ít nhất một món trước khi chốt.');
      await tx.orderParticipant.update({ where: { id: participant.id }, data: {
        confirmedAt: confirmed ? participant.confirmedAt ?? now : null,
      } });
    });
    return reply.code(204).send();
  });

  app.post('/orders/:id/items', async (request, reply) => {
    const actor = signedIn(request);
    const orderId = id(request.params);
    const { menuItemId, quantity } = z.object({ menuItemId: idSchema, quantity: quantitySchema }).parse(request.body);
    const row = await db.$transaction(async tx => {
      const order = await lockOrder(tx, orderId);
      await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${order.restaurantId}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "MenuItem" WHERE id = ${menuItemId}::uuid AND "restaurantId" = ${order.restaurantId}::uuid FOR SHARE`;
      const participant = await tx.orderParticipant.findUnique({ where: { orderId_userId: { orderId, userId: actor.id } } });
      if (!participant) throw forbidden();
      if (participant.confirmedAt) throw conflict('Bỏ chốt món trước khi chỉnh sửa.');
      const item = await tx.menuItem.findFirst({ where: {
        id: menuItemId, restaurantId: order.restaurantId, isAvailable: true, deletedAt: null,
        restaurant: { deletedAt: null },
      } });
      if (!item) throw conflict('Món này hiện không nhận đặt.');
      const key = { participantId: participant.id, menuItemId, itemNameSnapshot: item.name, unitPriceSnapshot: item.price };
      const existing = await tx.orderItem.findUnique({
        where: { participantId_menuItemId_itemNameSnapshot_unitPriceSnapshot: key },
      });
      const next = quantitySchema.safeParse((existing?.quantity ?? 0) + quantity);
      if (!next.success) throw conflict('Số lượng tối đa là 99 cho mỗi dòng món.');
      assertAcceptingItems(order, await dbNow(tx));
      return existing
        ? tx.orderItem.update({ where: { id: existing.id }, data: { quantity: next.data, version: { increment: 1 } } })
        : tx.orderItem.create({ data: { ...key, orderId, restaurantId: order.restaurantId, quantity } });
    });
    return reply.code(201).send(asLine(row));
  });

  async function modifyLine(actorId: string, orderId: string, itemId: string, version: number, quantity?: number) {
    return db.$transaction(async tx => {
      const order = await lockOrder(tx, orderId);
      const row = requireFound(await tx.orderItem.findFirst({ where: { id: itemId, orderId }, include: { participant: true } }));
      if (row.participant.userId !== actorId) throw forbidden();
      if (row.participant.confirmedAt) throw conflict('Bỏ chốt món trước khi chỉnh sửa.');
      if (row.version !== version) throw conflict('Món đã được cập nhật ở nơi khác. Hãy kiểm tra lại số lượng.');
      if (quantity !== undefined && quantity > row.quantity) {
        await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${row.restaurantId}::uuid FOR SHARE`;
        await tx.$queryRaw`SELECT id FROM "MenuItem" WHERE id = ${row.menuItemId}::uuid FOR SHARE`;
        const available = await tx.menuItem.findFirst({ where: {
          id: row.menuItemId, isAvailable: true, deletedAt: null, name: row.itemNameSnapshot, price: row.unitPriceSnapshot,
          restaurant: { deletedAt: null },
        } });
        if (!available) throw conflict('Món đã thay đổi hoặc ngừng bán. Hãy chọn món từ thực đơn để tăng số lượng.');
      }
      assertAcceptingItems(order, await dbNow(tx));
      if (quantity === undefined) return tx.orderItem.delete({ where: { id: itemId } });
      return tx.orderItem.update({ where: { id: itemId }, data: { quantity, version: { increment: 1 } } });
    });
  }

  const linePath = z.object({ id: idSchema, itemId: idSchema });
  const versionSchema = z.number().int().positive();
  app.patch('/orders/:id/items/:itemId', async request => {
    const actor = signedIn(request);
    const { id: orderId, itemId } = linePath.parse(request.params);
    const { quantity, version } = z.object({ quantity: quantitySchema, version: versionSchema }).parse(request.body);
    return asLine(await modifyLine(actor.id, orderId, itemId, version, quantity));
  });
  app.delete('/orders/:id/items/:itemId', async (request, reply) => {
    const actor = signedIn(request);
    const { id: orderId, itemId } = linePath.parse(request.params);
    const { version } = z.object({ version: z.coerce.number().int().positive() }).parse(request.query);
    await modifyLine(actor.id, orderId, itemId, version);
    return reply.code(204).send();
  });

  for (const action of ['close', 'extend', 'reopen', 'cancel'] as const) {
    app.post('/orders/:id/' + action, async (request, reply) => {
      const actor = signedIn(request);
      const orderId = id(request.params);
      const date = action === 'extend' || action === 'reopen' ? z.object({ deadline: deadlineSchema }).parse(request.body).deadline : undefined;
      if (action === 'reopen') await closeDueOrders(db, orderId);
      await db.$transaction(async tx => {
        if (action === 'reopen') await lockOrderActor(tx, actor.id);
        const order = await lockOrder(tx, orderId);
        if (order.createdById !== actor.id) throw forbidden();
        const now = await dbNow(tx);
        if (order.status === 'OPEN') assertAcceptingItems(order, now);
        const status = transition(order.status, action);
        if (!status) throw conflict('Trạng thái hiện tại không cho phép thao tác này.');
        const deadline = date ? future(date, now) : undefined;
        if (action === 'extend' && deadline && deadline <= order.deadline) throw conflict('Hạn mới phải muộn hơn hạn hiện tại.');
        if (action === 'close') {
          const waiting = await tx.orderParticipant.count({
            where: { orderId, OR: [{ confirmedAt: null }, { items: { none: {} } }] },
          });
          if (waiting) throw conflict('Còn người chưa chọn hoặc chưa chốt món.');
        }
        if (order.status === 'CLOSED' && status === 'OPEN') {
          await removeParticipants(tx, { orderId, user: { deletedAt: { not: null } } });
          await tx.orderParticipant.updateMany({ where: { orderId }, data: { confirmedAt: null } });
        }
        await tx.order.update({ where: { id: orderId }, data: {
          status, deadline,
          cancelledAt: action === 'cancel' ? now : undefined,
        } });
      });
      return reply.code(204).send();
    });
  }
}

async function listOrders(tx: Tx, where: Prisma.OrderWhereInput, page: number, size: number, now: Date) {
  const rows = await tx.order.findMany({ where, include: orderInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * size, take: size });
  const total = await tx.order.count({ where });
  return { items: rows.map(row => card(row, now)), total, page, size };
}
