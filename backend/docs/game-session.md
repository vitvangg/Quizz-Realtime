# Game Session

## Current Status

**GameSessionService**: ❌ CHƯA IMPLEMENT
**GameSessionModule**: Basic module tồn tại
**State Machine**: ❌ CHƯA IMPLEMENT

## RoomStatus (từ schema.prisma)

```prisma
enum RoomStatus {
  WAITING
  PLAYING
  FINISHED
}
```

Hiện tại game state chỉ có 3 trạng thái cơ bản từ `RoomStatus` enum.

## Database Schema

### GameSession

```prisma
model GameSession {
  id                    String   @id @default(uuid())
  roomId                String
  status                RoomStatus @default(WAITING)
  startedAt             DateTime @default(now())
  endedAt               DateTime?
  currentQuestionIndex  Int      @default(0)
  questionStartedAt     DateTime?

  room    Room            @relation(fields: [roomId], references: [id])
  players PlayerSession[]
}
```

### PlayerSession

```prisma
model PlayerSession {
  id         String @id @default(uuid())
  playerId  String
  sessionId String
  score     Int    @default(0)

  player  Player         @relation(fields: [playerId], references: [id])
  session GameSession    @relation(fields: [sessionId], references: [id])
  answers PlayerAnswer[]
}
```

### PlayerAnswer

```prisma
model PlayerAnswer {
  id                String @id @default(uuid())
  playerSessionId   String
  questionId        String
  answerId          String
  questionContent   String?
  answerContent     String?
  isCorrect         Boolean
  scoreEarned       Int     @default(0)
  timeAnswered      DateTime @default(now())

  playerSession PlayerSession @relation(fields: [playerSessionId], references: [id])
  question      Question      @relation(fields: [questionId], references: [id])
  answer        Answer        @relation(fields: [answerId], references: [id])

  @@unique([playerSessionId, questionId])
}
```

## TODO - Implementation Checklist

- [ ] GameSessionService - Full implementation
- [ ] WebSocket Gateway cho game events
- [ ] Start game flow
- [ ] Question emission
- [ ] Answer handling
- [ ] Score calculation
- [ ] Leaderboard
- [ ] End game
