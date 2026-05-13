# 🎮 Realtime Quiz System — Architecture & Developer Guide

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Game Session Flow](#2-game-session-flow)
3. [Redis Data Schema](#3-redis-data-schema)
4. [Admin OPS — Incident Controls](#4-admin-ops--incident-controls)
5. [WebSocket Events Reference](#5-websocket-events-reference)
6. [Cài đặt & Chạy Local](#6-cài-đặt--chạy-local)

---

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                    │
│                                                             │
│  /room/[id]         /game/[sessionId]     /admin/system     │
│  (Waiting Room)     (Game Screen)         (OPS Dashboard)   │
│       │                    │                    │           │
│  RoomStore            GameStore            OPS Socket       │
└───────┼────────────────────┼────────────────────┼───────────┘
        │  WebSocket         │  WebSocket          │  WebSocket
        ▼                    ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (NestJS)                         │
│                                                             │
│  RoomGateway          GameGateway         DashboardGateway  │
│  /room namespace      /game namespace     /admin-ops ns     │
│       │                    │                    │           │
│  RoomService      GameSessionService    DashboardService    │
│                        │                    │              │
│                   RedisService ◄────────────┘              │
│                        │                                   │
│                   PrismaService (PostgreSQL)               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Game Session Flow

### 2.1. Tạo Room & Waiting

```
Host                  RoomGateway           DB (Prisma)
  │                        │                     │
  │── POST /room ──────────►                     │
  │                        │── INSERT Room ──────►
  │                        │◄── Room(pin) ────────
  │◄── { pin: "123456" } ──│                     │
  │                        │                     │
  │── WS: room:join ───────►                     │
  │   (hostId, pin)        │── UPDATE room.host ─►
  │◄── room:state ─────────│                     │
```

```
Player                RoomGateway
  │                        │
  │── WS: room:join ───────►
  │   (pin, nickname)      │── INSERT Player ─────►
  │◄── room:player_joined ─│                     │
  │                        │── broadcast all ─────►(Host thấy player list)
```

### 2.2. Bắt đầu Game

```
Host              GameGateway          GameSessionService      Redis
  │                    │                       │                 │
  │── WS: host_start_game ──────────────────►  │                 │
  │   (roomId, jwt)    │                       │                 │
  │                    │── startGame() ────────►                 │
  │                    │                       │── INSERT GameSession ──► DB
  │                    │                       │── INSERT PlayerSession x N ──► DB
  │                    │                       │── UPDATE Room.status = PLAYING ──► DB
  │                    │                       │                 │
  │                    │                       │── SET game:{id} ─►
  │                    │                       │   {                │
  │                    │                       │     status: QUESTION_ACTIVE
  │                    │                       │     currentQuestionIndex: 0
  │                    │                       │     questionStartedAt: <timestamp>
  │                    │                       │     timeLimit: 20
  │                    │                       │     questionIds: [...]
  │                    │                       │   }  EX 7200    │
  │                    │                       │── ZADD leaderboard:{id} ─► (score=0 cho mỗi player)
  │                    │◄── { session, firstQuestion } ─────────  │
  │                    │                       │                 │
  │                    │── emit game_starting ─►(tất cả /game socket)
  │                    │── countdown 5s ──────► (countdown_tick mỗi giây)
  │                    │── emit question_start ► (câu hỏi đầu tiên)
  │                    │── scheduleQuestionEnd ► (setTimeout 20s)
  │◄── question_start ─│                       │                 │
```

### 2.3. Question Timer & Answer Flow

```
┌──────────────────────────────────────────────────────────┐
│  Khi câu hỏi bắt đầu:                                    │
│                                                          │
│  Redis:  game:{sessionId}.questionStartedAt = now()      │
│          game:{sessionId}.timeLimit = 20 (giây)          │
│                                                          │
│  Memory: activeTimers.set(sessionId, {                   │
│    timeout: setTimeout(handleQuestionEnd, 20000),        │
│    scheduledAt: now(),                                   │
│    totalMs: 20000                                        │
│  })                                                      │
└──────────────────────────────────────────────────────────┘

Player              GameGateway          GameSessionService   Redis
  │                      │                      │               │
  │── WS: submit_answer ─►                      │               │
  │   (sessionId,        │                      │               │
  │    playerId,         │── submitAnswer() ────►               │
  │    questionId,       │                      │── GET game:{id}
  │    answerId)         │                      │◄── cache      │
  │                      │                      │               │
  │                      │                      │  Tính điểm:  │
  │                      │                      │  timeTaken = now - questionStartedAt
  │                      │                      │  timeBonus = (maxTime - timeTaken) / 10
  │                      │                      │  score = 1000 + timeBonus
  │                      │                      │               │
  │                      │                      │── ZINCRBY leaderboard:{id} score playerId
  │                      │                      │── INSERT PlayerAnswer ──► DB
  │                      │◄── { isCorrect, score } ───────────  │
  │◄── { success } ──────│                      │               │
  │                      │── emit score_update ─► (tất cả trong session)
```

### 2.4. Kết thúc câu hỏi (Timer hết)

```
setTimeout fires (sau 20s)
         │
         ▼
GameSessionService.handleQuestionEnd(sessionId)
         │
         ├── GET game:{sessionId} từ Redis
         ├── Lấy correctAnswer từ DB
         ├── getLeaderboard() từ Redis (ZREVRANGE)
         ├── UPDATE game cache: status = QUESTION_RESULT
         │
         └── callback → GameGateway.handleQuestionEnd()
                  │
                  ├── emit 'question_result' → tất cả client
                  │   { correctAnswer, leaderboard, isLastQuestion }
                  │
                  └── Nếu isLastQuestion → endGame()
                                │
                                ├── UPDATE GameSession.status = FINISHED ──► DB
                                ├── UPDATE Room.status = FINISHED ──► DB
                                └── emit 'game_ended' → tất cả client
```

### 2.5. Next Question (Host bấm tiếp)

```
Host bấm "Tiếp tục"
         │
         ▼
WS: host_next_question { sessionId }
         │
         ├── cancelTimer(sessionId)     ← xóa setTimeout cũ
         ├── nextQuestion()
         │   ├── currentIndex++
         │   ├── UPDATE GameSession.currentQuestionIndex ──► DB
         │   └── SET game:{sessionId} (index mới, questionStartedAt mới)
         │
         ├── emit 'question_start' → tất cả client
         └── scheduleQuestionEnd(nextQuestion.timeLimit, callback)
```

---

## 3. Redis Data Schema

### 3.1. Game Cache

```
KEY:   game:{sessionId}
TYPE:  String (JSON)
TTL:   7200s (2 giờ)

VALUE: {
  "sessionId": "uuid",
  "roomId": "uuid",
  "status": "QUESTION_ACTIVE" | "QUESTION_RESULT" | "FINISHED",
  "currentQuestionIndex": 0,
  "totalQuestions": 5,
  "questionStartedAt": 1715234567890,   ← timestamp ms, dùng tính điểm
  "timeLimit": 20,                       ← giây
  "questionIds": ["id1", "id2", ...]
}
```

### 3.2. Leaderboard

```
KEY:   leaderboard:{sessionId}
TYPE:  Sorted Set (ZSET)
TTL:   không set (tự xóa khi session kết thúc)

MEMBERS: playerId → score (số nguyên, tổng điểm)

Đọc:  ZREVRANGE leaderboard:{id} 0 99 WITHSCORES
Ghi:  ZINCRBY  leaderboard:{id} <score> <playerId>
```

### 3.3. Timer Pause (Freeze State)

```
KEY:   game:timer_pause:{sessionId}
TYPE:  String
TTL:   86400s (1 ngày)

VALUE: "12500"   ← milliseconds còn lại khi bị pause

Được set khi: OPS bật Hard Freeze
Được đọc khi: OPS tắt Hard Freeze → resume timer
Được xóa khi: Timer chạy hết tự nhiên
```

### 3.4. Timer Metadata

```
KEY:   game:timer_meta:{sessionId}
TYPE:  String (JSON)
TTL:   7200s

VALUE: {
  "totalMs": 20000,
  "scheduledAt": 1715234567890
}
```

### 3.5. System Config

```
KEY:   system:config:lockdown
TYPE:  String
TTL:   không set (persistent)

VALUE: "true" | "false"

Mục đích: Cờ toàn cục kiểm tra trước mọi join request
```

### 3.6. IP Blacklist

```
KEY:   blacklist:ips
TYPE:  Hash
TTL:   không set

FIELDS: {
  "192.168.1.100": '{"reason":"Auto-banned: DDoS","timestamp":1715234567890}',
  "10.0.0.5":      '{"reason":"Manual ban","timestamp":1715234567890}'
}

Đọc:  HGETALL blacklist:ips
Ghi:  HSET    blacklist:ips <ip> <json>
Xóa:  HDEL    blacklist:ips <ip>
Check: HEXISTS blacklist:ips <ip>
```

### 3.7. Rate Limiting (Sliding Window)

```
KEY:   ratelimit:{context}:{ip}
       VD: ratelimit:join:192.168.1.1
           ratelimit:answer:192.168.1.1
TYPE:  Sorted Set (ZSET)
TTL:   tự động expire sau window

Thuật toán: Lua Script — Sliding Window
- Xóa entries cũ hơn windowMs
- Đếm entries còn lại
- Nếu count < limit → cho phép + thêm entry
- Nếu count >= limit → từ chối
```

---

## 4. Admin OPS — Incident Controls

### 4.1. Kiến trúc OPS

```
OPS Admin Browser
        │
        ├── HTTP API (axios)  → IncidentController → DashboardService
        │                                                    │
        └── WebSocket         → DashboardGateway            │
            /admin-ops ns     ◄────────── broadcastEvent ───┘
                │
                └── Nhận: system:metrics (mỗi 3s), system:event (realtime)


DashboardService ──EventEmitter──► GameGateway ──WebSocket──► All Players
                                   /game namespace
```

### 4.2. Targeted Kill Switch

**Mục đích**: Ngắt kết nối toàn bộ người trong 1 room cụ thể mà không ảnh hưởng room khác.

```
POST /admin/system/incident/kill-switch
Body: { "pin": "123456" }   ← có pin = targeted
      { }                   ← không có pin = global (cực kỳ nguy hiểm)

Flow:
  DashboardService.activateKillSwitch(adminId, pin)
    │
    ├── broadcastEvent(CRITICAL, message)   → OPS Dashboard Event Log
    ├── eventEmitter.emit('system.incident.kill_switch', { pin })
    │       │
    │       └── GameGateway.handleKillSwitch()
    │               ├── Nếu có pin: server.in(pin).disconnectSockets(true)
    │               └── Nếu không:  server.disconnectSockets(true)
    │
    └── auditLog.logSecurityEvent(KILL_SWITCH)
```

> **Lưu ý**: `server.in(pin)` hoạt động vì khi Host/Player join game, socket được `client.join(sessionId)`. Kill Switch dùng Room PIN để map sang sessionId thông qua room data.

### 4.3. Hard Freeze (Lockdown)

**Mục đích**: Đóng băng toàn bộ game đang diễn ra, khóa màn hình người chơi, dừng timer câu hỏi. Khi tắt → game tiếp tục từ chỗ dừng.

```
POST /admin/system/incident/lockdown
Body: { "enable": true }   ← bật Freeze
      { "enable": false }  ← tắt Freeze

Flow Bật Freeze:
  DashboardService.setLockdown(adminId, true)
    │
    ├── redis.setSystemLockdown(true)     → Redis: system:config:lockdown = "true"
    ├── broadcastEvent(WARNING)           → OPS Event Log
    ├── eventEmitter.emit('system.incident.lockdown', { enable: true, message })
    │       │
    │       └── GameGateway.handleLockdown()
    │               ├── server.emit('system:freeze', { freeze: true, message })
    │               │       └── Frontend: FreezeOverlay hiển thị đè lên màn hình
    │               └── gameSessionService.pauseAllTimers()
    │                       ├── clearTimeout(mọi timer đang chạy)
    │                       └── redis.set('game:timer_pause:{id}', remainingMs)
    │
    └── auditLog.logSecurityEvent(LOCKDOWN_ENABLE)

Flow Tắt Freeze:
  DashboardService.setLockdown(adminId, false)
    │
    ├── redis.setSystemLockdown(false)
    ├── eventEmitter.emit('system.incident.lockdown', { enable: false })
    │       │
    │       └── GameGateway.handleLockdown()
    │               ├── server.emit('system:freeze', { freeze: false })
    │               │       └── Frontend: FreezeOverlay biến mất
    │               └── Với mỗi session có callback đã lưu:
    │                       ├── redis.get('game:timer_pause:{sessionId}') → remainingMs
    │                       ├── server.to(sessionId).emit('timer_resume', { remainingSeconds })
    │                       └── scheduleQuestionEnd(remainingSec, callback)  ← timer tiếp tục!
    │
    └── auditLog.logSecurityEvent(LOCKDOWN_DISABLE)
```

### 4.4. IP Auto-Ban & Blacklist

**Mục đích**: Tự động phát hiện và chặn IP tấn công DDoS/spam.

```
Lớp 1 — Connection (handleConnection):
  Client kết nối WebSocket
    │
    └── redis.isIpBanned(ip) → nếu true: client.disconnect(true) ngay lập tức

Lớp 2 — Join Game Rate Limit:
  WS: join_game
    │
    └── redis.checkRateLimit('join:{ip}', limit=10, window=5000ms)
          ├── Vượt ngưỡng nhẹ: reject với lỗi
          └── Vượt 50 lần: banIp() + disconnect + emit('system.incident.auto_ban')

Lớp 3 — Submit Answer Rate Limit:
  WS: submit_answer
    │
    └── redis.checkRateLimit('answer:{ip}', limit=5, window=1000ms)
          ├── Vượt ngưỡng nhẹ: reject
          └── Vượt 30 lần: banIp() + disconnect + emit('system.incident.auto_ban')

Auto-Ban Event Flow:
  GameGateway emit('system.incident.auto_ban', { ip, reason, count })
    │
    └── DashboardService.handleAutoBan()
          ├── broadcastEvent(CRITICAL)    → OPS Event Log (realtime)
          ├── auditLog.logSecurityEvent() → PostgreSQL
          └── notification.sendSecurityAlert() → Gmail (Nodemailer)
```

**Thuật toán Rate Limit — Sliding Window (Lua Script):**

```lua
-- Xóa requests cũ hơn window
ZREMRANGEBYSCORE key -inf (now - windowMs)
-- Đếm hiện tại
count = ZCARD key
-- Nếu còn chỗ: thêm request mới
if count < limit then
  ZADD key now "now:random"
  EXPIRE key (window + 1)
  return {1, count+1}  -- allowed
end
return {0, count}      -- rejected
```

### 4.5. Metrics Real-time

```
DashboardMetricsService (mỗi 3 giây)
    │
    ├── pidusage(process.pid) → CPU%, RAM bytes của Node.js process
    ├── os.freemem()          → RAM trống của hệ điều hành
    └── os.totalmem()         → RAM tổng của hệ điều hành

    └── DashboardGateway.broadcastMetrics()
              └── server.emit('system:metrics', data)
                        └── Frontend cập nhật realtime
```

### 4.6. Audit Log

Mọi hành động OPS đều được ghi vào bảng `audit_logs` (PostgreSQL):

| action | Khi nào |
|--------|---------|
| `KILL_SWITCH` | Admin kích hoạt Kill Switch |
| `LOCKDOWN_ENABLE` | Admin bật Hard Freeze |
| `LOCKDOWN_DISABLE` | Admin tắt Hard Freeze |
| `AUTO_IP_BAN` | Hệ thống tự động ban IP |
| `MANUAL_IP_BAN` | Admin ban IP thủ công |
| `IP_UNBAN` | Admin unban IP |

**API đọc log:**
```
GET /admin/system/audit-log/security?limit=50
```

---

## 5. WebSocket Events Reference

### 5.1. Namespace `/game` — Player/Host

| Event | Hướng | Payload | Mô tả |
|-------|-------|---------|-------|
| `host_join_game` | Client→Server | `{ sessionId, jwt }` | Host vào game |
| `host_start_game` | Client→Server | `{ roomId, jwt }` | Host bắt đầu |
| `host_next_question` | Client→Server | `{ sessionId }` | Chuyển câu tiếp |
| `host_end_game` | Client→Server | `{ sessionId }` | Kết thúc game |
| `join_game` | Client→Server | `{ sessionId, playerId, nickname }` | Player vào |
| `submit_answer` | Client→Server | `{ sessionId, playerId, questionId, answerId, clientTimestamp }` | Gửi đáp án |
| `game_starting` | Server→Client | `{ sessionId, countdown }` | Game sắp bắt đầu |
| `countdown_tick` | Server→Client | `{ remaining }` | Đếm ngược |
| `question_start` | Server→Client | `{ question, questionIndex, totalQuestions, serverTime }` | Câu hỏi mới |
| `question_result` | Server→Client | `{ correctAnswer, leaderboard, isLastQuestion }` | Kết quả câu |
| `score_update` | Server→Client | `{ playerId, score, leaderboard }` | Cập nhật điểm |
| `game_ended` | Server→Client | `{ leaderboard, totalQuestions }` | Game kết thúc |
| `system:freeze` | Server→Client | `{ freeze, message, timestamp }` | **OPS: Hard Freeze** |
| `timer_resume` | Server→Client | `{ remainingSeconds }` | **OPS: Resume sau Freeze** |

### 5.2. Namespace `/admin-ops` — OPS Dashboard

| Event | Hướng | Payload | Mô tả |
|-------|-------|---------|-------|
| `system:metrics` | Server→Client | `{ cpu, memory, freeMem, totalMem, uptime }` | Metrics mỗi 3s |
| `system:event` | Server→Client | `{ type, message, timestamp, user }` | Incident log |

### 5.3. HTTP API — Incident Controls

```
POST /admin/system/incident/kill-switch  { pin?: string }
POST /admin/system/incident/lockdown     { enable: boolean }
POST /admin/system/incident/ban-ip       { ip: string, reason?: string }
POST /admin/system/incident/unban-ip     { ip: string }
GET  /admin/system/incident/blacklist
GET  /admin/system/audit-log/security?limit=50
```

---

## 6. Cài đặt & Chạy Local

### Environment Variables (backend/.env)

```env
DATABASE_URL="postgresql://..."
PORT=5000
JWT_KEY=your-secret

REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USERNAME=your@gmail.com
SMTP_PASSWORD=your-app-password    # Google App Password (16 ký tự)
SMTP_FROMNAME=Security System
SMTP_FROMEMAIL=your@gmail.com
```

### Environment Variables (frontend/.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/
NEXT_PUBLIC_WS_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

### Chạy

```bash
# Terminal 1 — Backend
cd backend
npm run start:dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

### Verify Redis hoạt động

Mở terminal backend và quan sát log — mỗi 3 giây sẽ xuất hiện:
```
LOG [DashboardMetricsService] [Metrics] CPU: 0.12% | RAM: 131.4MB | System: 3.45GB free
```

### Test Incident Controls

**Test Hard Freeze:**
1. Tạo room, tham gia game (tab 1)
2. Vào `/admin/system` (tab 2)
3. Bật **Hard Freeze** → tab 1 hiển thị overlay đỏ, đồng hồ câu hỏi dừng lại
4. Tắt **Hard Freeze** → overlay biến mất, đồng hồ tiếp tục từ chỗ dừng

**Test IP Ban:**
```bash
# Gửi spam request liên tục
for i in {1..60}; do
  curl -X POST http://localhost:5000/socket.io/?EIO=4&transport=polling
done
```
IP của máy bạn sẽ xuất hiện trong bảng **IP Blacklist** trên OPS Dashboard.

**Test Email Alert:**
Mở OPS Dashboard → ban thủ công 1 IP → kiểm tra hộp thư `SMTP_FROMEMAIL`.
