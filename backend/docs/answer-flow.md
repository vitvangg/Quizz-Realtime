# Answer Flow

## Overview

Flow từ khi player submit answer đến khi tính điểm và broadcast kết quả.

## Sequence Diagram

```
Player                          Server                        Database
  │                              │                              │
  │──── submit_answer ──────────▶│                              │
  │    { questionId, answerId }  │                              │
  │                              │── Validate player in game ────▶│
  │                              │                              │
  │                              │── Check already answered? ──▶│
  │                              │◀─ No previous answer ─────────│
  │                              │                              │
  │                              │── Get question + answer ─────▶│
  │                              │◀─ Question details ──────────│
  │                              │                              │
 │                               │── Calculate score ───────────│
 │                               │                              │
 │                               │── Save PlayerAnswer ─────────▶│
 │                               │◀─ Answer saved ─────────────│
 │                               │                              │
 │                               │── Update PlayerSession score─▶│
 │                               │◀─ Score updated ─────────────│
 │                               │                              │
 │◀─── answer_received ──────────│                              │
 │    { received: true }         │                              │
 │                              │                              │
 │                              │── Broadcast to room ─────────▶│
 │                              │◀─ emit player_answered ───────│
```

## Submit Answer Flow

### Step 1: Validate Answer

```typescript
// src/game/answer-handler.service.ts

async handleAnswer(
  sessionId: string,
  playerId: string,
  questionId: string,
  answerId: string
) {
  // 1. Get current session state
  const session = await this.prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { room: true }
  });
  
  // 2. Validate game state allows answers
  if (session.status !== 'QUESTION_ACTIVE') {
    throw new BadRequestException('Not accepting answers right now');
  }
  
  // 3. Validate player in session
  const playerSession = await this.prisma.playerSession.findUnique({
    where: {
      playerId_sessionId: { playerId, sessionId }
    }
  });
  
  if (!playerSession) {
    throw new NotFoundException('Player not in this session');
  }
  
  // 4. Check duplicate answer
  const existingAnswer = await this.prisma.playerAnswer.findUnique({
    where: {
      playerSessionId_questionId: { playerSessionId: playerSession.id, questionId }
    }
  });
  
  if (existingAnswer) {
    throw new ConflictException('Already answered this question');
  }
  
  // 5. Validate answer exists and belongs to question
  const answer = await this.prisma.answer.findFirst({
    where: { id: answerId, questionId }
  });
  
  if (!answer) {
    throw new BadRequestException('Invalid answer');
  }
  
  return { playerSession, answer, session };
}
```

### Step 2: Calculate Score

```typescript
async calculateScore(
  answer: Answer,
  session: GameSession
): Promise<{ score: number; isCorrect: boolean }> {
  const isCorrect = answer.isCorrect;
  
  if (!isCorrect) {
    return { score: 0, isCorrect: false };
  }
  
  // Time-based scoring
  const questionStartedAt = session.questionStartedAt;
  const now = new Date();
  const timeTaken = now.getTime() - questionStartedAt.getTime(); // ms
  
  const question = await this.prisma.question.findUnique({
    where: { id: answer.questionId }
  });
  
  const maxTime = question.timeLimit * 1000; // seconds to ms
  
  // Scoring formula (Kahoot-like)
  // - Base: 1000 points for correct
  // - Time bonus: up to 1000 bonus for fast answers
  const baseScore = 1000;
  const timeBonus = Math.max(0, Math.floor((1 - timeTaken / maxTime) * 1000));
  
  return {
    score: baseScore + timeBonus,
    isCorrect: true
  };
}
```

### Step 3: Save Answer

```typescript
async saveAnswer(
  playerSessionId: string,
  questionId: string,
  answerId: string,
  isCorrect: boolean,
  score: number
) {
  // Get question and answer content for snapshot
  const question = await this.prisma.question.findUnique({
    where: { id: questionId }
  });
  const answer = await this.prisma.answer.findUnique({
    where: { id: answerId }
  });
  
  return this.prisma.$transaction(async (tx) => {
    // 1. Save player answer
    const playerAnswer = await tx.playerAnswer.create({
      data: {
        playerSessionId,
        questionId,
        answerId,
        questionContent: question.content,  // Snapshot
        answerContent: answer.content,      // Snapshot
        isCorrect,
        scoreEarned: score,
        timeAnswered: new Date()
      }
    });
    
    // 2. Update player session score
    await tx.playerSession.update({
      where: { id: playerSessionId },
      data: {
        score: { increment: score }
      }
    });
    
    return playerAnswer;
  });
}
```

## Answer Received Broadcast

```typescript
// In GameGateway
async handleAnswerSubmit(client: Socket, payload: AnswerPayload) {
  const identity = this.socketMap.get(client.id);
  
  try {
    const result = await this.answerService.submitAnswer(
      identity.sessionId,
      identity.playerId,
      payload.questionId,
      payload.answerId
    );
    
    // Confirm to player
    client.emit('answer_received', {
      received: true,
      scoreEarned: result.score
    });
    
    // Broadcast to room (without revealing correctness)
    this.server.to(identity.roomId).emit('player_answered', {
      playerId: identity.playerId,
      nickname: identity.nickname,
      questionIndex: result.questionIndex
    });
    
  } catch (error) {
    client.emit('answer_error', {
      message: error.message
    });
  }
}
```

## Duplicate Answer Prevention

```typescript
// Database unique constraint prevents duplicates
// PlayerAnswer: @@unique([playerSessionId, questionId])

// Also check in code for faster feedback
const hasAnswered = playerAnswers.has(`${playerId}-${questionId}`);
if (hasAnswered) {
  throw new ConflictException('Already answered');
}

// Add to tracking set
playerAnswers.set(`${playerId}-${questionId}`, true);
```

## Answer Buffering (Optional)

```typescript
// Buffer answers during question, process at end
// Useful for analytics even if player didn't complete

private answerBuffer = new Map<string, BufferedAnswer[]>();

async bufferAnswer(sessionId: string, playerId: string, payload: AnswerPayload) {
  const key = `${sessionId}-${playerId}`;
  
  if (!this.answerBuffer.has(key)) {
    this.answerBuffer.set(key, []);
  }
  
  this.answerBuffer.get(key).push({
    ...payload,
    bufferedAt: Date.now()
  });
}

async processBufferedAnswers(sessionId: string) {
  const entries = this.answerBuffer.entries();
  for (const [key, answers] of entries) {
    // Process each buffered answer
    for (const answer of answers) {
      await this.saveAnswer(...);
    }
  }
  this.answerBuffer.delete(sessionId);
}
```

## Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `submit_answer` | Client → Server | `{ questionId, answerId }` | Player submits answer |
| `answer_received` | Server → Client | `{ received, scoreEarned }` | Confirm answer received |
| `answer_error` | Server → Client | `{ message }` | Error response |
| `player_answered` | Server → Client | `{ playerId, nickname, questionIndex }` | Broadcast to room |

## Validation Summary

| Check | Error | Message |
|-------|-------|---------|
| Game accepting answers | BadRequest | "Not accepting answers right now" |
| Player in session | NotFound | "Player not in this session" |
| Not duplicate | Conflict | "Already answered this question" |
| Answer valid | BadRequest | "Invalid answer" |
| Within time | BadRequest | "Time expired" |
