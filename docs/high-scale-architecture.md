# Quiz Game — High-Scale Architecture (1000+ Players)

> **Scope:** Chỉ tập trung code vào các module phục vụ game thời gian thực — Room, Game Session, Player, Player Session — và cách chúng được thiết kế để chịu tải 1000 players đồng thời trong một game session, cùng gửi câu trả lời gần như cùng lúc.

---

## 1. Tổng Quan Kiến Trúc Layer

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Web/Mobile)                   │
│     WebSocket (Socket.io / Native WS) — bidirectional   │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              GATEWAY / API LAYER (NestJS)                │
│  ┌────────────────┐  ┌────────────────────────────────┐ │
│  │  REST APIs     │  │  WebSocket Gateway (Gateway)    │ │
│  │  (CRUD Room,   │  │  ─── event-driven, stateful ─── │ │
│  │   Quiz, Auth)  │  │  - @SubscribeMessage           │ │
│  └───────┬────────┘  └──────────────┬─────────────────┘ │
│          │                          │                     │
│          └──────────────┬───────────┘                     │
└─────────────────────────┼─────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────┐
│                   CACHE / REAL-TIME LAYER                   │
│                                                             │
│   ┌─────────────────┐    ┌──────────────────────────────┐  │
│   │     Redis        │    │    In-Process State (per     │  │
│   │  (cross-node)    │    │    NestJS instance / worker) │  │
│   │  ─────────────   │    │  ┌────────────────────────┐  │  │
│   │  - Session state │    │  │  GameSessionStore      │  │  │
│   │  - Leaderboard   │    │  │  (Map<sessionId, ...>) │  │  │
│   │  - Rate limiting │    │  │  ────────────────────  │  │  │
│   │  - Pub/Sub       │    │  │  - currentQuestionIndex │  │  │
│   │  - Answer queue  │    │  │  - questionStartedAt   │  │  │
│   │                  │    │  │  - answerBuffer: Map   │  │  │
│   │                  │    │  │    questionId → []      │  │  │
│   └─────────────────┘    │  └────────────────────────┘  │  │
│                         └────────────────────────────────┘  │
└───────────────────────────┬───────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────┐
│                 PERSISTENCE LAYER (PostgreSQL)             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Prisma ORM + PgBouncer (connection pooler)           │ │
│  │  ─────────────────────────────────────────────────── │ │
│  │  Room, Player, GameSession, PlayerSession,            │ │
│  │  PlayerAnswer (append-only log)                        │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

**Nguyên tắc cốt lõi:**
- **Redis** = hot state (câu trả lời đến đâu ghi đến đó, không blocking DB).
- **PostgreSQL** = cold storage (batch flush khi round kết thúc).
- **In-process Map** = ultra-low-latency local cache cho question state.
- DB chỉ được chạm khi thật sự cần persist, không phải mỗi câu trả lời.

---

## 2. Data Model (Prisma Schema Mở Rộng)

### 2.1 Prisma Schema — Chi Tiết Các Model Game

```prisma
// ==============================================================
// ROOM — Phòng chơi (static metadata)
// ==============================================================
model Room {
  id        String     @id @default(uuid())
  pin       String     @unique
  quizId    String     @map("quiz_id")
  hostId    String     @map("host_id")
  status    RoomStatus @default(WAITING)
  createdAt DateTime   @default(now()) @map("created_at")

  quiz     Quiz          @relation(fields: [quizId], references: [id])
  host     User          @relation("UserRooms", fields: [hostId], references: [id])
  players  Player[]
  sessions GameSession[]

  @@index([quizId])
  @@index([hostId])
  @@map("rooms")
}

//
// 🟢 PLAYER
//
model Player {
  id       String   @id @default(uuid())
  roomId   String   @map("room_id")
  nickname String
  joinedAt DateTime @default(now()) @map("joined_at")

  room     Room            @relation(fields: [roomId], references: [id])
  sessions PlayerSession[]

  @@unique([roomId, nickname])
  @@index([roomId])
  @@map("players")
}

//
// 🔥 GAME SESSION
//
model GameSession {
  id        String     @id @default(uuid())
  roomId    String     @map("room_id")
  status    RoomStatus @default(WAITING)
  startedAt DateTime   @default(now()) @map("started_at")
  endedAt   DateTime?  @map("ended_at")

  currentQuestionIndex Int       @default(0) @map("current_question_index")
  questionStartedAt    DateTime? @map("question_started_at")

  room    Room            @relation(fields: [roomId], references: [id])
  players PlayerSession[]

  @@index([roomId])
  @@map("game_sessions")
}

//
// 🔥 PLAYER SESSION
//
model PlayerSession {
  id        String @id @default(uuid())
  playerId  String @map("player_id")
  sessionId String @map("session_id")
  score     Int    @default(0)

  player  Player         @relation(fields: [playerId], references: [id])
  session GameSession    @relation(fields: [sessionId], references: [id])
  answers PlayerAnswer[]

  @@unique([playerId, sessionId])
  @@index([sessionId])
  @@index([playerId])
  @@map("player_sessions")
}

//
// 🔥 PLAYER ANSWER (HISTORY → KHÔNG CASCADE)
//
model PlayerAnswer {
  id              String @id @default(uuid())
  playerSessionId String @map("player_session_id")
  questionId      String @map("question_id")
  answerId        String @map("answer_id")

  // 🔥 snapshot chống sai lịch sử (optional nhưng nên có)
  questionContent String? @map("question_content")
  answerContent   String? @map("answer_content")

  isCorrect    Boolean  @map("is_correct")
  scoreEarned  Int      @default(0) @map("score_earned")
  timeAnswered DateTime @default(now()) @map("time_answered")

  playerSession PlayerSession @relation(fields: [playerSessionId], references: [id])
  question      Question      @relation(fields: [questionId], references: [id])
  answer        Answer        @relation(fields: [answerId], references: [id])

  @@unique([playerSessionId, questionId])
  @@index([playerSessionId])
  @@index([questionId])
  @@index([playerSessionId, isCorrect]) // 🔥 optimize score
  @@map("player_answers")
}

//
// 🔐 AUTH SESSION
//
model AuthSession {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  refreshToken String   @map("refresh_token")
  expiresAt    DateTime @map("expires_at")
  createdAt    DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([expiresAt])
  @@map("auth_sessions")
}

// ==============================================================
// REVISED: RoomStatus enum — thêm để sync real-time state
// ==============================================================
enum RoomStatus {
  WAITING    // Chờ người chơi
  PLAYING    // Đang chơi
  FINISHED   // Kết thúc
}

// ==============================================================
// HELPER: BIGINT mapping cho Prisma (PostgreSQL)
// ==============================================================
// Prisma hỗ trợ BigInt via Int? nhưng giới hạn ở JS Number.
// Với avg_response_time_ms, dùng Int là đủ (max ~20000ms).
// Nếu cần chính xác hơn cho sum: store as Int (ms), compute in app.
```

### 2.2 Tại Sao Schema Này Chịu Được 1000 Players

| Thành phần | Lý do |
|---|---|
| `PlayerAnswer` **append-only** | Không có UPDATE/DELETE → không có row lock contention |
| **Denormalized `sessionId`** trên `PlayerAnswer` | Không cần JOIN qua PlayerSession để query leaderboard |
| `@@index([sessionId, scoreEarned])` | Leaderboard top-N được index hỗ trợ, không full scan |
| `@@unique([playerSessionId, questionId])` | Đảm bảo 1 player chỉ trả lời 1 lần mỗi câu — enforced by DB |
| `avg_response_time_ms` as **Int (BIGINT)** | Không dùng Decimal/Float → so sánh nhanh, không precision issue |
| `PlayerAnswer` có **snapshots** `questionContent`/`answerContent` | Không cần JOIN sang Question/Answer khi hiển thị lịch sử |
| `Player` có `userId` nullable | Anonymous guests không cần account |

---

## 3. Luồng Dữ Liệu — Submit Câu Trả Lời (Critical Path)

### 3.1 Write Path — Khi Player Gửi Câu Trả Lời

```
Player Client
    │
    │  WebSocket: submit_answer({ sessionId, questionId, answerId })
    ▼
WebSocket Gateway
    │
    ├─► Rate Limiter (Redis INCR expiring key) ──→ 429 if > 3 req/s
    │
    ├─► Validate session đang PLAYING / SHOW_ANSWER
    │
    ├─► [REDIS] LPUSH answer_buffer:{sessionId}:{questionId}
    │       payload: { playerId, answerId, timestamp }
    │
    ├─► [REDIS] INCR answer_count:{sessionId}:{questionId}
    │
    ├─► [REDIS] ZADD leaderboard:{sessionId} score delta
    │       → chỉ cập nhật score nếu điểm > điểm cũ (Lua script)
    │
    └─► ACK ngay về client (latency < 5ms)

─────────────────────────────────────────────────────
Background Worker (every 5s OR when count reaches threshold)
    │
    ├─► [REDIS] LRANGE answer_buffer:{sessionId}:{questionId} 0 -1
    │       → lấy batch answers
    │
    ├─► [REDIS] DEL answer_buffer
    │
    ├─► Prisma.createMany({ data: playerAnswers[] })  ← BATCH INSERT
    │       → 1 DB round-trip cho 1000 answers
    │
    └─► Commit checkpoint vào [REDIS] last_flushed:{sessionId}:{questionId}
```

### 3.2 Read Path — Khi Cần Leaderboard / Kết Quả

```
GameSession Leaderboard
    │
    ├─► [REDIS] ZREVRANGE leaderboard:{sessionId} 0 9 WITHSCORES
    │       → Top 10, < 1ms, không chạm DB
    │
    └─► Fallback: Prisma.playerSessions.findMany({
           where: { sessionId },
           orderBy: { score: 'desc' },
           take: 10,
           include: { player: true }
         })
```

### 3.3 Tại Sao Không Ghi Trực Tiếp Vào DB?

| Vấn đề | Giải pháp Redis Buffer |
|---|---|
| **1000 players cùng gửi 1 lúc** | Redis LPUSH O(1), không lock |
| **DB connection exhaustion** | Batch 100-500 rows/lần thay vì 1000 individual inserts |
| **Latency spike** | ACK ngay từ Redis (< 5ms), DB write là async |
| **Race condition trùng câu trả lời** | Redis SETNX hoặc Lua script atomic |
| **Điểm cần tính toán** | Lua script trong Redis, atomic, không race |

---

## 4. Cấu Trúc Code Đề Xuất

### 4.1 File Structure

```
backend/src/
├── game/
│   ├── game.module.ts
│   ├── game.gateway.ts          ← WebSocket Gateway (NestJS)
│   ├── game.service.ts         ← Game logic
│   ├── game-state.service.ts   ← In-memory Map per instance
│   ├── dto/
│   │   ├── submit-answer.dto.ts
│   │   ├── join-room.dto.ts
│   │   └── ...
│   └── interfaces/
│       ├── game-session-state.interface.ts
│       └── answer-payload.interface.ts
│
├── redis/
│   ├── redis.module.ts
│   ├── redis.service.ts        ← IORedis wrapper
│   └── lua-scripts/
│       ├── atomic-score-update.lua
│       └── submit-answer.lua
│
├── room/
│   ├── room.module.ts
│   ├── room.service.ts
│   ├── room.controller.ts
│   └── ...
│
└── prisma/
    └── prisma.service.ts
```

### 4.2 GameStateService — In-Memory Cache

```typescript
// game/game-state.service.ts
import { Injectable } from '@nestjs/common';

export interface QuestionState {
  questionIndex: number;
  questionId: string;
  startedAt: number;          // Date.now()
  durationMs: number;
  answerCount: number;
  totalPlayers: number;
}

export interface SessionState {
  sessionId: string;
  roomId: string;
  status: RoomStatus;
  currentQuestion: QuestionState | null;
  playerCount: number;
  // Local leaderboard cache (top 20)
  leaderboard: Array<{ playerId: string; score: number; nickname: string }>;
}

@Injectable()
export class GameStateService {
  // Map<sessionId, SessionState>
  // Có thể dùng @nestjs/bull để scale horizontal
  private sessions = new Map<string, SessionState>();

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  setSession(sessionId: string, state: SessionState): void {
    this.sessions.set(sessionId, state);
  }

  updateQuestionState(
    sessionId: string,
    questionId: string,
    index: number,
    durationMs: number,
    totalPlayers: number,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.currentQuestion = {
      questionIndex: index,
      questionId,
      startedAt: Date.now(),
      durationMs,
      answerCount: 0,
      totalPlayers,
    };
  }

  incrementAnswerCount(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.currentQuestion) {
      session.currentQuestion.answerCount++;
    }
  }
}
```

### 4.3 Redis Service — Buffer & Leaderboard

```typescript
// redis/redis.service.ts (IORedis)
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private client: Redis;
  private subscriber: Redis; // cho pub/sub cross-instance

  // ============ ANSWER BUFFER ============
  async bufferAnswer(
    sessionId: string,
    questionId: string,
    payload: AnswerPayload,
  ): Promise<void> {
    const key = `buffer:${sessionId}:${questionId}`;
    await this.client.lpush(key, JSON.stringify(payload));
    // expire sau 10 phút (safety net)
    await this.client.expire(key, 600);
  }

  async flushAnswerBuffer(
    sessionId: string,
    questionId: string,
  ): Promise<AnswerPayload[]> {
    const key = `buffer:${sessionId}:${questionId}`;
    const raw = await this.client.lrange(key, 0, -1);
    if (raw.length > 0) {
      await this.client.del(key);
    }
    return raw.map((r) => JSON.parse(r));
  }

  // ============ LEADERBOARD (Sorted Set) ============
  async updateScore(
    sessionId: string,
    playerId: string,
    deltaScore: number,
  ): Promise<void> {
    const key = `leaderboard:${sessionId}`;
    // Lua script: chỉ update nếu delta > 0 hoặc player chưa có
    const script = `
      local current = redis.call('ZSCORE', KEYS[1], ARGV[1])
      if current == false or tonumber(ARGV[2]) > 0 then
        redis.call('ZINCRBY', KEYS[1], ARGV[2], ARGV[1])
        return 1
      end
      return 0
    `;
    await this.client.eval(script, 1, key, playerId, deltaScore);
  }

  async getTopScores(
    sessionId: string,
    count: number = 10,
  ): Promise<Array<{ playerId: string; score: number }>> {
    const key = `leaderboard:${sessionId}`;
    const result = await this.client.zrevrange(key, 0, count - 1, 'WITHSCORES');
    const pairs: Array<{ playerId: string; score: number }> = [];
    for (let i = 0; i < result.length; i += 2) {
      pairs.push({ playerId: result[i], score: parseInt(result[i + 1]) });
    }
    return pairs;
  }

  // ============ RATE LIMITING ============
  async checkRateLimit(
    playerId: string,
    limit: number = 3,
    windowSec: number = 1,
  ): Promise<boolean> {
    const key = `ratelimit:answer:${playerId}`;
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSec);
    }
    return count <= limit;
  }
}
```

### 4.4 GameGateway — WebSocket Events

```typescript
// game/game.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { RedisService } from '../redis/redis.service';
import { GameStateService } from './game-state.service';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
    private readonly gameService: GameService,
    private readonly redis: RedisService,
    private readonly state: GameStateService,
  ) {}

  // =====================================================
  // CLIENT → SERVER EVENTS
  // =====================================================

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomPin: string; nickname: string },
  ) {
    const session = await this.gameService.joinRoom(
      payload.roomPin,
      payload.nickname,
      client.id,
    );

    // Map socket.id → playerId để lookup nhanh
    client.data.playerId = session.playerId;
    client.data.sessionId = session.id;

    // Join socket.io room để broadcast
    client.join(`session:${session.id}`);

    // Gửi session state về client
    return {
      event: 'room_joined',
      data: {
        sessionId: session.id,
        playerId: session.playerId,
        playerCount: session.playerCount,
        status: session.status,
      },
    };
  }

  @SubscribeMessage('submit_answer')
  async handleSubmitAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SubmitAnswerDto,
  ) {
    const playerId = client.data.playerId as string;
    const sessionId = client.data.sessionId as string;

    if (!playerId || !sessionId) {
      return { event: 'error', data: { message: 'Not in a game session' } };
    }

    // 1. Rate limit check
    const allowed = await this.redis.checkRateLimit(playerId);
    if (!allowed) {
      return { event: 'error', data: { message: 'Rate limit exceeded' } };
    }

    // 2. Validate session đang chơi
    const session = this.state.getSession(sessionId);
    if (!session?.currentQuestion) {
      return { event: 'error', data: { message: 'No active question' } };
    }

    const question = session.currentQuestion;
    const elapsedMs = Date.now() - question.startedAt;

    // 3. Early reject nếu hết giờ
    if (elapsedMs > question.durationMs) {
      return { event: 'error', data: { message: 'Time expired' } };
    }

    // 4. Atomic Redis buffer
    const payload = {
      playerId,
      sessionId,
      questionId: dto.questionId,
      answerId: dto.answerId,
      responseTimeMs: elapsedMs,
      timestamp: Date.now(),
    };

    // Chỉ ghi buffer nếu chưa có câu trả lời cho câu này
    const isFirstAnswer = await this.redis.trySetAnswer(
      sessionId,
      questionId,
      playerId,
      payload,
    );

    if (!isFirstAnswer) {
      return { event: 'error', data: { message: 'Already answered' } };
    }

    // 5. Update in-memory answer count
    this.state.incrementAnswerCount(sessionId);

    // 6. ACK ngay
    return {
      event: 'answer_received',
      data: { questionId: dto.questionId, responseTimeMs: elapsedMs },
    };
  }

  // =====================================================
  // SERVER → CLIENT EVENTS (broadcast from game logic)
  // =====================================================

  broadcastQuestionStart(sessionId: string, question: QuestionPayload): void {
    this.server.to(`session:${sessionId}`).emit('question_start', {
      ...question,
      startedAt: Date.now(),
    });
  }

  broadcastLeaderboardUpdate(
    sessionId: string,
    topPlayers: Array<{ playerId: string; score: number; nickname: string }>,
  ): void {
    this.server.to(`session:${sessionId}`).emit('leaderboard_update', {
      topPlayers,
      updatedAt: Date.now(),
    });
  }

  broadcastSessionEnd(sessionId: string, finalLeaderboard: FinalResult[]): void {
    this.server.to(`session:${sessionId}`).emit('session_end', {
      finalLeaderboard,
    });
  }
}
```

### 4.5 GameService — Business Logic

```typescript
// game/game.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GameStateService } from './game-state.service';

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly state: GameStateService,
  ) {}

  // =====================================================
  // JOIN ROOM
  // =====================================================
  async joinRoom(roomPin: string, nickname: string, socketId: string) {
    // 1. Tìm room đang WAITING
    const room = await this.prisma.room.findUnique({
      where: { pin: roomPin },
      include: {
        players: { where: { nickname } }, // kiểm tra nickname trùng
        sessions: { where: { status: { in: ['WAITING', 'PLAYING'] } } },
      },
    });

    if (!room) throw new Error('Room not found');
    if (room.players.length > 0) throw new Error('Nickname already taken');
    if (room.players.length >= room.maxPlayers) {
      throw new Error('Room is full');
    }

    // 2. Tạo hoặc lấy Player
    const player = await this.prisma.player.upsert({
      where: { roomId_userId: { roomId: room.id, userId: null } },
      create: { roomId: room.id, nickname },
      update: {},
    });

    // 3. Tạo PlayerSession cho session đang active
    let activeSession = room.sessions[0];
    if (!activeSession) {
      activeSession = await this.prisma.gameSession.create({
        data: { roomId: room.id },
      });
    }

    const playerSession = await this.prisma.playerSession.create({
      data: { playerId: player.id, sessionId: activeSession.id },
    });

    // 4. Init Redis leaderboard entry
    await this.redis.initPlayerScore(activeSession.id, player.id, 0);

    // 5. Update in-memory state
    const existing = this.state.getSession(activeSession.id);
    if (existing) {
      existing.playerCount++;
    } else {
      this.state.setSession(activeSession.id, {
        sessionId: activeSession.id,
        roomId: room.id,
        status: activeSession.status,
        currentQuestion: null,
        playerCount: room.players.length + 1,
        leaderboard: [],
      });
    }

    return {
      id: activeSession.id,
      playerId: player.id,
      playerCount: room.players.length + 1,
      status: activeSession.status,
    };
  }

  // =====================================================
  // START GAME (host triggers)
  // =====================================================
  async startGame(sessionId: string, hostId: string) {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { room: true, players: true },
    });

    if (!session) throw new Error('Session not found');
    if (session.room.hostId !== hostId) throw new Error('Only host can start');
    if (session.status !== 'WAITING') throw new Error('Session already started');

    const updated = await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: 'COUNTDOWN' },
    });

    // Broadcast countdown → Gateway sẽ emit 'countdown_start'

    // Sau 3s → chuyển sang PLAYING, load câu hỏi đầu tiên
    setTimeout(async () => {
      await this.prisma.gameSession.update({
        where: { id: sessionId },
        data: { status: 'PLAYING' },
      });
      await this.loadNextQuestion(sessionId, 0);
    }, 3000);

    return updated;
  }

  // =====================================================
  // LOAD QUESTION & BROADCAST
  // =====================================================
  async loadNextQuestion(sessionId: string, questionIndex: number) {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        room: { include: { quiz: { include: { questions: { orderBy: { orderIndex: 'asc' } } } } } },
        players: { include: { player: true } },
      },
    });

    const questions = session.room.quiz.questions;
    if (questionIndex >= questions.length) {
      // Kết thúc game
      await this.endGame(sessionId);
      return;
    }

    const question = questions[questionIndex];
    const durationMs = question.timeLimit * 1000;

    // Update session state
    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        currentQuestionIndex: questionIndex,
        questionStartedAt: new Date(),
        status: 'PLAYING',
      },
    });

    // Update in-memory
    this.state.updateQuestionState(
      sessionId,
      question.id,
      questionIndex,
      durationMs,
      session.players.length,
    );

    // Broadcast to all players via gateway
    // (gateway reference injected via EventEmitter or singleton)
    this.broadcastQuestion(sessionId, question, durationMs);

    // Set timer để tự động kết thúc câu hỏi
    setTimeout(async () => {
      await this.closeQuestionAndShowAnswer(sessionId, question.id);
    }, durationMs + 2000); // +2s grace period
  }

  // =====================================================
  // CLOSE QUESTION — flush buffer, show answer, update leaderboard
  // =====================================================
  async closeQuestionAndShowAnswer(sessionId: string, questionId: string) {
    // 1. Flush Redis buffer → Prisma batch insert
    await this.flushAnswerBufferToDb(sessionId, questionId);

    // 2. Broadcast answer result
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { answers: true },
    });
    const correctAnswer = question.answers.find((a) => a.isCorrect);

    // 3. Get top scores từ Redis
    const topScores = await this.redis.getTopScores(sessionId, 10);

    // 4. Broadcast 'question_end' với đáp án đúng
    this.broadcastQuestionEnd(sessionId, {
      questionId,
      correctAnswerId: correctAnswer.id,
      topPlayers: topScores,
    });

    // 5. Schedule next question
    setTimeout(async () => {
      const session = await this.prisma.gameSession.findUnique({
        where: { id: sessionId },
      });
      await this.loadNextQuestion(sessionId, session.currentQuestionIndex + 1);
    }, 5000);
  }

  // =====================================================
  // FLUSH BUFFER (called by cron or after each question)
  // =====================================================
  async flushAnswerBufferToDb(sessionId: string, questionId: string) {
    const buffered = await this.redis.flushAnswerBuffer(sessionId, questionId);
    if (buffered.length === 0) return;

    // Fetch correct answer info để compute score
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { answers: { where: { isCorrect: true } } },
    });

    const correctAnswerId = question.answers[0]?.id;

    // Build PlayerAnswer records
    const answerRecords = buffered.map((payload) => {
      const isCorrect = payload.answerId === correctAnswerId;
      const responseTimeMs = payload.responseTimeMs;
      // Score formula: base - time penalty
      const scoreEarned = isCorrect
        ? Math.max(0, 1000 - Math.floor(responseTimeMs / 10))
        : 0;

      return {
        playerSessionId: payload.playerSessionId,
        sessionId: payload.sessionId,
        questionId: payload.questionId,
        answerId: payload.answerId,
        questionContent: question.content,
        answerContent: null,
        isCorrect,
        scoreEarned,
        responseTimeMs,
        timeAnswered: new Date(payload.timestamp),
      };
    });

    // Batch insert — Prisma hỗ trợ createMany với raw queries
    // hoặc dùng $executeRawBatch cho performance tối ưu
    await this.prisma.playerAnswer.createMany({ data: answerRecords });

    // Update PlayerSession scores
    await this.recomputePlayerScores(sessionId);

    this.logger.log(
      `Flushed ${answerRecords.length} answers for session ${sessionId}:${questionId}`,
    );
  }

  // =====================================================
  // RECOMPUTE SCORES — chạy sau khi flush buffer
  // =====================================================
  async recomputePlayerScores(sessionId: string) {
    await this.prisma.$executeRaw`
      UPDATE player_sessions ps
      SET
        score = sub.total_score,
        correct_answers = sub.correct_count,
        avg_response_time_ms = sub.avg_time
      FROM (
        SELECT
          player_session_id,
          SUM(score_earned)      AS total_score,
          COUNT(*) FILTER (WHERE is_correct) AS correct_count,
          AVG(response_time_ms)  AS avg_time
        FROM player_answers
        WHERE session_id = ${sessionId}
        GROUP BY player_session_id
      ) sub
      WHERE ps.id = sub.player_session_id
    `;
  }

  // =====================================================
  // END GAME
  // =====================================================
  async endGame(sessionId: string) {
    await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: 'FINISHED', endedAt: new Date() },
    });

    // Final leaderboard từ Redis
    const finalScores = await this.redis.getTopScores(sessionId, 100);

    // Broadcast end
    this.broadcastSessionEnd(sessionId, finalScores);
  }

  // Placeholder methods — implementation tùy integration pattern
  private broadcastQuestion(sessionId: string, question: any, durationMs: number) {}
  private broadcastQuestionEnd(sessionId: string, data: any) {}
  private broadcastSessionEnd(sessionId: string, data: any) {}
}
```

### 4.6 RedisService — Bổ Sung `trySetAnswer`

```typescript
// redis/redis.service.ts — bổ sung
async trySetAnswer(
  sessionId: string,
  questionId: string,
  playerId: string,
  payload: AnswerPayload,
): Promise<boolean> {
  // Dùng Redis SETNX (SET if Not eXists) để đảm bảo atomic
  const key = `answered:${sessionId}:${questionId}:${playerId}`;
  const set = await this.client.setnx(key, JSON.stringify(payload));
  if (set === 1) {
    // Đặt expire = question duration + buffer
    await this.client.expire(key, 60);
    return true;
  }
  return false;
}

async initPlayerScore(sessionId: string, playerId: string, score: number): Promise<void> {
  const key = `leaderboard:${sessionId}`;
  await this.client.zadd(key, score, playerId);
}
```

---

## 5. Redis Keys Cheat Sheet

```
answer_buffer:{sessionId}:{questionId}      LIST      Buffer câu trả lời chờ flush
leaderboard:{sessionId}                     ZSET      Sorted set điểm số (score → playerId)
answered:{sessionId}:{questionId}:{playerId} STRING    Đánh dấu đã trả lời (SETNX, TTL 60s)
ratelimit:answer:{playerId}                 STRING    Rate limit counter (TTL 1s)
session:state:{sessionId}                   HASH      Session metadata (optional, cross-instance)
socket:player:{socketId}                    STRING    Map socket.id → playerId (TTL = session)
```

---

## 6. Database Optimization Checklist

### 6.1 PostgreSQL Settings

```sql
-- postgresql.conf

-- Connection pool (dùng PgBouncer ở tầng app)
-- max_connections = 100 (PgBouncer xử lý, không set quá cao)

-- Write performance
shared_buffers = 256MB           -- 25% RAM
effective_cache_size = 1GB      -- 75% RAM
maintenance_work_mem = 128MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB

-- Concurrency (quantile estimator cho query planner)
default_statistics_target = 100

-- Disable synchronous commit cho non-critical writes
-- (DB vẫn an toàn vì Redis là primary, DB là async backup)
-- ⚠️ Chỉ áp dụng cho player_answers, không áp dụng cho transactions
synchronous_commit = off

-- Increase WAL
max_wal_size = 1GB
min_wal_size = 80MB
```

### 6.2 Index Strategy

```sql
-- player_answers: MASSIVE table, append-only
-- Composite index cho leaderboard query (most important)
CREATE INDEX idx_pa_session_score
  ON player_answers (session_id, score_earned DESC)
  WHERE is_correct = true;   -- partial index

-- Composite cho per-question analytics
CREATE INDEX idx_pa_question_correct
  ON player_answers (question_id, is_correct);

-- player_sessions: frequently queried for leaderboard
CREATE INDEX idx_ps_session_score
  ON player_sessions (session_id, score DESC);

-- game_sessions: find active session quickly
CREATE INDEX idx_gs_room_status
  ON game_sessions (room_id, status)
  WHERE status IN ('WAITING', 'PLAYING', 'COUNTDOWN');
```

### 6.3 Partitioning (Khi Cần Scale Hơn Nữa)

```sql
-- Partition player_answers theo tháng (range partitioning)
CREATE TABLE player_answers (
  id              TEXT,
  player_session_id TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  question_id     TEXT NOT NULL,
  answer_id       TEXT NOT NULL,
  is_correct      BOOLEAN NOT NULL,
  score_earned    INTEGER NOT NULL DEFAULT 0,
  response_time_ms INTEGER NOT NULL,
  time_answered   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, time_answered)
) PARTITION BY RANGE (time_answered);

-- Tạo partition cho tháng hiện tại + 2 tháng tới
CREATE TABLE player_answers_2026_05
  PARTITION OF player_answers
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

---

## 7. Horizontal Scaling — Multi-Instance Deployment

```
                    ┌──────────────┐
                    │  Load Balancer│
                    │  (Socket.io  │
                    │   Adapter)   │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
   │ Instance 1 │   │ Instance 2  │   │ Instance 3  │
   │ (NestJS)   │   │ (NestJS)   │   │ (NestJS)   │
   └─────┬──────┘   └──────┬──────┘   └──────┬──────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
              ┌────────────▼────────────┐
              │         Redis          │
              │  (Pub/Sub + State)     │
              │  (answer_buffer,       │
              │   leaderboard ZSET,    │
              │   session state HASH)  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   PostgreSQL + PgBouncer │
              └─────────────────────────┘
```

### Socket.io Redis Adapter

```typescript
// main.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

- Mỗi NestJS instance nhận message qua Redis Pub/Sub
- `client.join(sessionId)` → tất cả instances nhận, broadcast đến tất cả clients
- Redis buffer/leaderboard là **shared state** → không cần sticky sessions

---

## 8. Redis Lua Scripts

### 8.1 Atomic Score Update

```lua
-- atomic-score-update.lua
-- KEYS[1] = leaderboard:{sessionId}
-- ARGV[1] = playerId
-- ARGV[2] = deltaScore (số nguyên)
-- Returns: 1 if updated, 0 if skipped (delta <= 0 and player exists)

local current = redis.call('ZSCORE', KEYS[1], ARGV[1])
if current == false then
    redis.call('ZINCRBY', KEYS[1], ARGV[2], ARGV[1])
    return 1
end
local currentNum = tonumber(current)
local delta = tonumber(ARGV[2])
if delta > 0 then
    redis.call('ZINCRBY', KEYS[1], delta, ARGV[1])
    return 1
end
return 0
```

### 8.2 Submit Answer (Atomic Buffer + Dedupe)

```lua
-- submit-answer.lua
-- KEYS[1] = answered:{sessionId}:{questionId}:{playerId}
-- KEYS[2] = buffer:{sessionId}:{questionId}
-- ARGV[1] = answer payload JSON
-- ARGV[2] = TTL seconds
-- Returns: 1 if accepted, 0 if duplicate

local set = redis.call('SETNX', KEYS[1], ARGV[1])
if set == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
    redis.call('LPUSH', KEYS[2], ARGV[1])
    return 1
end
return 0
```

---

## 9. Stress Test Plan

### 9.1 Simulate 1000 Players Submitting Simultaneously

```typescript
// stress-test.ts
import io from 'socket.io-client';

async function stressTest(sessionId: string, playerCount = 1000) {
  const clients: any[] = [];
  const questionId = 'question-uuid-here';

  console.log(`Spawning ${playerCount} clients...`);
  const start = Date.now();

  // Spawn all connections
  for (let i = 0; i < playerCount; i++) {
    const socket = io('http://localhost:3000/game', {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    clients.push(socket);
  }

  const connectTime = Date.now() - start;
  console.log(`All connected in ${connectTime}ms (avg ${connectTime / playerCount}ms/client)`);

  // All submit answer at the same time
  console.log('Submitting answers...');
  const submitStart = Date.now();

  const promises = clients.map((socket, i) => {
    return new Promise<void>((resolve) => {
      socket.emit('submit_answer', {
        sessionId,
        questionId,
        answerId: i % 4 === 0 ? 'correct-answer-id' : 'wrong-answer-id',
      });
      socket.on('answer_received', () => resolve());
    });
  });

  await Promise.all(promises);

  const submitTime = Date.now() - submitStart;
  console.log(
    `All answers received in ${submitTime}ms (avg ${submitTime / playerCount}ms, ${(playerCount / submitTime) * 1000} answers/sec)`,
  );

  // Cleanup
  clients.forEach((s) => s.disconnect());
}
```

### 9.2 Target Metrics

| Metric | Target |
|---|---|
| Answer throughput | > 10,000 answers/giây (Redis LPUSH) |
| ACK latency (client nhận được) | < 10ms p95 |
| DB batch insert latency | < 500ms cho 1000 rows |
| Leaderboard read | < 2ms (Redis ZREVRANGE) |
| Socket.io message fan-out (1000 clients) | < 50ms |
| DB leaderboard query | < 100ms cho top 100 |

---

## 10. Công Thức Tính Điểm

```typescript
function calculateScore(isCorrect: boolean, responseTimeMs: number): number {
  if (!isCorrect) return 0;

  const BASE_SCORE = 1000;
  const PENALTY_PER_10MS = 1; // mỗi 10ms trừ 1 điểm
  const MIN_SCORE = 100;       // tối thiểu vẫn được 100 điểm nếu đúng

  const penalty = Math.floor(responseTimeMs / 10);
  return Math.max(MIN_SCORE, BASE_SCORE - penalty);
}

// Ví dụ:
// - Trả lời đúng trong 500ms  → 1000 - 50 = 950 điểm
// - Trả lời đúng trong 9s     → 1000 - 900 = 100 điểm (floor)
// - Trả lời sai               → 0 điểm
```

---

## 11. Các Vấn Đề Cần Giải Quyết Trước Khi Implement

1. **PgBouncer** — Cần setup connection pooling vì Prisma mở connection riêng
2. **Redis** — Chưa có trong project → cần install `ioredis`, `socket.io-redis-adapter`
3. **Socket.io Redis Adapter** — Cần adapter để multi-instance broadcast
4. **Cron/Queue** — Cần `@nestjs/bull` hoặc cron job để flush buffer định kỳ
5. **PlayerAnswer batch insert** — Prisma `createMany` không hỗ trợ nested relations → dùng `$executeRaw` hoặc `prisma.$transaction` batch nhỏ
6. **Leaderboard sync** — Redis leaderboard là source of truth trong game, PostgreSQL là backup
7. **Socket.io rooms** — Dùng `sessionId` làm room name để broadcast đúng group

---

## 12. Điểm Yếu Cần Giám Sát (Monitoring)

```typescript
// Metrics cần theo dõi
{
  redis_buffer_size: gauge,           // số answers đang trong buffer
  buffer_flush_duration_ms: histogram, // thời gian flush 1 batch
  answer_throughput: counter,         // answers/giây
  db_batch_insert_duration_ms: histogram,
  leaderboard_read_latency_ms: histogram,
  socket_broadcast_duration_ms: histogram,  // fan-out 1000 clients
  active_sessions: gauge,
  players_per_session: histogram,
}
```

> **Khuyến nghị:** Dùng Prometheus + Grafana hoặc DataDog để monitor. Với 1000 players/game, các metric trên là critical.

---

## 13. Summary — Điểm Chính

| Vấn đề | Giải pháp | Layer |
|---|---|---|
| 1000 answers đến cùng lúc | Redis LPUSH buffer + batch insert | Redis |
| Trùng câu trả lời (1 player, 1 question) | Redis SETNX atomic | Redis |
| Điểm số race condition | Redis Lua script atomic | Redis |
| DB connection exhaustion | PgBouncer + batch insert | PostgreSQL |
| Cross-instance WebSocket | Socket.io Redis Adapter | Redis |
| Leaderboard nhanh | Redis Sorted Set (ZREVRANGE) | Redis |
| State sync giữa instances | Redis Hash + Pub/Sub | Redis |
| Append-only log | `PlayerAnswer` — không UPDATE | PostgreSQL |
| Score computation | `RECOMPUTE` via SQL after flush | PostgreSQL |

**Stack đề xuất thêm vào project:**
- `ioredis` — Redis client
- `@socket.io/redis-adapter` — Multi-instance WebSocket
- `pg` (đã có) + `pg-pool` / PgBouncer — Connection pooling
- `@nestjs/bull` — Background job queue (buffer flush)
