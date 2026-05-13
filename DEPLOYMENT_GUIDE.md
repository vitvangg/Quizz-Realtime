# 🚀 Hướng dẫn Triển khai VPS & Load Test (K6)

Tài liệu này hướng dẫn cách build, chạy ứng dụng bằng Docker và thực hiện các bài kiểm thử chịu tải.

## 1. Chuẩn bị trên VPS

### Cài đặt Docker & Docker Compose
Nếu VPS chưa có Docker, hãy chạy lệnh sau (Ubuntu):
```bash
sudo apt update
sudo apt install docker.io docker-compose -y
sudo systemctl start docker
sudo systemctl enable docker
```

### Thiết lập biến môi trường
Tạo file `.env` tại thư mục gốc của dự án:
```bash
# Backend
DATABASE_URL="postgresql://user:password@host:port/db?sslmode=require"
REDIS_PASSWORD=your_secure_password
JWT_KEY=your_secret_key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Frontend (Build Args)
NEXT_PUBLIC_API_URL=http://<YOUR_VPS_IP>:5000/
NEXT_PUBLIC_WS_URL=http://<YOUR_VPS_IP>:5000
```

## 2. Triển khai bằng Docker Compose

Chạy lệnh sau để build và khởi động toàn bộ hệ thống:
```bash
docker-compose up -d --build
```

- **Frontend:** Truy cập tại cổng `3000`
- **Backend:** Truy cập tại cổng `5000`
- **Redis:** Chạy nội bộ, cổng `6379` (đã có mật khẩu bảo vệ)

## 3. Quy trình Load Test bằng K6

### Cài đặt K6 (Local hoặc trên VPS)
Nếu chạy trực tiếp trên Linux:
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Chạy kịch bản Spam Socket
Kịch bản này giả lập 50 người dùng gửi liên tục hàng ngàn event `join_game`:
```bash
k6 run -e BASE_URL=ws://<YOUR_VPS_IP>:5000/socket.io/?EIO=4&transport=websocket load-tests/socket-spam.js
```

### Chạy kịch bản DDoS
Kịch bản này tấn công dồn dập vào API hệ thống (200 requests/giây) để kiểm tra cơ chế Auto-ban:
```bash
k6 run -e BASE_URL=http://<YOUR_VPS_IP>:5000 load-tests/ddos-attack.js
```

## 4. Kiểm tra kết quả (Admin OPS)
Sau khi chạy DDoS test, bạn hãy truy cập trang **Admin > System Operations** để kiểm tra:
1.  **Event Log:** Xem các thông báo `AUTO-BAN` có xuất hiện không.
2.  **IP Blacklist:** Kiểm tra danh sách các IP (từ K6) đã bị hệ thống tự động chặn.
3.  **Metrics:** Quan sát biểu đồ CPU/RAM xem hệ thống có bị quá tải không.

---
**Lưu ý:** Hãy cẩn thận khi chạy DDoS test trên môi trường Production thật vì nó có thể làm gián đoạn dịch vụ của người dùng thực.
