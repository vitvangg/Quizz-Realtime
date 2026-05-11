# Frontend Flow - Implementation Status

## 1. Landing Page (`/`)

**STATUS**: ✅ IMPLEMENTED

### Features:
- Input nhập mã PIN room
- Input nhập nickname
- Button "Tham gia Game"
- Button đăng nhập/đăng ký
- Hiển thị features

### Guest Flow:
1. Nhập PIN (6 số)
2. Nhập nickname
3. Click "Tham gia Game"
4. → Redirect `/room/[id]`

### Authenticated Flow:
1. Click "Đi đến Quiz của tôi"
2. → Redirect `/quiz`

---

## 2. Authentication Flow

**STATUS**: ✅ Code sẵn có

- `/signin` - Đăng nhập
- `/signup` - Đăng ký
- Redirect `/quiz` sau login thành công

---

## 3. Quiz List Page (`/quiz`)

**STATUS**: ✅ IMPLEMENTED

### Features:
- Hiển thị quiz của user
- Button "Sửa" → `/quiz/edit/:id`
- Button "Bắt đầu" → Tạo room + redirect `/room/[id]`

### Flow:
1. Click "Bắt đầu" trên quiz
2. Gọi `roomService.create(quizId)`
3. Backend tạo room + sinh PIN
4. Redirect `/room/${room.id}`

---

## 4. Waiting Room (`/room/[id]`)

**STATUS**: ✅ IMPLEMENTED

### Features:
- Hiển thị mã PIN (copy được)
- Danh sách player realtime (WebSocket)
- Player đang online highlight
- Nút "Bắt đầu Game" (host only)
- Nút "Thoát phòng"

### WebSocket Events:
| Event | Handler | Status |
|-------|---------|--------|
| `room_joined` | Update room state | ✅ |
| `player_joined` | Add player to list | ✅ |
| `player_left` | Remove player | ✅ |
| `room_left` | Reset state | ✅ |
| `room_error` | Show error toast | ✅ |

---

## 5. Game Play (`/room/[id]/play`)

**STATUS**: ❌ CHƯA IMPLEMENT

Khi host bấm "Bắt đầu Game":
1. Emit `start_game` event
2. Backend broadcast `game_starting` (countdown)
3. Backend emit `question_start`
4. Player submit `submit_answer`
5. → `leaderboard` → `game_end`

---

## 6. API Endpoints

| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| POST | `/room` | Tạo room | ✅ |
| GET | `/room/:id` | Get room | ✅ |
| GET | `/room/pin/:pin` | Get by PIN | ✅ |
| POST | `/room/join` | Join room (REST) | ✅ |

---

## 7. Files Structure

```
frontend/
├── app/
│   ├── page.tsx                    ✅ Landing page
│   ├── signin/page.tsx            ✅
│   ├── signup/page.tsx             ✅
│   ├── quiz/
│   │   ├── page.tsx               ✅ Quiz list + start game
│   │   ├── builder/page.tsx       ✅ Create quiz
│   │   └── edit/[id]/page.tsx    ✅ Edit quiz
│   └── room/
│       └── [id]/page.tsx          ✅ Waiting room
├── components/
│   └── (existing components)
├── services/
│   ├── auth.service.ts            ✅
│   ├── quiz.service.ts            ✅
│   ├── room.service.ts            ✅ NEW
│   └── socket.service.ts          ✅ NEW
├── stores/
│   ├── auth.store.ts              ✅
│   ├── quiz.store.ts              ✅
│   └── room.store.ts              ✅ NEW
└── types/
    ├── auth.type.ts               ✅
    ├── quiz.type.ts               ✅
    └── room.type.ts               ✅ NEW
```

---

## 8. WebSocket Events (Implemented)

### Namespace: `/game`

| Event | Direction | Payload | Status |
|-------|-----------|---------|--------|
| `join_room` | Client → Server | `{ pin, nickname }` | ✅ Backend |
| `join_by_id` | Client → Server | `{ roomId, nickname }` | ✅ Backend |
| `leave_room` | Client → Server | `{ roomId }` | ✅ Backend |
| `get_room_state` | Client → Server | `{ roomId }` | ✅ Backend |
| `room_joined` | Server → Client | Full state | ✅ |
| `player_joined` | Server → Client | Player info | ✅ |
| `player_left` | Server → Client | Player info | ✅ |
| `room_left` | Server → Client | Confirm | ✅ |
| `error` | Server → Client | Error msg | ✅ |

### Game Events (TODO):

| Event | Direction | Description |
|-------|-----------|-------------|
| `start_game` | Client → Server | Host starts |
| `game_starting` | Server → Client | Countdown |
| `question_start` | Server → Client | New question |
| `submit_answer` | Client → Server | Player answers |
| `answer_received` | Server → Client | Confirm |
| `question_result` | Server → Client | Correct answer |
| `leaderboard` | Server → Client | Rankings |
| `game_end` | Server → Client | Final results |

---

## 9. Implementation Checklist

### ✅ Completed:
- [x] Landing page với join game form
- [x] Room types
- [x] Room service (API)
- [x] Socket service (WebSocket)
- [x] Room store (Zustand)
- [x] Waiting room page
- [x] Quiz page → Room flow
- [x] Player list realtime
- [x] Host indicator
- [x] Copy PIN functionality

### ❌ TODO:
- [ ] Game play page
- [ ] Question display
- [ ] Answer submission
- [ ] Timer synchronization
- [ ] Leaderboard display
- [ ] Game results
- [ ] Reconnect handling
- [ ] Kick player functionality

---

## 10. State Management

### Room Store (`room.store.ts`)

```typescript
interface RoomState {
  currentRoom: Room | null;
  players: Player[];
  myPlayer: Player | null;
  isHost: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  
  createRoom: (quizId: string) => Promise<Room>;
  joinRoom: (pin: string, nickname: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  // ...
}
```

---

## 11. Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3000
```
