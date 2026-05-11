# Game Session - CRITICAL DOCUMENT

## Current Status

**GameSessionService**: Stub implementation - chỉ có placeholder methods
**GameSessionModule**: Basic module tồn tại

## Database Schema (Game Session)

```prisma
model GameSession {
  id                    String   @id @default(uuid())
  roomId                String
  status                RoomStatus @default(WAITING)
  startedAt             DateTime @default(now())
  endedAt               DateTime?
  currentQuestionIndex  Int      @default(0)
  questionStartedAt     DateTime?
  
  room    Room            @relation(...)
  players PlayerSession[]
}

model PlayerSession {
  id        String @id @default(uuid())
  playerId  String
  sessionId String
  score     Int    @default(0)
  
  player  Player         @relation(...)
  session GameSession    @relation(...)
  answers PlayerAnswer[]
}

model PlayerAnswer {
  id              String @id @default(uuid())
  playerSessionId String
  questionId      String
  answerId        String
  questionContent String?  // Snapshot
  answerContent   String?  // Snapshot
  isCorrect       Boolean
  scoreEarned     Int     @default(0)
  timeAnswered    DateTime @default(now())
}
```

## Proposed State Machine

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    ▼                                          │
┌──────────┐  start  ┌──────────┐  timer   ┌─────────────┐    │
│ WAITING  │────────▶│STARTING  │────────▶│QUESTION_    │    │
└──────────┘         └──────────┘  ends   │ACTIVE       │────┘
     ▲                                     └─────────────┘
     │                                          │
     │                                          │ timer
     │                                          │ ends
     │                                          ▼
     │                                  ┌───────────────┐
     │                                  │QUESTION_RESULT│
     │                                  └───────────────┘
     │                                          │
     │                                          │ next
     │                                          ▼
     │                                  ┌───────────────┐
     │                                  │ LEADERBOARD   │────┐
     │                                  └───────────────┘    │
     │                                          │            │
     │                                          │ last q     │
     │                                          ▼            │
     │                                    ┌───────────┐      │
     │                                    │ FINISHED  │◀─────┘
     │                                    └───────────┘
     │                                          ▲
     │                                          │
     └──────────────────────────────────────────┘
                          host cancels
```

## State Definitions

| State | Description | Valid Transitions |
|-------|-------------|------------------|
| `WAITING` | Chờ player join, host chưa start | → STARTING (host starts) |
| `STARTING` | Countdown trước khi bắt đầu | → QUESTION_ACTIVE |
| `QUESTION_ACTIVE` | Đang hiển thị câu hỏi, timer chạy | → QUESTION_RESULT |
| `QUESTION_RESULT` | Hiển thị đáp án đúng | → LEADERBOARD |
| `LEADERBOARD` | Hiển thị bảng điểm | → QUESTION_ACTIVE / FINISHED |
| `FINISHED` | Game kết thúc | - |

## Game Session Interface

```typescript
interface GameSessionState {
  sessionId: string;
  roomId: string;
  status: GameState;
  currentQuestionIndex: number;
  totalQuestions: number;
  questionStartedAt: Date | null;
  timeLimit: number;           // seconds per question
  players: PlayerInGame[];
  questions: Question[];        // loaded at start
}

interface PlayerInGame {
  playerId: string;
  nickname: string;
  score: number;
  answeredCurrent: boolean;
  answers: PlayerAnswer[];     // history
}
```

## Start Game Flow (Suggested)

```typescript
async startGame(roomId: string, hostId: string) {
  // 1. Validate host
  const room = await this.prisma.room.findUnique({
    where: { id: roomId },
    include: { 
      quiz: { include: { questions: { include: { answers: true } } } },
      players: true 
    }
  });
  
  if (room.hostId !== hostId) throw new ForbiddenException('Only host can start');
  if (room.players.length < 1) throw new BadRequestException('Need at least 1 player');
  
  // 2. Create session
  const session = await this.prisma.gameSession.create({
    data: {
      roomId,
      status: 'WAITING',
      currentQuestionIndex: 0
    }
  });
  
  // 3. Create player sessions
  await this.prisma.playerSession.createMany({
    data: room.players.map(p => ({
      playerId: p.id,
      sessionId: session.id,
      score: 0
    }))
  });
  
  // 4. Update room status
  await this.prisma.room.update({
    where: { id: roomId },
    data: { status: 'PLAYING' }
  });
  
  return session;
}
```

## Question Flow (Suggested)

```typescript
// src/game/game-session.service.ts

async emitQuestion(sessionId: string) {
  const session = await this.getSessionWithData(sessionId);
  const question = session.questions[session.currentQuestionIndex];
  
  // Update state
  await this.prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      status: 'QUESTION_ACTIVE',
      questionStartedAt: new Date()
    }
  });
  
  // Emit to room (via WebSocket)
  this.gameGateway.emitToRoom(session.roomId, 'question_start', {
    questionIndex: session.currentQuestionIndex,
    question: {
      id: question.id,
      content: question.content,
      answers: question.answers.map(a => ({
        id: a.id,
        content: a.content
      }))  // NOT isCorrect!
    },
    timeLimit: question.timeLimit,
    totalQuestions: session.questions.length
  });
  
  // Schedule timer
  this.scheduleQuestionEnd(sessionId, question.timeLimit);
}

async handleQuestionEnd(sessionId: string) {
  const session = await this.getSessionWithData(sessionId);
  const question = session.questions[session.currentQuestionIndex];
  
  // Emit result
  this.gameGateway.emitToRoom(session.roomId, 'question_result', {
    correctAnswer: question.answers.find(a => a.isCorrect),
    scores: this.calculateLeaderboard(session)
  });
  
  // Check if last question
  if (session.currentQuestionIndex >= session.questions.length - 1) {
    await this.endGame(sessionId);
  } else {
    // Emit leaderboard, then next question
    await this.emitLeaderboard(sessionId);
    await this.delay(5000);  // 5s showing result
    await this.nextQuestion(sessionId);
  }
}
```

## Timer Synchronization

```typescript
// Server-side timer (source of truth)
interface QuestionTimer {
  sessionId: string;
  questionIndex: number;
  startedAt: Date;
  duration: number;  // seconds
  serverTime: number;
}

// Client receives server time to calculate remaining
// Client: remaining = duration - (serverNow - startedAt)
```

## Score Calculation

```typescript
async calculateScore(
  playerSessionId: string,
  questionId: string,
  answerId: string,
  questionStartedAt: Date
): Promise<number> {
  const question = await this.prisma.question.findUnique({
    where: { id: questionId },
    include: { answers: true }
  });
  
  const answer = question.answers.find(a => a.id === answerId);
  if (!answer?.isCorrect) return 0;
  
  // Time-based scoring
  const timeTaken = Date.now() - questionStartedAt.getTime();
  const maxTime = question.timeLimit * 1000;
  
  // Faster = more points
  const timeBonus = Math.max(0, 1000 - Math.floor(timeTaken / 10));
  const baseScore = 1000;
  
  return baseScore + timeBonus;
}
```

## Reconnect Strategy (Suggested)

```typescript
// When player reconnects
async handleReconnect(socketId: string, playerId: string, sessionId: string) {
  // 1. Find player's session
  const playerSession = await this.prisma.playerSession.findUnique({
    where: {
      playerId_sessionId: { playerId, sessionId }
    }
  });
  
  if (!playerSession) throw new NotFoundException('Session not found');
  
  // 2. Get current game state
  const session = await this.prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { questions: true }
  });
  
  // 3. Send current state to player
  return {
    status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    questions: session.questions.map(q => ({
      // Only send question content, not answers
      id: q.id,
      content: q.content
    })),
    score: playerSession.score,
    answers: await this.getPlayerAnswers(playerSession.id)
  };
}
```

## TODO - Implementation Checklist

- [ ] GameSessionService - Full implementation
- [ ] Create player sessions on game start
- [ ] Question emission logic
- [ ] Timer handling (server-side)
- [ ] Answer validation
- [ ] Score calculation
- [ ] State machine transitions
- [ ] Reconnect logic
- [ ] Leaderboard calculation
- [ ] End game cleanup
