# 🛡️ Hướng dẫn Vận hành Hệ thống Admin OPS

Tài liệu này hướng dẫn cách sử dụng các công cụ quản trị hệ thống (Incident Controls) để bảo vệ và duy trì ứng dụng Quizz-Realtime.

## 🛠️ Các chức năng chính (Incident Controls)

### 1. ❄️ Hard Freeze (Đóng băng hệ thống)
- **Mục đích:** Tạm dừng toàn bộ các trận đấu đang diễn ra ngay lập tức khi phát hiện gian lận hoặc tấn công.
- **Cách hoạt động:**
  - Khi bật, màn hình người chơi sẽ bị khóa bởi một lớp phủ cảnh báo (🚨).
  - Toàn bộ Timer (đồng hồ đếm ngược) của các câu hỏi sẽ bị tạm dừng.
  - Người chơi không thể chọn đáp án hay thao tác gì thêm.
- **Khôi phục:** Khi tắt Freeze, hệ thống sẽ tự động gửi lệnh `timer_resume` để các trận đấu tiếp tục với số giây còn lại.

### 2. 🔧 Maintenance Mode (Chế độ bảo trì)
- **Mục đích:** Thông báo và chuẩn bị ngắt kết nối người chơi để nâng cấp hệ thống.
- **Cách hoạt động:**
  - Hiển thị thông báo bảo trì (🔧) trên màn hình người chơi.
  - Có đồng hồ đếm ngược 5 giây trước khi người chơi bị ngắt kết nối.
  - Ngăn chặn người chơi mới tham gia vào các phòng game.

### 3. 🛑 Kill Switch (Ngắt kết nối khẩn cấp)
- **Mục đích:** Ngắt ngay lập tức kết nối Socket của một phòng hoặc toàn bộ máy chủ.
- **Cách sử dụng:**
  - **Global Kill:** Để trống ô PIN và bấm "Global Kill" để ngắt toàn bộ người chơi đang online.
  - **Targeted Kill:** Nhập Room PIN (ví dụ: `123456`) để chỉ ngắt kết nối các người chơi trong phòng đó.

### 4. 🚫 IP Blacklist (Quản lý chặn IP)
- **Mục đích:** Chặn các địa chỉ IP có dấu hiệu tấn công (Spam request, Brute force).
- **Cách hoạt động:**
  - **Auto-ban:** Hệ thống tự động chặn IP nếu vượt ngưỡng request cho phép (được thông báo qua Event Log).
  - **Manual Ban:** Admin có thể nhập IP thủ công và chọn thời gian chặn (1h, 6h, 24h, Permanent).

---

## 🚀 Các lỗi đã sửa (Bug Fixes)

1.  **Mất tín hiệu điều khiển:** Do file `lib/socket.ts` bị mất các listeners (`system:freeze`, `system:maintenance`), dẫn đến việc admin bấm nút nhưng người chơi không nhận được lệnh.
    -   *Giải pháp:* Đã khôi phục đầy đủ các socket listeners và liên kết chúng với Global Store.
2.  **Xung đột Store:** Việc sử dụng song song `game.store.ts` và `game2.store.ts` gây loạn trạng thái.
    -   *Giải pháp:* Đã hợp nhất (merge) toàn bộ logic vào `game.store.ts` duy nhất, sử dụng kiến trúc Shared Socket để đảm bảo tính ổn định cao nhất.
3.  **Giao diện Overlay:** Các màn hình cảnh báo (Freeze/Maintenance) đôi khi không hiển thị hoặc không biến mất khi admin tắt lệnh.
    -   *Giải pháp:* Đồng bộ hóa trạng thái Store và sử dụng cơ chế phản ứng (reactive) của React để cập nhật UI ngay lập tức.

## 📝 Lưu ý quan trọng
- Khi bật **Hard Freeze**, dữ liệu trận đấu vẫn được giữ trong Redis, bạn có thể an tâm xử lý sự cố.
- Chức năng **Kill Switch** sẽ ngắt socket "cứng", người chơi sẽ phải reload trang hoặc chờ reconnect để vào lại.
