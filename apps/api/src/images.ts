import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { FastifyRequest } from 'fastify';
import sharp from 'sharp';
import { ApiError } from './core.js';

export const imageLimit = 8 * 1024 * 1024;
const imageHeaders = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': Buffer.from('RIFF'),
};
export async function readImage(request: FastifyRequest, maxWidth: number) {
  const file = await request.file();
  if (!file) throw new ApiError(400, 'MISSING_IMAGE', 'Vui lòng chọn ảnh.');
  const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as const;
  const type = file.mimetype as keyof typeof formats;
  if (!Object.hasOwn(formats, type)) throw new ApiError(415, 'IMAGE_FORMAT', 'Chỉ hỗ trợ ảnh JPG, PNG và WebP.');
  const buffer = await file.toBuffer();
  try {
    const header = imageHeaders[type];
    if (!buffer.subarray(0, header.length).equals(header) || (type === 'image/webp' && buffer.toString('ascii', 8, 12) !== 'WEBP')) {
      throw new Error('Invalid image signature');
    }
    const image = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' });
    const meta = await image.metadata();
    if (meta.format !== formats[type] || (meta.pages ?? 1) > 1) throw new Error('Invalid format');
    return await image.rotate().resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 }).toBuffer();
  } catch {
    throw new ApiError(422, 'INVALID_IMAGE', 'Ảnh bị lỗi, là ảnh động hoặc vượt quá 40 triệu pixel.');
  }
}

export function objectStorage(env: NodeJS.ProcessEnv) {
  const { S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_BUCKET || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return undefined;
  const client = new S3Client({
    endpoint: S3_ENDPOINT, region: env.S3_REGION || 'auto', forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  const key = (id: string) => 'eat-vsf/images/' + id + '.webp';
  return {
    async put(body: Buffer) {
      const id = randomUUID();
      await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key(id), Body: body, ContentType: 'image/webp' }));
      return '/api/v1/images/' + id;
    },
    get(id: string) {
      return client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key(id) }));
    },
  };
}
