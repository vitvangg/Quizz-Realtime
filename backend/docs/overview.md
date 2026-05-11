# Quiz Project - Backend Overview

## Mục đích Project

Backend cho game quiz realtime kiểu Kahoot.

- Realtime multiplayer quiz game
- Guest đăng nhập -> Host
- Guest nhập PIN -> Player
- Host tạo room + share PIN
- Players join bằng PIN
- Live question/answer flow
- Leaderboard + scoring

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS v11 |
| Database | PostgreSQL |
| ORM | Prisma v7 (với adapter pg) |
| Auth | JWT + Refresh Token |
| API | REST |

## Chưa có (NOT IMPLEMENTED YET)

- [ ] **WebSocket Gateway** - Chưa có realtime communication
- [ ] **Redis** - Chưa tích hợp
- [ ] **Game Session Logic** - Chỉ có schema DB, chưa có service
- [ ] **Start Game Flow** - Chưa implement
- [ ] **Answer Flow** - Chưa implement
- [ ] **Timer/Sync** - Chưa implement

## Backend Responsibilities (Hiện tại)

1. **Auth**: Register, Login, Logout, Refresh Token
2. **Quiz CRUD**: Tạo quiz, câu hỏi, đáp án
3. **Room Management**: Schema + basic CRUD (chưa hoàn thiện)
4. **Game Session**: Schema + basic CRUD (chưa hoàn thiện)
5. **Admin**: RBAC, Analytics, Notifications

## Cấu trúc Module chính

```
src/
├── auth/           # Authentication
├── user/          # User management
├── quizs/         # Quiz CRUD (client)
├── questions/     # Questions CRUD
├── answers/       # Answers CRUD
├── room/          # Room management (NOT IMPLEMENTED YET)
├── session/       # Auth session management
├── prisma/        # Database service
├── admin/         # Admin modules
└── main.ts        # Entry point
```

## Database Connection

```typescript
// PrismaService sử dụng PrismaPg adapter
connectionString: process.env.DATABASE_URL || 'postgresql://nhan:nhan@localhost:5432/db_demo_security'
```

## NEXT STEPS

1. Cài đặt `@nestjs/websockets` + `@nestjs/platform-socket.io`
2. Tạo WebSocket Gateway cho realtime
3. Implement Room Service với WebSocket
4. Implement Game Session Service
5. Tích hợp Redis cho pub/sub + state sync
