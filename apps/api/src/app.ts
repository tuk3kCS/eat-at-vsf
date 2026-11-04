import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { Prisma, type PrismaClient } from './generated/prisma/client.js';
import { ZodError } from 'zod';
import { adminRoutes } from './admin.js';
import { authRoutes } from './auth.js';
import { catalogRoutes } from './catalog.js';
import { ApiError } from './core.js';
import { makeDb } from './db.js';
import { imageLimit, objectStorage } from './images.js';
import { closeDueOrders, orderRoutes } from './orders.js';
import { openAiProvider, type VisionProvider } from './vision.js';

export async function buildApp(options: { db?: PrismaClient; vision?: VisionProvider; env?: NodeJS.ProcessEnv; logger?: boolean } = {}) {
  const env = options.env ?? process.env;
  const secure = env.NODE_ENV === 'production';
  if (secure && !env.APP_ORIGIN) throw new Error('APP_ORIGIN is required in production');
  const origin = new URL(env.APP_ORIGIN ?? 'http://localhost:5173').origin;
  if (secure && !origin.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production');
  const app = Fastify({
    logger: options.logger ?? false, logController: new Fastify.LogController({ disableRequestLogging: true }),
    trustProxy: env.TRUSTED_PROXY_CIDRS?.split(','), bodyLimit: 256 * 1024, requestTimeout: 60_000,
  });
  const db = options.db ?? makeDb(env.DATABASE_URL);
  let sweep: Promise<void> | undefined;
  let deadlineTimer: NodeJS.Timeout | undefined;
  const sweepDeadlines = () => {
    sweep ??= closeDueOrders(db)
      .catch(() => { app.log.error('Could not close overdue orders.'); })
      .finally(() => { sweep = undefined; });
  };
  app.addHook('onReady', async () => {
    sweepDeadlines();
    deadlineTimer = setInterval(sweepDeadlines, 5000).unref();
  });
  app.addHook('onClose', async () => {
    clearInterval(deadlineTimer);
    await sweep;
    if (!options.db) await db.$disconnect();
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: imageLimit, files: 1, fields: 0, parts: 2 } });
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError) return reply.code(400).send({
      error: { code: 'VALIDATION', message: 'Kiểm tra lại thông tin đã nhập.',
        fields: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) },
    });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return reply.code(409).send({ error: { code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại. Hãy kiểm tra tên đăng nhập hoặc mục đã nhập.' } });
      if (error.code === 'P2025') return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu.' } });
      if (['P2028', 'P2034'].includes(error.code)) return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Đang có cập nhật khác. Hãy thử lại.' } });
    }
    const detail = error instanceof Error ? error as Error & { statusCode?: number; code?: string } : undefined;
    const status = detail?.statusCode;
    if (status && status >= 400 && status < 500) {
      const messages: Record<number, string> = { 413: 'Ảnh tối đa 8 MB.', 415: 'Định dạng yêu cầu không được hỗ trợ.', 429: 'Bạn thao tác quá nhanh. Hãy thử lại sau.' };
      return reply.code(status).send({ error: { code: 'REQUEST_REJECTED', message: messages[status] ?? 'Yêu cầu không hợp lệ.' } });
    }
    request.log.error({ type: detail?.name, code: detail?.code, requestId: request.id }, 'Request failed');
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Máy chủ gặp lỗi. Hãy thử lại sau.' } });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy đường dẫn.' } }));
  app.get('/health', async (_request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  await app.register(async api => {
    api.addHook('onRequest', async request => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin !== origin) {
        throw new ApiError(403, 'CSRF', 'Nguồn của yêu cầu không hợp lệ.');
      }
    });
    await authRoutes(api, db, secure);
    catalogRoutes(api, db, options.vision ?? openAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL), objectStorage(env));
    orderRoutes(api, db);
    adminRoutes(api, db);
  }, { prefix: '/api/v1' });
  return app;
}
