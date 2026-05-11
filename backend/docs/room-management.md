# Room Management

## Current Status

**RoomService**: ✅ IMPLEMENTED
**RoomGateway**: ✅ IMPLEMENTED (WebSocket)
**RoomController**: ✅ IMPLEMENTED

## Database Schema (Room)

```prisma
model Room {
  id        String     @id @default(uuid())
  pin       String     @unique        // 6-digit PIN code
  quizId    String                    // Quiz được sử dụng
  hostId    String                    // User tạo room
  status    RoomStatus @default(WAITING)  // WAITING | PLAYING | FINISHED
  createdAt DateTime  @default(now())
  
  quiz      Quiz       @relation(...)
  host      User       @relation(...)
  players   Player[]
  sessions  GameSession[]
}

enum RoomStatus {
  WAITING
  PLAYING
  FINISHED
}
```

## Create Room

### DTO

```typescript
// src/room/dto/create-room.dto.ts
export class CreateRoomDto {
  @IsUUID()
  @IsNotEmpty()
  quizId: string;

  @IsOptional()
  @IsString()
  pin?: string;  // Optional, auto-generate nếu không cung cấp
}
```

### Implementation

```typescript
async create(createRoomDto: CreateRoomDto, userId: string) {
  // 1. Validate user owns quiz
  const quiz = await this.prisma.quiz.findUnique({
    where: { id: createRoomDto.quizId },
    include: { questions: { include: { answers: true } } }
  });
  
  if (!quiz) throw new NotFoundException('Quiz not found');
  if (quiz.deletedAt) throw new BadRequestException('Quiz has been deleted');
  if (quiz.createdBy !== userId) throw new ForbiddenException();
  if (!quiz.questions?.length) throw new BadRequestException('Quiz has no questions');
  
  // 2. Generate unique PIN (6 digits)
  const pin = providedPin || await this.generateUniquePin();
  
  // 3. Create room
  return this.prisma.room.create({ data: { pin, quizId, hostId: userId, status: 'WAITING' } });
}
```

## Join Room

### REST API

```typescript
// POST /room/join
{ pin: string, nickname: string }
```

### WebSocket

```typescript
// join_room event
{ pin: string, nickname: string }

// Response: room_joined
{ room, player, players, quiz }
```

### Flow

```
Client                          Server                         Database
  │                                │                               │
  │──── join_room ───────────────▶│                               │
  │    { pin, nickname }          │                               │
  │                                │── Validate room ─────────────▶│
  │                                │◀── Room exists ──────────────│
  │                                │── Create/update Player ──────▶│
  │                                │                               │
  │◀─── room_joined ──────────────│                               │
  │    { room, player, players }  │                               │
  │                                │── Broadcast player_joined ───▶│
  │◀─── player_joined ────────────│  (to other players)           │
```

## Host/Player Roles

| Role | Permissions |
|------|-------------|
| **Host** | Start game, Kick player, End game, View all players |
| **Player** | Submit answers, View leaderboard, Leave room |

## Room States

```
┌──────────┐    host starts    ┌──────────┐   all done   ┌──────────┐
│ WAITING  │──────────────────▶│ PLAYING  │─────────────▶│ FINISHED│
└──────────┘                   └──────────┘              └──────────┘
     │                              │
     │                              │
     └──────────────────────────────┘
              host cancels / no players
```

## Leave Room

```typescript
// WebSocket: leave_room
{ roomId: string }

// Logic:
// 1. Remove player from DB
// 2. If host left:
//    - Transfer to next player (if any)
//    - Or close room (FINISHED status)
// 3. Broadcast player_left to room
```

## Host Transfer Logic

```typescript
if (room.hostId === playerId) {
  if (room.status === 'WAITING' && room.players.length > 1) {
    // Transfer to next player
    const newHost = room.players.find(p => p.id !== playerId);
    await this.prisma.room.update({
      where: { id: roomId },
      data: { hostId: newHost.id }
    });
  } else {
    // Close room
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: 'FINISHED' }
    });
  }
}
```

## WebSocket Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join_room` | Client → Server | `{ pin, nickname }` | Join by PIN |
| `join_by_id` | Client → Server | `{ roomId, nickname }` | Join by ID |
| `leave_room` | Client → Server | `{ roomId }` | Leave room |
| `get_room_state` | Client → Server | `{ roomId }` | Get current state |
| `room_joined` | Server → Client | `{ room, player, players, quiz }` | Joined success |
| `player_joined` | Server → Client | `{ player, playerCount }` | Someone joined |
| `player_left` | Server → Client | `{ playerId, nickname, playerCount }` | Someone left |
| `room_left` | Server → Client | `{ roomId, message }` | Confirm left |
| `error` | Server → Client | `{ message }` | Error occurred |

## PIN Generation

```typescript
private async generateUniquePin(): Promise<string> {
  let pin: string;
  let attempts = 0;
  
  do {
    pin = Math.random().toString().slice(2, 8).padStart(6, '0');
    const exists = await this.prisma.room.findUnique({ where: { pin } });
    if (!exists) return pin;
    attempts++;
  } while (attempts < 10);
  
  throw new Error('Failed to generate unique PIN');
}
```

## Validation

| Check | Error | Status |
|-------|-------|--------|
| Room exists | NotFoundException | ✅ |
| Room waiting | BadRequestException | ✅ |
| Nickname unique | ConflictException | ✅ |
| Quiz exists | NotFoundException | ✅ |
| Quiz not deleted | BadRequestException | ✅ |
| User owns quiz | ForbiddenException | ✅ |
| Quiz has questions | BadRequestException | ✅ |
