# Quiz Game ΓÇö High-Scale Architecture (1000+ Players)

> **Scope:** Chß╗ë tß║¡p trung code v├áo c├íc module phß╗Ñc vß╗Ñ game thß╗¥i gian thß╗▒c ΓÇö Room, Game Session, Player, Player Session ΓÇö v├á c├ích ch├║ng ─æ╞░ß╗úc thiß║┐t kß║┐ ─æß╗â chß╗ïu tß║úi 1000 players ─æß╗ông thß╗¥i trong mß╗Öt game session, c├╣ng gß╗¡i c├óu trß║ú lß╗¥i gß║ºn nh╞░ c├╣ng l├║c.

---

## 1. Tß╗òng Quan Kiß║┐n Tr├║c Layer

```
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                    CLIENT (Web/Mobile)                   Γöé
Γöé     WebSocket (Socket.io / Native WS) ΓÇö bidirectional   Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                       Γöé
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé              GATEWAY / API LAYER (NestJS)                Γöé
Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ Γöé
Γöé  Γöé  REST APIs     Γöé  Γöé  WebSocket Gateway (Gateway)    Γöé Γöé
Γöé  Γöé  (CRUD Room,   Γöé  Γöé  ΓöÇΓöÇΓöÇ event-driven, stateful ΓöÇΓöÇΓöÇ Γöé Γöé
Γöé  Γöé   Quiz, Auth)  Γöé  Γöé  - @SubscribeMessage           Γöé Γöé
Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ Γöé
Γöé          Γöé                          Γöé                     Γöé
Γöé          ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ                     Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                          Γöé
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                   CACHE / REAL-TIME LAYER                   Γöé
Γöé                                                             Γöé
Γöé   ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ    ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé   Γöé     Redis        Γöé    Γöé    In-Process State (per     Γöé  Γöé
Γöé   Γöé  (cross-node)    Γöé    Γöé    NestJS instance / worker) Γöé  Γöé
Γöé   Γöé  ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ   Γöé    Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé  Γöé
Γöé   Γöé  - Session state Γöé    Γöé  Γöé  GameSessionStore      Γöé  Γöé  Γöé
Γöé   Γöé  - Leaderboard   Γöé    Γöé  Γöé  (Map<sessionId, ...>) Γöé  Γöé  Γöé
Γöé   Γöé  - Rate limiting Γöé    Γöé  Γöé  ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ  Γöé  Γöé  Γöé
Γöé   Γöé  - Pub/Sub       Γöé    Γöé  Γöé  - currentQuestionIndex Γöé  Γöé  Γöé
Γöé   Γöé  - Answer queue  Γöé    Γöé  Γöé  - questionStartedAt   Γöé  Γöé  Γöé
Γöé   Γöé                  Γöé    Γöé  Γöé  - answerBuffer: Map   Γöé  Γöé  Γöé
Γöé   Γöé                  Γöé    Γöé  Γöé    questionId ΓåÆ []      Γöé  Γöé  Γöé
Γöé   ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ    Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé  Γöé
Γöé                         ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                            Γöé
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                 PERSISTENCE LAYER (PostgreSQL)             Γöé
Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ Γöé
Γöé  Γöé  Prisma ORM + PgBouncer (connection pooler)           Γöé Γöé
Γöé  Γöé  ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Γöé Γöé
Γöé  Γöé  Room, Player, GameSession, PlayerSession,            Γöé Γöé
Γöé  Γöé  PlayerAnswer (append-only log)                        Γöé Γöé
Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

**Nguy├¬n tß║»c cß╗æt l├╡i:**
- **Redis** = hot state (c├óu trß║ú lß╗¥i ─æß║┐n ─æ├óu ghi ─æß║┐n ─æ├│, kh├┤ng blocking DB).
- **PostgreSQL** = cold storage (batch flush khi round kß║┐t th├║c).
- **In-process Map** = ultra-low-latency local cache cho question state.
- DB chß╗ë ─æ╞░ß╗úc chß║ím khi thß║¡t sß╗▒ cß║ºn persist, kh├┤ng phß║úi mß╗ùi c├óu trß║ú lß╗¥i.

---

## 2. Data Model (Prisma Schema Mß╗ƒ Rß╗Öng)

### 2.1 Prisma Schema ΓÇö Chi Tiß║┐t C├íc Model Game

```prisma
// ==============================================================
// ROOM ΓÇö Ph├▓ng ch╞íi (static metadata)
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
// ≡ƒƒó PLAYER
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
// ≡ƒöÑ GAME SESSION
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
// ≡ƒöÑ PLAYER SESSION
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
// ≡ƒöÑ PLAYER ANSWER (HISTORY ΓåÆ KH├öNG CASCADE)
//
model PlayerAnswer {
  id              String @id @default(uuid())
  playerSessionId String @map("player_session_id")
  questionId      String @map("question_id")
  answerId        String @map("answer_id")

  // ≡ƒöÑ snapshot chß╗æng sai lß╗ïch sß╗¡ (optional nh╞░ng n├¬n c├│)
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
  @@index([playerSessionId, isCorrect]) // ≡ƒöÑ optimize score
  @@map("player_answers")
}

//
// ≡ƒöÉ AUTH SESSION
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
// REVISED: RoomStatus enum ΓÇö th├¬m ─æß╗â sync real-time state
// ==============================================================
enum RoomStatus {
  WAITING    // Chß╗¥ ng╞░ß╗¥i ch╞íi
  PLAYING    // ─Éang ch╞íi
  FINISHED   // Kß║┐t th├║c
}

// ==============================================================
// HELPER: BIGINT mapping cho Prisma (PostgreSQL)
// ==============================================================
// Prisma hß╗ù trß╗ú BigInt via Int? nh╞░ng giß╗¢i hß║ín ß╗ƒ JS Number.
// Vß╗¢i avg_response_time_ms, d├╣ng Int l├á ─æß╗º (max ~20000ms).
// Nß║┐u cß║ºn ch├¡nh x├íc h╞ín cho sum: store as Int (ms), compute in app.
```

### 2.2 Tß║íi Sao Schema N├áy Chß╗ïu ─É╞░ß╗úc 1000 Players

| Th├ánh phß║ºn | L├╜ do |
|---|---|
| `PlayerAnswer` **append-only** | Kh├┤ng c├│ UPDATE/DELETE ΓåÆ kh├┤ng c├│ row lock contention |
| **Denormalized `sessionId`** tr├¬n `PlayerAnswer` | Kh├┤ng cß║ºn JOIN qua PlayerSession ─æß╗â query leaderboard |
| `@@index([sessionId, scoreEarned])` | Leaderboard top-N ─æ╞░ß╗úc index hß╗ù trß╗ú, kh├┤ng full scan |
| `@@unique([playerSessionId, questionId])` | ─Éß║úm bß║úo 1 player chß╗ë trß║ú lß╗¥i 1 lß║ºn mß╗ùi c├óu ΓÇö enforced by DB |
| `avg_response_time_ms` as **Int (BIGINT)** | Kh├┤ng d├╣ng Decimal/Float ΓåÆ so s├ính nhanh, kh├┤ng precision issue |
| `PlayerAnswer` c├│ **snapshots** `questionContent`/`answerContent` | Kh├┤ng cß║ºn JOIN sang Question/Answer khi hiß╗ân thß╗ï lß╗ïch sß╗¡ |
| `Player` c├│ `userId` nullable | Anonymous guests kh├┤ng cß║ºn account |

---

## 3. Luß╗ông Dß╗» Liß╗çu ΓÇö Submit C├óu Trß║ú Lß╗¥i (Critical Path)

### 3.1 Write Path ΓÇö Khi Player Gß╗¡i C├óu Trß║ú Lß╗¥i

```
Player Client
    Γöé
    Γöé  WebSocket: submit_answer({ sessionId, questionId, answerId })
    Γû╝
WebSocket Gateway
    Γöé
    Γö£ΓöÇΓû║ Rate Limiter (Redis INCR expiring key) ΓöÇΓöÇΓåÆ 429 if > 3 req/s
    Γöé
    Γö£ΓöÇΓû║ Validate session ─æang PLAYING / SHOW_ANSWER
    Γöé
    Γö£ΓöÇΓû║ [REDIS] LPUSH answer_buffer:{sessionId}:{questionId}
    Γöé       payload: { playerId, answerId, timestamp }
    Γöé
    Γö£ΓöÇΓû║ [REDIS] INCR answer_count:{sessionId}:{questionId}
    Γöé
    Γö£ΓöÇΓû║ [REDIS] ZADD leaderboard:{sessionId} score delta
    Γöé       ΓåÆ chß╗ë cß║¡p nhß║¡t score nß║┐u ─æiß╗âm > ─æiß╗âm c┼⌐ (Lua script)
    Γöé
    ΓööΓöÇΓû║ ACK ngay vß╗ü client (latency < 5ms)

ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
Background Worker (every 5s OR when count reaches threshold)
    Γöé
    Γö£ΓöÇΓû║ [REDIS] LRANGE answer_buffer:{sessionId}:{questionId} 0 -1
    Γöé       ΓåÆ lß║Ñy batch answers
    Γöé
    Γö£ΓöÇΓû║ [REDIS] DEL answer_buffer
    Γöé
    Γö£ΓöÇΓû║ Prisma.createMany({ data: playerAnswers[] })  ΓåÉ BATCH INSERT
    Γöé       ΓåÆ 1 DB round-trip cho 1000 answers
    Γöé
    ΓööΓöÇΓû║ Commit checkpoint v├áo [REDIS] last_flushed:{sessionId}:{questionId}
```

### 3.2 Read Path ΓÇö Khi Cß║ºn Leaderboard / Kß║┐t Quß║ú

```
GameSession Leaderboard
    Γöé
    Γö£ΓöÇΓû║ [REDIS] ZREVRANGE leaderboard:{sessionId} 0 9 WITHSCORES
    Γöé       ΓåÆ Top 10, < 1ms, kh├┤ng chß║ím DB
    Γöé
    ΓööΓöÇΓû║ Fallback: Prisma.playerSessions.findMany({
           where: { sessionId },
           orderBy: { score: 'desc' },
           take: 10,
           include: { player: true }
         })
```

### 3.3 Tß║íi Sao Kh├┤ng Ghi Trß╗▒c Tiß║┐p V├áo DB?

| Vß║Ñn ─æß╗ü | Giß║úi ph├íp Redis Buffer |
|---|---|
| **1000 players c├╣ng gß╗¡i 1 l├║c** | Redis LPUSH O(1), kh├┤ng lock |
| **DB connection exhaustion** | Batch 100-500 rows/lß║ºn thay v├¼ 1000 individual inserts |
| **Latency spike** | ACK ngay tß╗½ Redis (< 5ms), DB write l├á async |
| **Race condition tr├╣ng c├óu trß║ú lß╗¥i** | Redis SETNX hoß║╖c Lua script atomic |
| **─Éiß╗âm cß║ºn t├¡nh to├ín** | Lua script trong Redis, atomic, kh├┤ng race |

---

## 4. Cß║Ñu Tr├║c Code ─Éß╗ü Xuß║Ñt

### 4.1 File Structure

```
backend/src/
Γö£ΓöÇΓöÇ game/
Γöé   Γö£ΓöÇΓöÇ game.module.ts
Γöé   Γö£ΓöÇΓöÇ game.gateway.ts          ΓåÉ WebSocket Gateway (NestJS)
Γöé   Γö£ΓöÇΓöÇ game.service.ts         ΓåÉ Game logic
Γöé   Γö£ΓöÇΓöÇ game-state.service.ts   ΓåÉ In-memory Map per instance
Γöé   Γö£ΓöÇΓöÇ dto/
Γöé   Γöé   Γö£ΓöÇΓöÇ submit-answer.dto.ts
Γöé   Γöé   Γö£ΓöÇΓöÇ join-room.dto.ts
Γöé   Γöé   ΓööΓöÇΓöÇ ...
Γöé   ΓööΓöÇΓöÇ interfaces/
Γöé       Γö£ΓöÇΓöÇ game-session-state.interface.ts
Γöé       ΓööΓöÇΓöÇ answer-payload.interface.ts
Γöé
Γö£ΓöÇΓöÇ redis/
Γöé   Γö£ΓöÇΓöÇ redis.module.ts
Γöé   Γö£ΓöÇΓöÇ redis.service.ts        ΓåÉ IORedis wrapper
Γöé   ΓööΓöÇΓöÇ lua-scripts/
Γöé       Γö£ΓöÇΓöÇ atomic-score-update.lua
Γöé       ΓööΓöÇΓöÇ submit-answer.lua
Γöé
Γö£ΓöÇΓöÇ room/
Γöé   Γö£ΓöÇΓöÇ room.module.ts
Γöé   Γö£ΓöÇΓöÇ room.service.ts
Γöé   Γö£ΓöÇΓöÇ room.controller.ts
Γöé   ΓööΓöÇΓöÇ ...
Γöé
ΓööΓöÇΓöÇ prisma/
    ΓööΓöÇΓöÇ prisma.service.ts
```

### 4.2 GameStateService ΓÇö In-Memory Cache

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
  // C├│ thß╗â d├╣ng @nestjs/bull ─æß╗â scale horizontal
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

### 4.3 Redis Service ΓÇö Buffer & Leaderboard

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
    // expire sau 10 ph├║t (safety net)
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
    // Lua script: chß╗ë update nß║┐u delta > 0 hoß║╖c player ch╞░a c├│
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

### 4.4 GameGateway ΓÇö WebSocket Events

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
  // CLIENT ΓåÆ SERVER EVENTS
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

    // Map socket.id ΓåÆ playerId ─æß╗â lookup nhanh
    client.data.playerId = session.playerId;
    client.data.sessionId = session.id;

    // Join socket.io room ─æß╗â broadcast
    client.join(`session:${session.id}`);

    // Gß╗¡i session state vß╗ü client
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

    // 2. Validate session ─æang ch╞íi
    const session = this.state.getSession(sessionId);
    if (!session?.currentQuestion) {
      return { event: 'error', data: { message: 'No active question' } };
    }

    const question = session.currentQuestion;
    const elapsedMs = Date.now() - question.startedAt;

    // 3. Early reject nß║┐u hß║┐t giß╗¥
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

    // Chß╗ë ghi buffer nß║┐u ch╞░a c├│ c├óu trß║ú lß╗¥i cho c├óu n├áy
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
  // SERVER ΓåÆ CLIENT EVENTS (broadcast from game logic)
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

### 4.5 GameService ΓÇö Business Logic

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
    // 1. T├¼m room ─æang WAITING
    const room = await this.prisma.room.findUnique({
      where: { pin: roomPin },
      include: {
        players: { where: { nickname } }, // kiß╗âm tra nickname tr├╣ng
        sessions: { where: { status: { in: ['WAITING', 'PLAYING'] } } },
      },
    });

    if (!room) throw new Error('Room not found');
    if (room.players.length > 0) throw new Error('Nickname already taken');
    if (room.players.length >= room.maxPlayers) {
      throw new Error('Room is full');
    }

    // 2. Tß║ío hoß║╖c lß║Ñy Player
    const player = await this.prisma.player.upsert({
      where: { roomId_userId: { roomId: room.id, userId: null } },
      create: { roomId: room.id, nickname },
      update: {},
    });

    // 3. Tß║ío PlayerSession cho session ─æang active
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

    // Broadcast countdown ΓåÆ Gateway sß║╜ emit 'countdown_start'

    // Sau 3s ΓåÆ chuyß╗ân sang PLAYING, load c├óu hß╗Åi ─æß║ºu ti├¬n
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
      // Kß║┐t th├║c game
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

    // Set timer ─æß╗â tß╗▒ ─æß╗Öng kß║┐t th├║c c├óu hß╗Åi
    setTimeout(async () => {
      await this.closeQuestionAndShowAnswer(sessionId, question.id);
    }, durationMs + 2000); // +2s grace period
  }

  // =====================================================
  // CLOSE QUESTION ΓÇö flush buffer, show answer, update leaderboard
  // =====================================================
  async closeQuestionAndShowAnswer(sessionId: string, questionId: string) {
    // 1. Flush Redis buffer ΓåÆ Prisma batch insert
    await this.flushAnswerBufferToDb(sessionId, questionId);

    // 2. Broadcast answer result
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { answers: true },
    });
    const correctAnswer = question.answers.find((a) => a.isCorrect);

    // 3. Get top scores tß╗½ Redis
    const topScores = await this.redis.getTopScores(sessionId, 10);

    // 4. Broadcast 'question_end' vß╗¢i ─æ├íp ├ín ─æ├║ng
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

    // Fetch correct answer info ─æß╗â compute score
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

    // Batch insert ΓÇö Prisma hß╗ù trß╗ú createMany vß╗¢i raw queries
    // hoß║╖c d├╣ng $executeRawBatch cho performance tß╗æi ╞░u
    await this.prisma.playerAnswer.createMany({ data: answerRecords });

    // Update PlayerSession scores
    await this.recomputePlayerScores(sessionId);

    this.logger.log(
      `Flushed ${answerRecords.length} answers for session ${sessionId}:${questionId}`,
    );
  }

  // =====================================================
  // RECOMPUTE SCORES ΓÇö chß║íy sau khi flush buffer
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

    // Final leaderboard tß╗½ Redis
    const finalScores = await this.redis.getTopScores(sessionId, 100);

    // Broadcast end
    this.broadcastSessionEnd(sessionId, finalScores);
  }

  // Placeholder methods ΓÇö implementation t├╣y integration pattern
  private broadcastQuestion(sessionId: string, question: any, durationMs: number) {}
  private broadcastQuestionEnd(sessionId: string, data: any) {}
  private broadcastSessionEnd(sessionId: string, data: any) {}
}
```

### 4.6 RedisService ΓÇö Bß╗ò Sung `trySetAnswer`

```typescript
// redis/redis.service.ts ΓÇö bß╗ò sung
async trySetAnswer(
  sessionId: string,
  questionId: string,
  playerId: string,
  payload: AnswerPayload,
): Promise<boolean> {
  // D├╣ng Redis SETNX (SET if Not eXists) ─æß╗â ─æß║úm bß║úo atomic
  const key = `answered:${sessionId}:${questionId}:${playerId}`;
  const set = await this.client.setnx(key, JSON.stringify(payload));
  if (set === 1) {
    // ─Éß║╖t expire = question duration + buffer
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
answer_buffer:{sessionId}:{questionId}      LIST      Buffer c├óu trß║ú lß╗¥i chß╗¥ flush
leaderboard:{sessionId}                     ZSET      Sorted set ─æiß╗âm sß╗æ (score ΓåÆ playerId)
answered:{sessionId}:{questionId}:{playerId} STRING    ─É├ính dß║Ñu ─æ├ú trß║ú lß╗¥i (SETNX, TTL 60s)
ratelimit:answer:{playerId}                 STRING    Rate limit counter (TTL 1s)
session:state:{sessionId}                   HASH      Session metadata (optional, cross-instance)
socket:player:{socketId}                    STRING    Map socket.id ΓåÆ playerId (TTL = session)
```

---

## 6. Database Optimization Checklist

### 6.1 PostgreSQL Settings

```sql
-- postgresql.conf

-- Connection pool (d├╣ng PgBouncer ß╗ƒ tß║ºng app)
-- max_connections = 100 (PgBouncer xß╗¡ l├╜, kh├┤ng set qu├í cao)

-- Write performance
shared_buffers = 256MB           -- 25% RAM
effective_cache_size = 1GB      -- 75% RAM
maintenance_work_mem = 128MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB

-- Concurrency (quantile estimator cho query planner)
default_statistics_target = 100

-- Disable synchronous commit cho non-critical writes
-- (DB vß║½n an to├án v├¼ Redis l├á primary, DB l├á async backup)
-- ΓÜá∩╕Å Chß╗ë ├íp dß╗Ñng cho player_answers, kh├┤ng ├íp dß╗Ñng cho transactions
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

### 6.3 Partitioning (Khi Cß║ºn Scale H╞ín Nß╗»a)

```sql
-- Partition player_answers theo th├íng (range partitioning)
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

-- Tß║ío partition cho th├íng hiß╗çn tß║íi + 2 th├íng tß╗¢i
CREATE TABLE player_answers_2026_05
  PARTITION OF player_answers
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

---

## 7. Horizontal Scaling ΓÇö Multi-Instance Deployment

```
                    ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                    Γöé  Load BalancerΓöé
                    Γöé  (Socket.io  Γöé
                    Γöé   Adapter)   Γöé
                    ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                           Γöé
         ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
         Γöé                 Γöé                 Γöé
   ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ   ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ   ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
   Γöé Instance 1 Γöé   Γöé Instance 2  Γöé   Γöé Instance 3  Γöé
   Γöé (NestJS)   Γöé   Γöé (NestJS)   Γöé   Γöé (NestJS)   Γöé
   ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ   ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ   ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
         Γöé                 Γöé                 Γöé
         ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                           Γöé
              ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
              Γöé         Redis          Γöé
              Γöé  (Pub/Sub + State)     Γöé
              Γöé  (answer_buffer,       Γöé
              Γöé   leaderboard ZSET,    Γöé
              Γöé   session state HASH)  Γöé
              ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                           Γöé
              ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
              Γöé   PostgreSQL + PgBouncer Γöé
              ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
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

- Mß╗ùi NestJS instance nhß║¡n message qua Redis Pub/Sub
- `client.join(sessionId)` ΓåÆ tß║Ñt cß║ú instances nhß║¡n, broadcast ─æß║┐n tß║Ñt cß║ú clients
- Redis buffer/leaderboard l├á **shared state** ΓåÆ kh├┤ng cß║ºn sticky sessions

---

## 8. Redis Lua Scripts

### 8.1 Atomic Score Update

```lua
-- atomic-score-update.lua
-- KEYS[1] = leaderboard:{sessionId}
-- ARGV[1] = playerId
-- ARGV[2] = deltaScore (sß╗æ nguy├¬n)
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
| Answer throughput | > 10,000 answers/gi├óy (Redis LPUSH) |
| ACK latency (client nhß║¡n ─æ╞░ß╗úc) | < 10ms p95 |
| DB batch insert latency | < 500ms cho 1000 rows |
| Leaderboard read | < 2ms (Redis ZREVRANGE) |
| Socket.io message fan-out (1000 clients) | < 50ms |
| DB leaderboard query | < 100ms cho top 100 |

---

## 10. C├┤ng Thß╗⌐c T├¡nh ─Éiß╗âm

```typescript
function calculateScore(isCorrect: boolean, responseTimeMs: number): number {
  if (!isCorrect) return 0;

  const BASE_SCORE = 1000;
  const PENALTY_PER_10MS = 1; // mß╗ùi 10ms trß╗½ 1 ─æiß╗âm
  const MIN_SCORE = 100;       // tß╗æi thiß╗âu vß║½n ─æ╞░ß╗úc 100 ─æiß╗âm nß║┐u ─æ├║ng

  const penalty = Math.floor(responseTimeMs / 10);
  return Math.max(MIN_SCORE, BASE_SCORE - penalty);
}

// V├¡ dß╗Ñ:
// - Trß║ú lß╗¥i ─æ├║ng trong 500ms  ΓåÆ 1000 - 50 = 950 ─æiß╗âm
// - Trß║ú lß╗¥i ─æ├║ng trong 9s     ΓåÆ 1000 - 900 = 100 ─æiß╗âm (floor)
// - Trß║ú lß╗¥i sai               ΓåÆ 0 ─æiß╗âm
```

---

## 11. C├íc Vß║Ñn ─Éß╗ü Cß║ºn Giß║úi Quyß║┐t Tr╞░ß╗¢c Khi Implement

1. **PgBouncer** ΓÇö Cß║ºn setup connection pooling v├¼ Prisma mß╗ƒ connection ri├¬ng
2. **Redis** ΓÇö Ch╞░a c├│ trong project ΓåÆ cß║ºn install `ioredis`, `socket.io-redis-adapter`
3. **Socket.io Redis Adapter** ΓÇö Cß║ºn adapter ─æß╗â multi-instance broadcast
4. **Cron/Queue** ΓÇö Cß║ºn `@nestjs/bull` hoß║╖c cron job ─æß╗â flush buffer ─æß╗ïnh kß╗│
5. **PlayerAnswer batch insert** ΓÇö Prisma `createMany` kh├┤ng hß╗ù trß╗ú nested relations ΓåÆ d├╣ng `$executeRaw` hoß║╖c `prisma.$transaction` batch nhß╗Å
6. **Leaderboard sync** ΓÇö Redis leaderboard l├á source of truth trong game, PostgreSQL l├á backup
7. **Socket.io rooms** ΓÇö D├╣ng `sessionId` l├ám room name ─æß╗â broadcast ─æ├║ng group

---

## 12. ─Éiß╗âm Yß║┐u Cß║ºn Gi├ím S├ít (Monitoring)

```typescript
// Metrics cß║ºn theo d├╡i
{
  redis_buffer_size: gauge,           // sß╗æ answers ─æang trong buffer
  buffer_flush_duration_ms: histogram, // thß╗¥i gian flush 1 batch
  answer_throughput: counter,         // answers/gi├óy
  db_batch_insert_duration_ms: histogram,
  leaderboard_read_latency_ms: histogram,
  socket_broadcast_duration_ms: histogram,  // fan-out 1000 clients
  active_sessions: gauge,
  players_per_session: histogram,
}
```

> **Khuyß║┐n nghß╗ï:** D├╣ng Prometheus + Grafana hoß║╖c DataDog ─æß╗â monitor. Vß╗¢i 1000 players/game, c├íc metric tr├¬n l├á critical.

---

## 13. Summary ΓÇö ─Éiß╗âm Ch├¡nh

| Vß║Ñn ─æß╗ü | Giß║úi ph├íp | Layer |
|---|---|---|
| 1000 answers ─æß║┐n c├╣ng l├║c | Redis LPUSH buffer + batch insert | Redis |
| Tr├╣ng c├óu trß║ú lß╗¥i (1 player, 1 question) | Redis SETNX atomic | Redis |
| ─Éiß╗âm sß╗æ race condition | Redis Lua script atomic | Redis |
| DB connection exhaustion | PgBouncer + batch insert | PostgreSQL |
| Cross-instance WebSocket | Socket.io Redis Adapter | Redis |
| Leaderboard nhanh | Redis Sorted Set (ZREVRANGE) | Redis |
| State sync giß╗»a instances | Redis Hash + Pub/Sub | Redis |
| Append-only log | `PlayerAnswer` ΓÇö kh├┤ng UPDATE | PostgreSQL |
| Score computation | `RECOMPUTE` via SQL after flush | PostgreSQL |

**Stack ─æß╗ü xuß║Ñt th├¬m v├áo project:**
- `ioredis` ΓÇö Redis client
- `@socket.io/redis-adapter` ΓÇö Multi-instance WebSocket
- `pg` (─æ├ú c├│) + `pg-pool` / PgBouncer ΓÇö Connection pooling
- `@nestjs/bull` ΓÇö Background job queue (buffer flush)
