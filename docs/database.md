# Cơ sở dữ liệu

## Quan hệ

- `User` có nhiều `Session`, đơn đã tạo và lượt tham gia.
- `Restaurant` có nhiều `MenuItem` và `Order`.
- `OrderParticipant` nối người dùng với đơn, mỗi cặp đơn và người dùng là duy nhất.
- `OrderItem` tham chiếu đơn, lượt tham gia và món. Khóa ngoại kép buộc người tham gia thuộc đúng đơn và món thuộc đúng quán của đơn.
- Khóa duy nhất theo người tham gia, món, tên và giá snapshot cho phép gộp lượt thêm cùng mức giá và lưu riêng khi thực đơn đổi.
- `OrderItem.version` tăng sau mỗi lần cập nhật. API trả xung đột khi phiên bản gửi lên đã cũ.

Giá dùng số nguyên VND. Migration kiểm tra khoảng giá, số lượng 1–99 và phiên bản dương. Tổng tiền lấy từ các dòng snapshot. Thời gian lưu bằng `timestamptz` và hiển thị theo `Asia/Ho_Chi_Minh`.

Quán, món và tài khoản dùng `deletedAt` để xóa mềm. Tài khoản đã xóa giữ ID và tên đăng nhập cho lịch sử đơn. Lịch sử đơn giữ tên và đơn giá món tại thời điểm đặt. Các chỉ mục phục vụ truy vấn theo trạng thái và deadline, quán, người tạo, người tham gia và thời gian tạo đơn.

## Migration

Migration `20261104010000_username_auth` giữ ID tài khoản, mật khẩu đã băm, quyền và các quan hệ đơn. Tên đăng nhập cũ được lấy từ phần trước `@` và chuyển thành chữ thường nếu hợp lệ và duy nhất. Giá trị trùng, không hợp lệ, bắt đầu bằng `legacy-` hoặc bằng `tungnh33` được chuyển thành `legacy-<id>`. Migration xóa hai cột họ tên và email sau khi tạo tên đăng nhập. Nếu nâng cấp database có người dùng, lưu danh sách ID và email trước khi chạy để đối chiếu và thông báo tên đăng nhập mới.

Migration `20261104030000_user_deletion` chuyển tài khoản đã vô hiệu hóa sang trạng thái đã xóa, thu hồi phiên và áp dụng cùng cách xử lý đơn đang mở như khi xóa qua giao diện.

```sh
npm run migrate
```

Lệnh áp dụng migration đã được kiểm tra vào database hiện có. Khi sửa schema ở môi trường phát triển, dùng `npm run db:dev -- --name ten-thay-doi`. Review SQL trước khi đưa lên GitHub. Với thay đổi schema lớn, sao lưu và triển khai theo bước tương thích với bản API đang chạy.
