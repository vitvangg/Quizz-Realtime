# WebSocket Flow

## Current Status

**RoomGateway**: ✅ IMPLEMENTED
**Namespace**: `/game`

## Gateway Structure

```typescript
// src/room/room.gateway.ts
@WebSocketGateway({
  cors: { origin: 'http://localhost:3000' },
  namespace: '/game'
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  
  private socketMap = new Map<string, PlayerIdentity>();
  private roomSockets = new Map<string, Set<string>>();
}
```

## Connection Lifecycle

```
1. Client connects to /game namespace
   ↓
2. Server logs connection (handleConnection)
   ↓
3. Client authenticates (optional - JWT in handshake auth)
   ↓
4. Client emits 'join_room' with { roomId, nickname }
   ↓
5. Server validates room exists
   ↓
6. Server adds socket to room namespace
   ↓
7. Server broadcasts 'player_joined' to room
   ↓
8. Connection established
```

## Join Room Flow

```
Client                          Server                         Database
  │                                │                               │
  │──── join_room ───────────────▶│                               │
  │    { pin, nickname }          │                               │
  │                                │── Validate room ─────────────▶│
  │                                │◀── Room exists ──────────────│
  │                                │── Create Player ────────────▶│
  │                                │                               │
  │◀─── room_joined ──────────────│                               │
  │    { room, player, players }  │                               │
  │                                │                               │
  │                                │── Broadcast player_joined ───▶│
  │◀─── player_joined ────────────│                               │
  │    { player, playerCount }    │                               │
```

## Leave Room Flow

```
Client                          Server                         Database
  │                                │                               │
  │──── leave_room ───────────────▶│                               │
  │    { roomId }                  │                               │
  │                                │── Update Room status ────────▶│
  │                                │── Delete Player ────────────▶│
  │                                │                               │
  │◀─── room_left ────────────────│                               │
  │                                │                               │
  │◀─── player_left ──────────────│                               │
  │    { playerId, playerCount }  │                               │
  │                                │                               │
  │──── Disconnect ───────────────▶│                               │
  │    (auto leave_room)           │                               │
```

## Broadcast Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `player_joined` | Server → Client | `{ player: Player, playerCount: number }` |
| `player_left` | Server → Client | `{ playerId: string, nickname: string, playerCount: number }` |
| `room_joined` | Server → Client | Full room state |
| `room_left` | Server → Client | `{ roomId: string, message: string }` |
| `error` | Server → Client | `{ message: string }` |

## Room Isolation

```typescript
// Mỗi room là 1 Socket.IO room
// Players chỉ nhận events trong room của họ

@SubscribeMessage('join_room')
async handleJoinRoom(client: Socket, payload: JoinRoomPayload) {
  // Add socket to room
  client.join(room.id);
  
  // Emit to room (including sender)
  this.server.to(room.id).emit('player_joined', data);
  
  // Emit to others (excluding sender)
  client.to(room.id).emit('player_joined', data);
}
```

## Socket Identity

```typescript
interface PlayerIdentity {
  socketId: string;
  userId?: string;       // từ JWT (optional)
  playerId: string;     // từ DB (Player entity)
  roomId: string;
  nickname: string;
  isHost: boolean;
}

// Lưu trong Map
this.socketMap.set(socket.id, identity);
```

## Anti-Abuse Measures

| Measure | Implementation |
|---------|----------------|
| ValidationPipe | ✅ All payloads validated |
| Nickname uniqueness | ✅ Check before create |
| Room status check | ✅ Only WAITING rooms accept joins |
| Rate limiting | TODO |
| Host-only actions | TODO (for start_game) |

## Client SDK Example

```typescript
// Client usage example
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/game', {
  auth: { token: accessToken }  // Optional
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  
  // Join room
  socket.emit('join_room', { pin: '123456', nickname: 'Player1' });
});

socket.on('room_joined', (data) => {
  console.log('Joined room:', data.room);
  console.log('Players:', data.players);
  console.log('You are:', data.player);
});

socket.on('player_joined', (data) => {
  showNotification(`${data.player.nickname} joined!`);
});

socket.on('player_left', (data) => {
  showNotification(`${data.nickname} left`);
});

socket.on('error', (error) => {
  showError(error.message);
});

// Get room state anytime
socket.emit('get_room_state', { roomId: '...' });

// Leave room
socket.emit('leave_room', { roomId: '...' });
```

## WebSocket Gateway Features

### Implemented
- ✅ Connection/disconnection handling
- ✅ Join room by PIN
- ✅ Join room by ID
- ✅ Leave room
- ✅ Player tracking
- ✅ Room broadcasting
- ✅ Auto-cleanup on disconnect

### TODO
- [ ] Authentication (JWT verification)
- [ ] Rate limiting
- [ ] Start game event
- [ ] Question/answer events
- [ ] Leaderboard events
