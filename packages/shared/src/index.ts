import { z } from 'zod';

export const maxPrice = 10_000_000;
export const maxQuantity = 99;
export const zone = 'Asia/Ho_Chi_Minh';
export const idSchema = z.uuid();
export const priceSchema = z.number().int().min(0).max(maxPrice);
export const quantitySchema = z.number().int().min(1).max(maxQuantity);
export const usernameSchema = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{0,79}$/, 'Nhập tên đăng nhập từ 1 đến 80 ký tự, gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
export const credentialsSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Nhập mật khẩu.'),
});
export const newUserSchema = credentialsSchema;
const optionalText = (length: number) => z.string().trim().max(length).nullable().optional();
export const imageUrlSchema = z.string().trim().max(2048).refine(value => {
  if (value === '' || /^\/api\/v1\/images\/[\da-f-]{36}$/i.test(value)) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, 'Dùng đường dẫn HTTPS hoặc tải ảnh lên.');
export const restaurantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: optionalText(1000),
  phone: optionalText(40),
  imageUrl: z.string().regex(/^\/api\/v1\/images\/[\da-f-]{36}$/i).nullable().optional(),
});
export const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(150),
  price: priceSchema,
  description: optionalText(500),
  category: optionalText(80),
  imageUrl: imageUrlSchema.nullable().optional(),
  isAvailable: z.boolean().optional(),
});
export const deadlineSchema = z.iso.datetime({ offset: true });
export const createOrderSchema = z.object({
  restaurantId: idSchema,
  note: optionalText(1000),
  deadline: deadlineSchema,
});
export const statuses = ['OPEN', 'CLOSED', 'CANCELLED'] as const;
export type Status = typeof statuses[number];
export const isFinalized = (status: Status) => status === 'CLOSED';
export type Role = 'ADMIN' | 'USER';
export type User = { id: string; username: string; role: Role; createdAt: string };
export type Restaurant = Required<z.output<typeof restaurantSchema>> & { id: string; menuCount?: number };
export type MenuItem = Required<z.output<typeof menuItemSchema>> & { id: string; isAvailable: boolean };
export type Page<T> = { items: T[]; total: number; page: number; size: number };
export type Line = {
  id: string; menuItemId: string; name: string; unitPrice: number; quantity: number; total: number; version: number;
};
export type Person = { id: string; name: string; userId: string; lines: Line[]; total: number; confirmed: boolean };
export type GroupLine = Pick<Line, 'name' | 'unitPrice' | 'quantity' | 'total'> & { key: string };
export type OrderCard = {
  id: string; restaurant: Pick<Restaurant, 'id' | 'name' | 'imageUrl'>;
  owner: { id: string; name: string }; status: Status; deadline: string; createdAt: string;
  participantCount: number; quantity: number; total: number; acceptingItems: boolean;
};
export type OrderDetail = OrderCard & {
  note: string | null; joined: boolean; myLines: Line[]; myTotal: number; myConfirmed: boolean; confirmedCount: number; groups: GroupLine[];
  people: Person[] | null; menu: MenuItem[];
};
export type OrderSummary = OrderCard & { note: string | null; groups: GroupLine[]; people: Person[]; exportedAt: string };
export type Extraction = { available: boolean; reason?: string; storageAvailable: boolean };
export type ExtractedItem = { name: string; price: number | null; confidence: number; warnings: string[] };
