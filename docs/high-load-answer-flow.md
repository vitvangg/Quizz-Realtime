# Phân tích Kiến trúc High-Load: 1000–10000 Players Trả Lời Đồng Thời

> **Phạm vi:** Phân tích luồng submit câu trả lời, cách leaderboard được cập nhật với độ trễ tối thiểu, cách load balancer hoạt động, và đặc biệt là các bottleneck hiện tại của codebase khi scale lên 1000–10000 players đồng thời.

---

## Mục lục

1. [Luồng Submit Answer — Từ Client Đến Redis](#1-luồng-submit-answer)
2. [Kiến trúc Redis Buffer & Leaderboard](#2-kiến-trúc-redis-buffer--leaderboard)
3. [Vấn đề Bottleneck Hiện Tại](#3-vấn-đề-bottleneck-hiện-tại)
4. [Load Balancer — Socket.io Redis Adapter](#4-load-balancer--socketio-redis-adapter)
5. [Cập Nhật Leaderboard Với Độ Trễ Thấp Nhất](#5-cập-nhật-leaderboard-với-độ-trễ-thấp-nhất)
6. [Mở Rộng Lên 10000 Players](#6-mở-rộng-lên-10000-players)
7. [Roadmap Cải Tiến](#7-roadmap-cải-tiến)

---

## 1. Luồng Submit Answer

### 1.1 Sơ đồ tuần tự — 1000 Players Cùng Gửi

```
Player 1 ──┐
Player 2 ──┤
  ...     │  WebSocket submit_answer
Player N ─┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│                  NestJS Instance A (hoặc B, C...)              │
│                                                              │
│  GameGateway → AnswerHandler.handleSubmitAnswer()             │
│                                                              │
│  ① Rate limit check (Redis Lua script)                         │
│     ├─ ZREMRANGEBYSCORE (sliding window)                     │
│     ├─ ZCARD → count                                         │
│     ├─ ZADD new entry                                        │
│     └─ ← { allowed: true/false }                             │
│                                                              │
│  ② Validate active question (In-Memory Map ⚠️)               │
│     ├─ GameService.activeQuestions.get(roomId)                │
│     └─ ← ActiveQuestion { sessionId, questionId, startedAt }   │
│                                                              │
│  ③ Validate: đúng question, chưa hết giờ                    │
│                                                              │
│  ④ Redis SETNX — Atomic deduplication (answered key)         │
│     ├─ SETNX answered:{sessionId}:{questionId}:{playerId}     │
│     ├─ Nếu wasSet=1 → chưa trả lời, tiếp tục                │
│     └─ Nếu wasSet=0 → đã trả lời rồi → reject              │
│                                                              │
│  ⑤ LPUSH — Buffer answer vào Redis (O(1))                   │
│     ├─ LPUSH buffer:{sessionId}:{questionId} JSON            │
│     └─ EXPIRE buffer 600s                                     │
│                                                              │
│  ⑥ ZADD — Cập nhật leaderboard score (O(log N))             │
│     ├─ ZINCRBY lb:{sessionId} {deltaScore} {playerId}        │
│     └─ Chỉ cập nhật nếu đáp án đúng                         │
│                                                              │
│  ⑦ ACK về client (< 10ms)                                    │
│     └─ answer:received { estimatedScore, responseTimeMs }    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Chi tiết mã nguồn — AnswerHandler

**File:** `backend/src/game/handlers/answer.handler.ts`

```typescript
async handleSubmitAnswer(client: Socket, payload: SubmitAnswerPayload, server: Server) {
  // ─── ① Rate limit (Lua script — atomic) ────────────────────────
  const rateLimit = await this.redis.checkRateLimit(playerId);
  if (!rateLimit.allowed) throw new WsException({ code: 'RATE_LIMITED', ... });

  // ─── ② Get active question (⚠️ In-Memory — bottleneck!) ────────
  const activeQuestion = await this.gameService.getActiveQuestion(roomId);
  if (!activeQuestion) throw new WsException({ code: 'NO_ACTIVE_QUESTION', ... });

  // ─── ③ Time validation ────────────────────────────────────────
  const elapsedMs = Date.now() - activeQuestion.startedAt;
  if (elapsedMs > activeQuestion.durationMs)
    throw new WsException({ code: 'TIME_EXPIRED', ... });

  // ─── ④ Atomic deduplication (SETNX) ──────────────────────────
  const { isFirst } = await this.redis.checkAndSetAnswered(
    sessionId, questionId, playerId, answerPayload,
  );
  if (!isFirst) throw new WsException({ code: 'ALREADY_ANSWERED', ... });

  // ─── ⑤ Buffer answer (LPUSH) ──────────────────────────────────
  await this.redis.bufferAnswer(sessionId, questionId, answerPayload);

  // ─── ⑥ Leaderboard update (ZINCRBY) ──────────────────────────
  // NOTE: Điểm chỉ được cộng khi đáp án đúng
  // Score được tính trong flushAnswersAndCalculateScores()

  // ─── ⑦ ACK ngay về client ─────────────────────────────────────
  return {
    event: 'answer:received',
    data: { success: true, responseTimeMs: elapsedMs, estimatedScore },
  };
}
```

### 1.3 Redis Lua Script cho Rate Limit

**File:** `backend/src/redis/redis.service.ts` (dòng 146–200)

```lua
-- Sliding window rate limiter — atomic trong 1 Redis command
-- KEYS[1] = ratelimit:{playerId}
-- ARGV[1] = now (timestamp ms)
-- ARGV[2] = window (1000ms)
-- ARGV[3] = limit (5 requests/window)

ZREMRANGEBYSCORE KEY -inf now-window        -- Xóa entries cũ
ZCARD KEY                                    -- Đếm entries hiện tại

if count < limit then
  ZADD KEY now now:random                    -- Thêm entry mới
  EXPIRE KEY window+1                        -- Set TTL
  return {1, limit-count-1, now+window}     -- allowed, remaining, reset
else
  oldest = ZRANGE KEY 0 0 WITHSCORES        -- Lấy entry cũ nhất
  reset = oldest[2] + window
  return {0, 0, reset}                       -- rejected
end
```

**Đặc điểm:**
- Atomic — không có race condition giữa ZREMRANGEBYSCORE và ZADD
- Sliding window — không có vấn đề "burst" ở boundary
- 5 requests/giây/player — đủ để chống spam, không gây chậm người chơi thật

---

## 2. Kiến trúc Redis Buffer & Leaderboard

### 2.1 Cấu trúc Redis Keys cho Game

```
┌─────────────────────────────────────────────────────────────────┐
│                    REDIS KEYS — GAME                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ ANSWER BUFFER ───────────────────────────────────────────┐  │
│  │                                                             │  │
│  │  buffer:{sessionId}:{questionId}     LIST                 │  │
│  │  ├─ "[{playerId, answerId, responseTimeMs, timestamp}]"  │  │
│  │  ├─ "..."                                                │  │
│  │  └─ LPUSH (front) / LRANGE 0 -1 (read)                  │  │
│  │  TTL: 600s (10 phút)                                     │  │
│  │                                                             │  │
│  │  → Mỗi player submit: LPUSH 1 entry                      │  │
│  │  → Flush: LRANGE → DEL → batch insert DB                 │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ ANSWER DEDUPLICATION ───────────────────────────────────┐  │
│  │                                                             │  │
│  │  answered:{sessionId}:{questionId}:{playerId}  STRING     │  │
│  │  Value: JSON payload                                       │  │
│  │  TTL: 120s                                                │  │
│  │                                                             │  │
│  │  SETNX — chỉ set nếu chưa tồn tại                        │  │
│  │  → Atomic: không race condition "trùng câu trả lời"       │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ LEADERBOARD ─────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │  lb:{sessionId}                           ZSET              │  │
│  │  ├─ score: playerId                                           │  │
│  │  ├─ "1000:player-1"                                         │  │
│  │  ├─ "950:player-2"                                         │  │
│  │  └─ "900:player-N"                                         │  │
│  │                                                             │  │
│  │  ZINCRBY lb:{sessionId} {delta} {playerId}  ← update score │  │
│  │  ZREVRANGE lb:{sessionId} 0 9 WITHSCORES  ← top 10       │  │
│  │  ZREVRANK lb:{sessionId} {playerId}     ← rank của player │  │
│  │  ZSCORE lb:{sessionId} {playerId}       ← score của player│  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ RATE LIMIT ──────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │  ratelimit:{playerId}                    ZSET              │  │
│  │  ├─ score: timestamp                                        │  │
│  │  └─ member: timestamp:random                                │  │
│  │  TTL: 2s                                                   │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ ROOM STATE (cho join/leave) ─────────────────────────────┐  │
│  │                                                             │  │
│  │  room:{pin}                              HASH             │  │
│  │  room:{pin}:players                     HASH              │  │
│  │  socket:{socketId}                      STRING            │  │
│  │                                                             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Tại sao dùng Buffer thay vì ghi trực tiếp vào DB?

| Vấn đề | Giải pháp Buffer |
|---|---|
| **1000 answers cùng lúc** | Redis LPUSH O(1), không có lock contention |
| **DB connection exhaustion** | Batch 100-500 rows/request thay vì 1000 individual INSERT |
| **Latency spike** | ACK ngay từ Redis (< 5ms), DB write là async |
| **Race condition trùng câu trả lời** | Redis SETNX atomic |
| **Điểm cần tính toán** | Lua script trong Redis, atomic |

### 2.3 Flush Buffer — Batch Insert vào DB

**File:** `backend/src/game/game.service.ts` (dòng 622–658)

```typescript
async flushAnswersAndCalculateScores(
  sessionId: string,
  questionId: string,
  correctAnswerId: string,
  bufferedAnswers: AnswerPayload[],
) {
  const results = [];

  for (const answer of bufferedAnswers) {
    const isCorrect = answer.answerId === correctAnswerId;

    // Score formula: 1000 - (elapsedMs / 10), min 100 nếu đúng
    const scoreEarned = isCorrect
      ? Math.max(100, 1000 - Math.floor(answer.responseTimeMs / 10))
      : 0;

    results.push({ playerId, scoreEarned, isCorrect, responseTimeMs });

    // Update leaderboard
    if (isCorrect) {
      await this.redis.updateScore(sessionId, answer.playerId, scoreEarned);
    }
  }

  // sau đó batch insert vào DB (PlayerAnswer records)
  // → Prisma: playerAnswer.createMany()
}
```

---

## 3. Vấn đề Bottleneck Hiện Tại

> ⚠️ **Cảnh báo:** Đây là các vấn đề nghiêm trọng trong codebase hiện tại nếu muốn scale lên 1000+ players.

### 3.1 Bottleneck #1 — `activeQuestions` In-Memory (CRITICAL)

**File:** `backend/src/game/game.service.ts` (dòng 14, 573–612)

```typescript
export class GameService {
  // ⚠️ IN-MEMORY — KHÔNG SHARED GIỮA CÁC INSTANCES!
  private activeQuestions = new Map<string, ActiveQuestion>();
}
```

**Vấn đề:**
```
Instance A                      Instance B
    │                               │
    │ Host bắt đầu câu hỏi         │
    │ setActiveQuestion(roomId, q)  │
    │ → activeQuestions.set()       │
    │                               │
    │ Player 500 kết nối đến A      │
    │ submit_answer → Instance A ✅  │
    │                               │
    │ Player 600 kết nối đến B      │
    │ submit_answer → Instance B ❌
    │ → getActiveQuestion(roomId)
    │ → activeQuestions.get(roomId)
    │ → undefined! (instance B không có)
    │ → NO_ACTIVE_QUESTION
```

**Hậu quả:** Trong multi-instance, **player có thể không submit được câu trả lời** nếu không kết nối đúng instance đang host câu hỏi.

**Giải pháp:** Di chuyển `activeQuestions` vào Redis:

```typescript
// Trong RedisService
async setActiveQuestion(roomId: string, data: ActiveQuestion): Promise<void> {
  const key = `game:active:${roomId}`;
  await this.client.hset(key, {
    sessionId: data.sessionId,
    questionId: data.questionId,
    startedAt: data.startedAt.toString(),
    durationMs: data.durationMs.toString(),
    questionIndex: data.questionIndex.toString(),
  });
  await this.client.expire(key, 3600); // 1h
}

async getActiveQuestion(roomId: string): Promise<ActiveQuestion | null> {
  const key = `game:active:${roomId}`;
  const data = await this.client.hgetall(key);
  if (!data || Object.keys(data).length === 0) return null;
  return {
    sessionId: data.sessionId,
    questionId: data.questionId,
    startedAt: parseInt(data.startedAt),
    durationMs: parseInt(data.durationMs),
    questionIndex: parseInt(data.questionIndex),
  };
}
```

### 3.2 Bottleneck #2 — `SocketStateService` In-Memory (CRITICAL)

**File:** `backend/src/game/services/socket-state.service.ts`

```typescript
export class SocketStateService {
  // ⚠️ IN-MEMORY — CHỈ TRÊN 1 INSTANCE!
  private socketInfoMap = new Map<string, SocketInfo>();
  private playerSocketMap = new Map<string, string>();
  private roomHostMap = new Map<string, string>();
}
```

**Vấn đề:**
```
Instance A                      Instance B
    │                               │
    │ Player join → Instance A      │
    │ registerPlayer(socketA, ...)  │
    │                               │
    │ Player 200 join → Instance A  │
    │ ✅ getSocketInfo() works      │
    │                               │
    │ Host kick Player 200          │
    │ → Host ở Instance A          │
    │ → SocketState lookup OK       │
    │                               │
    │ Player 500 join → Instance B  │
    │ registerPlayer(socketB, ...)  │
    │                               │
    │ Host ở Instance A kick P.500  │
    │ → getPlayerSocketId(playerId) │
    │ → lookup ở Instance A        │
    │ → Player 500 ở Instance B ❌  │
    │ → undefined! Socket not found │
```

**Giải pháp:** Thay hoàn toàn bằng Redis operations (đã có sẵn trong `RedisService`):

```typescript
// Sử dụng Redis thay vì SocketStateService
// Đã implement trong RedisService:
async addPlayerToRoom(pin, socketId, playerData)
async getPlayerBySocket(socketId)
async isHostSocket(socketId, pin)
async getSocketRoom(socketId)
```

> **Lưu ý:** Code hiện tại có DUAL state — vừa dùng `SocketStateService` (in-memory) trong `AnswerHandler`/`HostHandler`/`PlayerHandler`, vừa dùng `RedisService` trong `RoomHandler`. Đây là inconsistency nghiêm trọng cần consolidate.

### 3.3 Bottleneck #3 — Socket.io Fan-out khi Broadcast

**Vấn đề:**

```
Khi 1 câu hỏi kết thúc, cần broadcast kết quả cho N players:

Instance A (1000 players) ──→ server.to('room:{id}').emit('question:end', ...)
                               │
                               ├──→ WebSocket msg → Player 1
                               ├──→ WebSocket msg → Player 2
                               ├──→ ...
                               └──→ WebSocket msg → Player 1000
                               
Thời gian fan-out: ~50ms cho 1000 clients (single instance)
Thời gian fan-out: ~50ms × M instances (M instances cùng broadcast)
```

**Vấn đề với 10000 players:**
- Mỗi WebSocket message phải được gửi riêng lẻ
- CPU bound trên instance phát sóng
- Với 10 instances × 1000 players = 10 × 50ms = 500ms để broadcast hết

**Giải pháp:** Xem phần 5.

### 3.4 Bottleneck #4 — Prisma Batch Insert

**Vấn đề:**

```typescript
// Hiện tại: insert từng PlayerAnswer một
for (const answer of bufferedAnswers) {
  await this.prisma.playerAnswer.create({ data: answerRecord });
}
```

Với 1000 players → 1000 individual DB writes → ~200-500ms → latency cao.

**Giải pháp:**

```typescript
// Tốt hơn: batch insert
await this.prisma.playerAnswer.createMany({
  data: answerRecords,  // 1 round-trip cho 1000 rows
});

// Hoặc với prisma.$executeRawBatch (thậm chí nhanh hơn)
await this.prisma.$executeRaw`
  INSERT INTO player_answers (id, player_session_id, ...)
  VALUES ${Prisma.join(answerRecords.map(r => Prisma.sql`(${r})`))}
```

### 3.5 Tổng hợp Bottleneck

| Bottleneck | Mức độ | Ảnh hưởng | Giải pháp |
|---|---|---|---|
| `activeQuestions` in-memory | **CRITICAL** | Multi-instance: player không submit được | Redis HASH |
| `SocketStateService` in-memory | **CRITICAL** | Multi-instance: kick/leave không hoạt động | Chỉ dùng Redis |
| Fan-out broadcast 10K players | HIGH | Trễ broadcast, CPU spike | Redis Pub/Sub + sharding |
| Prisma individual insert | MEDIUM | DB latency ~200-500ms | `createMany` batch |
| No sticky sessions | MEDIUM | Socket state không sync | Redis state (khi đã fix) |
| No connection pooling tuning | LOW | Connection exhaustion | PgBouncer |

---

## 4. Load Balancer — Socket.io Redis Adapter

### 4.1 Cách Hoạt Động

**File:** `backend/src/game/game.gateway.ts` (dòng 31–60)

```typescript
async afterInit(server: Server) {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    this.logger.warn('Redis not configured - running without Redis adapter');
    return;
  }

  const redisConfig = this.parseRedisUrl(redisUrl);

  try {
    const Redis = require('ioredis');
    const { createAdapter } = require('socket.io-redis-adapter');

    // 2 Redis clients — 1 cho publish, 1 cho subscribe
    const pubClient = new Redis({ host, port, password, tls });
    const subClient = pubClient.duplicate();

    await pubClient.ping();
    this.logger.log('Redis adapter connected');

    // Gắn Redis adapter vào Socket.io server
    server.adapter(createAdapter(pubClient, subClient));
  } catch (error) {
    this.logger.error('Failed to connect Redis adapter:', error.message);
  }
}
```

### 4.2 Sơ đồ Load Balancer

```
                          ┌──────────────────────────────────────────────────┐
                          │                    Redis                           │
                          │                                                   │
                          │  Pub/Sub channel: "room:{roomId}"               │
                          │  State: room:{pin}, lb:{sessionId}               │
                          └───────────────┬──────────────────────────────────┘
                          PubClient ▲      │     ▲ SubClient
                          pub/sub    │      │      │
                          ───────────┘      │      └─────────────
                                           │
                    ┌──────────────────────┼──────────────────────────┐
                    │                      │                          │
             ┌──────▼──────┐        ┌──────▼──────┐         ┌───────▼──────┐
             │  Instance A │        │  Instance B │         │  Instance C  │
             │  (NestJS)   │        │  (NestJS)   │         │  (NestJS)    │
             │             │        │             │         │              │
             │ Players     │        │ Players     │         │ Players      │
             │ 1-333       │        │ 334-666     │         │ 667-1000     │
             │             │        │             │         │              │
             │ activeQ: {} │        │ activeQ: {} │         │ activeQ: {}  │
             │ ⚠️ in-memory│        │ ⚠️ in-memory│         │ ⚠️ in-memory │
             └─────────────┘        └─────────────┘         └──────────────┘
                   │                      │                        │
                   └──────────────────────┼────────────────────────┘
                                          │
                         ┌────────────────▼────────────────┐
                         │       Load Balancer              │
                         │  (Nginx / Cloud LB / Kubernetes) │
                         │                                 │
                         │  Sticky sessions: BẬT (cookies) │
                         │  hoặc: TẮT + dùng Redis state  │
                         └─────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
              ┌─────▼─────┐         ┌─────▼─────┐        ┌─────▼──────┐
              │  Player 1  │         │ Player 2  │        │ Player 3   │
              │ (Chrome)   │         │ (Mobile)  │        │ (Tab mới)  │
              └───────────┘         └───────────┘        └────────────┘
```

### 4.3 Socket.io Redis Adapter — Chi Tiết

**Không có Redis Adapter:**
```
Player 1 → Instance A  ──→  client.join('room:X')
Player 2 → Instance A  ──→  client.join('room:X')
Player 3 → Instance B  ──→  client.join('room:X')  ← B không biết A có members
Player 4 → Instance C  ──→  client.join('room:X')  ← C không biết A/B có members

Instance A: server.to('room:X').emit('question:end', ...)
→ Chỉ gửi đến Player 1, 2 (cùng instance)
→ Player 3, 4 KHÔNG NHẬN ĐƯỢC! ❌
```

**Có Redis Adapter:**
```
Player 1 → Instance A  ──→  client.join('room:X')
  → Adapter gửi "join room:X" lên Redis Pub/Sub
  → Instance B, C nhận được notification
  → B, C thêm Player 1 vào local socket room mapping

Player 2 → Instance B  ──→  client.join('room:X')
  → Tương tự, A, C biết Player 2

Instance A: server.to('room:X').emit('question:end', ...)
  → Adapter gửi message lên Redis Pub/Sub
  → B, C nhận được và forward đến local clients
  → Player 1, 2, 3, 4 ĐỀU NHẬN ĐƯỢC! ✅
```

### 4.4 Sticky Sessions — Có Nên Dùng?

| Chế độ | Ưu điểm | Nhược điểm |
|---|---|---|
| **Sticky Sessions BẬT** | Đơn giản, không cần sync state | Player luôn đến cùng instance; 1 instance quá tải = không cân bằng |
| **Sticky Sessions TẮT** | Cân bằng tải tốt hơn | Cần shared state (Redis) cho mọi thứ |
| **Hybrid (Khuyến nghị)** | Host sticky (luôn cùng instance để control game flow) | Players không sticky, dùng Redis state |

**Khuyến nghị cho project này:**
- **Host:** Sticky session (đảm bảo host + question control cùng instance)
- **Players:** Không sticky (cân bằng tải), dùng Redis state cho mọi lookup

---

## 5. Cập Nhật Leaderboard Với Độ Trễ Thấp Nhất

### 5.1 Write Path — Điểm Số Được Ghi Như Thế Nào

```
Player submit answer đúng
    │
    │  (đợi đến khi câu hỏi kết thúc — handleQuestionEnd được gọi)
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ AnswerHandler.handleQuestionEnd()                            │
│                                                              │
│  1. Flush buffer: LRANGE + DEL (Redis)                       │
│     └─ Lấy tất cả buffered answers từ Redis                 │
│                                                              │
│  2. Tính điểm: scoreEarned = 1000 - floor(responseTime/10)  │
│     ├─ Trả lời trong 500ms → 950 điểm                      │
│     ├─ Trả lời trong 5s    → 500 điểm                      │
│     └─ Trả lời sai          → 0 điểm                        │
│                                                              │
│  3. Batch INSERT PlayerAnswer vào PostgreSQL (Prisma)        │
│                                                              │
│  4. ZINCRBY cho từng đáp án đúng:                           │
│     └─ Redis: ZINCRBY lb:{sessionId} {scoreEarned} {playerId}│
│                                                              │
│  5. Broadcast 'question:end' với top 10:                    │
│     └─ Redis: ZREVRANGE lb:{sessionId} 0 9 WITHSCORES        │
│     └─ Gửi đến tất cả players qua Socket.io                 │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Read Path — Top 10 Leaderboard

```typescript
// backend/src/game/handlers/answer.handler.ts (dòng 192–205)
async handleGetLeaderboard(client: Socket, sessionId: string) {
  // Redis ZREVRANGE — O(log N + M) với M=10 → gần như O(1)
  const topScores = await this.redis.getTopScores(sessionId, 10);

  // Enrich với nickname từ DB (cache được)
  const enriched = await this.gameService.enrichLeaderboard(topScores);

  return {
    event: 'leaderboard:update',
    data: { sessionId, leaderboard: enriched, updatedAt: Date.now() },
  };
}
```

**Độ phức tạp:** `ZREVRANGE lb:sessionId 0 9 WITHSCORES` → ~0.1ms với 10000 players trên Redis.

### 5.3 Broadcast Leaderboard Cho 1000–10000 Players

**Vấn đề cốt lõi:** Socket.io fan-out gửi message riêng cho từng client.

```
Traditional approach (HIGH LATENCY):
  for each player in room:
    send WebSocket message
  → 1000 players = 1000 WebSocket writes
  → ~50ms với 1 instance

Redis Pub/Sub approach (LOW LATENCY):
  1. Host instance publish 'leaderboard:{sessionId}' lên Redis
  2. Mỗi instance nhận qua subClient
  3. Mỗi instance broadcast đến local clients
  → chỉ 1 Redis publish, N instances tự forward
```

**Cải tiến đề xuất — Redis Pub/Sub cho Leaderboard:**

```typescript
// Tạo 1 Pub/Sub channel riêng cho leaderboard updates
async broadcastLeaderboardUpdate(sessionId: string, roomId: string) {
  const topScores = await this.redis.getTopScores(sessionId, 10);
  const enriched = await this.gameService.enrichLeaderboard(topScores);

  // Publish lên Redis channel
  const channel = `lb:update:${sessionId}`;
  await this.redis.getClient().publish(channel, JSON.stringify({
    leaderboard: enriched,
    updatedAt: Date.now(),
  }));

  // Cùng instance: gửi trực tiếp
  this.server.to(`room:${roomId}`).emit('leaderboard:update', {
    sessionId, leaderboard: enriched,
  });
}

// Sau đó mỗi instance subscribe:
// subClient.subscribe('lb:update:*', (channel, message) => {
//   const sessionId = extractSessionId(channel);
//   this.server.to(`room:${sessionId}`).emit('leaderboard:update', JSON.parse(message));
// });
```

### 5.4 Score Formula — Chi Tiết

```typescript
function calculateScore(isCorrect: boolean, responseTimeMs: number): number {
  if (!isCorrect) return 0;

  const BASE_SCORE = 1000;       // Điểm tối đa
  const PENALTY_PER_10MS = 1;   // Mỗi 10ms trừ 1 điểm
  const MIN_SCORE = 100;        // Tối thiểu vẫn được 100 điểm

  const penalty = Math.floor(responseTimeMs / 10);
  return Math.max(MIN_SCORE, BASE_SCORE - penalty);
}

// Ví dụ:
// Trả lời đúng trong   500ms  → 1000 - 50  =   950 điểm
// Trả lời đúng trong  2,000ms  → 1000 - 200 =   800 điểm
// Trả lời đúng trong  9,000ms  → 1000 - 900 =   100 điểm (floor)
// Trả lời sai               →              =     0 điểm
```

---

## 6. Mở Rộng Lên 10000 Players

### 6.1 Kiến trúc Target

```
                        ┌───────────────────────────────────────────────┐
                        │              Redis Cluster / Redis Cloud        │
                        │                                                │
                        │  ┌─────────────┐  ┌─────────────┐              │
                        │  │  Shard 1    │  │  Shard 2    │              │
                        │  │ lb:session1 │  │ lb:session2 │              │
                        │  │ buf:*       │  │ buf:*       │              │
                        │  └─────────────┘  └─────────────┘              │
                        │                                                │
                        │  Pub/Sub channels (all instances subscribe)    │
                        └──────────────────────┬────────────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 │                              │                              │
          ┌──────▼──────┐               ┌───────▼──────┐              ┌────────▼────────┐
          │  Instance 1 │               │  Instance 2  │              │   Instance N    │
          │  (NestJS)    │               │  (NestJS)    │              │   (NestJS)      │
          │              │               │              │              │                  │
          │ Players:     │               │ Players:      │              │ Players:        │
          │ 1 - 3000     │               │ 3001-6000     │              │ 6001-10000      │
          │              │               │              │              │                  │
          │ pub/sub      │               │ pub/sub       │              │ pub/sub         │
          │ (shared)     │               │ (shared)       │              │ (shared)        │
          └──────────────┘               └──────────────┘              └──────────────────┘
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                │
                        ┌────────────────────────▼────────────────────────┐
                        │           Kubernetes / Load Balancer             │
                        │                                                │
                        │  - L7 HTTP/WS Load Balancer                     │
                        │  - Health checks (liveness/readiness probes)    │
                        │  - Horizontal Pod Autoscaler (HPA)             │
                        │  - Sticky sessions cho host (session affinity) │
                        └────────────────────────────────────────────────┘
                                                │
                        ┌────────────────────────┼────────────────────────┐
                        │                        │                        │
                 ┌──────▼──────┐          ┌──────▼──────┐         ┌──────▼──────┐
                 │  Player 1   │          │ Player 2    │         │ Player 10K  │
                 └─────────────┘          └─────────────┘         └─────────────┘
```

### 6.2 Horizontal Pod Autoscaler (HPA) — Tự Động Scale

```yaml
# kubernetes/hpa-game.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: game-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: game-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70  # Scale up khi CPU > 70%
    - type: Pods
      pods:
        metric:
          name: websocket_connections_per_pod
        target:
          type: AverageValue
          averageValue: "1000"  # Scale khi > 1000 connections/pod
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30  # Đợi 30s trước khi scale up thêm
      policies:
        - type: Percent
          value: 100  # Tăng tối đa gấp đôi mỗi lần
          periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300  # Đợi 5 phút trước khi scale down
```

### 6.3 Deployment Config — Kubernetes

```yaml
# kubernetes/deployment-game.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: game-server
spec:
  replicas: 5
  selector:
    matchLabels:
      app: game-server
  template:
    spec:
      containers:
        - name: game-server
          image: quiz-game:latest
          ports:
            - containerPort: 3000
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-credentials
                  key: url
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "2000m"  # 2 cores cho xử lý WS
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            tcpSocket:
              port: 3000
            initialDelaySeconds: 30
```

### 6.4 Các Con Số Ước Tính

| Metric | 100 players | 1000 players | 10000 players |
|---|---|---|---|
| **Answer buffer size** | ~50 answers (1 question) | ~500 | ~5000 |
| **Redis throughput** | 50 LPUSH/s | 500/s | 5000/s |
| **Redis memory/game** | ~50 KB | ~500 KB | ~5 MB |
| **DB batch insert** | 50 rows × 1 query | 500 rows × 1 query | 5000 rows × 1 query |
| **DB latency (batch)** | ~10ms | ~30ms | ~100ms |
| **Fan-out broadcast** | ~5ms | ~50ms | ~500ms (needs optimization) |
| **Socket.io connections/pod** | 20 | 200 | 2000 |
| **Số pods cần thiết** | 1 | 1-2 | 5-10 |

---

## 7. Roadmap Cải Tiến

### Phase 1 — Fix Critical Bottlenecks (Tuần 1-2)

```
□ 1.1 Thay thế SocketStateService bằng Redis
      ├─ Loại bỏ hoàn toàn in-memory Maps
      ├─ Chỉ dùng RedisService.getPlayerBySocket() trong mọi handler
      └─ Test: 2 instances, verify kick/leave hoạt động cross-instance

□ 1.2 Di chuyển activeQuestions vào Redis
      ├─ Thêm game:active:{roomId} HASH trong RedisService
      ├─ Loại bỏ GameService.activeQuestions Map
      └─ Test: Player submit từ instance khác instance host

□ 1.3 Thống nhất handlers — dùng RoomHandler cho tất cả
      ├─ Loại bỏ duplicate code trong HostHandler, PlayerHandler
      └─ Chỉ giữ RoomHandler duy nhất

□ 1.4 Prisma batch insert thay vì loop
      └─ $executeRaw batch cho PlayerAnswer
```

### Phase 2 — Tối Ưu Leaderboard & Broadcast (Tuần 3-4)

```
□ 2.1 Redis Pub/Sub cho leaderboard updates
      ├─ Mỗi instance subscribe 'lb:update:*'
      └─ Giảm fan-out latency từ O(N) xuống O(instances)

□ 2.2 Stale leaderboard cho real-time feel
      ├─ Broadcast top 10 mỗi 2-5s thay vì chờ flush
      └─ Dùng Redis ZREVRANGE (rẻ) cho top 10 thường xuyên

□ 2.3 CDN/WebSocket edge cho fan-out
      ├─ Socket.io v4: hybrid adapter (Redis + local)
      └─ Cloudflare Durable Objects cho ultra-low latency
```

### Phase 3 — Observability & Testing (Tuần 5-6)

```
□ 3.1 Prometheus metrics
      ├─ redis_buffer_size (gauge)
      ├─ answer_throughput (counter)
      ├─ fan_out_duration_ms (histogram)
      └─ leaderboard_read_latency_ms (histogram)

□ 3.2 Load test với 10000 mock connections
      ├─ Socket.io-client stress test
      └─ Artillery.io / k6

□ 3.3 PgBouncer setup
      ├─ pool_mode = transaction
      ├─ max_client_conn = 1000
      └─ default_pool_size = 20
```

### Phase 4 — Production Hardening (Tuần 7-8)

```
□ 4.1 Kubernetes deployment
      ├─ HPA với custom metrics
      ├─ PodDisruptionBudget (0 disruption)
      └─ Rolling update strategy

□ 4.2 Redis Cluster (nếu > 5000 connections đồng thời)
      └─ Shard theo sessionId

□ 4.3 Redis Sentinel hoặc Redis Cloud
      └─ Automatic failover
```

---

## Phụ lục: File Tham Chiếu

| File | Nội dung |
|---|---|
| `backend/src/game/handlers/answer.handler.ts` | Xử lý submit answer, rate limit, buffer, dedup |
| `backend/src/game/game.service.ts` | GameService: activeQuestions Map, flush buffer, score calculation |
| `backend/src/redis/redis.service.ts` | Tất cả Redis operations: buffer, leaderboard, rate limit, room state |
| `backend/src/game/game.gateway.ts` | afterInit() — Socket.io Redis Adapter setup |
| `backend/src/game/services/socket-state.service.ts` | ⚠️ In-memory state — cần loại bỏ |
| `backend/src/game/handlers/host.handler.ts` | Host flow dùng SocketStateService (inconsistent) |
| `backend/src/game/handlers/player.handler.ts` | Player flow dùng SocketStateService (inconsistent) |
| `backend/src/game/handlers/room.handler.ts` | Room flow dùng RedisService (consistent) — NÊN giữ |
| `docs/high-scale-architecture.md` | Tài liệu thiết kế high-scale gốc |
| `docs/state-management-analysis.md` | So sánh In-Memory vs Redis |
