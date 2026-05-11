# Redis Flow - NOT IMPLEMENTED YET

## Current Status

**Redis**: Chưa được tích hợp vào project.

## Why Redis?

| Use Case | Without Redis | With Redis |
|----------|---------------|------------|
| Multi-instance | Not possible | Share state across instances |
| Real-time sync | Local only | Pub/Sub across servers |
| Session cache | DB queries | In-memory cache |
| Presence | N/A | Track online players |
| Rate limiting | Memory-based | Distributed |

## Proposed Redis Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MULTI-INSTANCE SETUP                      │
│                                                             │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐                  │
│  │ Server1 │   │ Server2 │   │ Server3 │                  │
│  │   WS    │   │   WS    │   │   WS    │                  │
│  └────┬────┘   └────┬────┘   └────┬────┘                  │
│       │              │              │                       │
│       └──────────────┼──────────────┘                       │
│                      │                                      │
│              ┌───────┴───────┐                              │
│              ▼               ▼                              │
│        ┌──────────┐   ┌──────────┐                         │
│        │  Redis   │   │  Redis   │                         │
│        │ Adapter  │   │  PubSub  │                         │
│        └──────────┘   └──────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Recommended Setup

```typescript
// src/redis/redis.module.ts
import { Module, Global } from '@nestjs/common';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

@Global()
@Module({
  providers: [
    {
      provide: 'PUB_SUB',
      useFactory: () => new RedisPubSub({
        publisher: new Redis(REDIS_URL),
        subscriber: new Redis(REDIS_URL),
      }),
    },
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => new Redis(REDIS_URL),
    },
  ],
  exports: ['PUB_SUB', 'REDIS_CLIENT'],
})
export class RedisModule {}
```

## Use Case 1: Room State Cache

```typescript
// Cache room state to avoid DB queries
async cacheRoomState(roomId: string, state: RoomState) {
  const redis = this.redisClient;
  await redis.hset(`room:${roomId}`, {
    status: state.status,
    hostId: state.hostId,
    playerCount: state.players.length,
    updatedAt: Date.now()
  });
  await redis.expire(`room:${roomId}`, 3600); // 1 hour
}

async getRoomState(roomId: string) {
  const redis = this.redisClient;
  const cached = await redis.hgetall(`room:${roomId}`);
  return cached ? JSON.parse(cached) : null;
}
```

## Use Case 2: Game Session State

```typescript
// Real-time game state (frequently updated)
interface GameRedisState {
  sessionId: string;
  status: GameState;
  currentQuestion: number;
  questionStartedAt: number;
  activePlayers: string[];
}

async cacheGameState(sessionId: string, state: GameRedisState) {
  const redis = this.redisClient;
  await redis.setex(
    `game:${sessionId}`,
    3600, // TTL
    JSON.stringify(state)
  );
}

// Subscribe to game updates
async subscribeToGame(sessionId: string, callback: Function) {
  const subscriber = this.redisClient.duplicate();
  await subscriber.subscribe(`game:${sessionId}`);
  subscriber.on('message', (channel, message) => {
    callback(JSON.parse(message));
  });
}
```

## Use Case 3: Pub/Sub for Cross-Instance Events

```typescript
// src/game/game.gateway.ts
@WebSocketGateway()
export class GameGateway {
  constructor(
    @Inject('PUB_SUB') private pubSub: RedisPubSub,
  ) {}

  async handleAnswer(client: Socket, payload: AnswerPayload) {
    // Process answer locally
    const result = await this.processAnswer(payload);
    
    // Broadcast to ALL instances
    await this.pubSub.publish(`room:${payload.roomId}`, {
      playerAnswered: result
    });
  }
}

// Separate subscriber for state sync
@Injectable()
export class GameSubscriber {
  constructor(@Inject('PUB_SUB') private pubSub: RedisPubSub) {
    this.setupSubscriptions();
  }
  
  private setupSubscriptions() {
    this.pubSub.subscribe('room:*', async (message) => {
      // Sync state to local cache
      await this.updateLocalState(message);
    });
  }
}
```

## Use Case 4: Presence (Player Online Status)

```typescript
// Track which players are online
async setPlayerOnline(playerId: string, roomId: string) {
  const redis = this.redisClient;
  await redis.sadd(`room:${roomId}:online`, playerId);
  await redis.expire(`room:${roomId}:online`, 3600);
}

async setPlayerOffline(playerId: string, roomId: string) {
  const redis = this.redisClient;
  await redis.srem(`room:${roomId}:online`, playerId);
}

async getOnlinePlayers(roomId: string) {
  const redis = this.redisClient;
  return redis.smembers(`room:${roomId}:online`);
}
```

## Use Case 5: Rate Limiting

```typescript
// Per-socket rate limiting
async checkRateLimit(socketId: string, action: string): Promise<boolean> {
  const redis = this.redisClient;
  const key = `ratelimit:${socketId}:${action}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 1); // 1 second window
  }
  
  const limit = action === 'answer' ? 2 : 10; // answers: 2/sec, other: 10/sec
  return count <= limit;
}
```

## Use Case 6: Distributed Timer

```typescript
// Server-side timer coordination
async startQuestionTimer(sessionId: string, duration: number) {
  const redis = this.redisClient;
  const endTime = Date.now() + (duration * 1000);
  
  // Store timer in Redis
  await redis.setex(
    `timer:${sessionId}:question`,
    duration + 10, // Extra buffer
    endTime.toString()
  );
  
  // Broadcast to all instances
  await this.pubSub.publish(`game:${sessionId}`, {
    event: 'question_timer_start',
    endTime
  });
}

// Other instances subscribe
this.pubSub.subscribe(`game:${sessionId}`, (message) => {
  if (message.event === 'question_timer_start') {
    // Start local timer with same endTime
    this.scheduleQuestionEnd(message.endTime);
  }
});
```

## Redis Key Patterns

| Pattern | Type | TTL | Purpose |
|---------|------|-----|---------|
| `room:{id}` | Hash | 1h | Room metadata cache |
| `game:{id}` | String | 1h | Game session state |
| `room:{id}:online` | Set | 1h | Online players |
| `timer:{sessionId}:question` | String | variable | Question timer |
| `ratelimit:{socketId}:{action}` | String | 1s | Rate limit counters |
| `socket:{socketId}` | Hash | session | Socket identity |

## Environment Variables Needed

```bash
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Dependencies Required

```bash
npm install ioredis @nestjs/websockets @nestjs/platform-socket.io graphql-redis-subscriptions
```

## Migration Plan

1. **Phase 1**: Add Redis for caching only (no pub/sub)
2. **Phase 2**: Add Socket.io Redis Adapter
3. **Phase 3**: Add Redis Pub/Sub for game events
4. **Phase 4**: Add distributed rate limiting
