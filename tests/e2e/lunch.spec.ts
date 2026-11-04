import { randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import type { OrderSummary } from '@vsf/shared';
import { hashPassword } from '../../apps/api/src/auth.js';
import { makeDb } from '../../apps/api/src/db.js';

const password = 'browser-test-vsf-2026';
let adminUsername: string;

test.beforeAll(async () => {
  const db = makeDb(process.env.TEST_DATABASE_URL);
  adminUsername = 'admin-' + randomUUID();
  try {
    await db.user.create({ data: { username: adminUsername, role: 'ADMIN', passwordHash: await hashPassword(password) } });
  } finally { await db.$disconnect(); }
});

async function login(page: Page, username: string, secret = password) {
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}
async function checkViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
async function checkTabScroll(tabs: Locator) {
  expect(await tabs.evaluate(row => row.scrollWidth > row.clientWidth)).toBe(true);
  await tabs.hover();
  await tabs.page().mouse.wheel(500, 0);
  await expect.poll(() => tabs.evaluate(row => row.scrollLeft)).toBeGreaterThan(0);
  await checkViewport(tabs.page());
}
async function checkOrderActions(page: Page) {
  const { panel, actions, buttons } = await page.locator('.order-banner').evaluate(banner => {
    const row = banner.querySelector('.order-actions')!;
    return {
      panel: banner.querySelector('.order-heading')!.getBoundingClientRect().toJSON(),
      actions: row.getBoundingClientRect().toJSON(),
      buttons: Array.from(row.children, button => button.getBoundingClientRect().toJSON()),
    };
  });
  expect(actions.top).toBeGreaterThan(panel.bottom);
  expect(buttons[0].left).toBeGreaterThanOrEqual(panel.left);
  expect(Math.abs(buttons.at(-1).right - panel.right)).toBeLessThan(1);
  const center = buttons[0].top + buttons[0].height / 2;
  for (const button of buttons) expect(Math.abs(button.top + button.height / 2 - center)).toBeLessThan(1);
}
async function download(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải ảnh PNG' }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(/^eat-vsf-order-\d{8}\.png$/);
  const path = await file.path();
  const image = sharp(path);
  const metadata = await image.metadata();
  expect(metadata.format).toBe('png');
  expect(metadata.width).toBe(1500);
  expect(metadata.height).toBeGreaterThan(600);
  // Decode the bottom of the file, which also verifies complete IDAT data.
  await image.extract({ left: 0, top: metadata.height! - 20, width: 100, height: 20 }).raw().toBuffer();
  return metadata.height!;
}

test('admin creates a menu and two members order, close and export', async ({ browser, page }, info) => {
  const mobile = info.project.name === 'mobile';
  const shortId = randomUUID().slice(0, 8);
  const restaurant = 'Cơm Nhà ' + shortId;
  const dish = 'Cơm rang dưa bò';
  const ownerUsername = 'an-' + shortId;
  const memberUsername = 'binh-' + shortId;
  const memberPassword = '1';
  await page.goto('/login');
  if (mobile) await expect(page.getByLabel('Tên đăng nhập')).toHaveCSS('font-size', '16px');
  await expect(page.getByRole('link', { name: /Đăng ký|Quên mật khẩu/ })).toHaveCount(0);
  await login(page, adminUsername);
  await expect(page).toHaveURL(/\/admin\/restaurants$/);
  await expect(page.getByRole('heading', { name: 'Quản lý quán ăn' })).toBeVisible();
  if (mobile) await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  await page.getByRole('link', { name: 'Người dùng', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bộ lọc' })).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Tìm tên đăng nhập…' })).toBeVisible();
  await expect(page.locator('.sidebar').getByRole('link', { name: 'Tạo đơn đặt món' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Chỉnh sửa ' + adminUsername, exact: true }).click();
  const editUser = page.getByRole('dialog', { name: 'Chỉnh sửa người dùng' });
  await expect(editUser.getByLabel('Vai trò')).toBeDisabled();
  await expect(editUser.getByText('Tài khoản đang hoạt động')).toHaveCount(0);
  await editUser.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xóa ' + adminUsername, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Thêm người dùng' }).click();
  const userForm = page.getByRole('dialog');
  const usernames = userForm.getByLabel('Tên đăng nhập', { exact: true });
  const passwords = userForm.getByLabel('Mật khẩu');
  const saveUsers = userForm.getByRole('button', { name: 'Lưu người dùng' });
  await usernames.first().fill(ownerUsername);
  await saveUsers.click();
  await expect(userForm.getByText('Nhập mật khẩu.', { exact: true })).toBeVisible();
  if (!mobile) {
    const usernameBox = (await usernames.first().boundingBox())!;
    const passwordBox = (await passwords.first().boundingBox())!;
    expect(usernameBox.y).toBeCloseTo(passwordBox.y);
    expect(usernameBox.height).toBeCloseTo(passwordBox.height);
  }
  await passwords.first().fill(password);
  await userForm.getByRole('button', { name: 'Thêm tài khoản' }).click();
  await usernames.nth(1).fill(memberUsername);
  await passwords.nth(1).fill(password);
  await userForm.getByRole('button', { name: 'Thêm tài khoản' }).click();
  const disposableUser = 'xoa-' + shortId;
  await usernames.nth(2).fill(disposableUser);
  await passwords.nth(2).fill(password);
  await saveUsers.click();
  await expect(userForm).toBeHidden();
  await page.getByRole('button', { name: 'Chỉnh sửa ' + memberUsername, exact: true }).click();
  await editUser.getByLabel('Mật khẩu mới').fill(memberPassword);
  await editUser.getByRole('button', { name: 'Tiếp tục' }).click();
  const confirmEdit = page.getByRole('dialog', { name: 'Xác nhận cập nhật người dùng?' });
  await confirmEdit.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(confirmEdit).toBeHidden();
  await page.getByRole('button', { name: 'Xóa ' + disposableUser, exact: true }).click();
  const confirmDelete = page.getByRole('dialog', { name: 'Xóa ' + disposableUser + '?' });
  await confirmDelete.getByRole('button', { name: 'Xóa người dùng' }).click();
  await expect(confirmDelete).toBeHidden();
  await expect(page.getByText(disposableUser, { exact: true })).toHaveCount(0);
  if (mobile) await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  await page.getByRole('link', { name: 'Quản lý quán ăn', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm quán', exact: true }).first().click();
  await page.getByRole('dialog').getByLabel('Tên quán', { exact: true }).fill(restaurant);
  await expect(page.getByRole('dialog').getByLabel('Địa chỉ', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByLabel('Đường dẫn ảnh', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByText('Đang hoạt động', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lưu quán' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const restaurantSearch = page.getByRole('searchbox', { name: 'Tìm tên quán…' });
  const filterToggle = page.getByRole('button', { name: 'Bộ lọc' });
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(restaurantSearch).toBeHidden();
  await filterToggle.click();
  await expect(page.getByRole('combobox', { name: 'Lọc trạng thái quán' })).toHaveCount(0);
  await restaurantSearch.fill(restaurant);
  await expect(restaurantSearch).toHaveValue(restaurant);
  await filterToggle.click();
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(restaurantSearch).toBeHidden();
  await expect(page.getByText('Đang áp dụng', { exact: true })).toBeVisible();
  await filterToggle.press('Enter');
  await expect(restaurantSearch).toHaveValue(restaurant);
  await page.getByRole('article').filter({ hasText: restaurant }).getByRole('link', { name: 'Xem thực đơn' }).click();
  await expect(page.getByRole('button', { name: 'Bộ lọc' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Thêm món', exact: true }).click();
  const menuForm = page.getByRole('dialog');
  await menuForm.getByLabel('Tên món', { exact: true }).fill(dish);
  await menuForm.getByLabel('Giá (VND)').fill('45000');
  await page.route('**/api/v1/admin/restaurants/*/menu/extract', route => route.fulfill({
    json: { items: [{ name: 'Trà đá', price: 5000, confidence: 0.99, warnings: [] }] },
  }));
  const importImage = menuForm.getByRole('button', { name: 'Import từ ảnh bằng AI' });
  const [cancelledPicker] = await Promise.all([page.waitForEvent('filechooser'), importImage.click()]);
  await cancelledPicker.element().dispatchEvent('cancel', { bubbles: true });
  await expect(menuForm).toBeVisible();
  await expect(menuForm.getByLabel('Tên món', { exact: true })).toHaveValue(dish);
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer();
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), importImage.click()]);
  await picker.setFiles({ name: 'menu.png', mimeType: 'image/png', buffer: image });
  await expect(menuForm.getByLabel('Tên món', { exact: true }).nth(1)).toHaveValue('Trà đá');
  await expect(menuForm.getByLabel('Tên món', { exact: true }).first()).toHaveValue(dish);
  await menuForm.getByRole('button', { name: 'Lưu món', exact: true }).click();
  await expect(page.getByText(dish, { exact: true })).toBeVisible();
  await expect(page.getByText('Trà đá', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sửa ' + dish }).click();
  const editDish = page.getByRole('dialog', { name: 'Chỉnh sửa món' });
  await expect(editDish.getByLabel('Tên món', { exact: true })).toHaveValue(dish);
  await expect(editDish.getByLabel('Danh mục')).toHaveCount(0);
  await expect(editDish.getByLabel('Đường dẫn ảnh')).toHaveCount(0);
  await editDish.getByRole('button', { name: 'Đóng hộp thoại' }).click();
  await checkViewport(page);

  const viewport = mobile ? { width: 320, height: 720 } : { width: 1440, height: 900 };
  const owner = await browser.newContext({ viewport });
  const member = await browser.newContext({ viewport });
  const a = await owner.newPage();
  const b = await member.newPage();
  try {
    await a.goto('/login');
    await login(a, ownerUsername);
    await expect(a.getByRole('heading', { name: 'Xin chào, ' + ownerUsername + '!' })).toBeVisible();
    await expect(a.getByRole('heading', { name: 'Lịch sử gần đây' })).toHaveCount(0);
    await a.getByRole('link', { name: 'Tạo đơn đặt món', exact: true }).filter({ visible: true }).first().click();
    await expect(a.getByRole('button', { name: 'Bộ lọc' })).toHaveCount(0);
    await a.getByRole('searchbox', { name: 'Tìm quán ăn…' }).fill(restaurant);
    await a.getByRole('button', { name: restaurant, exact: true }).click();
    await expect(a.getByLabel('Tên đơn', { exact: true })).toHaveCount(0);
    await expect(a.locator('.create-form .required-mark')).toHaveCount(2);
    if (!mobile) {
      await expect(a.locator('.picker-grid > button')).toHaveCount(1);
      const gap = await a.locator('.picker-grid > button').evaluate(button =>
        button.parentElement!.getBoundingClientRect().width - button.getBoundingClientRect().width);
      expect(gap).toBeCloseTo(0);
    }
    await a.getByLabel('Ghi chú (tùy chọn)').fill('Giao ở tầng 1');
    await a.getByRole('button', { name: 'Tạo đơn và chọn món' }).click();
    await expect(a.getByRole('heading', { name: restaurant, exact: true })).toBeVisible();
    await expect(a.getByText('Đã tạo đơn mới. Bạn có thể chọn món.', { exact: true })).toBeVisible();
    const facts = a.locator('.order-facts');
    await expect(facts.getByText('HẠN CHỐT', { exact: true })).toBeVisible();
    await expect(facts.getByText(/THAM GIA|SỐ MÓN|TỔNG ĐƠN/)).toHaveCount(0);
    await checkOrderActions(a);
    if (mobile) {
      const row = a.locator('.dish-line').filter({ hasText: dish });
      const name = (await row.getByText(dish, { exact: true }).boundingBox())!;
      const price = (await row.getByText(/45\.000/).boundingBox())!;
      const controls = (await row.locator('.menu-line-actions').boundingBox())!;
      expect(price.y).toBeGreaterThan(name.y);
      expect(Math.abs(price.x - name.x)).toBeLessThan(1);
      expect(price.x + price.width).toBeLessThan(controls.x);
      await checkViewport(a);
      await expect(a.getByRole('button', { name: 'Tổng hợp đơn' })).toHaveCSS('font-size', '14px');
      await checkTabScroll(a.getByRole('group', { name: 'Chi tiết đơn' }));
      await expect(a.locator('html')).toHaveCSS('scrollbar-width', 'none');
      await a.mouse.move(100, 400);
      await a.mouse.wheel(0, 200);
      await expect.poll(() => a.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expect.poll(async () => (await a.locator('.topbar').boundingBox())?.y).toBe(0);
    }
    const path = new URL(a.url()).pathname;
    await expect(a.getByRole('button', { name: 'Xuất đơn hàng' })).toHaveCount(0);
    await expect(a.getByRole('button', { name: 'Chốt đơn', exact: true })).toBeDisabled();
    await expect(a.getByRole('button', { name: 'Tổng hợp đơn, 0 trên 1 người đã chốt' })).toBeVisible();
    await expect(a.getByRole('button', { name: 'Bộ lọc' })).toHaveCount(0);
    const reminder = a.locator('.menu-heading').getByRole('status');
    await expect(reminder).toHaveCount(0);
    await a.getByRole('button', { name: 'Thêm ' + dish, exact: true }).click();
    await expect(reminder).toHaveText('Hãy chốt món để hoàn tất.');

    await b.goto(path);
    await expect(b).toHaveURL(/\/login\?next=/);
    await login(b, memberUsername, memberPassword);
    await expect(b).toHaveURL(new RegExp(path + '$'));
    await b.getByRole('button', { name: 'Tham gia đơn' }).click();
    await expect(b.getByText('Đã tham gia đơn. Bạn có thể chọn món.', { exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Thêm ' + dish, exact: true }).click();
    await b.getByRole('button', { name: 'Rời đơn', exact: true }).click();
    const leaveDialog = b.getByRole('dialog', { name: 'Rời đơn đặt món?' });
    await expect(leaveDialog).toContainText('Phần món bạn đã chọn sẽ được xóa khỏi đơn.');
    await leaveDialog.getByRole('button', { name: 'Rời đơn', exact: true }).click();
    await expect(b).toHaveURL(/\/orders\?scope=open$/);
    const statusFilter = b.getByRole('combobox', { name: 'Trạng thái' });
    const orderFilterToggle = b.getByRole('button', { name: 'Bộ lọc' });
    const actionGap = await b.locator('.page-heading').evaluate(header => {
      const action = header.querySelector('.heading-actions a')!;
      return header.getBoundingClientRect().right - action.getBoundingClientRect().right;
    });
    expect(Math.abs(actionGap)).toBeLessThan(1);
    if (mobile) await checkTabScroll(b.getByRole('group', { name: 'Nhóm đơn' }));
    await expect(statusFilter).toBeHidden();
    await orderFilterToggle.click();
    await statusFilter.selectOption('OPEN');
    await orderFilterToggle.click();
    await expect(statusFilter).toBeHidden();
    await expect(b.getByRole('article').filter({ hasText: restaurant })).toBeVisible();
    await orderFilterToggle.click();
    await expect(statusFilter).toHaveValue('OPEN');
    await b.goto(path);
    await b.getByRole('button', { name: 'Tham gia đơn' }).click();
    await b.getByRole('button', { name: 'Tăng số lượng ' + dish }).click();
    await b.getByRole('button', { name: 'Thêm ' + dish, exact: true }).click();
    await b.getByRole('button', { name: 'Đơn của tôi', exact: false }).first().click();
    await expect(b.getByText(/90\.000/).first()).toBeVisible();
    await b.reload();
    await b.getByRole('button', { name: 'Đơn của tôi', exact: false }).first().click();
    await expect(b.getByText(/90\.000/).first()).toBeVisible();
    await checkViewport(b);
    await expect(a.getByRole('button', { name: 'Chốt đơn', exact: true })).toBeDisabled();
    await a.getByRole('button', { name: 'Chốt món', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Tổng hợp đơn, 1 trên 2 người đã chốt' })).toBeVisible();
    await expect(reminder).toHaveCount(0);
    await expect(a.getByRole('button', { name: 'Chốt đơn', exact: true })).toBeDisabled();
    await b.getByRole('button', { name: 'Chốt món', exact: true }).click();
    await expect(b.getByText('Đã chốt món.', { exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Tổng hợp đơn' }).click();
    await b.getByRole('button', { name: 'Theo người' }).click();
    await expect(b.getByText(ownerUsername, { exact: true }).last()).toBeVisible();
    await expect(b.getByRole('columnheader', { name: 'Đơn giá' }).first()).toHaveCSS('font-size', '14px');
    await expect(b.getByRole('button', { name: 'Theo người' })).toHaveCSS('font-size', '14px');
    await checkViewport(b);

    await a.getByRole('button', { name: 'Tổng hợp đơn' }).click();
    await a.getByRole('button', { name: 'Theo người' }).click();
    await expect(a.getByText(memberUsername, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(a.getByRole('table').getByText(/90\.000/)).toBeVisible();
    await a.route('**/api/v1' + path + '/close', route => route.fulfill({
      status: 409, json: { error: { message: 'Đơn vừa thay đổi. Hãy thử lại.' } },
    }), { times: 1 });
    await a.getByRole('button', { name: 'Chốt đơn', exact: true }).click();
    const closeDialog = a.getByRole('dialog', { name: 'Chốt đơn ngay?' });
    await closeDialog.getByRole('button', { name: 'Chốt đơn' }).click();
    await expect(closeDialog.getByRole('alert')).toHaveText('Đơn vừa thay đổi. Hãy thử lại.');
    await closeDialog.getByRole('button', { name: 'Chốt đơn' }).click();
    await expect(a.getByText('Đã chốt', { exact: true })).toBeVisible();
    await expect(a.getByText('Đã chốt đơn. Bạn có thể xuất ảnh đơn hàng.', { exact: true })).toBeVisible();
    await checkOrderActions(a);
    if (mobile) {
      await a.setViewportSize({ width: 280, height: 720 });
      await checkViewport(a);
      const actionBounds = await a.locator('.order-actions').evaluate(row => {
        const { left, right } = row.getBoundingClientRect();
        return Array.from(row.children).every(child => {
          const box = child.getBoundingClientRect();
          return box.left >= left - 1 && box.right <= right + 1;
        });
      });
      expect(actionBounds).toBe(true);
      await a.setViewportSize(viewport);
    }
    await expect(a.getByText('Tùy chọn', { exact: true })).toHaveCount(0);
    await expect(a.getByRole('button', { name: 'Đánh dấu đã gửi' })).toHaveCount(0);
    await a.getByRole('button', { name: 'Thực đơn', exact: true }).click();
    if (!mobile) {
      const panels = a.locator('.order-layout > .panel');
      expect((await panels.first().boundingBox())!.height).toBeCloseTo((await panels.last().boundingBox())!.height);
    }
    await a.getByRole('button', { name: 'Xuất đơn hàng' }).click();
    const preview = a.locator('.receipt-preview');
    await expect(preview.getByText(dish, { exact: true })).toBeVisible();
    await expect(preview).toContainText('Tên quán: ' + restaurant);
    await expect(preview).toContainText('Ngày đặt:');
    await expect(preview).toContainText('Ghi chú: Giao ở tầng 1');
    await expect(preview).toContainText('Tổng số lượng');
    await expect(preview).toContainText('Tổng tiền');
    await expect(preview).not.toContainText(/EAT @ VSF|Xuất lúc|Đơn giá|Thành tiền|người tham gia/);
    await checkViewport(a);
    await download(a);
    await expect(a.getByRole('dialog').getByRole('status')).toHaveText('Đã tạo ảnh đơn hàng.');

    if (!mobile) {
      await a.getByRole('button', { name: 'Đóng hộp thoại' }).click();
      await a.route('**/api/v1' + path + '/summary', async route => {
        const response = await route.fetch();
        const real = await response.json() as OrderSummary;
        const groups = Array.from({ length: 200 }, (_, i) => ({
          key: String(i), name: 'Món ' + (i + 1) + ' · Bún thịt nướng với rau thơm và nước mắm', quantity: 1, unitPrice: 45000, total: 45000,
        }));
        await route.fulfill({ response, json: { ...real, groups, quantity: groups.length, total: groups.length * 45000 } });
      });
      await a.getByRole('button', { name: 'Xuất đơn hàng' }).click();
      await expect(a.getByRole('dialog').getByText(/^Món 200 ·/)).toBeVisible();
      expect(await download(a)).toBeGreaterThan(16_384);
    }
    await a.getByRole('button', { name: 'Đóng hộp thoại' }).click();
    await a.getByRole('link', { name: 'Đặt lại' }).click();
    await expect(a.getByRole('heading', { name: 'Đặt lại' })).toBeVisible();
    await expect(a.getByText('Đã chọn ' + restaurant)).toBeVisible();
    await expect(a.getByLabel('Ghi chú (tùy chọn)')).toHaveValue('Giao ở tầng 1');
    await a.getByRole('button', { name: 'Tạo đơn và chọn món' }).click();
    await expect(a).toHaveURL(/\/orders\/[\da-f-]+$/);
    expect(new URL(a.url()).pathname).not.toBe(path);
    await expect(a.getByRole('button', { name: 'Xuất đơn hàng' })).toHaveCount(0);

    await a.goto(path);
    await a.getByRole('button', { name: 'Mở lại đơn', exact: true }).click();
    await a.getByRole('dialog').getByRole('button', { name: 'Mở lại đơn', exact: true }).click();
    await expect(a.getByText('Đang mở', { exact: true })).toBeVisible();
    await expect(a.getByRole('button', { name: 'Xuất đơn hàng' })).toHaveCount(0);

    await b.getByLabel('Menu tài khoản').click();
    await b.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(b).toHaveURL(/\/login\?next=/);
  } finally {
    await owner.close();
    await member.close();
  }
});
