# Kiến trúc

Trình duyệt truy cập một địa chỉ web công khai. Caddy phục vụ bản dựng Vite và chuyển `/api/v1/*` tới Fastify qua mạng riêng của Render. API dùng Prisma với Render Postgres. Chỉ API gọi OpenAI và truy cập S3. Vite proxy mô phỏng cùng cách định tuyến ở môi trường phát triển.

- `apps/web` chứa các màn hình được tải theo route. TanStack Query lấy dữ liệu mới mỗi 7 giây ở trang đơn và tải lại sau khi lưu.
- `apps/api` xử lý phiên, phân quyền, cơ sở dữ liệu, AI và ảnh. HTTP handler xác thực đầu vào bằng Zod và chủ động chọn các trường trả về.
- `packages/shared` chứa schema đầu vào và kiểu dữ liệu trao đổi giữa API với web.
- `prisma` chứa schema, migration, seed phát triển và lệnh tạo admin.
- `tests` chứa unit, tích hợp Fastify với PostgreSQL và kiểm thử trình duyệt Playwright.

## Phiên và phân quyền

Quản trị viên cấp tên đăng nhập và mật khẩu. Mật khẩu dùng Argon2id. Cookie chứa token ngẫu nhiên 256 bit và PostgreSQL chỉ lưu SHA-256 của token. Phiên có thời hạn 7 ngày. Mỗi request kiểm tra tài khoản chưa bị xóa và đọc quyền hiện tại từ cơ sở dữ liệu. Đăng xuất xóa phiên. Đổi mật khẩu hoặc xóa tài khoản thu hồi mọi phiên của tài khoản đó. API kiểm tra chính xác `Origin` ở request ghi và bật cookie HTTP-only, SameSite=Lax. Production dùng thêm Secure và tiền tố `__Host-`.

Thành viên đã đăng nhập có thể thấy và tham gia đơn còn nhận món. Người đã tham gia, chủ đơn và admin xem được tổng hợp theo người. Chỉ chủ đơn được đổi hạn, chốt, mở lại, hủy đơn đang mở hoặc lấy snapshot xuất ảnh. Mọi người chỉ có thể sửa và xác nhận phần món của mình. API xác định quyền từ phiên và quan hệ trong database.

## Thời hạn và cập nhật đồng thời

Các thao tác ghi dùng giao dịch và khóa hàng của đơn trước khi kiểm tra quyền và trạng thái. PostgreSQL cung cấp thời điểm hiện tại qua `clock_timestamp()` sau khi đã lấy các khóa cần thiết. Đến hạn, API tự xác nhận người đã có món và chốt đơn trong cùng một giao dịch. API kiểm tra các đơn đến hạn khi khởi động, định kỳ mỗi 5 giây và khi đọc đơn. Chủ đơn có thể chốt sớm khi mọi người tham gia đã có món và xác nhận. Mở lại đơn đã chốt sẽ đặt hạn mới và yêu cầu xác nhận lại. Đặt lại điền quán và ghi chú từ đơn cũ vào một đơn mới.

Thêm món khóa đọc quán và món đang bán, lấy giá hiện hành từ database và ghi snapshot. Sau khi giá hoặc tên thay đổi, lượt thêm mới có dòng snapshot riêng. Có thể giảm hoặc xóa dòng cũ trong lúc đơn mở. Khi món đổi hoặc ngừng bán, API chỉ tăng số lượng qua lựa chọn từ thực đơn hiện tại. Sửa hoặc xóa dùng phiên bản dòng để báo xung đột nếu có tab khác cập nhật trước. Tạo và gia hạn đơn phải dùng deadline tương lai. Đổi hạn của đơn mở có thể đưa hạn chốt sớm hơn.

API đọc bản tổng hợp trong một giao dịch `RepeatableRead`. Web tính thời gian đếm ngược để hiển thị. Trình duyệt lấy snapshot lần nữa khi tải PNG và yêu cầu xem lại nếu dữ liệu đã thay đổi. PNG được vẽ ở độ phân giải 2× và mã hóa theo các dải canvas để tránh giới hạn chiều cao của một canvas đơn.

## Dữ liệu ngoài PostgreSQL

Ảnh upload cho OpenAI được xử lý trong bộ nhớ. Ảnh quán tải lên được chuyển sang WebP và lưu trong S3, có thể dùng liên kết ảnh HTTPS do admin cung cấp. Endpoint ảnh lưu trong S3 yêu cầu phiên hợp lệ. Bản xuất PNG được tạo trong trình duyệt và tải về thiết bị.

Rate limit mặc định chạy trong bộ nhớ của từng tiến trình API. Admin upload và AI có ngưỡng riêng. Khi vận hành nhiều replica hoặc nhiều nhóm dùng chung một proxy, cấu hình giới hạn tại lớp vào mạng để áp dụng chính sách chung cho toàn dịch vụ.
