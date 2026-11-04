import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priceSchema, quantitySchema, type Line } from '@vsf/shared';
import { acceptsItems, groupLines, totals, transition } from '../apps/api/src/order-domain.js';
import { normalizeExtraction, normalizePrice, openAiProvider } from '../apps/api/src/vision.js';

test('totals use integer VND and group by menu and historical price/name', () => {
  const base: Line = { id: 'a', menuItemId: 'm', name: 'Bún chả', quantity: 2, unitPrice: 40000, total: 80000, version: 1 };
  const lines = [
    base,
    { ...base, id: 'b', quantity: 1 },
    { ...base, id: 'c', unitPrice: 45000, quantity: 2 },
    { ...base, id: 'd', menuItemId: 'another', quantity: 1 },
  ];
  assert.deepEqual(totals(lines), { quantity: 6, total: 250000 });
  assert.deepEqual(groupLines(lines).map(row => [row.quantity, row.unitPrice, row.total]), [[3, 40000, 120000], [1, 40000, 40000], [2, 45000, 90000]]);
  assert.deepEqual(totals([]), { quantity: 0, total: 0 });
});

test('the exact deadline stops item edits and a closed order cannot be cancelled', () => {
  const deadline = new Date('2026-11-04T04:00:00.000Z');
  assert.equal(acceptsItems('OPEN', deadline, new Date(deadline.getTime() - 1)), true);
  assert.equal(acceptsItems('OPEN', deadline, deadline), false);
  assert.equal(acceptsItems('CLOSED', deadline, new Date(0)), false);
  assert.equal(transition('CLOSED', 'extend'), 'OPEN');
  assert.equal(transition('OPEN', 'close'), 'CLOSED');
  assert.equal(transition('OPEN', 'cancel'), 'CANCELLED');
  assert.equal(transition('CLOSED', 'cancel'), undefined);
  assert.equal(transition('CLOSED', 'reopen'), 'OPEN');
  assert.equal(transition('OPEN', 'reopen'), undefined);
  assert.equal(transition('CANCELLED', 'reopen'), undefined);
  for (const action of ['extend', 'close', 'cancel'] as const) assert.equal(transition('CANCELLED', action), undefined);
});

test('prices and quantities enforce positive integer counts and bounded integer VND', () => {
  for (const value of [-1, 1.1, '20000', 10000001]) assert.equal(priceSchema.safeParse(value).success, false);
  assert.equal(priceSchema.parse(0), 0);
  for (const value of [-1, 0, 2.5, '2', 100]) assert.equal(quantitySchema.safeParse(value).success, false);
  assert.equal(quantitySchema.parse(99), 99);
});

test('menu extraction normalizes printed prices, preserves accents and warns on ambiguous or repeated rows', () => {
  for (const raw of ['45k', '45.000đ', '45,000 VNĐ', '45 000 ₫', 45000]) assert.equal(normalizePrice(raw), 45000);
  for (const raw of [null, '40–50k', '4.5', '3.456,89', -1]) assert.equal(normalizePrice(raw), null);
  assert.equal(normalizePrice('4,5 k'), 4500);
  const rows = normalizeExtraction({ items: [
    { name: '  Bún chả ', price: '45k', confidence: .9 },
    { name: 'BÚN CHẢ', price: 'khó đọc', confidence: .55 },
  ] }, ['bún chả']);
  assert.equal(rows[0]?.name, 'Bún chả');
  assert.equal(rows[0]?.warnings.length, 2);
  assert.equal(rows[1]?.price, null);
  assert.equal(rows[1]?.warnings.length, 4);
  assert.throws(() => normalizeExtraction({ items: [{ name: 'x', price: '1', confidence: 2 }] }, []));
});

test('OpenAI vision sends an image and strict schema to Responses and handles refusals', async t => {
  assert.equal(openAiProvider(' '), undefined);
  let output: unknown = {
    status: 'completed', output: [
      { type: 'reasoning' },
      { type: 'message', content: [{ type: 'output_text', text: '{"items":[{"name":"Bún bò","price":"45k","confidence":0.95}]}' }] },
    ],
  };
  t.mock.method(globalThis, 'fetch', async (url: string, request: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(request.headers).get('authorization'), 'Bearer test-key');
    const body = JSON.parse(String(request.body));
    assert.equal(body.model, 'gpt-5.4-mini');
    assert.equal(body.store, false);
    assert.equal(body.input[0].content[1].image_url, 'data:image/webp;base64,dGVzdA==');
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    return Response.json(output);
  });
  const provider = openAiProvider('test-key')!;
  const result = normalizeExtraction(await provider.extract(Buffer.from('test')), []);
  assert.deepEqual(result, [{ name: 'Bún bò', price: 45000, confidence: .95, warnings: [] }]);
  output = { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] };
  await assert.rejects(() => provider.extract(Buffer.from('test')), { code: 'AI_RESULT' });
});
