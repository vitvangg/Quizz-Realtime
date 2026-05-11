# WebSocket Events

## Current Status

**RoomGateway**: ✅ IMPLEMENTED
**Namespace**: `/game`
**Events**: Room events implemented, Game events pending

## Implemented Events

### Client → Server

| Event | Payload | Description | Auth |
|-------|---------|-------------|------|
| `join_room` | `{ pin, nickname }` | Join by room PIN | - |
| `join_by_id` | `{ roomId, nickname }` | Join by room ID | - |
| `leave_room` | `{ roomId }` | Leave current room | - |
| `get_room_state` | `{ roomId }` | Get current state | - |
| `ping` | - | Heartbeat | - |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room_joined` | `{ room, player, players, quiz }` | Successfully joined |
| `player_joined` | `{ player, playerCount }` | New player joined |
| `player_left` | `{ playerId, nickname, playerCount }` | Player left |
| `room_left` | `{ roomId, message }` | Confirmed left |
| `error` | `{ message }` | Error occurred |
| `pong` | `{ timestamp }` | Heartbeat response |

## Event Payloads (Detailed)

### join_room

```typescript
// Request
interface JoinRoomPayload {
  pin: string;      // 6-digit PIN
  nickname: string;  // 1-20 characters
}

// Response: room_joined
interface RoomJoinedPayload {
  room: {
    id: string;
    pin: string;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
    hostId: string;
  };
  player: {
    id: string;
    nickname: string;
    isHost: boolean;
  };
  players: {
    id: string;
    nickname: string;
    isHost: boolean;
  }[];
  quiz: {
    id: string;
    title: string;
    questionCount: number;
  };
}
```

### player_joined

```typescript
interface PlayerJoinedPayload {
  player: {
    id: string;
    nickname: string;
  };
  playerCount: number;
  joinedBy?: string;  // Host nickname
}
```

### player_left

```typescript
interface PlayerLeftPayload {
  playerId: string;
  nickname: string;
  playerCount: number;
}
```

### error

```typescript
interface ErrorPayload {
  message: string;  // Error message
  code?: string;    // Optional error code
}
```

## Pending Events (TODO)

### Game Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `start_game` | Client → Server | Host starts game |
| `game_starting` | Server → Client | Countdown begins |
| `countdown_tick` | Server → Client | Countdown update |
| `question_start` | Server → Client | New question |
| `submit_answer` | Client → Server | Player answers |
| `answer_received` | Server → Client | Answer confirmed |
| `player_answered` | Server → Client | Player answered |
| `question_result` | Server → Client | Show correct answer |
| `leaderboard` | Server → Client | Current standings |
| `game_end` | Server → Client | Game finished |

## Error Codes

| Code | Message | When |
|------|---------|------|
| `ROOM_NOT_FOUND` | Room not found | Invalid roomId/pin |
| `ROOM_FULL` | Room is full | Player limit reached |
| `NICKNAME_TAKEN` | Nickname already in use | Duplicate nickname |
| `NOT_HOST` | Only host can perform this | Wrong permissions |
| `GAME_STARTED` | Game already started | Late join attempt |
| `GAME_FINISHED` | Game has ended | Room closed |

## Event Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                      CONNECTION LIFECYCLE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  connect ──────────────────────────────────────────────────────  │
│    │                                                              │
│    ├── (optional auth)                                           │
│    │                                                              │
│    ├── join_room ──────────────────────────────────────────────  │
│    │                                                              │
│    │    room_joined ◀── player_joined (to others)                 │
│    │                                                              │
│    ├── [Host only] start_game ────────────────────────────────    │
│    │                                                              │
│    │    game_starting ─── countdown_tick ─── question_start       │
│    │                                                              │
│    ├── [Each question] submit_answer ────────────────────────    │
│    │                                                              │
│    │    answer_received ◀── player_answered (broadcast)          │
│    │                                                              │
│    ├── [Question ends] question_result ─── leaderboard ────      │
│    │                                                              │
│    └── [Game ends] game_end ─────────────────────────────────    │
│                                                                  │
│  disconnect ───────────────────────────────────────────────────   │
│    │                                                              │
│    └── (auto leave_room)                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
