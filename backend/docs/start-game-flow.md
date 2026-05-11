# Start Game Flow

## Overview

Flow từ khi host nhấn "Start Game" đến khi câu hỏi đầu tiên được emit.

## Sequence Diagram

```
Host                          Server                        Database                    Players
 │                              │                              │                           │
 │──── start_game ─────────────▶│                              │                           │
 │    { roomId }                │                              │                           │
 │                              │── Get room + quiz ───────────▶│                           │
 │                              │◀─ Room, Questions ────────────│                           │
 │                              │                              │                           │
 │                              │── Create GameSession ─────────▶│                           │
 │                              │◀─ Session created ────────────│                           │
 │                              │                              │                           │
 │                              │── Create PlayerSessions ─────▶│                           │
 │                              │                              │                           │
 │                              │◀─ ALL READY ──────────────────│                           │
 │                              │                              │                           │
 │◀── game_starting ───────────│                              │                           │
 │    { countdown: 5 }          │                              │                           │
 │                              │                              │                           │
 │                              │──── player_list_update ───────────────────────────────▶  │
 │                              │    { players: [] }            │                           │
 │                              │                              │                           │
 │                              │    [5s countdown via setTimeout]                        │
 │                              │                              │                           │
 │                              │──── question_start ──────────────────────────────────▶  │
 │                              │    { question, timeLimit }   │                           │
 │                              │                              │                           │
```

## Implementation Steps

### Step 1: Validate Start Request

```typescript
// src/game/game-session.service.ts

async validateStartGame(roomId: string, userId: string) {
  // 1. Get room with players
  const room = await this.prisma.room.findUnique({
    where: { id: roomId },
    include: {
      players: true,
      quiz: {
        include: {
          questions: {
            include: { answers: true },
            orderBy: { orderIndex: 'asc' }
          }
        }
      }
    }
  });
  
  // 2. Validate host
  if (room.hostId !== userId) {
    throw new ForbiddenException('Only host can start game');
  }
  
  // 3. Validate game not started
  if (room.status !== 'WAITING') {
    throw new BadRequestException('Game already started or finished');
  }
  
  // 4. Validate players exist
  if (room.players.length === 0) {
    throw new BadRequestException('No players in room');
  }
  
  // 5. Validate quiz has questions
  if (room.quiz.questions.length === 0) {
    throw new BadRequestException('Quiz has no questions');
  }
  
  return room;
}
```

### Step 2: Create Game Session

```typescript
async createGameSession(roomId: string, room: RoomWithRelations) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Create session
    const session = await tx.gameSession.create({
      data: {
        roomId,
        status: 'WAITING',
        currentQuestionIndex: 0
      }
    });
    
    // 2. Create player sessions for all players
    await tx.playerSession.createMany({
      data: room.players.map(player => ({
        playerId: player.id,
        sessionId: session.id,
        score: 0
      }))
    });
    
    // 3. Update room status
    await tx.room.update({
      where: { id: roomId },
      data: { status: 'PLAYING' }
    });
    
    return session;
  });
}
```

### Step 3: Emit Countdown

```typescript
// src/game/game.gateway.ts

async handleStartGame(client: Socket, payload: { roomId: string }) {
  const { roomId } = payload;
  
  // Validate and create session
  const session = await this.gameSessionService.startGame(roomId);
  
  // Store session state in memory (or Redis)
  this.gameState.set(session.id, {
    status: 'STARTING',
    roomId,
    questions: loadedQuestions
  });
  
  // Emit countdown
  this.server.to(roomId).emit('game_starting', { countdown: 5 });
  
  // Start countdown
  for (let i = 5; i > 0; i--) {
    await this.delay(1000);
    this.server.to(roomId).emit('countdown_tick', { remaining: i - 1 });
  }
  
  // Emit first question
  await this.emitQuestion(session.id, 0);
}
```

## Anti-Double-Start Protection

```typescript
// Guard against multiple start requests
private gameStarting = new Set<string>();  // roomId being started

async handleStartGame(roomId: string) {
  // Prevent double start
  if (this.gameStarting.has(roomId)) {
    throw new ConflictException('Game already starting');
  }
  
  try {
    this.gameStarting.add(roomId);
    // ... start game logic
  } finally {
    this.gameStarting.delete(roomId);
  }
}
```

## Countdown Events

| Event | Payload | Description |
|-------|---------|-------------|
| `game_starting` | `{ countdown: 5 }` | Game is about to start |
| `countdown_tick` | `{ remaining: 4 }` | Countdown update |
| `question_start` | `{ question, timeLimit, index }` | First question |

## Validation Summary

| Check | Error | Message |
|-------|-------|---------|
| Is host | Forbidden | "Only host can start game" |
| Room exists | NotFound | "Room not found" |
| Room waiting | BadRequest | "Game already started" |
| Has players | BadRequest | "No players in room" |
| Quiz has questions | BadRequest | "Quiz has no questions" |
| Not already starting | Conflict | "Game already starting" |

## Error Handling

```typescript
async handleStartGame(client: Socket, payload: { roomId: string }) {
  try {
    // Check auth
    const identity = this.getSocketIdentity(client);
    if (!identity.isHost) {
      client.emit('error', { message: 'Only host can start' });
      return;
    }
    
    // Start game
    await this.gameSessionService.startGame(payload.roomId, identity.userId);
    
    // Emit success
    this.server.to(payload.roomId).emit('game_started', {
      playerCount: players.length
    });
    
  } catch (error) {
    client.emit('error', {
      message: error.message,
      code: error.response?.statusCode || 500
    });
  }
}
```

## Client-Side Handling

```typescript
// Client
socket.on('game_starting', (data) => {
  showCountdownOverlay(data.countdown);
});

socket.on('countdown_tick', (data) => {
  updateCountdownDisplay(data.remaining);
});

socket.on('question_start', (data) => {
  hideCountdown();
  displayQuestion(data.question);
  startQuestionTimer(data.timeLimit);
});
```
