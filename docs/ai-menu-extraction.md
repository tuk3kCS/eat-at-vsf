# Trích xuất thực đơn bằng AI

Đặt `OPENAI_API_KEY` ở service API. `OPENAI_MODEL` mặc định là `gpt-5.4-mini` và có thể đổi sang model OpenAI hỗ trợ ảnh và Structured Outputs qua Responses API. Giao diện báo tính năng chưa khả dụng nếu thiếu khóa.

Trong quản trị quán, mở thực đơn, chọn **Thêm món** rồi chọn **Import từ ảnh bằng AI** trong hộp thoại. Chọn ảnh JPG, PNG hoặc WebP tối đa 8 MB. API kiểm tra nội dung thực, giới hạn 40 triệu pixel, chuẩn hóa hướng ảnh và thu nhỏ cạnh dài tối đa 2.800 px. API gửi ảnh WebP đến OpenAI qua Responses API với `store: false`.

Adapter `VisionProvider` trả kết quả thô. API xác thực bằng Zod, giữ dấu tiếng Việt và chuẩn hóa giá như `45k`, `45.000đ` hoặc `45,000 VNĐ` thành `45000`. Giá không đọc được hoặc mơ hồ là `null`. Các dòng giá thiếu, độ tin cậy thấp, tên lặp trong ảnh hoặc giống tên món có sẵn có cảnh báo.

Kiểm tra lại từng dòng trên ảnh. Chỉnh tên và giá, chọn các dòng muốn lưu, thêm hoặc bỏ dòng rồi nhấn **Xác nhận lưu món**. Request đọc ảnh chỉ tạo bản xem trước. Request xác nhận kiểm tra giá nguyên và lưu danh sách đã chọn trong một giao dịch.

Giới hạn mặc định là 5 lần đọc mỗi phút cho một admin. Nếu OpenAI quá hạn, hết quota hoặc trả dữ liệu lỗi, giao diện hiển thị nguyên nhân và giữ phần đã chỉnh. Có thể tiếp tục nhập món thủ công trong cùng hộp thoại.

[OpenAI Docs về ảnh đầu vào](https://developers.openai.com/api/docs/guides/images-vision) · [OpenAI Docs về Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
