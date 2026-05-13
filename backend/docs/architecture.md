# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│         (Web Browser / Mobile App)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP REST + Cookies
                      │ WebSocket (TODO)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      NESTJS SERVER                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    HTTP Layer                         │   │
│  │  Controllers: Auth, Quiz, Questions, Answers, Room   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Module Layer                        │   │
│  │  AuthModule | QuizModule | RoomModule | GameModule  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Service Layer                      │   │
│  │  Business Logic + Prisma ORM                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               WebSocket Gateway (TODO)              │   │
│  │  GameGateway | RoomGateway                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis       │
│   (Prisma)      │    │   (TODO)        │
└─────────────────┘    └─────────────────┘
```

## Module Structure

```
backend/src/
├── auth/               # JWT Auth
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── auth.controller.ts
│   ├── guards/
│   └── dtos/
│
├── user/               # User CRUD (client-side)
│   ├── user.module.ts
│   ├── user.service.ts
│   ├── user.controller.ts
│   └── decorators/
│
├── quizs/              # Quiz CRUD (client-side)
│   ├── quizzs.module.ts
│   ├── quizzs.service.ts
│   ├── quizzs.controller.ts
│   └── dto/
│
├── questions/          # Question CRUD
│   ├── questions.module.ts
│   ├── questions.service.ts
│   ├── questions.controller.ts
│   └── dto/
│
├── answers/            # Answer CRUD
│   ├── answers.module.ts
│   ├── answers.service.ts
│   ├── answers.controller.ts
│   └── dto/
│
├── room/               # Room + Game (NOT IMPLEMENTED)
│   ├── room.module.ts
│   ├── room.service.ts
│   ├── room.controller.ts
│   └── dto/
│
├── admin/              # Admin modules
│   ├── user/
│   ├── quiz/
│   ├── game-session/
│   ├── role/
│   ├── permission/
│   ├── analytics/
│   └── ...
│
└── prisma/             # Database
    ├── prisma.module.ts
    └── prisma.service.ts
```

## Database Schema (Entities)

| Entity | Purpose |
|--------|---------|
| User | Người dùng (player/host) |
| Quiz | Bộ câu hỏi |
| Question | Câu hỏi |
| Answer | Đáp án |
| Room | Phòng chơi |
| Player | Player trong room |
| GameSession | Phiên chơi |
| PlayerSession | Player trong session |
| PlayerAnswer | Lịch sử trả lời |
| AuthSession | Refresh token session |
| Role/Permission | RBAC |
| AuditLog | Log hành động |

## Flow: Client -> Backend

```
1. Client gửi HTTP Request
   ↓
2. Controller nhận request
   ↓
3. DTO validation (class-validator)
   ↓
4. Service xử lý business logic
   ↓
5. Prisma tương tác PostgreSQL
   ↓
6. Response trả về qua Interceptors
```

## Missing Components (TODO)

| Component | Status | Priority |
|-----------|--------|----------|
| WebSocket Gateway | NOT IMPLEMENTED | HIGH |
| Redis Adapter | NOT IMPLEMENTED | HIGH |
| Game Session Service | Stub only | HIGH |
| Realtime State | NOT IMPLEMENTED | HIGH |
| Timer Sync | NOT IMPLEMENTED | MEDIUM |

## Scalability Warning

**Hiện tại**: Single instance, in-memory state

**Vấn đề khi scale**:
- WebSocket connections không sync giữa instances
- Room state không shared
- Không có sticky sessions

**Giải pháp tương lai**:
- Redis Adapter cho Socket.io
- Redis Pub/Sub cho cross-instance communication
- Redis Session store
