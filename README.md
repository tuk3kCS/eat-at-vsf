# Eat @ VSF

Ứng dụng đặt bữa trưa theo nhóm. Thành viên chọn quán, chia sẻ đơn và tự chỉnh món trước giờ chốt. Chủ đơn có thể tải ảnh sau khi chốt và mở lại đơn. Thành viên có thể tạo đơn mới từ quán và ghi chú của đơn trước. Quản trị viên quản lý quán, món và tài khoản.

Web dùng React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod và Lucide. API dùng Fastify, Prisma và PostgreSQL. OpenAI đọc ảnh thực đơn khi được cấu hình. S3 lưu ảnh quán khi cần tải lên.

## Chạy trên máy phát triển

Cần Node.js 22.12+ và PostgreSQL. Có thể dùng PostgreSQL đã cài hoặc dịch vụ trong `compose.yaml`.

```sh
npm ci
docker compose up -d --wait postgres
```

Sao chép `.env.example` thành `.env`. Với PowerShell dùng `Copy-Item .env.example .env`. PostgreSQL trong Docker mặc định dùng cổng `5433` trên máy. Nếu cần cổng khác, đặt `POSTGRES_HOST_PORT` và dùng cùng cổng trong `DATABASE_URL`. Nếu dùng PostgreSQL đã cài sẵn, bỏ qua lệnh Docker và đặt `DATABASE_URL` theo database đó.

```sh
npm run migrate
npm run dev
```

Mở [Eat @ VSF trên máy phát triển](http://localhost:5173). API dùng cổng 3001 mặc định. Nếu đổi địa chỉ web, đặt `APP_ORIGIN` đúng với địa chỉ mở trên trình duyệt. Khi sửa schema hoặc gói dùng chung, khởi động lại `npm run dev` để cập nhật mã được tạo.

### Tạo dữ liệu phát triển

Chạy lệnh sau từ terminal khác khi API và web đã được khởi tạo lần đầu. Seed chỉ dành cho cơ sở dữ liệu phát triển.

```powershell
$env:ALLOW_DEV_SEED = 'yes'
npm run db:seed
```

Trên shell POSIX, dùng `ALLOW_DEV_SEED=yes npm run db:seed`. Seed tạo tài khoản quản trị phát triển `tungnh33` với mật khẩu `1` và một thực đơn mẫu. Sau khi đăng nhập, admin cấp tài khoản thành viên trong **Quản trị → Người dùng**.

Để tạo tài khoản quản trị đầu tiên cho production, dùng `npm run admin:create` với `ADMIN_USERNAME` và `ADMIN_PASSWORD`. Xem hướng dẫn triển khai để thiết lập.

## Kiểm thử và dựng bản phát hành

```sh
npm run build
npm test
npx playwright install chromium
```

Tạo một database kiểm thử riêng, áp dụng `npm run migrate` với `DATABASE_URL` trỏ vào đó rồi đặt `TEST_DATABASE_URL` cùng địa chỉ. Bộ tích hợp và E2E ghi dữ liệu thật vào database kiểm thử.

```sh
npm run test:integration
npm run test:e2e
```

Playwright tự khởi động API đã build và Vite preview trên cổng 3005 và 5175. Hai cấu hình dùng Chromium ở 1440 px và 320 px. CI lặp lại quy trình với PostgreSQL trong môi trường tách biệt.

## Triển khai và tài liệu

- [Triển khai Render từ GitHub](docs/deployment.md)
- [Kiến trúc và phân quyền](docs/architecture.md)
- [Cơ sở dữ liệu và migration](docs/database.md)
- [Hợp đồng REST API](docs/api.md)
- [Trích xuất thực đơn bằng OpenAI](docs/ai-menu-extraction.md)
- [Tiến độ và kết quả xác minh](IMPLEMENTATION_STATUS.md)
