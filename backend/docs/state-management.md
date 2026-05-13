# State Management

## Overview

Phân tích cách quản lý state trong hệ thống hiện tại và đề xuất cải thiện.

## Current State (Single Instance)

### In-Memory State

```typescript
// Currently using Map for in-memory storage
// Example (not implemented yet):

private socketMap = new Map<string, PlayerIdentity>();
private roomSockets = new Map<string, Set<string>>();
private gameState = new Map<string, GameSessionState>();
```

### Problems with In-Memory

| Problem | Impact |
|---------|--------|
| Lost on restart | Game state wiped |
| Not shared | Multiple instances have different state |
| No persistence | Can't resume games |

## State Layers

```
┌─────────────────────────────────────────────┐
│               CLIENT STATE                    │
│  - UI state                                 │
│  - Timer countdown                          │
│  - Current scores                          │
└─────────────────────────────────────────────┘
                    │ Socket events
                    ▼
┌─────────────────────────────────────────────┐
│            SERVER STATE (In-Memory)          │
│  - Active sessions                         │
│  - Connected sockets                       │
│  - Current question                        │
│  - Timer state                             │
└─────────────────────────────────────────────┘
                    │ Sync
                    ▼
┌─────────────────────────────────────────────┐
│                  REDIS                       │
│  - Session cache (TODO)                    │
│  - Presence/online status (TODO)           │
│  - Distributed timer (TODO)                 │
└─────────────────────────────────────────────┘
                    │ Persist
                    ▼
┌─────────────────────────────────────────────┐
│              POSTGRESQL                      │
│  - Rooms, Players, Sessions                │
│  - Questions, Answers                       │
│  - Player answers, Scores                   │
│  - Historical data                          │
└─────────────────────────────────────────────┘
```

## Proposed State Structure

### 1. Persistent State (PostgreSQL)

```typescript
// Stored in DB - survives restarts
interface PersistentState {
  // Room
  room: {
    id: string;
    pin: string;
    quizId: string;
    hostId: string;
    status: RoomStatus;
  };
  
  // Game Session
  session: {
    id: string;
    roomId: string;
    status: GameState;
    currentQuestionIndex: number;
    questionStartedAt: Date;
  };
  
  // Player Sessions
  playerSessions: {
    playerId: string;
    sessionId: string;
    score: number;
  }[];
}
```

### 2. Cache State (Redis)

```typescript
// Cached in Redis - fast access
interface CachedState {
  // Current game state
  game: {
    status: GameState;
    currentQuestionIndex: number;
    questionStartedAt: number;  // timestamp
    timeLimit: number;
  };
  
  // Online players
  onlinePlayers: string[];
  
  // Answered questions
  answeredQuestions: {
    [playerId: string]: {
      [questionId: string]: {
        answerId: string;
        score: number;
      };
    };
  };
  
  // Leaderboard cache
  leaderboard: {
    playerId: string;
    score: number;
    rank: number;
  }[];
}
```

### 3. In-Memory State (Server)

```typescript
// Active state - fastest access
interface ActiveState {
  // Socket mappings
  socketToPlayer: Map<string, PlayerIdentity>;
  roomToSockets: Map<string, Set<string>>;
  
  // Active timers
  timers: Map<string, NodeJS.Timeout>;
  
  // Event handlers
  handlers: Map<string, Function[]>;
}
```

## State Synchronization

### Game Start

```typescript
async startGame(roomId: string) {
  // 1. DB: Create session, player sessions
  const session = await this.prisma.gameSession.create({ ... });
  
  // 2. Redis: Cache initial state
  await this.redis.set(`game:${session.id}`, JSON.stringify({
    status: 'WAITING',
    currentQuestionIndex: 0,
    players: []
  }));
  
  // 3. Memory: Start tracking
  this.activeGames.set(session.id, { ... });
}
```

### Question Update

```typescript
async emitQuestion(sessionId: string) {
  // 1. Update DB
  await this.prisma.gameSession.update({
    where: { id: sessionId },
    data: { 
      status: 'QUESTION_ACTIVE',
      questionStartedAt: new Date()
    }
  });
  
  // 2. Update Redis
  await this.redis.set(`game:${sessionId}`, JSON.stringify({
    status: 'QUESTION_ACTIVE',
    questionStartedAt: Date.now()
  }));
  
  // 3. Emit to clients
  this.gateway.emit('question_start', { ... });
}
```

### Score Update

```typescript
async submitAnswer(playerId: string, answerId: string) {
  // 1. Calculate score
  const score = await this.calculateScore(...);
  
  // 2. Save to DB (persistent)
  await this.prisma.playerAnswer.create({ ... });
  await this.prisma.playerSession.update({
    where: { id: playerSessionId },
    data: { score: { increment: score } }
  });
  
  // 3. Update Redis cache
  await this.redis.hincrby(`leaderboard:${sessionId}`, playerId, score);
  
  // 4. Broadcast
  this.gateway.emit('score_update', { playerId, score });
}
```

## Multi-Instance Consistency

### Problem

```
Instance 1                          Instance 2
    │                                   │
    │ Player A joins Room X              │
    │ State: { players: [A] }           │
    │                                   │ Player B joins Room X
    │                                   │ State: { players: [B] }  ← WRONG!
```

### Solution: Redis Pub/Sub

```typescript
// All instances subscribe to same channel
await this.pubSub.subscribe('room:*', (message) => {
  // Update local state
  this.syncState(message);
});

// All instances publish state changes
await this.pubSub.publish(`room:${roomId}`, {
  event: 'player_joined',
  player: newPlayer
});
```

### Socket.io Redis Adapter

```typescript
// Use Redis Adapter for Socket.io
import { RedisAdapter } from '@socket.io/redis-adapter';

const pubClient = new Redis(REDIS_URL);
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

// Now messages automatically broadcast across instances
io.to(roomId).emit('player_joined', { player });
```

## State Recovery (Reconnect)

```typescript
async handleReconnect(socketId: string, playerId: string) {
  // 1. Find player's active session
  const playerSession = await this.prisma.playerSession.findFirst({
    where: { playerId },
    include: { session: true }
  });
  
  if (!playerSession || playerSession.session.status === 'FINISHED') {
    return null; // No active game
  }
  
  // 2. Get current state from Redis (fast)
  const cachedState = await this.redis.get(`game:${playerSession.sessionId}`);
  
  // 3. Get player answers from DB
  const answers = await this.prisma.playerAnswer.findMany({
    where: { playerSessionId: playerSession.id }
  });
  
  // 4. Return full state to client
  return {
    session: playerSession.session,
    state: cachedState,
    playerScore: playerSession.score,
    answers
  };
}
```

## State Summary

| State Type | Storage | Access | TTL | Use Case |
|-----------|---------|--------|-----|----------|
| Session meta | PostgreSQL | Slow | Permanent | Persistence |
| Current scores | PostgreSQL | Medium | Permanent | Final results |
| Game progress | Redis | Fast | Session | Real-time |
| Active timers | Memory | Fastest | Session | Timer sync |
| Socket mappings | Memory | Fastest | Session | Routing |

## TODO

- [ ] Implement Redis connection
- [ ] Add state caching layer
- [ ] Set up Redis Pub/Sub
- [ ] Configure Socket.io Redis Adapter
- [ ] Add state recovery on reconnect
