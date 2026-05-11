# Redis Architecture for Quiz Game (1000 players/game)

## Tổng quan

| Metric | Target |
|--------|--------|
| Players/game | 1,000 max |
| Latency P99 | < 50ms |
| Operations/sec | ~5,000 |

### Stack đề xuất
- **Redis Cloud** (free tier cho dev, ~$15/tháng cho production)
- **Single Redis instance** (sharding không cần thiết với 1K players)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    NestJS Servers                   │
│           (WebSocket + Game Logic)                  │
│                   Server #1, #2...                  │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
    Pub/Sub                      Redis API
    (events)                    (data)
         │                           │
         └───────────┬───────────────┘
                     │
         ┌───────────▼───────────┐
         │     Redis Cloud       │
         │   (Single Instance)   │
         └───────────────────────┘
```

---

## Redis Data Patterns

### 1. Game State (Hash)
```
game:{gameId} → {
  status: "waiting" | "playing" | "finished",
  currentQuestion: 0,
  questionCount: 10,
  startTime: timestamp,
  endTime: timestamp
}
TTL: 2 hours
```

### 2. Player Session (Hash)
```
session:{gameId}:{playerId} → {
  joinedAt: timestamp,
  score: number,
  answersCount: number
}
TTL: 1 hour
```

### 3. Leaderboard (Sorted Set)
```
leaderboard:{gameId} → {
  playerId: score,
  playerId: score
}
Auto-managed, no TTL needed
```

### 4. Rate Limiting (Sorted Set)
```
ratelimit:{playerId}:submit → [timestamp, timestamp, ...]
```
```
EVAL submit_answer 4 ratelimit:{playerId}:submit leaderboard:{gameId} session:{gameId}:{playerId} ANSWER_WINDOW 1
  -- Sliding window check
  -- ZADD score
  -- ZREVRANK + ZSCORE
```

---

## Pub/Sub Channels

| Channel | Purpose | Subscribers |
|---------|---------|-------------|
| `game:{gameId}:broadcast` | Question, timer, results | All game players |
| `game:{gameId}:player:{playerId}` | Personal notifications | Specific player |
| `game:{gameId}:leaderboard` | Real-time ranking updates | All game players |

---

## Performance Optimizations

### 1. Lua Scripts (Atomic Operations)

Tất cả operations cần atomicity phải dùng Lua:

```lua
-- Submit answer + update score + check leaderboard
-- 1 network roundtrip thay vì 4
```

### 2. Connection Pooling
```
ioredis cluster mode với:
- Min connections: 5
- Max connections: 50
- Connect timeout: 5s
```

### 3. MessagePack thay JSON
```
Payload size giảm ~40%
序列化/反序列化 nhanh hơn
```

---

## Benchmark Targets (1000 players)

| Operation | Target P99 |
|-----------|------------|
| Submit Answer | < 20ms |
| Get Leaderboard (top 10) | < 5ms |
| Player Join | < 10ms |
| Broadcast to 1000 | < 50ms |

---

## Redis Cloud Setup

### 1. Tạo Redis Cloud subscription
- Đăng ký tại [redis.com/redis-enterprise-cloud](https://redis.com/redis-enterprise-cloud/)
- Free tier: 30MB, 30 connections
- Production tier: $15-30/tháng

### 2. Cấu hình

```bash
# .env
REDIS_HOST=redis-xxxxx-0.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-password
```

### 3. Security
- Enable SSL/TLS
- Sử dụng password
- Firewall whitelist IP

---

## Khi nào cần Scale thêm?

Dấu hiệu cần nâng cấp:

| Metric | Warning | Critical |
|--------|---------|----------|
| Memory usage | > 70% | > 90% |
| CPU usage | > 50% | > 80% |
| Latency P99 | > 50ms | > 100ms |
| Concurrent games | 50+ | 100+ |

### Scale path:
```
1-50 games    → Single Redis instance (đủ)
50-100 games  → Redis Cloud với bigger plan
100+ games    → Redis Cluster hoặc Multi-tenant
```

---

## Monitoring

### Redis Cloud Dashboard
- Memory usage
- Connections
- Ops/sec
- Latency

### Key metrics cần theo dõi:
- `connected_clients`
- `used_memory_human`
- `instantaneous_ops_per_second`
- `rejected_connections`
