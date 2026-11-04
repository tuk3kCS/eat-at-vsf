# Triển khai Render

## Tạo Blueprint từ GitHub

1. Commit và đẩy mã nguồn lên nhánh `main` của repository GitHub. Chờ workflow **Build and test** chạy thành công.
2. Trong Render Dashboard, chọn **New → Blueprint** rồi kết nối repository. Chọn nhánh `main` và tệp `render.yaml` ở thư mục gốc.
3. Nhập `APP_ORIGIN` là địa chỉ HTTPS sẽ dùng để đăng nhập. Nếu dùng tên mặc định của Blueprint, nhập `https://eat-vsf-web.onrender.com`. Sau khi tạo, kiểm tra URL Render thực tế của web. Nếu URL khác, cập nhật `APP_ORIGIN` trong phần **Environment** của API rồi deploy lại API.
4. Xem các gói và chi phí trong bản xem trước của Blueprint, sau đó chọn **Deploy Blueprint**.

Blueprint tạo web công khai, API riêng và PostgreSQL trong cùng khu vực Singapore. Web và API dùng gói Starter. Database dùng gói Basic 256 MB với 1 GB dung lượng. Các gói này có phí. Render tự triển khai web và API sau khi các kiểm tra CI của nhánh liên kết thành công. [Render Blueprints](https://render.com/docs/blueprints) · [Các gói và giá Render](https://render.com/pricing)

## Kết nối và biến môi trường

- **`eat-vsf-web`** phục vụ bản dựng Vite bằng Caddy. Render cấp `PORT`. Blueprint lấy `API_UPSTREAM` từ địa chỉ và cổng nội bộ của API. Trình duyệt gọi API qua `/api/v1` trên cùng domain với web.
- **`eat-vsf-api`** chạy trong mạng riêng ở cổng 3001. Blueprint lấy `DATABASE_URL` từ Render Postgres. Render chạy `npm run migrate` trước mỗi lần triển khai API. Health check `/health` của web đi qua API và kiểm tra kết nối PostgreSQL.
- **`eat-vsf-db`** chạy PostgreSQL 17 và chỉ nhận kết nối qua mạng riêng.
- **`APP_ORIGIN`** phải khớp với domain HTTPS mà người dùng mở. Khi chuyển sang custom domain, cập nhật biến này trên API. Cookie phiên production dùng Secure, HTTP-only và SameSite=Lax.
- **`OPENAI_API_KEY`** đặt trên API để bật đọc ảnh thực đơn. Có thể đặt `OPENAI_MODEL` để đổi model mặc định.
- **`S3_ENDPOINT`**, **`S3_REGION`**, **`S3_BUCKET`**, **`S3_ACCESS_KEY_ID`** và **`S3_SECRET_ACCESS_KEY`** đặt trên API nếu cần tải ảnh quán lên. Cấp quyền đọc và ghi object trong tiền tố `eat-vsf/images/` của bucket.

[Blueprint YAML](https://render.com/docs/blueprint-spec) · [Private services](https://render.com/docs/private-services) · [Pre-deploy](https://render.com/docs/deploys#pre-deploy-command) · [Health checks](https://render.com/docs/health-checks)

## Tạo quản trị viên đầu tiên

Sau khi API triển khai thành công, mở **Shell** của `eat-vsf-api` trong Render. Cấp `ADMIN_USERNAME` và `ADMIN_PASSWORD` cho tiến trình, rồi chạy `npm run admin:create`. Chọn tên đăng nhập còn trống và nhập mật khẩu. Xóa các biến bootstrap khỏi môi trường sau khi tạo tài khoản. Dùng tài khoản này đăng nhập tại `/login` và cấp quyền truy cập cho thành viên.

## Kiểm tra sau triển khai

Mở `/health` trên domain web và kiểm tra phản hồi `{"status":"ok"}`. Đăng nhập, tạo quán, tạo đơn và tải ảnh PNG. Nếu đã bật OpenAI hoặc S3, thử đọc ảnh thực đơn hoặc tải ảnh quán lên.
