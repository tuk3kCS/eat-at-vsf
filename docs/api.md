# REST API

Các route nghiệp vụ bắt đầu bằng `/api/v1`. Cookie do API cấp qua đăng ký hoặc đăng nhập. Request ghi phải có `Origin` đúng với `APP_ORIGIN`. `GET /health` nằm ngoài prefix và trả 503 nếu PostgreSQL không phản hồi.

## Tài khoản

- `POST /auth/login` nhận `username` và `password` do quản trị viên cấp.
- `GET /auth/me` trả hồ sơ công khai của phiên hiện tại.
- `POST /auth/logout` thu hồi token và xóa cookie. Phiên cố định 7 ngày, sau đó đăng nhập lại.

## Quán và thực đơn

- `GET /restaurants` và `GET /restaurants/:id` hiển thị các quán chưa bị xóa. `GET /restaurants/:id/menu` chỉ hiển thị món còn bán của quán.
- Admin đọc, tạo, sửa, xóa mềm ở `/admin/restaurants` và `/admin/restaurants/:id`.
- `GET /admin/restaurants/:id/menu` đọc menu quản trị. `POST` cùng đường dẫn nhận `{ items: [...] }` để lưu một hoặc nhiều món.
- `PATCH|DELETE /admin/menu-items/:id` sửa hoặc xóa mềm một món.
- `POST /admin/restaurants/:id/menu/extract` nhận multipart với ảnh, trả các dòng nháp và cảnh báo. `POST /admin/restaurants/:id/menu/import` nhận `{ items: [...] }` với giá đã được xác nhận.
- `GET /admin/capabilities` trả trạng thái OpenAI và S3. `POST /admin/images` lưu ảnh nếu S3 đã được cấu hình. `GET /images/:id` phục vụ ảnh cho người đã đăng nhập.

## Đơn

- `GET /orders` hỗ trợ `scope=open|created|joined|history`, `status`, `q`, `restaurantId`, `restaurantName`, `from`, `to`.
- `POST /orders` nhận `restaurantId`, `deadline` ISO 8601 có múi giờ và `note` tùy chọn. Người tạo tự trở thành người tham gia.
- `GET /orders/:id` trả thông tin đơn, món đã chọn, trạng thái xác nhận của người gọi và tổng hợp theo người cho người tham gia hoặc quản trị viên.
- `POST /orders/:id/join` tham gia đơn mở. Có thể gọi lại khi đã tham gia.
- `POST /orders/:id/leave` rời đơn đang mở và xóa các món của người gọi. Chủ đơn giữ vai trò tổ chức.
- `POST /orders/:id/items` nhận `menuItemId`, `quantity`. Mỗi lần thêm là một thay đổi số lượng. Sau khi mất kết nối, tải lại đơn trước khi gửi lại.
- `PATCH /orders/:id/items/:itemId` nhận `quantity` mới và `version` đọc được. `DELETE` cùng đường dẫn nhận `?version=`.
- `PATCH /orders/:id` nhận `deadline` để đổi hạn của đơn đang mở.
- `PATCH /orders/:id/confirmation` nhận `{ confirmed: true }` để chốt món của chính mình. Cần có ít nhất một món. Gửi `false` để bỏ chốt.
- `POST /orders/:id/close|extend|reopen|cancel` dành cho chủ đơn. Chốt sớm yêu cầu mọi người tham gia đã chọn và chốt món. Đến hạn, hệ thống tự xác nhận những người đã chọn món và chốt đơn. `cancel` chỉ áp dụng trước hạn. `extend` nhận hạn muộn hơn hạn hiện tại. `reopen` nhận `deadline` trong tương lai và đặt lại các xác nhận của đơn đã chốt.
- `GET /orders/:id/summary` trả snapshot cho chủ đơn sau khi chốt. Ảnh có tên quán, ngày đặt, ghi chú nếu có, món và số lượng, tổng số lượng và tổng tiền.

## Quản trị

- `GET /admin/dashboard` hỗ trợ `from` và `to` dạng `YYYY-MM-DD`. Số tài khoản, quán và món là tổng hiện tại. Chỉ số đơn và tổng giá trị theo kỳ, bỏ giá trị đơn hủy.
- `GET /admin/users` hỗ trợ tìm theo tên đăng nhập bằng `q`. `POST` nhận `{ users: [...] }` với `username` và `password` cho mỗi tài khoản.
- `PATCH /admin/users/:id` nhận `role` và `password` tùy chọn. Quản trị viên không thể tự đổi vai trò. Khi đổi mật khẩu, hệ thống thu hồi các phiên đăng nhập của tài khoản.
- `DELETE /admin/users/:id` xóa tài khoản và thu hồi phiên đăng nhập. Quản trị viên không thể tự xóa mình. Hệ thống giữ lịch sử đơn, hủy đơn đang mở do tài khoản tạo và gỡ các món của tài khoản khỏi những đơn đang mở khác.
- `GET /admin/users/:id/orders` đọc lịch sử của tài khoản.

Các endpoint danh sách phân trang dùng `page`, `size` và trả `{ items, total, page, size }`. `from` và `to` bao gồm cả hai ngày theo giờ Việt Nam. Lỗi trả `{ error: { code, message, fields? } }`. HTTP 401 yêu cầu đăng nhập, 403 thiếu quyền, 404 không tìm thấy, 409 xung đột nghiệp vụ và 429 vượt giới hạn.
