import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import type { Line, OrderDetail, OrderSummary, User } from '@vsf/shared';
import { buildApp } from '../apps/api/src/app.js';
import { makeDb } from '../apps/api/src/db.js';
import { hashPassword } from '../apps/api/src/auth.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to a migrated disposable database.');
const db = makeDb(url);
const origin = 'http://localhost:5173';
const password = 'integration-pw-vsf-2026';
let app: FastifyInstance;
let visionCalls = 0;

before(async () => {
  app = await buildApp({ db, env: { APP_ORIGIN: origin }, vision: {
    async extract() {
      visionCalls++;
      return { items: [{ name: 'Cơm rang', price: '45k', confidence: .98 }, { name: 'Nước chanh', price: null, confidence: .6 }] };
    },
  } });
});
after(async () => { await app?.close(); await db.$disconnect(); });

function req(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object, session?: string, source = origin) {
  return app.inject({ method, url: '/api/v1' + path, payload, headers: { origin: source, ...(session ? { cookie: session } : {}) } });
}
const token = (response: Awaited<ReturnType<typeof req>>) => response.headers['set-cookie']!.toString().split(';')[0]!;
function expectStatus(response: Awaited<ReturnType<typeof req>>, status: number) {
  assert.equal(response.statusCode, status, response.body);
}
async function login(username: string, role: User['role'] = 'USER') {
  const result = await req('POST', '/auth/login', { username: username.toUpperCase(), password });
  expectStatus(result, 200);
  const user = result.json<User>();
  assert.equal(user.username, username);
  assert.equal(user.role, role);
  assert.equal(Object.hasOwn(user, 'email'), false);
  assert.equal(Object.hasOwn(user, 'name'), false);
  assert.equal(Object.hasOwn(user, 'passwordHash'), false);
  assert.equal(Object.hasOwn(user, 'isActive'), false);
  assert.match(result.headers['set-cookie']!.toString(), /HttpOnly.*SameSite=Lax/);
  return { id: user.id, username, cookie: token(result) };
}

test('authentication, RBAC, catalog, deadlines, concurrency, price snapshots and AI confirmation', async () => {
  expectStatus(await req('GET', '/auth/me'), 401);
  expectStatus(await req('POST', '/auth/login', { username: 'admin', password }, undefined, 'https://evil.example'), 403);
  expectStatus(await req('POST', '/auth/register', { username: 'public', password }), 404);
  expectStatus(await req('POST', '/auth/forgot-password', { username: 'public' }), 404);
  const staffName = 'admin-' + randomUUID();
  await db.user.create({ data: { username: staffName, role: 'ADMIN', passwordHash: await hashPassword(password) } });
  const staff = await login(staffName, 'ADMIN');
  const usernames = ['anh', 'binh', 'chau'].map(name => name + '-' + randomUUID());
  const payload = { users: usernames.map(username => ({ username: username.toUpperCase(), password, role: 'ADMIN' })) };
  expectStatus(await req('POST', '/admin/users', payload), 401);
  expectStatus(await req('POST', '/admin/users', payload, staff.cookie), 201);
  expectStatus(await req('POST', '/admin/users', payload, staff.cookie), 409);
  const a = await login(usernames[0]!);
  const b = await login(usernames[1]!);
  const outsider = await login(usernames[2]!);
  expectStatus(await req('POST', '/admin/users', payload, a.cookie), 403);
  expectStatus(await req('POST', '/admin/restaurants', { name: 'Quán bị chặn' }, a.cookie), 403);
  assert.equal((await req('GET', '/auth/me', undefined, staff.cookie)).json<User>().role, 'ADMIN');
  expectStatus(await req('PATCH', '/admin/users/' + outsider.id, { role: 'ADMIN' }, staff.cookie), 200);
  expectStatus(await req('PATCH', '/admin/users/' + staff.id, { role: 'USER' }, staff.cookie), 409);
  expectStatus(await req('DELETE', '/admin/users/' + staff.id, undefined, staff.cookie), 409);
  expectStatus(await req('PATCH', '/admin/users/' + outsider.id, { role: 'USER' }, staff.cookie), 200);

  const restaurant = await req('POST', '/admin/restaurants', { name: 'Cơm Nhà ' + randomUUID() }, staff.cookie);
  expectStatus(restaurant, 201);
  assert.equal(Object.hasOwn(restaurant.json(), 'isActive'), false);
  const restaurantId = restaurant.json<{ id: string }>().id;
  const menuPath = '/admin/restaurants/' + restaurantId + '/menu';
  expectStatus(await req('POST', menuPath, { items: [{ name: 'Cơm rang', price: 45000 }] }, staff.cookie), 201);
  const menu = await req('GET', menuPath, undefined, staff.cookie);
  expectStatus(menu, 200);
  const menuItemId = menu.json<{ items: { id: string }[] }>().items[0]!.id;
  const restaurantTwo = await db.restaurant.create({ data: { name: 'Quán khác', menu: { create: { name: 'Trà đá', price: 5000 } } }, include: { menu: true } });

  function imageRequest(image: Buffer, type: string) {
    const boundary = 'eat-vsf-test-' + randomUUID();
    return app.inject({
      method: 'POST', url: '/api/v1' + menuPath + '/extract',
      headers: { origin, cookie: staff.cookie, 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: Buffer.concat([
        Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="image"; filename="menu.png"\r\nContent-Type: ' + type + '\r\n\r\n'),
        image, Buffer.from('\r\n--' + boundary + '--\r\n'),
      ]),
    });
  }
  expectStatus(await imageRequest(Buffer.from('not a PNG'), 'image/png'), 422);
  expectStatus(await imageRequest(Buffer.from('not an image'), 'text/plain'), 415);
  expectStatus(await imageRequest(Buffer.alloc(8 * 1024 * 1024 + 1), 'image/png'), 413);
  const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).png().toBuffer();
  const extraction = await imageRequest(image, 'image/png');
  expectStatus(extraction, 200);
  expectStatus(await imageRequest(image, 'image/jpeg'), 422);
  assert.equal(visionCalls, 1);
  assert.equal(extraction.json().items[0].price, 45000);
  assert.match(extraction.json().items[0].warnings[0], /trùng/);
  assert.equal(extraction.json().items[1].price, null);
  assert.equal(await db.menuItem.count({ where: { restaurantId } }), 1);
  expectStatus(await req('POST', menuPath + '/import', { items: [{ name: 'Nước chanh', price: null }] }, staff.cookie), 400);
  expectStatus(await req('POST', menuPath + '/import', { items: [{ name: 'Nước chanh', price: 12000 }] }, staff.cookie), 201);
  assert.equal(await db.menuItem.count({ where: { restaurantId } }), 2);

  const future = (offset = 60_000) => new Date(Date.now() + offset).toISOString();
  expectStatus(await req('POST', '/orders', { restaurantId, deadline: future(-1000) }, a.cookie), 400);
  const created = await req('POST', '/orders', { restaurantId, deadline: future(), note: 'Giao ở tầng 1' }, a.cookie);
  expectStatus(created, 201);
  const orderId = created.json<{ id: string }>().id;
  const base = '/orders/' + orderId;
  const read = async (cookie = a.cookie) => (await req('GET', base, undefined, cookie)).json<OrderDetail>();
  const add = (cookie: string, quantity = 1, item = menuItemId) => req('POST', base + '/items', { menuItemId: item, quantity, unitPrice: 1 }, cookie);
  const confirm = (cookie: string, confirmed = true) => req('PATCH', base + '/confirmation', { confirmed }, cookie);
  expectStatus(await confirm(a.cookie), 409);
  expectStatus(await confirm(outsider.cookie), 403);
  expectStatus(await add(b.cookie), 403);
  const joins = await Promise.all([req('POST', base + '/join', undefined, b.cookie), req('POST', base + '/join', undefined, b.cookie)]);
  joins.forEach(result => expectStatus(result, 204));
  expectStatus(await add(b.cookie, 0), 400);
  expectStatus(await add(b.cookie, -1), 400);
  expectStatus(await add(b.cookie, 1, restaurantTwo.menu[0]!.id), 409);
  const adds = await Promise.all([add(a.cookie), add(b.cookie), add(b.cookie)]);
  adds.forEach(result => expectStatus(result, 201));
  let detail = await read();
  assert.equal(detail.participantCount, 2);
  assert.equal(detail.total, 135000);
  assert.equal(detail.groups[0]?.quantity, 3);
  const line = (await read(b.cookie)).myLines[0]!;
  assert.equal((await read(b.cookie)).people?.length, 2);
  assert.equal((await read(outsider.cookie)).people, null);
  assert.equal((await read(outsider.cookie)).confirmedCount, 0);
  const path = base + '/items/' + line.id;
  expectStatus(await req('PATCH', path, { quantity: 1, version: line.version }, a.cookie), 403);
  expectStatus(await req('GET', base + '/summary', undefined, b.cookie), 403);
  expectStatus(await req('GET', base + '/summary', undefined, a.cookie), 409);
  const edits = await Promise.all([1, 3].map(quantity => req('PATCH', path, { quantity, version: line.version }, b.cookie)));
  assert.deepEqual(edits.map(result => result.statusCode).sort(), [200, 409]);
  const modified = edits.find(result => result.statusCode === 200)!.json<Line>();
  expectStatus(await req('DELETE', path + '?version=' + modified.version, undefined, b.cookie), 204);
  expectStatus(await add(b.cookie), 201);
  expectStatus(await req('PATCH', '/admin/menu-items/' + menuItemId, { name: 'Cơm rang bò', price: 50000 }, staff.cookie), 200);
  expectStatus(await add(b.cookie), 201);
  detail = await read();
  assert.deepEqual(detail.groups.map(row => row.unitPrice).sort(), [45000, 50000]);
  assert.equal(detail.total, 140000);
  expectStatus(await req('PATCH', '/admin/menu-items/' + menuItemId, { isAvailable: false }, staff.cookie), 200);
  expectStatus(await add(b.cookie), 409);

  expectStatus(await req('POST', base + '/close', undefined, b.cookie), 403);
  expectStatus(await req('POST', base + '/close', undefined, a.cookie), 409);
  expectStatus(await confirm(a.cookie), 204);
  expectStatus(await req('POST', base + '/close', undefined, a.cookie), 409);
  expectStatus(await confirm(b.cookie), 204);
  const confirmedLine = (await read(b.cookie)).myLines[0]!;
  expectStatus(await req('DELETE', base + '/items/' + confirmedLine.id + '?version=' + confirmedLine.version, undefined, b.cookie), 409);
  expectStatus(await confirm(b.cookie, false), 204);
  expectStatus(await req('POST', base + '/close', undefined, a.cookie), 409);
  expectStatus(await confirm(b.cookie), 204);
  expectStatus(await req('POST', base + '/close', undefined, a.cookie), 204);
  expectStatus(await req('POST', base + '/cancel', undefined, a.cookie), 409);
  expectStatus(await req('POST', base + '/leave', undefined, b.cookie), 409);
  expectStatus(await req('GET', base, undefined, outsider.cookie), 403);
  expectStatus(await req('POST', base + '/extend', { deadline: future(120_000) }, a.cookie), 204);
  assert.equal((await read()).status, 'OPEN');
  assert.equal((await read()).myConfirmed, false);
  expectStatus(await req('PATCH', base, { deadline: future(50_000) }, a.cookie), 204);
  expectStatus(await req('GET', base + '/summary', undefined, a.cookie), 409);

  // Force the deadline to the present without adding a wall-clock delay to the test.
  await db.$executeRaw`UPDATE "Order" SET deadline = clock_timestamp() WHERE id = ${orderId}::uuid`;
  expectStatus(await req('POST', base + '/join', undefined, outsider.cookie), 409);
  expectStatus(await add(a.cookie), 409);
  const automaticallyClosed = await read();
  assert.equal(automaticallyClosed.status, 'CLOSED');
  assert.equal(automaticallyClosed.acceptingItems, false);
  assert.equal(automaticallyClosed.confirmedCount, 2);
  assert.equal(automaticallyClosed.myConfirmed, true);
  expectStatus(await req('POST', base + '/close', undefined, a.cookie), 409);
  const open = await req('GET', '/orders?scope=open', undefined, outsider.cookie);
  assert.equal(open.json().items.some((row: { id: string }) => row.id === orderId), false);
  expectStatus(await confirm(a.cookie, false), 409);
  expectStatus(await req('PATCH', base, { deadline: future() }, a.cookie), 409);
  const first = await req('GET', base + '/summary', undefined, a.cookie);
  expectStatus(first, 200);
  assert.equal(first.json<OrderSummary>().total, 140000);
  assert.equal(first.json<OrderSummary>().people.length, 2);
  assert.equal(first.json<OrderSummary>().note, 'Giao ở tầng 1');
  expectStatus(await req('POST', base + '/submit', undefined, a.cookie), 404);
  expectStatus(await req('POST', base + '/reopen', { deadline: future() }, b.cookie), 403);
  expectStatus(await req('POST', base + '/reopen', { deadline: future(-1000) }, a.cookie), 400);
  expectStatus(await req('POST', base + '/reopen', { deadline: future() }, a.cookie), 204);
  assert.equal((await read()).status, 'OPEN');
  assert.equal((await read()).myConfirmed, false);
  assert.equal((await read()).total, 140000);
  expectStatus(await req('GET', base + '/summary', undefined, a.cookie), 409);
  expectStatus(await req('DELETE', '/admin/restaurants/' + restaurantId, undefined, staff.cookie), 204);
  assert.equal((await read()).total, 140000);

  const shared = await req('POST', '/orders', { restaurantId: restaurantTwo.id, deadline: future() }, a.cookie);
  expectStatus(shared, 201);
  const sharedId = shared.json<{ id: string }>().id;
  const sharedPath = '/orders/' + sharedId;
  expectStatus(await req('POST', sharedPath + '/leave', undefined, a.cookie), 409);
  expectStatus(await req('POST', sharedPath + '/join', undefined, b.cookie), 204);
  for (const member of [a, b]) {
    expectStatus(await req('POST', sharedPath + '/items', { menuItemId: restaurantTwo.menu[0]!.id, quantity: 1 }, member.cookie), 201);
    expectStatus(await req('PATCH', sharedPath + '/confirmation', { confirmed: true }, member.cookie), 204);
  }
  expectStatus(await req('POST', sharedPath + '/leave', undefined, b.cookie), 204);
  expectStatus(await req('POST', sharedPath + '/leave', undefined, b.cookie), 204);
  const afterLeave = (await req('GET', sharedPath, undefined, a.cookie)).json<OrderDetail>();
  assert.equal(afterLeave.participantCount, 1);
  assert.equal(afterLeave.total, afterLeave.myTotal);
  assert.equal(afterLeave.myLines.length, 1);
  expectStatus(await req('POST', sharedPath + '/close', undefined, a.cookie), 204);
  expectStatus(await req('GET', sharedPath, undefined, b.cookie), 403);

  const accountPath = '/admin/users/' + b.id;
  expectStatus(await req('PATCH', accountPath, { password: '1' }, a.cookie), 403);
  expectStatus(await req('PATCH', accountPath, { password: '' }, staff.cookie), 400);
  expectStatus(await req('PATCH', accountPath, { password: '1' }, staff.cookie), 200);
  expectStatus(await req('GET', '/auth/me', undefined, b.cookie), 401);
  expectStatus(await req('POST', '/auth/login', { username: b.username, password }), 401);
  const resetLogin = await req('POST', '/auth/login', { username: b.username, password: '1' });
  expectStatus(resetLogin, 200);
  const resetCookie = token(resetLogin);
  const makeOrder = async (cookie: string) => {
    const response = await req('POST', '/orders', { restaurantId: restaurantTwo.id, deadline: future() }, cookie);
    expectStatus(response, 201);
    return '/orders/' + response.json<{ id: string }>().id;
  };
  const ownedOpen = await makeOrder(resetCookie);
  const archive = await makeOrder(a.cookie);
  expectStatus(await req('POST', archive + '/join', undefined, resetCookie), 204);
  for (const cookie of [a.cookie, resetCookie]) {
    expectStatus(await req('POST', archive + '/items', { menuItemId: restaurantTwo.menu[0]!.id, quantity: 1 }, cookie), 201);
    expectStatus(await req('PATCH', archive + '/confirmation', { confirmed: true }, cookie), 204);
  }
  expectStatus(await req('POST', archive + '/close', undefined, a.cookie), 204);

  expectStatus(await req('DELETE', accountPath, undefined, a.cookie), 403);
  expectStatus(await req('DELETE', accountPath, undefined, staff.cookie), 204);
  expectStatus(await req('DELETE', accountPath, undefined, staff.cookie), 204);
  expectStatus(await req('GET', '/auth/me', undefined, resetCookie), 401);
  expectStatus(await req('POST', '/auth/login', { username: b.username, password: '1' }), 401);
  assert.equal((await req('GET', '/admin/users?q=' + b.username, undefined, staff.cookie)).json().total, 0);
  assert.equal((await req('GET', ownedOpen, undefined, staff.cookie)).json<OrderDetail>().status, 'CANCELLED');
  const afterDelete = await read();
  assert.equal(afterDelete.participantCount, 1);
  assert.equal(afterDelete.total, afterDelete.myTotal);
  const archived = (await req('GET', archive, undefined, a.cookie)).json<OrderDetail>();
  assert.equal(archived.status, 'CLOSED');
  assert.equal(archived.participantCount, 2);
  assert.equal(archived.total, 10_000);
  expectStatus(await req('POST', archive + '/reopen', { deadline: future() }, a.cookie), 204);
  assert.equal((await req('GET', archive, undefined, a.cookie)).json<OrderDetail>().participantCount, 1);
  const stats = await req('GET', '/admin/dashboard', undefined, staff.cookie);
  expectStatus(stats, 200);
  assert.ok(stats.json().total >= afterDelete.total);
  expectStatus(await req('POST', '/auth/logout', undefined, a.cookie), 204);
  expectStatus(await req('GET', '/auth/me', undefined, a.cookie), 401);
});

test('the deadline worker closes orders without a request and confirms only selected meals', async () => {
  const owner = await db.user.create({ data: { username: 'worker-owner-' + randomUUID(), passwordHash: 'unused' } });
  const member = await db.user.create({ data: { username: 'worker-member-' + randomUUID(), passwordHash: 'unused' } });
  const restaurant = await db.restaurant.create({
    data: { name: 'Worker test', menu: { create: { name: 'Bún chả', price: 40_000 } } }, include: { menu: true },
  });
  const order = await db.order.create({
    data: { restaurantId: restaurant.id, createdById: owner.id, deadline: new Date(Date.now() + 60_000),
      participants: { create: [{ userId: owner.id }, { userId: member.id }] } },
    include: { participants: true },
  });
  const meal = restaurant.menu[0]!;
  await db.orderItem.create({ data: { orderId: order.id, restaurantId: restaurant.id, menuItemId: meal.id,
    participantId: order.participants.find(person => person.userId === owner.id)!.id,
    itemNameSnapshot: meal.name, unitPriceSnapshot: meal.price, quantity: 1 } });
  await db.$executeRaw`UPDATE "Order" SET deadline = clock_timestamp() WHERE id = ${order.id}::uuid`;
  const end = Date.now() + 8000;
  do {
    const result = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { participants: true } });
    if (result.status === 'CLOSED') {
      assert.deepEqual(result.participants.find(person => person.userId === owner.id)?.confirmedAt, result.deadline);
      assert.equal(result.participants.find(person => person.userId === member.id)?.confirmedAt, null);
      return;
    }
    await delay(100);
  } while (Date.now() < end);
  assert.fail('The deadline worker did not close the order.');
});

test('production uses a Secure host-only cookie and checks the exact web origin', async () => {
  const productionOrigin = 'https://eat-vsf.example.test';
  const secure = await buildApp({ db, env: { NODE_ENV: 'production', APP_ORIGIN: productionOrigin } });
  try {
    const payload = { username: 'https-' + randomUUID(), password };
    await db.user.create({ data: { username: payload.username, passwordHash: await hashPassword(password) } });
    const url = '/api/v1/auth/login';
    const forged = await secure.inject({ method: 'POST', url, payload, headers: { origin: productionOrigin + '.evil.test' } });
    assert.equal(forged.statusCode, 403);
    const result = await secure.inject({ method: 'POST', url, payload, headers: { origin: productionOrigin } });
    assert.equal(result.statusCode, 200, result.body);
    const cookie = result.headers['set-cookie']?.toString() ?? '';
    assert.match(cookie, /^__Host-vsf=/);
    assert.match(cookie, /; Path=\//);
    assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /; SameSite=Lax/);
    assert.doesNotMatch(cookie, /; Domain=/i);
  } finally { await secure.close(); }
});
