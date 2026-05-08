# Luồng Tham Gia Phòng Quiz — Chi Tiết Redis & Database

> Tài liệu mô tả toàn bộ luồng từ lúc user mở trang phòng (`/room/{pin}`), nhập nickname, đến khi tham gia thành công vào phòng chờ. Giải thích rõ vai trò của Redis (hot state) và PostgreSQL (cold/persistent state) tại từng bước.

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Luồng Host tham gia phòng](#2-luồng-host-tham-gia-phòng)
3. [Luồng Player tham gia phòng](#3-luồng-player-tham-gia-phòng)
4. [Chi tiết Redis keys & Database schema](#4-chi-tiết-redis-keys--database-schema)
5. [Mã lỗi & Xử lý exception](#5-mã-lỗi--xử-lý-exception)
6. [Sơ đồ tổng hợp](#6-sơ-đồ-tổng-hợp)

---

## 1. Tổng quan kiến trúc

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                         │
│                                                               │
│  /room/[pin]/page.tsx                                         │
│    ├─ Token check → xác định host hay player                 │
│    ├─ NicknameEntry modal (player chưa đăng nhập)            │
│    └─ WaitingRoom (sau khi join thành công)                  │
│                                                               │
│  Zustand Store (gameStore.ts)                                 │
│    ├─ room, players, currentPlayer                             │
│    └─ isHost, isConnected                                     │
│                                                               │
│  Socket singleton (lib/socket.ts) → ws://localhost:3000/game   │
└───────────────────────────┬──────────────────────────────────┘
                            │ WebSocket (Socket.io)
                            │ REST API (Axios)
                            ▼
┌───────────────────────────▼──────────────────────────────────┐
│                    BACKEND (NestJS)                            │
│                                                               │
│  GameGateway (game.gateway.ts)                                 │
│    @SubscribeMessage('room:host_join')   → host                │
│    @SubscribeMessage('room:player_join') → player              │
│    @SubscribeMessage('game:start')       → host                │
│                                                               │
│  RoomHandler (handlers/room.handler.ts)                        │
│    ├─ handleHostJoin()                                         │
│    ├─ handlePlayerJoin()                                      │
│    ├─ handleKickPlayer()                                      │
│    ├─ handlePlayerLeave()                                     │
│    ├─ handleCloseRoom()                                       │
│    └─ handleDisconnect()                                       │
│                                                               │
│  GameService (game.service.ts)  ──► PrismaService              │
│    ├─ verifyAndGetHostRoom()  ──► DB query Room               │
│    ├─ joinRoom()             ──► DB create Player            │
│    ├─ leaveRoom()            ──► DB delete Player             │
│    └─ startGame()            ──► DB update Room + create Session│
│                                                               │
│  RedisService (redis.service.ts)                               │
│    ├─ createRoom()          ──► HSET room:{pin}               │
│    ├─ addPlayerToRoom()     ──► HSET room:{pin}:players        │
│    ├─ getPlayersInRoom()    ──► HGETALL room:{pin}:players     │
│    └─ getPlayerBySocket()   ──► GET socket:{socketId}         │
└──────────────┬──────────────────────────┬─────────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────┐  ┌────────────────────────────────┐
│     Redis Cloud           │  │     PostgreSQL                  │
│  (Hot / Real-time State)  │  │  (Persistent / Source of Truth) │
│                           │  │                                │
│  room:{pin}               │  │  Room { id, pin, quizId,       │
│  room:{pin}:players       │  │          hostId, status }      │
│  socket:{socketId}        │  │                                │
│  (rate limit, buffer,     │  │  Player { id, roomId, nickname,│
│   leaderboard, session)    │  │           joinedAt }           │
└──────────────────────────┘  └────────────────────────────────┘
```

### Vai trò phân tách Redis vs Database

| Khía cạnh | Redis | PostgreSQL |
|---|---|---|
| **Mục đích** | Hot state — thông tin phòng đang hoạt động | Cold/persistent — dữ liệu tồn tại sau game |
| **Tốc độ** | O(1) cho read/write, ~1-5ms latency | ~10-50ms cho query |
| **Thời gian sống** | TTL tự động hoặc khi đóng phòng | Vĩnh viễn |
| **Truy cập** | Mọi NestJS instance cùng thấy (cross-node) | Mỗi instance truy vấn qua Prisma |
| **Dùng cho** | Biết ai đang ở phòng nào (socket→pin mapping) | Lưu Player record, Room metadata |

---

## 2. Luồng Host tham gia phòng

### 2.1 Sơ đồ tuần tự

```
Browser (đã đăng nhập, là host)
    │
    │  GET /room/{pin}
    ▼
┌──────────────────────────────────────────────────────────────┐
│ /room/[pin]/page.tsx                                         │
│                                                              │
│  1. Đọc JWT token từ authStore                              │
│  2. Gọi roomService.getRoomByPin(pin)  [REST API → backend] │
│  3. Decode token → lấy userId                               │
│  4. So sánh room.hostId === userId                          │
│     ├─ Đúng → setIsHost(true), setShowNicknameEntry(false)  │
│     └─ Sai  → setIsHost(false), setShowNicknameEntry(true)  │
│                                                              │
│  5. useEffect → getSocket().connect()                       │
│  6. Socket emit 'room:host_join' { roomId }                 │
└───────────────────────────┬──────────────────────────────────┘
                            │ WebSocket
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ GameGateway.handleHostJoin(client, { roomId }, server)        │
│                                                              │
│  return roomHandler.handleHostJoin(client, { roomId }, server)│
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ RoomHandler.handleHostJoin()                                  │
│                                                              │
│  ① GameService.verifyAndGetHostRoom(roomId)                  │
│     │                                                        │
│     │  ┌──────────────────────────────────────────────────┐  │
│     └──►  Prisma: Room.findUnique({ where: { id: roomId }  │  │
│            │  include: { quiz, questions, players, host }  │  │
│            │  })                                            │  │
│            └──────────────────────────────────────────────────┘  │
│                                                              │
│     ◄── Trả về room object hoặc error                       │
│                                                              │
│  ② RedisService.createRoom(pin, hostSocketId)               │
│     │                                                        │
│     │  HSET room:{pin} {                                     │
│     │    hostSocketId: client.id,                            │
│     │    status: 'waiting',                                  │
│     │    createdAt: Date.now()                               │
│     │  }                                                     │
│     │                                                        │
│     │  Key: room:{pin}  →  Type: HASH                       │
│     │  TTL: none (xóa khi đóng phòng)                       │
│     │                                                        │
│     └──► await redis.client.hset(...)                        │
│                                                              │
│  ③ client.join('room:{room.id}')  [Socket.io channel]       │
│     ◄── Host join vào room channel để nhận broadcast        │
│                                                              │
│  ④ RedisService.getPlayersInRoom(pin)                       │
│     │                                                        │
│     │  HGETALL room:{pin}:players                            │
│     │  → Trả về players đang có trong Redis (có thể có     │
│     │    từ session trước nếu host reconnect)               │
│     │                                                        │
│     └──► Trả về [] nếu phòng mới                            │
│                                                              │
│  ⑤ Trả về response:                                          │
│     { event: 'room:joined', data: {                          │
│         success: true,                                        │
│         room: <Prisma room object>,                          │
│         players: [...],                                       │
│         isHost: true                                         │
│       }}                                                      │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            │ WebSocket emit về client
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Frontend: socket.on('room:joined', handleRoomJoined)          │
│                                                              │
│  1. gameStore.setRoom(data.room)                             │
│  2. gameStore.setPlayers(unique players)                     │
│  3. gameStore.setCurrentPlayer(host player)                  │
│  4. setShowNicknameEntry(false)                             │
│  5. Render <WaitingRoom /> với isHost=true                  │
│                                                              │
│  [Đồng thời: frontend render WaitingRoom với danh sách      │
│   players từ Redis, cho phép host kick/close]               │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Mã nguồn tương ứng

**Frontend** — `frontend/app/room/[pin]/page.tsx` (dòng 30–72):

```typescript
// 1. Kiểm tra host bằng JWT
const role = await checkUserRole(); // gọi roomService.getRoomByPin(pin)
if (roomData.hostId === userId) {
  setIsHost(true);  // → show WaitingRoom, không cần NicknameEntry
}

// 2. Kết nối socket và emit
const socket = getSocket();
socket.on('connect', () => {
  socket.emit('room:host_join', { roomId: room.id });
});
```

**Backend** — `backend/src/game/handlers/room.handler.ts` (dòng 20–53):

```typescript
async handleHostJoin(client: Socket, payload: { roomId: string }, server: Server) {
  // ① Xác thực room từ DB
  const result = await this.gameService.verifyAndGetHostRoom(payload.roomId);
  if (!result.success) throw new WsException(...);

  // ② Tạo room state trong Redis
  await this.redisService.createRoom(room.pin, client.id);

  // ③ Join socket.io room channel
  client.join(`room:${room.id}`);

  // ④ Lấy players từ Redis
  const redisPlayers = await this.redisService.getPlayersInRoom(room.pin);

  return { event: 'room:joined', data: { room, players: redisPlayers, isHost: true } };
}
```

### 2.3 Redis operations cho Host

| Thao tác | Redis command | Key | Giá trị |
|---|---|---|---|
| Tạo phòng | `HSET` | `room:{pin}` | `{hostSocketId, status, createdAt}` |
| Kiểm tra host | `HGET` | `room:{pin}` → `hostSocketId` | so sánh với `client.id` |
| Lấy danh sách players | `HGETALL` | `room:{pin}:players` | `{socketId: JSON{playerId, nickname}}` |
| Xóa phòng | `DEL` | `room:{pin}` + `room:{pin}:players` | — |

---

## 3. Luồng Player tham gia phòng

### 3.1 Sơ đồ tuần tự

```
Browser (chưa đăng nhập hoặc không phải host)
    │
    │  GET /room/{pin}
    ▼
┌──────────────────────────────────────────────────────────────┐
│ /room/[pin]/page.tsx                                         │
│                                                              │
│  1. checkUserRole() → token không khớp hostId               │
│  2. setShowNicknameEntry(true)                               │
│  3. Render NicknameEntry modal (overlay)                     │
└───────────────────────────┬──────────────────────────────────┘
                            │ User nhập nickname → click "Join Room"
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ NicknameEntry.tsx → handleSubmit                              │
│                                                              │
│  1. Validate: 2-20 ký tự                                     │
│  2. Gọi onSubmit(trimmedNickname)                           │
│  3. page.tsx: handleJoinAsPlayer(nickname)                   │
│     └─ setPendingNickname(nickname)                          │
│                                                              │
│  [Điều kiện trong useEffect thỏa mãn: isLoading=false       │
│   && pendingNickname !== null → tiếp tục]                    │
│                                                              │
│  4. getSocket().connect() (nếu chưa connected)              │
│  5. socket.emit('room:player_join', { pin, nickname })      │
└───────────────────────────┬──────────────────────────────────┘
                            │ WebSocket
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ GameGateway.handlePlayerJoin(client, { pin, nickname }, srv) │
│                                                              │
│  return roomHandler.handlePlayerJoin(client, { pin, nickname }, server)
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ RoomHandler.handlePlayerJoin()                                │
│                                                              │
│  ① Validate nickname (2-20 chars)                             │
│     └─ WsException('INVALID_NICKNAME') nếu sai               │
│                                                              │
│  ② GameService.joinRoom(pin, nickname)                        │
│     │                                                        │
│     │  ┌──────────────────────────────────────────────────┐  │
│     │  │ Bước 2a: Prisma Room.findUnique({ where: { pin }│  │
│     │  │   include: { players }                           │  │
│     │  │   })                                              │  │
│     │  │                                                    │  │
│     │  │   Kiểm tra:                                       │  │
│     │  │   ├─ room tồn tại?                                │  │
│     │  │   ├─ room.status === 'WAITING'?                   │  │
│     │  │   ├─ nickname đã tồn tại (case-insensitive)?     │  │
│     │  │   └─ số lượng players < 50?                      │  │
│     │  └──────────────────────────────────────────────────┘  │
│     │                                                        │
│     │  ┌──────────────────────────────────────────────────┐  │
│     │  │ Bước 2b: Prisma Player.create({                  │  │
│     │  │   data: { roomId: room.id, nickname }             │  │
│     │  │   })                                              │  │
│     │  │                                                    │  │
│     │  │   → INSERT vào bảng players                       │  │
│     │  │   → Trả về player object { id, roomId, nickname }│  │
│     │  └──────────────────────────────────────────────────┘  │
│     │                                                        │
│     │  ┌──────────────────────────────────────────────────┐  │
│     │  │ Bước 2c: Prisma Room.findUnique({                │  │
│     │  │   where: { id: room.id }                         │  │
│     │  │   include: { quiz, questions, players, host }     │  │
│     │  │   })                                              │  │
│     │  │                                                    │  │
│     │  │   → Lấy room mới nhất kèm players để gửi về     │  │
│     │  └──────────────────────────────────────────────────┘  │
│     │                                                        │
│     └──► Trả về { success: true, player, room }              │
│                                                              │
│  ③ RedisService.addPlayerToRoom(pin, socketId, playerData)   │
│     │                                                        │
│     │  Pipeline (2 lệnh atomic):                            │
│     │  HSET room:{pin}:players {socketId: JSON{playerId, nickname}}
│     │  SET socket:{socketId} {pin}                           │
│     │                                                        │
│     │  → Mapping socketId → pin để handleDisconnect()       │
│     │  → Mapping pin → {socketId, playerInfo} để broadcast   │
│     │                                                        │
│     └──► await redis.pipeline().hset(...).set(...).exec()   │
│                                                              │
│  ④ client.join('room:{room.id}')  [Socket.io channel]       │
│     ◄── Player join vào room channel để nhận broadcast        │
│                                                              │
│  ⑤ Gửi confirm về cho player mới:                            │
│     client.emit('room:joined', {                               │
│       success: true,                                          │
│       room, player,                                          │
│       isHost: false                                          │
│     })                                                        │
│                                                              │
│  ⑥ Broadcast cho các player khác trong phòng:               │
│     client.to('room:{room.id}').emit('room:updated', {        │
│       action: 'player_joined',                                │
│       player                                                 │
│     })                                                        │
│                                                              │
│  ⑦ Trả về ACK:                                               │
│     { event: 'room:join_success', data: { success: true } }  │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            │ WebSocket events
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Frontend: socket listeners                                   │
│                                                              │
│  1. 'room:joined' → handleRoomJoined:                         │
│     ├─ gameStore.setRoom(data.room)                           │
│     ├─ gameStore.setCurrentPlayer(data.player)               │
│     ├─ gameStore.setPlayers(unique players)                   │
│     ├─ setShowNicknameEntry(false)                            │
│     └─ Render <WaitingRoom /> với isHost=false               │
│                                                              │
│  2. 'room:updated' → handleRoomUpdated:                       │
│     ├─ action === 'player_joined'                             │
│     │   └─ gameStore.addPlayer(data.player)                  │
│     │   └─ toast.info(`${nickname} joined`)                  │
│     └─ action === 'player_left'                               │
│         └─ gameStore.removePlayer(playerId)                  │
│                                                              │
│  [Kết quả: Tất cả players trong phòng nhìn thấy player mới] │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Mã nguồn tương ứng

**Frontend** — `frontend/components/game/NicknameEntry.tsx` (dòng 14–30):

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 20) return; // validate
  onSubmit(trimmed); // → setPendingNickname → socket.emit('room:player_join')
};
```

**Backend** — `backend/src/game/handlers/room.handler.ts` (dòng 182–219):

```typescript
async handlePlayerJoin(client: Socket, payload: { pin: string; nickname: string }, server: Server) {
  // ① Validate nickname
  if (!nickname || nickname.length < 2 || nickname.length > 20)
    throw new WsException({ code: 'INVALID_NICKNAME', message: '...' });

  // ② Tạo Player trong DB
  const result = await this.gameService.joinRoom(payload.pin, nickname);
  if (!result.success) throw new WsException({ ... });

  const { player, room } = result;

  // ③ Thêm vào Redis state
  await this.redisService.addPlayerToRoom(room!.pin, client.id, {
    playerId: player!.id,
    nickname: player!.nickname,
  });

  // ④ Join socket channel
  client.join(`room:${room!.id}`);

  // ⑤ Confirm về player mới
  client.emit('room:joined', { success: true, room, player, isHost: false });

  // ⑥ Broadcast cho players khác
  client.to(`room:${room!.id}`).emit('room:updated', { action: 'player_joined', player });

  return { event: 'room:join_success', data: { success: true } };
}
```

**Backend** — `backend/src/game/game.service.ts` (dòng 95–192) — `joinRoom()`:

```typescript
async joinRoom(pin: string, nickname: string) {
  // Bước 2a: Tìm phòng
  const room = await this.prisma.room.findUnique({
    where: { pin },
    include: { players: true },
  });
  // Kiểm tra: room tồn tại, WAITING, nickname unique, chưa full

  // Bước 2b: Tạo player
  const player = await this.prisma.player.create({
    data: { roomId: room.id, nickname },
  });

  // Bước 2c: Lấy room mới nhất kèm data để gửi về client
  const updatedRoom = await this.prisma.room.findUnique({
    where: { id: room.id },
    include: { quiz, questions, players, host },
  });

  return { success: true, player, room: updatedRoom };
}
```

### 3.3 Redis operations cho Player

| Thao tác | Redis command | Key | Giá trị |
|---|---|---|---|
| Thêm player | `HSET` | `room:{pin}:players` | `{socketId: JSON{playerId, nickname}}` |
| Map socket→pin | `SET` | `socket:{socketId}` | `{pin}` |
| Lấy room của socket | `GET` | `socket:{socketId}` | `{pin}` |
| Lấy player info | `HGET` | `room:{pin}:players` | JSON{playerId, nickname} |
| Lấy tất cả players | `HGETALL` | `room:{pin}:players` | Map<socketId, playerInfo> |
| Xóa player | `HDEL` + `DEL` | `room:{pin}:players` + `socket:{socketId}` | — |

---

## 4. Chi tiết Redis Keys & Database Schema

### 4.1 Redis Keys cho Room Management

```
room:{pin}
├── hostSocketId   → "socket_id_cua_host"
├── status         → "waiting" | "playing"
└── createdAt      → "1746691200000"

room:{pin}:players
├── "socket_id_player_1" → '{"playerId":"uuid-1","nickname":"Alice"}'
├── "socket_id_player_2" → '{"playerId":"uuid-2","nickname":"Bob"}'
└── ...

socket:{socketId}  → "123456"   (PIN của phòng mà socket đang ở)
```

### 4.2 Database Schema — Bảng liên quan

```prisma
// ─── ROOM: Phòng chơi (tồn tại vĩnh viễn sau khi tạo) ───────
model Room {
  id        String     @id @default(uuid())
  pin       String     @unique   // Mã PIN 6 số, duy nhất
  quizId    String     @map("quiz_id")
  hostId    String     @map("host_id")
  status    RoomStatus @default(WAITING)
  createdAt DateTime   @default(now())

  quiz     Quiz      @relation(fields: [quizId], references: [id])
  host     User      @relation("UserRooms", fields: [hostId], references: [id])
  players  Player[]  // Quan hệ 1-N: 1 phòng có nhiều players
  sessions GameSession[]

  @@index([quizId])
  @@index([hostId])
}

// ─── PLAYER: Người chơi (tạo khi join, xóa khi leave/kick) ───
model Player {
  id       String   @id @default(uuid())
  roomId   String   @map("room_id")
  nickname String
  joinedAt DateTime @default(now())

  room     Room     @relation(fields: [roomId], references: [id])
  sessions PlayerSession[]

  @@unique([roomId, nickname]) // Nickname không trùng trong 1 phòng
  @@index([roomId])
}

// ─── ROOMSTATUS enum ──────────────────────────────────────────
enum RoomStatus {
  WAITING   // Chờ người chơi — chỉ giai đoạn này mới cho join
  PLAYING   // Đang chơi — không cho join mới
  FINISHED  // Kết thúc
}
```

### 4.3 So sánh dữ liệu Redis vs Database

| Dữ liệu | Redis | Database | Lý do |
|---|---|---|---|
| `room:{pin}` metadata | ✅ (hostSocketId, status, createdAt) | ✅ (Room table) | Redis cho lookup nhanh, DB là persistent |
| `room:{pin}:players` | ✅ (key= socketId) | ✅ (Player table) | Redis cho broadcast real-time, DB cho persistence |
| `socket:{socketId}` → pin | ✅ (reverse mapping) | ❌ | Cần thiết để handle disconnect |
| `playerId` → nickname | ❌ (chỉ lưu trong room:{pin}:players) | ✅ | DB có quan hệ đầy đủ |

---

## 5. Mã lỗi & Xử lý Exception

### 5.1 Mã lỗi từ Backend

| Mã lỗi | Nguồn | Nguyên nhân | HTTP/WS |
|---|---|---|---|
| `ROOM_NOT_FOUND` | GameService.joinRoom, verifyAndGetHostRoom | PIN không tồn tại trong DB | WsException |
| `ROOM_NOT_WAITING` | GameService.joinRoom | Phòng đang `PLAYING` hoặc `FINISHED` | WsException |
| `NICKNAME_TAKEN` | GameService.joinRoom | Nickname đã tồn tại (case-insensitive) | WsException |
| `ROOM_FULL` | GameService.joinRoom | Đã có 50 players | WsException |
| `INVALID_NICKNAME` | RoomHandler.handlePlayerJoin | Nickname không 2-20 ký tự | WsException |
| `UNAUTHORIZED` | RoomHandler (kick/close/start) | Socket không phải host | WsException |

### 5.2 Xử lý Exception trên Frontend

```typescript
// frontend/app/room/[pin]/page.tsx (dòng 217–224)
socket.on('error', (data: { code: string; message: string }) => {
  toast.error(data.message);

  if (data.code === 'ROOM_NOT_FOUND' ||
      data.code === 'ROOM_FULL' ||
      data.code === 'NICKNAME_TAKEN') {
    router.push('/'); // Redirect về trang chủ
  }
});
```

### 5.3 Handle Disconnect — Luồng quan trọng

Khi một socket ngắt kết nối (mất mạng, đóng tab), hệ thống xử lý qua `handleDisconnect`:

```
Client disconnect
    │
    ▼
RoomHandler.handleDisconnect(client, server)
    │
    ├─► RedisService.getPlayerBySocket(client.id)
    │       GET socket:{socketId}  →  lấy PIN
    │       HGET room:{PIN}:players, client.id  →  lấy playerInfo
    │
    ├─ [Nếu là PLAYER]
    │   ├─ GameService.leaveRoom(playerId)
    │   │   └─ Prisma: Player.delete({ where: { id: playerId } })
    │   ├─ RedisService.removePlayerFromRoom(pin, socketId)
    │   │   └─ HDEL room:{pin}:players {socketId}
    │   │   └─ DEL socket:{socketId}
    │   └─ server.to('room:{pin}').emit('room:updated', { action: 'player_left', ... })
    │
    └─ [Nếu là HOST]
        ├─ server.to('room:{pin}').emit('room:removed', { reason: 'host_disconnected' })
        └─ RedisService.deleteRoom(pin)
            └─ DEL room:{pin} + DEL room:{pin}:players
```

---

## 6. Sơ đồ tổng hợp

### 6.1 Luồng đầy đủ — Từ URL đến WaitingRoom

```
┌─ FRONTEND ────────────────────────────────────────────────────────────────┐
│                                                                           │
│  User mở /room/123456                                                     │
│       │                                                                    │
│       ▼                                                                    │
│  checkUserRole()                                                           │
│       │                                                                    │
│       ├─► Có JWT & hostId khớp                                           │
│       │       └─► setIsHost(true)                                         │
│       │              └─► getSocket().emit('room:host_join', { roomId })  │
│       │                                                                    │
│       └─► Không khớp (player)                                            │
│               └─► setShowNicknameEntry(true)                              │
│                      └─► Render NicknameEntry modal                       │
│                             └─► User nhập "Alice"                         │
│                                    └─► setPendingNickname("Alice")         │
│                                           └─► socket.emit('room:player_join',
│                                               { pin: "123456",            │
│                                                 nickname: "Alice" })       │
│                                                                           │
└────────────────────────────────┬──────────────────────────────────────────┘
                                 │ WebSocket
                                 ▼
┌─ BACKEND ─────────────────────────────────────────────────────────────────┐
│                                                                            │
│  GameGateway                                                                │
│    @SubscribeMessage('room:host_join')                                      │
│         │                                                                   │
│         ▼                                                                   │
│    RoomHandler.handleHostJoin()                                             │
│         │                                                                   │
│         ├─► GameService.verifyAndGetHostRoom()                             │
│         │       └─► Prisma: Room.findUnique(include: quiz, players, host)  │
│         │                                                                     │
│         ├─► RedisService.createRoom(pin, hostSocketId)                     │
│         │       └─► HSET room:123456 {hostSocketId, status:"waiting"}      │
│         │                                                                     │
│         └─► client.join('room:{room.id}')                                   │
│                                                                            │
│    @SubscribeMessage('room:player_join')                                    │
│         │                                                                   │
│         ▼                                                                   │
│    RoomHandler.handlePlayerJoin()                                           │
│         │                                                                   │
│         ├─► GameService.joinRoom(pin, nickname)                           │
│         │       │                                                           │
│         │       ├─► Prisma: Room.findUnique(where: { pin }, include: players)
│         │       ├─► Prisma: Player.create(data: { roomId, nickname })      │
│         │       └─► Prisma: Room.findUnique(include: full data)            │
│         │                                                                     │
│         ├─► RedisService.addPlayerToRoom(pin, socketId, playerData)        │
│         │       ├─► HSET room:123456:players {socketId: JSON{playerId,...}}
│         │       └─► SET socket:{socketId} "123456"                           │
│         │                                                                     │
│         ├─► client.join('room:{room.id}')                                   │
│         │                                                                     │
│         ├─► client.emit('room:joined', { success, room, player, isHost })  │
│         │       └─► Frontend: gameStore.setRoom(), WaitingRoom renders      │
│         │                                                                     │
│         └─► client.to('room:{room.id}').emit('room:updated',               │
│                 { action: 'player_joined', player })                        │
│                 └─► Các players khác: gameStore.addPlayer()                 │
│                                                                            │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
                                 ▼
┌─ KẾT QUẢ ──────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Host: thấy WaitingRoom với danh sách players, nút Start Game             │
│  Player: thấy WaitingRoom, biết mình đã join thành công                   │
│                                                                          │
│  Tất cả cùng ở trong socket.io channel 'room:{room.id}'                   │
│  → Khi có player join/leave/kick → 'room:updated' broadcast               │
│  → Khi host kick player → 'room:removed' emit đến player bị kick          │
│  → Khi host start game → 'game:starting' emit, chuyển /play/{sessionId} │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phụ lục: File tham chiếu

| File | Vai trò |
|---|---|
| `frontend/app/room/[pin]/page.tsx` | Trang chính — check role, socket connection, render UI |
| `frontend/components/game/NicknameEntry.tsx` | Modal nhập nickname cho player |
| `frontend/lib/socket.ts` | Socket.io client singleton |
| `frontend/stores/gameStore.ts` | Zustand store cho room/player state |
| `backend/src/game/game.gateway.ts` | WebSocket gateway — nhận events, routing |
| `backend/src/game/handlers/room.handler.ts` | Xử lý room events — host/player join, kick, leave |
| `backend/src/game/game.service.ts` | Business logic — DB operations, validation |
| `backend/src/redis/redis.service.ts` | Redis operations — room state, player mapping |
| `backend/prisma/schema.prisma` | Database schema — Room, Player models |
