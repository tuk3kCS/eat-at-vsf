import { Zlib } from 'fflate';
import { zone, type OrderSummary } from '@vsf/shared';
import { money } from './ui';

const dateFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric' });

export function receiptData(order: OrderSummary) {
  const items = new Map<string, number>();
  for (const { name, quantity } of order.groups) items.set(name, (items.get(name) ?? 0) + quantity);
  return {
    restaurant: 'Tên quán: ' + order.restaurant.name,
    date: 'Ngày đặt: ' + dateFormat.format(new Date(order.createdAt)),
    note: order.note,
    items: [...items].map(([name, quantity]) => ({ name, quantity })),
    quantity: order.quantity,
    total: order.total,
  };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function chunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]!) & 255]!;
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}

const logicalWidth = 750;
const scale = 2;
const ink = '#111827';
const red = '#b91c1c';
const muted = '#4b5563';
type Draw = { y: number; height: number; paint: () => void };

export async function receiptPng(receipt: ReturnType<typeof receiptData>) {
  const canvas = document.createElement('canvas');
  const width = logicalWidth * scale;
  const stripHeight = 512;
  canvas.width = width;
  canvas.height = stripHeight * scale;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas unavailable');
  const ctx = context;
  const font = (size: number, bold: boolean) => `${bold ? 700 : 400} ${size}px "Be Vietnam Pro", Arial, sans-serif`;
  const sample = ['Đơn đặt đồ ăn trưa Món ăn Số lượng Tổng số lượng Tổng tiền Ghi chú', receipt.restaurant, receipt.date, receipt.note, ...receipt.items.map(row => row.name)].join(' ');
  await Promise.all([document.fonts.load(font(18, false), sample), document.fonts.load(font(18, true), sample)]);
  const commands: Draw[] = [];
  let y = 0;
  function box(height: number, fill?: string) {
    const top = y;
    if (fill) commands.push({ y: top, height, paint: () => { ctx.fillStyle = fill; ctx.fillRect(0, top, logicalWidth, height); } });
    y += height;
  }
  function text(content: string, x: number, top: number, size: number, { color = ink, bold = false, right = false } = {}) {
    commands.push({ y: top, height: size + 13, paint: () => {
      ctx.font = font(size, bold); ctx.fillStyle = color; ctx.textAlign = right ? 'right' : 'left'; ctx.textBaseline = 'top'; ctx.fillText(content, x, top);
    } });
  }
  function wrap(content: string, size: number, maxWidth: number, bold: boolean) {
    ctx.font = font(size, bold);
    const lines: string[] = [];
    let line = '';
    for (const word of content.split(/\s+/)) {
      const joined = line ? line + ' ' + word : word;
      if (ctx.measureText(joined).width <= maxWidth) { line = joined; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of word) {
        if (ctx.measureText(line + character).width > maxWidth && line) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  function paragraph(content: string, size: number, bold = false, color = ink) {
    for (const line of wrap(content, size, 666, bold)) {
      text(line, 42, y, size, { bold, color });
      box(size + 10);
    }
  }
  box(9, '#dc2626'); box(28);
  paragraph('Đơn đặt đồ ăn trưa', 30, true);
  paragraph(receipt.restaurant, 18);
  paragraph(receipt.date, 18);
  if (receipt.note) {
    const lines = ('Ghi chú: ' + receipt.note).split(/\r?\n/);
    for (const line of lines) {
      if (line.trim()) paragraph(line, 18);
      else box(18);
    }
  }
  box(12);
  const headerTop = y + 13;
  box(47, '#f9fafb');
  text('Món ăn', 42, headerTop, 16, { color: muted, bold: true });
  text('Số lượng', 708, headerTop, 16, { color: muted, bold: true, right: true });
  for (const row of receipt.items) {
    const lines = wrap(row.name, 17, 525, true);
    const top = y + 12;
    lines.forEach((line, index) => text(line, 42, top + index * 25, 17, { bold: true }));
    text(String(row.quantity), 708, top, 17, { right: true });
    box(23 + 25 * lines.length); box(1, '#e5e7eb');
  }
  box(12);
  const top = y;
  box(100, '#fff1ee');
  text('Tổng số lượng', 42, top + 18, 16, { bold: true, color: red });
  text(String(receipt.quantity), 708, top + 16, 18, { bold: true, right: true });
  text('Tổng tiền', 42, top + 56, 20, { bold: true, color: red });
  text(money(receipt.total), 708, top + 51, 25, { bold: true, color: red, right: true });
  box(24);

  // Encode an RGB PNG one strip at a time. A single browser canvas has a height limit.
  const height = y * scale;
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  header[8] = 8; header[9] = 2;
  const bytes: BlobPart[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header)];
  const compressor = new Zlib({ level: 3 }, data => { if (data.length) bytes.push(chunk('IDAT', data)); });
  const sorted = commands.sort((a, b) => a.y - b.y);
  let first = 0;
  let end = 0;
  for (let offset = 0; offset < y; offset += stripHeight) {
    const rows = Math.min(stripHeight, y - offset) * scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, rows);
    ctx.setTransform(scale, 0, 0, scale, 0, -offset * scale);
    while (sorted[first] && sorted[first]!.y + sorted[first]!.height <= offset) first++;
    while (sorted[end] && sorted[end]!.y < offset + stripHeight) end++;
    for (let i = first; i < end; i++) {
      const command = sorted[i]!;
      if (command.y + command.height > offset) command.paint();
    }
    const rgba = ctx.getImageData(0, 0, width, rows).data;
    const pixels = new Uint8Array((width * 3 + 1) * rows);
    let input = 0;
    let output = 0;
    for (let row = 0; row < rows; row++) {
      output++; // PNG filter 0
      for (let column = 0; column < width; column++) {
        pixels[output++] = rgba[input++]!; pixels[output++] = rgba[input++]!; pixels[output++] = rgba[input++]!; input++;
      }
    }
    compressor.push(pixels, offset * scale + rows === height);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  bytes.push(chunk('IEND', new Uint8Array()));
  return new Blob(bytes, { type: 'image/png' });
}
