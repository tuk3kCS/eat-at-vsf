import type { Prisma } from './generated/prisma/client.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { menuItemSchema, restaurantSchema } from '@vsf/shared';
import { ApiError, admin, id, pagination, requireFound, search, signedIn, type Db } from './core.js';
import { objectStorage, readImage } from './images.js';
import { normalizeExtraction, type VisionProvider } from './vision.js';

const filters = z.object({ ...pagination, q: search, sort: z.enum(['name', 'newest']).default('name') });
const menuFilters = z.object({ ...pagination, q: search, sort: z.enum(['name', 'price']).default('name') });
const menuSelect = { id: true, name: true, description: true, price: true, category: true, imageUrl: true, isAvailable: true } as const;
const restaurantSelect = { id: true, name: true, description: true, phone: true, imageUrl: true, createdAt: true, updatedAt: true } as const;

export function catalogRoutes(app: FastifyInstance, db: Db, vision: VisionProvider | undefined, storage: ReturnType<typeof objectStorage>) {
  function restaurant(id: string) {
    return db.restaurant.findFirst({ where: { id, deletedAt: null }, select: restaurantSelect });
  }

  for (const isAdmin of [false, true]) {
    const base = isAdmin ? '/admin/restaurants' : '/restaurants';
    const auth = isAdmin ? admin : signedIn;
    app.get(base, async request => {
      auth(request);
      const { q, page, size, sort } = filters.parse(request.query);
      const where: Prisma.RestaurantWhereInput = {
        deletedAt: null, name: { contains: q, mode: 'insensitive' },
      };
      const [rows, total] = await db.$transaction([
        db.restaurant.findMany({
          where, select: { ...restaurantSelect, _count: { select: { menu: { where: { deletedAt: null, isAvailable: isAdmin ? undefined : true } } } } },
          orderBy: [sort === 'newest' ? { createdAt: 'desc' } : { name: 'asc' }, { id: 'asc' }], skip: (page - 1) * size, take: size,
        }),
        db.restaurant.count({ where }),
      ], { isolationLevel: 'RepeatableRead' });
      return { items: rows.map(({ _count, ...row }) => ({ ...row, menuCount: _count.menu })), total, page, size };
    });
    app.get(base + '/:id', async request => {
      auth(request);
      return requireFound(await restaurant(id(request.params)));
    });
    app.get(base + '/:id/menu', async request => {
      auth(request);
      const restaurantId = id(request.params);
      const { page, size, sort, q } = menuFilters.parse(request.query);
      requireFound(await restaurant(restaurantId));
      const where: Prisma.MenuItemWhereInput = {
        restaurantId, deletedAt: null, isAvailable: isAdmin ? undefined : true,
        restaurant: { deletedAt: null },
        name: { contains: q, mode: 'insensitive' },
      };
      const [items, total] = await db.$transaction([
        db.menuItem.findMany({ where, select: menuSelect, orderBy: [{ [sort]: 'asc' }, { id: 'asc' }], skip: (page - 1) * size, take: size }),
        db.menuItem.count({ where }),
      ], { isolationLevel: 'RepeatableRead' });
      return { items, total, page, size };
    });
  }

  app.post('/admin/restaurants', async (request, reply) => {
    admin(request);
    const data = restaurantSchema.parse(request.body);
    const row = await db.restaurant.create({ data, select: restaurantSelect });
    return reply.code(201).send(row);
  });
  app.patch('/admin/restaurants/:id', async request => {
    admin(request);
    return db.restaurant.update({
      where: { id: id(request.params), deletedAt: null }, data: restaurantSchema.partial().parse(request.body), select: restaurantSelect,
    });
  });
  app.delete('/admin/restaurants/:id', async (request, reply) => {
    admin(request);
    await db.restaurant.update({
      where: { id: id(request.params), deletedAt: null }, data: { deletedAt: new Date() },
    });
    return reply.code(204).send();
  });

  for (const suffix of ['', '/import']) {
    app.post('/admin/restaurants/:id/menu' + suffix, async (request, reply) => {
      admin(request);
      const restaurantId = id(request.params);
      const { items } = z.object({ items: z.array(menuItemSchema).min(1).max(200) }).parse(request.body);
      const result = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${restaurantId}::uuid FOR SHARE`;
        requireFound(await tx.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null }, select: { id: true } }));
        return tx.menuItem.createMany({ data: items.map(item => ({ ...item, restaurantId })) });
      });
      return reply.code(201).send(result);
    });
  }
  app.patch('/admin/menu-items/:id', async request => {
    admin(request);
    return db.menuItem.update({
      where: { id: id(request.params), deletedAt: null, restaurant: { deletedAt: null } },
      data: menuItemSchema.partial().parse(request.body), select: menuSelect,
    });
  });
  app.delete('/admin/menu-items/:id', async (request, reply) => {
    admin(request);
    await db.menuItem.update({
      where: { id: id(request.params), deletedAt: null, restaurant: { deletedAt: null } },
      data: { deletedAt: new Date(), isAvailable: false },
    });
    return reply.code(204).send();
  });

  app.get('/admin/capabilities', async request => {
    admin(request);
    return {
      available: !!vision, reason: vision ? undefined : 'Chưa cấu hình khóa OpenAI trên máy chủ.',
      storageAvailable: !!storage,
    };
  });
  app.post('/admin/restaurants/:id/menu/extract', { config: {
    rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: request => request.actor?.id ?? request.ip },
  } }, async request => {
    admin(request);
    if (!vision) throw new ApiError(503, 'AI_DISABLED', 'Chưa cấu hình khóa OpenAI trên máy chủ.');
    const restaurantId = id(request.params);
    requireFound(await restaurant(restaurantId));
    const image = await readImage(request, 2800);
    const result = await vision.extract(image);
    const existing = await db.menuItem.findMany({ where: { restaurantId, deletedAt: null }, select: { name: true } });
    return { items: normalizeExtraction(result, existing.map(item => item.name)) };
  });

  app.post('/admin/images', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (request, reply) => {
    admin(request);
    if (!storage) throw new ApiError(503, 'STORAGE_DISABLED', 'Chưa cấu hình lưu trữ ảnh S3.');
    const image = await readImage(request, 1200);
    return reply.code(201).send({ url: await storage.put(image) });
  });
  app.get('/images/:id', async (request, reply) => {
    signedIn(request);
    const imageId = id(request.params);
    if (!storage) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
    try {
      const result = await storage.get(imageId);
      return reply.type('image/webp').send(requireFound(result.Body));
    } catch (error) {
      if (error instanceof Error && (error.name === 'NoSuchKey' || error.name === 'NotFound')) {
        throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
      }
      throw error;
    }
  });
}
