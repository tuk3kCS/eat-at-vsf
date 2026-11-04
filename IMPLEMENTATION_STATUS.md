# Tiến độ Eat @ VSF

## Phase 1 · Nền tảng

- Monorepo npm, TypeScript strict, React, Vite, Tailwind CSS, Fastify, Prisma và các schema dùng chung.
- Đăng nhập bằng tên đăng nhập và mật khẩu do admin cấp. Mật khẩu dùng Argon2id, cookie phiên HTTP-only, phân quyền phía máy chủ, kiểm tra Origin và giới hạn lưu lượng.
- Migration áp dụng thành công trên PostgreSQL 18.4. Bài tích hợp kiểm tra cookie host-only và Secure cho cấu hình production.

## Phase 2 · Nghiệp vụ

- Quản lý quán, món và tài khoản. Có xóa mềm, thêm hàng loạt, đổi quyền và xem lịch sử.
- Tạo, tham gia, chia sẻ đơn, chọn và chốt món, quản lý hạn chốt, tổng hợp, chốt, mở lại và hủy đơn đang mở. Polling 7 giây trên danh sách và chi tiết.
- Bài tích hợp đã qua với dữ liệu PostgreSQL thật. Kiểm tra từ chối thao tác sau deadline, phân quyền từng dòng món, cập nhật đồng thời, xung đột phiên bản và giữ giá lịch sử.

## Phase 3 · AI và xuất PNG

- Adapter OpenAI Responses API dùng Structured Outputs, mặc định `gpt-5.4-mini`. Có kiểm tra ảnh và giới hạn dung lượng, chuẩn hóa giá và báo khả năng trùng, giá thiếu hoặc độ tin cậy thấp. Admin xác nhận các dòng trước khi ghi database.
- Bài tích hợp dùng adapter giả lập và kiểm tra ảnh hỏng, sai định dạng, sai chữ ký và quá lớn. Đã xác minh trích xuất riêng với thao tác ghi dữ liệu.
- Ảnh PNG có tiêu đề, tên quán, ngày đặt, ghi chú nếu có, món và số lượng, tổng số lượng và tổng tiền. API chỉ cấp dữ liệu xuất cho chủ đơn sau khi chốt.
- Bài kiểm thử adapter kiểm tra dữ liệu gửi đến OpenAI, đọc phản hồi có cấu trúc và xử lý từ chối. Gọi OpenAI thật và lưu ảnh vào S3 cần khóa và dịch vụ tương ứng để xác minh.

## Phase 4 · Giao diện

- Giao diện thành viên và quản trị bằng tiếng Việt, điều hướng thu gọn, bộ lọc, phân trang, trạng thái tải/rỗng/lỗi và hộp thoại xác nhận. Thêm món thủ công và nhập ảnh AI nằm trong cùng hộp thoại. Admin đăng nhập vào Quản lý quán ăn.
- Đã xem trực quan màn hình đăng nhập và dashboard desktop. Playwright kiểm tra luồng chính ở 1440 px và 320 px, gồm tải lại trang, quay về đơn sau đăng nhập và đăng xuất khi đang xem đơn.

## Phase 5 · Kiểm thử và triển khai

- `npm run build` thành công.
- `npm run migrate` thành công trên một database trống.
- `npm test` qua 5 bài.
- `npm run test:integration` qua 2 bài trên PostgreSQL.
- `npm run test:e2e` qua 2 bài Playwright, desktop và mobile.
- `npm audit --audit-level=high` báo 0 lỗ hổng tại thời điểm kiểm tra.
- Bản dựng có cảnh báo chú thích từ Zod/Rollup. Driver PostgreSQL có cảnh báo về API sẽ thay đổi trong pg 9. Các lệnh dựng và kiểm thử đều thoát thành công.
- `docker compose config --quiet` thành công. Docker image còn cần xác minh khi Docker Desktop hoạt động.
- Blueprint Render khai báo web công khai, API riêng và Render Postgres tại Singapore. API chạy migration trước deploy. Web và API chỉ tự triển khai sau khi CI thành công.
- `render.yaml` đã qua kiểm tra với schema chính thức. Các đường dẫn Dockerfile và tham chiếu service/database khớp. Triển khai thực tế cần đẩy mã nguồn lên GitHub, kết nối workspace Render và đặt `APP_ORIGIN`.
- Đã kiểm tra migration tên đăng nhập trên database có 3 đơn và 5 dòng món. Số bản ghi giữ nguyên sau nâng cấp.
- Đã đăng nhập trên bản xem thử bằng admin `tungnh33` với mật khẩu `1` từ seed phát triển. API từ chối cấp tài khoản nếu khách hoặc thành viên gọi trực tiếp. Đăng ký và quên mật khẩu không có route công khai.
