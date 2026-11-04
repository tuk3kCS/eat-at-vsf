import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { credentialsSchema } from '@vsf/shared';
import { ApiError, selectUser, signedIn, type Db, type Tx } from './core.js';

const lifetime = 7 * 24 * 60 * 60;
export const hashPassword = (password: string) => hash(password, {
  algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1,
});
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export async function authRoutes(app: FastifyInstance, db: Db, secure: boolean) {
  const cookie = secure ? '__Host-vsf' : 'vsf_session';
  const options = { httpOnly: true, secure, sameSite: 'lax', path: '/' } as const;
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  const readToken = (value?: string) => value && /^[A-Za-z0-9_-]{43}$/.test(value) ? digest(value) : undefined;

  app.decorateRequest('actor', null);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const tokenHash = readToken(request.cookies[cookie]);
    if (!tokenHash) return;
    const session = await db.session.findUnique({
      where: { tokenHash, user: { deletedAt: null } }, select: { expiresAt: true, user: { select: selectUser } },
    });
    if (session && session.expiresAt > new Date()) request.actor = session.user;
  });

  async function createSession(tx: Tx, userId: string, previous?: string) {
    const token = randomBytes(32).toString('base64url');
    const previousHash = readToken(previous);
    await tx.session.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() } }, ...(previousHash ? [{ tokenHash: previousHash }] : [])] } });
    await tx.session.create({
      data: { userId, tokenHash: digest(token), expiresAt: new Date(Date.now() + lifetime * 1000) },
    });
    return token;
  }
  const setCookie = (reply: FastifyReply, token: string) => reply.setCookie(cookie, token, { ...options, maxAge: lifetime });
  const invalidLogin = () => new ApiError(401, 'INVALID_LOGIN', 'Tên đăng nhập hoặc mật khẩu không đúng.');

  const limit = { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } };
  app.post('/auth/login', limit, async (request, reply) => {
    const { username, password } = credentialsSchema.parse(request.body);
    const user = await db.user.findUnique({ where: { username, deletedAt: null }, select: { id: true, passwordHash: true } });
    const valid = await verify(user?.passwordHash ?? dummyHash, password);
    if (!valid || !user) throw invalidLogin();
    const { profile, token } = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR SHARE`;
      const profile = await tx.user.findUnique({
        where: { id: user.id, deletedAt: null, passwordHash: user.passwordHash }, select: selectUser,
      });
      if (!profile) throw invalidLogin();
      return { profile, token: await createSession(tx, user.id, request.cookies[cookie]) };
    });
    return setCookie(reply, token).send(profile);
  });
  app.post('/auth/logout', async (request, reply) => {
    const tokenHash = readToken(request.cookies[cookie]);
    if (tokenHash) await db.session.deleteMany({ where: { tokenHash } });
    return reply.clearCookie(cookie, options).code(204).send();
  });
  app.get('/auth/me', async request => signedIn(request));
}
