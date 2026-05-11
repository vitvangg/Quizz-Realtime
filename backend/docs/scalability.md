# Scalability

## Current Architecture

**Single Instance**: Hiện tại chạy 1 server instance duy nhất.

## Problems at Scale

### 1. WebSocket Connection Limits

| Metric | Single Instance | Multi-Instance |
|--------|-----------------|----------------|
| Max Connections | ~10,000-50,000 | Horizontal |
| CPU Bound | Yes | Yes |
| Memory Bound | Yes | Yes |

### 2. Room State Isolation

```
Problem:
┌─────────────┐     ┌─────────────┐
│  Server A   │     │  Server B   │
│  Room X     │     │  Room Y     │
│  Players: A │     │  Players: B │
└─────────────┘     └─────────────┘

Player A cannot play with Player B!
```

### 3. Game State Sync

```
┌─────────────┐     ┌─────────────┐
│  Server A   │     │  Server B   │
│  Score: 500 │     │  Score: ?   │
│  Q: 3       │     │  Q: ?       │
└─────────────┘     └─────────────┘

If Player moves to Server B, state is lost!
```

## Solutions

### 1. Socket.io Redis Adapter

```typescript
// src/gateway.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

**Benefits**:
- Rooms broadcast to all instances
- Socket ID works across instances
- Automatic state sync

### 2. Redis Pub/Sub for Events

```typescript
// All instances subscribe to game events
await pubSub.subscribe('game:*', (message) => {
  // Process on each instance
});
```

### 3. Sticky Sessions

```nginx
# nginx.conf
upstream backend {
  ip_hash;  # Same client → same server
  server 127.0.0.1:3001;
  server 127.0.0.1:3002;
  server 127.0.0.1:3003;
}
```

**OR use load balancer with session affinity**

### 4. Game State in Redis

```typescript
// Store game state in Redis
await redis.set(`game:${sessionId}`, JSON.stringify({
  status: 'QUESTION_ACTIVE',
  currentQuestion: 2,
  scores: { player1: 1000, player2: 500 }
}));

// Any instance can read/write
```

## Load Estimates

| Scenario | Players | Rooms | Recommendations |
|----------|---------|-------|-----------------|
| Small | <100 | <20 | Single instance |
| Medium | 100-1000 | 20-200 | 3 instances + Redis |
| Large | 1000-10000 | 200-2000 | 5+ instances + Redis + Cache |
| Enterprise | 10000+ | 2000+ | K8s + Redis Cluster |

## Bottlenecks

### Database

| Query | Frequency | Solution |
|-------|-----------|----------|
| Room lookup by PIN | Per join | Redis cache |
| Player answer insert | Per answer | Batch insert |
| Score update | Per answer | Redis counter |

### Network

| Operation | Bandwidth | Solution |
|-----------|-----------|----------|
| Question payload | ~1KB/question | Compress |
| Leaderboard | ~10KB | Pagination |
| Broadcast all | N × 10KB | Chunked emit |

## Rate Limiting

```typescript
// Per socket rate limit
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  limiter: {
    max: 10,       // 10 requests
    duration: 1000  // per second
  }
});

// Use as middleware
io.use(async (socket, next) => {
  const allowed = await rateLimiter.consume(socket.id);
  if (!allowed) {
    return next(new Error('Rate limited'));
  }
  next();
});
```

## Horizontal Scaling Checklist

- [ ] Add Redis adapter for Socket.io
- [ ] Move game state to Redis
- [ ] Implement Pub/Sub for events
- [ ] Add health checks
- [ ] Configure load balancer with sticky sessions
- [ ] Add rate limiting
- [ ] Monitor connection counts
- [ ] Set up auto-scaling

## Infrastructure Suggestions

```yaml
# docker-compose.yml (example)
services:
  app:
    build: .
    scale: 3
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://...

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
```

```yaml
# kubernetes deployment (example)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: quiz-backend
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: quiz-backend:latest
          resources:
            limits:
              cpu: "1"
              memory: 1Gi
```
