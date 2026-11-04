import type { FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';
import { z } from 'zod';
import { idSchema, statuses, zone } from '@vsf/shared';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export function requireFound<T>(value: T | null | undefined): T {
  if (value == null) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy dữ liệu.');
  return value;
}

export const forbidden = () => new ApiError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
export const conflict = (message: string) => new ApiError(409, 'CONFLICT', message);
export const selectUser = { id: true, username: true, role: true, createdAt: true } as const;
type Actor = Prisma.UserGetPayload<{ select: typeof selectUser }>;
declare module 'fastify' {
  interface FastifyRequest { actor: Actor | null }
}

export function signedIn(request: FastifyRequest): Actor {
  if (!request.actor) throw new ApiError(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập để tiếp tục.');
  return request.actor;
}
export function admin(request: FastifyRequest) {
  const actor = signedIn(request);
  if (actor.role !== 'ADMIN') throw forbidden();
  return actor;
}

export const id = (params: unknown) => z.object({ id: idSchema }).parse(params).id;
export const pagination = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  size: z.coerce.number().int().min(1).max(100).default(24),
};
export const search = z.string().trim().max(120).default('');
export const statusSchema = z.enum(statuses);

export const day = z.iso.date();
export const dateRange = z.object({ from: day.optional(), to: day.optional() })
  .refine(value => !value.from || !value.to || value.from <= value.to, 'Khoảng ngày không hợp lệ.');

export function dayBounds(from?: string, to?: string) {
  return {
    gte: from ? new Date(from + 'T00:00:00+07:00') : undefined,
    lt: to ? new Date(new Date(to + 'T00:00:00+07:00').getTime() + 86_400_000) : undefined,
  };
}
export const localDay = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(date);

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
export async function dbNow(tx: Tx) {
  const [result] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return result!.now;
}
