# 🛠️ Tài Liệu Quản Trị Hệ Thống Quizz Real-time

Tài liệu này giải thích chi tiết toàn bộ các tính năng dành cho Quản trị viên (Admin) trên Dashboard. Bạn có thể sử dụng tài liệu này để tham khảo và trình bày trong buổi bảo vệ đồ án.

---

## 1. 📊 Tổng Quan Hệ Thống (Dashboard Overview)
Dashboard cung cấp một cái nhìn toàn cảnh về tình trạng hoạt động của hệ thống theo thời gian thực:
- **Người dùng / Quiz (Total Users/Quizzes):** Đếm tổng số lượng người dùng và bài quiz hiện có trong Database.
- **Phiên đang chạy (Active Sessions):** Đếm số lượng phòng chơi (room) đang "sáng đèn" và có người trong đó.
- **Người chơi trực tuyến (Total Players Online):** Tổng lượng người chơi đang kết nối Socket.
- **Biểu đồ Request (Traffic / Req/s):** Hệ thống tự động tính toán số request (yêu cầu) mà mỗi IP gửi đến Server thông qua bộ đếm **Sliding Window Log** lưu trong Redis. Guard của hệ thống (`RateLimitGuard`) sẽ bắt tất cả các thao tác (trả lời câu hỏi, gửi biểu tượng, vào sảnh, v.v.) và đẩy vào Redis để đếm chính xác tốc độ req/s.

---

## 2. 🛡️ Các Biện Pháp An Ninh (Security & Incident Management)
Các công cụ này giúp Quản trị viên xử lý ngay lập tức khi phát hiện có dấu hiệu bất thường (như bị spam, bị DDoS, hoặc phát hiện lỗi nghiêm trọng).

### A. 🛑 Lệnh Tạm Dừng Khẩn Cấp (Lockdown / Hard Freeze)
- **Tác dụng:** Khi kích hoạt, hệ thống sẽ bị "đóng băng". 
- **Cách hoạt động:**
  1. Tín hiệu được gửi qua Redis Pub/Sub đến toàn bộ các máy chủ (nếu đang chạy nhiều instance).
  2. Mọi đồng hồ đếm ngược của các phòng chơi sẽ bị **tạm dừng (Pause)**.
  3. Màn hình của tất cả người chơi sẽ hiện thông báo khẩn cấp: *"Hệ thống tạm dừng: Phát hiện truy cập bất thường..."*.
- **Khi nào nên dùng:** Khi bạn thấy số lượng Req/s tăng đột biến bất thường, nghi ngờ có người đang dùng bot tấn công vào game nhưng chưa xác định được IP.

### B. 🔌 Ngắt Kết Nối Khẩn Cấp (Kill Switch)
- **Tác dụng:** Đá văng (Disconnect) toàn bộ người chơi hoặc đá văng một phòng chơi cụ thể.
- **Cách hoạt động:** Gửi lệnh huỷ mọi Socket của một phòng nhất định hoặc huỷ toàn bộ Socket đang có trên máy chủ.
- **Khi nào nên dùng:** Khi một phòng chơi có nội dung vi phạm, hoặc khi bạn cần khởi động lại toàn bộ Socket Server ngay lập tức.

### C. 🔧 Chế Độ Bảo Trì (Maintenance)
- **Tác dụng:** Từ chối tạo phòng mới và thông báo hệ thống đang bảo trì.
- **Cách hoạt động:** Set cờ `maintenance_meta` vào Redis. Socket sẽ broadcast thông báo bảo trì xuống tất cả client để họ nắm thông tin.

---

## 3. 🚫 Quản Lý Danh Sách Đen (IP Blacklist & Auto-Ban)
Hệ thống được trang bị bộ Rate Limit chạy cực nhanh thông qua **Redis Lua Script** để tự động chống lại các cuộc tấn công DDoS hay spam answer.

### A. ⚙️ Cấu Hình Chặn IP (Rate Limiting)
Hệ thống lấy mức cấu hình trực tiếp từ CSDL Postgres (`Setting` table).
- **Mức giới hạn (Rate Limit Req/s):** Ví dụ: 20 request / giây. Vượt qua ngưỡng này, người chơi sẽ nhận lỗi `Too Many Requests` và thao tác bị từ chối.
- **Ngưỡng Auto-Ban (Auto-Ban Threshold):** Ví dụ: 30 request / giây. Nếu người chơi cố tình dùng tool spam vượt quá ngưỡng 30, hệ thống sẽ kích hoạt Auto-Ban.

### B. 🤖 Cơ chế Auto-Ban
Khi `RateLimitGuard` phát hiện IP chạm ngưỡng Auto-Ban:
1. Ghi IP đó vào danh sách `blacklist:ips` trên Redis với thời hạn TTL (mặc định 24h).
2. Tạo **Audit Log** trong CSDL lưu lại lý do Ban.
3. Kích hoạt sự kiện **`system.incident.ban_ip`** thông qua Redis Pub/Sub.
4. Mọi cổng Socket (từ `RoomGateway` ở sảnh chờ đến `GameGateway` trong lúc chơi) sẽ ngay lập tức **ngắt kết nối** và hiện thông báo lỗi. Người chơi đó sẽ không thể vào lại game cho đến khi hết 24h hoặc được Admin mở khoá (Unban).

### C. ✋ Ban IP Bằng Tay (Manual Ban)
Quản trị viên có quyền bấm thẳng vào một IP đang kết nối trên Dashboard và chọn "Chặn IP". Logic hoạt động y hệt Auto-Ban: IP bị lưu vào Blacklist của Redis và hệ thống lập tức sút bay (kick) toàn bộ Socket liên quan đến IP đó khỏi sảnh đợi lẫn game.

---

## 4. 🎮 Quản Lý Phiên Chơi (Active Sessions)
- **Danh sách phiên trực tiếp:** Admin có thể theo dõi xem hiện đang có bao nhiêu game diễn ra, host của game là ai, số người trong phòng là bao nhiêu.
- **Thông tin chi tiết:** Nhấn vào một phiên chơi, Admin có thể xem được tất cả IP của người chơi trong phòng đó và tốc độ Req/s của từng người ở thời điểm hiện tại. Điều này giúp dễ dàng "bắt quả tang" kẻ xấu đang spam.

---

## 5. 📝 Lịch Sử Hệ Thống (Audit Logs)
Mọi hành động nhạy cảm (Đổi cấu hình, Ban IP, Bật/Tắt Lockdown) đều bị ghi lại trong **Audit Logs** bằng `AuditLogInterceptor`.
- **Dữ liệu lưu trữ:** Ghi lại ID của Admin thao tác, hành động gì (Ví dụ: `MANUAL_IP_BAN`), thời gian, và chi tiết lý do. 
- Tính năng này đặc biệt quan trọng để đối soát nếu có Admin nào lạm quyền tắt hệ thống.

---

> [!TIP]
> **Điểm ăn tiền khi bảo vệ đồ án:** Hãy nhấn mạnh vào kiến trúc **Event-Driven** và **Redis Pub/Sub** của hệ thống.
> Thay vì các tính năng Ban IP chỉ hoạt động ở Local Memory (cục bộ trên 1 máy ảo), hệ thống Quizz của bạn sử dụng **Redis Pub/Sub** để làm kênh giao tiếp. Điều này giúp ứng dụng có khả năng **Scalable (Mở rộng)** dễ dàng - dù tương lai có gắn thêm 10 Server chạy song song thì lệnh Ban IP hay Lockdown từ Admin vẫn được truyền tới tất cả Server ngay lập tức trong chớp mắt.
