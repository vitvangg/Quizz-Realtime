# Frontend Flow

## Current Status

✅ Backend Room implementation: DONE
✅ Frontend Room implementation: DONE

---

## 1. Landing Page (`/`)

### ✅ Implemented

- Landing page với hero section
- Input mã PIN room (button "Tham gia ngay")
- Button "Tạo Quiz mới" cho user đã login
- Navigation header với login/logout
- JoinRoomDialog component

### Flow

1. User nhấn "Tham gia ngay"
2. Mở JoinRoomDialog
3. Nhập PIN + nickname
4. Connect WebSocket → join room
5. Redirect tới `/room/:id`

---

## 2. Authentication Flow

### ✅ Đã có

- `/signin` - Login page
- `/signup` - Register page
- Auth store với token management
- Auto refresh token

### Flow

1. User đăng nhập/đăng ký
2. Lưu access token
3. Redirect tới `/quiz`

---

## 3. Quiz List Page (`/quiz`)

### ✅ Implemented

- Danh sách quiz của user
- Button "Bắt đầu" → Tạo room + redirect tới waiting room
- Button "Sửa" → Edit quiz
- Button "Xóa" quiz

### Flow

1. Click "Bắt đầu" 
2. Gọi `POST /room` (auth required)
3. Backend sinh room PIN
4. Redirect tới `/room/:id`
5. Auto connect WebSocket

---

## 4. Waiting Room (`/room/:id`)

### ✅ Implemented

#### Components

- `waiting-screen.tsx` - Main waiting UI
- `player-list.tsx` - Player list với kick functionality
- `pin-input.tsx` - PIN input component

#### Host thấy:
- Room PIN (hiển thị nổi bật)
- Danh sách player realtime
- Button "Bắt đầu Game"
- Button copy PIN

#### Player thấy:
- Room info
- Quiz title
- Player list realtime
- Trạng thái "Đang chờ Host bắt đầu..."

---

## 5. WebSocket Events

### Namespace: `/game`

#### ✅ Implemented (Backend)

| Event | Direction | Status |
|-------|-----------|--------|
| `join_room` | Client → Server | ✅ |
| `join_by_id` | Client → Server | ✅ |
| `leave_room` | Client → Server | ✅ |
| `get_room_state` | Client → Server | ✅ |
| `room_joined` | Server → Client | ✅ |
| `player_joined` | Server → Client | ✅ |
| `player_left` | Server → Client | ✅ |
| `room_left` | Server → Client | ✅ |

#### ✅ Implemented (Frontend Store)

```typescript
// room.store.ts
interface RoomState {
  socket: Socket | null;
  isConnected: boolean;
  currentRoom: Room | null;
  currentPlayer: Player | null;
  players: Player[];
  isHost: boolean;
  
  connectSocket: () => void;
  disconnectSocket: () => void;
  createRoom: (quizId: string) => Promise<Room>;
  joinRoom: (pin: string, nickname: string) => Promise<void>;
  joinRoomById: (roomId: string, nickname: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
}
```

---

## 6. API Endpoints

### Room APIs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/room` | Create room | ✅ JWT |
| GET | `/room` | List waiting rooms | - |
| GET | `/room/:id` | Get room | - |
| GET | `/room/pin/:pin` | Get room by PIN | - |
| POST | `/room/join` | Join room | - |
| POST | `/room/leave` | Leave room | ✅ JWT |

---

## 7. File Structure

```
frontend/
├── app/
│   ├── page.tsx                    # Landing page ✅
│   ├── room/
│   │   └── [id]/
│   │       └── page.tsx           # Waiting room ✅
│   └── quiz/
│       └── page.tsx               # Quiz list ✅
├── components/
│   └── room/
│       ├── pin-input.tsx          # PIN input ✅
│       ├── player-list.tsx        # Player list ✅
│       ├── waiting-screen.tsx     # Waiting UI ✅
│       └── join-room-dialog.tsx   # Join dialog ✅
├── services/
│   └── room.service.ts            # Room API calls ✅
├── stores/
│   └── room.store.ts              # Room state ✅
└── types/
    └── room.type.ts               # Room types ✅
```

---

## 8. Pending Features

| Feature | Status |
|---------|--------|
| Kick player | TODO |
| Start game flow | TODO |
| Question/Answer flow | TODO |
| Leaderboard | TODO |
| Reconnect logic | TODO |
