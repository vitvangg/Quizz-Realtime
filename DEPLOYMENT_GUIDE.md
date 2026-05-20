# Hướng Dẫn Triển Khai Production (VPS, Domain, SSL) Mới Nhất

Hệ thống hiện tại đã được cấu hình tối ưu bằng Docker Compose bao gồm: **Next.js (Frontend)**, **NestJS (Backend)**, và **Nginx (Reverse Proxy)** làm cửa ngõ duy nhất ở cổng 80.

Sau đây là lộ trình toàn diện từ lúc mới mua VPS, gắn tên miền, đến khi chạy production thực tế.

---

## 1. Chuẩn Bị Server & Domain

1. **Thuê VPS:** Mua một VPS cài đặt hệ điều hành **Ubuntu 22.04 LTS**.
2. **Mua Tên Miền:** Mua một tên miền (Ví dụ: `minikahoot.com`).
3. **Trỏ DNS (Domain Name System):**
   - Truy cập trang quản lý tên miền.
   - Thêm bản ghi **A Record**:
     - Host/Tên: `@`
     - Giá trị/IP: `[IP_CỦA_VPS]`
   - Thêm bản ghi **A Record** cho `www` (Tuỳ chọn):
     - Host/Tên: `www`
     - Giá trị/IP: `[IP_CỦA_VPS]`

---

## 2. Cài Đặt Môi Trường Cơ Bản Trên VPS

SSH vào VPS và chạy các lệnh sau:

```bash
# 1. Cập nhật hệ điều hành
sudo apt update && sudo apt upgrade -y

# 2. Cài đặt Docker & Docker Compose
curl -fsSL https://get.docker.com | sh

# 3. Phân quyền Docker cho user hiện tại (không cần gõ sudo)
sudo usermod -aG docker $USER
newgrp docker

# 4. Cài đặt Git
sudo apt install git -y
```

---

## 3. Triển Khai Mã Nguồn (Lần Đầu)

```bash
# 1. Clone mã nguồn
git clone https://github.com/<your-username>/Quizz-Realtime.git
cd Quizz-Realtime

# 2. Tạo file cấu hình môi trường (.env)
nano .env
```

Dán nội dung cấu hình vào file `.env`.
**ĐIỂM QUAN TRỌNG:** Ở bước này, cập nhật các biến `NEXT_PUBLIC` trỏ về Tên miền của bạn thay vì `localhost`.

```env
# Database & Redis (Trỏ tới Neon DB & Redis Cloud của bạn)
DATABASE_URL="postgresql://user:pass@host/db..."
REDIS_HOST=...
REDIS_PORT=...
REDIS_PASSWORD=...

# NextJS gọi API thông qua Nginx (cùng domain)
# Lưu ý: Không cần /api ở đây vì frontend gọi /api/... sẽ tự động vào Nginx, 
# sau đó Nginx tự rewrite và gửi cho backend.
NEXT_PUBLIC_API_URL=http://minikahoot.com
NEXT_PUBLIC_WS_URL=http://minikahoot.com

# CORS cho Backend
CORS_ORIGIN=http://minikahoot.com
```

Lưu file (Ctrl + O -> Enter -> Ctrl + X).

---

## 4. Cấu Hình Nginx Của Tên Miền

Sửa file `nginx/default.conf` trong source code:

```bash
nano nginx/default.conf
```

Tìm dòng `server_name _;` và đổi thành tên miền của bạn:

```nginx
server {
  listen 80 default_server;
  server_name minikahoot.com www.minikahoot.com; # <--- ĐỔI Ở ĐÂY
  # ... giữ nguyên các cấu hình còn lại
```

Lưu file lại.

---

## 5. Khởi Động Hệ Thống (Auto-Restart)

Nhờ thiết lập `restart: always` trong `docker-compose.yml`, Docker sẽ **tự động khởi động lại toàn bộ hệ thống** nếu VPS bị sập, khởi động lại, hoặc container bị crash.

Chạy lệnh sau để build và chạy ngầm toàn bộ:

```bash
docker compose up -d --build
```

Kiểm tra xem các container đã chạy ổn chưa:

```bash
docker compose ps
docker compose logs -f backend
```

Bây giờ bạn đã có thể truy cập `http://minikahoot.com` !

---

## 6. Cài Đặt SSL (HTTPS) Chuyên Nghiệp

Để website có bảo mật ổ khóa xanh (HTTPS), chúng ta sẽ cài đặt Certbot trực tiếp trên VPS để nó chặn qua cổng 80 và sinh chứng chỉ, sau đó Nginx sẽ sử dụng chứng chỉ này.

### Phương Án 1: Dùng Cloudflare (Khuyên Dùng - Dễ Nhất)

Đây là cách phổ biến và dễ nhất cho ứng dụng Docker.
1. Đăng ký tài khoản Cloudflare và chuyển Nameservers của domain về Cloudflare.
2. Bật tab **SSL/TLS** -> Chọn chế độ **Flexible** hoặc **Full**.
3. **Xong!** Bạn không cần cài bất kỳ chứng chỉ nào trên VPS, Cloudflare tự động bọc HTTPS cho tên miền của bạn. Mọi request từ User -> HTTPS Cloudflare -> HTTP VPS (Nginx).

### Phương Án 2: Dùng Certbot tự sinh chứng chỉ trên VPS

Nếu bạn không dùng Cloudflare, bạn làm theo các bước sau:

**Bước 1: Sửa Nginx Config để nhận HTTPS**
Bạn mở file `nginx/default.conf` và cập nhật để Nginx trỏ vào chứng chỉ:

```nginx
server {
    listen 80;
    server_name minikahoot.com www.minikahoot.com;
    
    # Tự động redirect HTTP sang HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name minikahoot.com www.minikahoot.com;

    # Trỏ đến file chứng chỉ mà Certbot sẽ tạo ra
    ssl_certificate /etc/letsencrypt/live/minikahoot.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/minikahoot.com/privkey.pem;

    # ... Bê toàn bộ location /api, location /socket.io, location / ở bản hiện tại xuống đây
}
```

**Bước 2: Cài Certbot và Mount thư mục vào Docker**

Cài Certbot trên máy chủ Ubuntu:
```bash
sudo apt install certbot -y
```

Tạm tắt Nginx container để nhường cổng 80 cho Certbot xác minh:
```bash
docker compose stop nginx
sudo certbot certonly --standalone -d minikahoot.com -d www.minikahoot.com
```

**Bước 3: Mount chứng chỉ vào Docker Compose**
Sửa file `docker-compose.yml`, ở phần `nginx`:

```yaml
  nginx:
    # ...
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      # Thêm dòng này để đưa chứng chỉ từ Ubuntu vào trong Nginx Docker
      - /etc/letsencrypt:/etc/letsencrypt:ro 
    ports:
      - "80:80"
      - "443:443" # Bật thêm port HTTPS
```

Bật lại Nginx:
```bash
docker compose up -d nginx
```

---

## 7. Quy Trình Cập Nhật Chức Năng Mới (CI/CD Bằng Tay)

Sau này khi bạn sửa code ở máy tính (Local) và push lên Github, cách để cập nhật lên VPS cực kỳ đơn giản:

```bash
# 1. SSH vào VPS và vào thư mục
cd Quizz-Realtime

# 2. Lấy code mới nhất
git pull origin main

# 3. Build lại đúng service bạn thay đổi (VD: bạn sửa frontend)
docker compose up -d --build frontend

# (Hoặc build lại tất cả nếu sửa nhiều)
docker compose up -d --build
```

Nhờ kiến trúc này, khi bạn build container mới, container cũ vẫn chạy. Đến khi build xong, Docker mới tắt cái cũ và bật cái mới, mang lại tính năng **Zero-Downtime** mượt mà cho trải nghiệm người dùng!
