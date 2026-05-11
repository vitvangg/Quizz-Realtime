# API Summary

## Current REST Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register new user | None |
| POST | `/auth/login` | Login | None |
| POST | `/auth/logout` | Logout | Optional |
| POST | `/auth/refresh` | Refresh token | Cookie |

#### POST /auth/register

```typescript
// Request
{
  email: string;
  password: string;
}

// Response
{
  id: string;
  email: string;
}
```

#### POST /auth/login

```typescript
// Request
{
  email: string;
  password: string;
}

// Response
{
  accessToken: string;   // JWT
  refreshToken: string;
  user: { id, email }
}
```

### Quiz Management (Client)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/quizzs` | List all quizzes | Optional |
| GET | `/quizzs/user` | My quizzes | JWT |
| GET | `/quizzs/:id` | Get quiz by ID | Optional |
| POST | `/quizzs` | Create quiz | JWT |
| PATCH | `/quizzs/:id` | Update quiz | JWT |
| DELETE | `/quizzs/:id` | Delete quiz | JWT |

### Questions

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/questions` | List all questions | Optional |
| GET | `/questions/quiz/:quizId` | Questions by quiz | Optional |
| GET | `/questions/:id` | Get question | Optional |
| POST | `/questions` | Create question | JWT (owner) |
| PATCH | `/questions/:id` | Update question | JWT (owner) |
| DELETE | `/questions/:id` | Delete question | JWT (owner) |

#### POST /questions

```typescript
// Request
{
  quizId: string;
  content: string;
  timeLimit: number;      // seconds
  orderIndex: number;
}

// Response
{
  id: string;
  quizId: string;
  content: string;
  timeLimit: number;
  orderIndex: number;
}
```

### Answers

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/answers/question/:questionId` | Answers by question | JWT (owner) |
| GET | `/answers/:id` | Get answer | Optional |
| POST | `/answers` | Create answer | JWT (owner) |
| PATCH | `/answers/:id` | Update answer | JWT (owner) |
| DELETE | `/answers/:id` | Delete answer | JWT (owner) |

#### POST /answers

```typescript
// Request
{
  questionId: string;
  content: string;
  isCorrect: boolean;
}

// Response
{
  id: string;
  questionId: string;
  content: string;
  isCorrect: boolean;
}
```

### Room (Stub)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/room` | List rooms | - |
| GET | `/room/:id` | Get room | - |
| POST | `/room` | Create room | - |
| PATCH | `/room/:id` | Update room | - |
| DELETE | `/room/:id` | Delete room | - |

**STATUS**: NOT IMPLEMENTED - stub only

### Game Session (Stub)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/game-session` | List sessions | - |
| GET | `/game-session/:id` | Get session | - |
| POST | `/game-session` | Create session | - |
| PATCH | `/game-session/:id` | Update session | - |
| DELETE | `/game-session/:id` | Delete session | - |

**STATUS**: NOT IMPLEMENTED - stub only

### User

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/user/profile` | Get profile | JWT |
| GET | `/user/:id` | Get user by ID | Optional |
| PATCH | `/user` | Update profile | JWT |

## Admin Endpoints (RBAC)

### User Management

| Method | Endpoint | Roles |
|--------|----------|-------|
| GET | `/admin/users` | ADMIN |
| GET | `/admin/users/:id` | ADMIN |
| PATCH | `/admin/users/:id` | ADMIN |
| DELETE | `/admin/users/:id` | ADMIN |

### Quiz Management

| Method | Endpoint | Roles |
|--------|----------|-------|
| GET | `/admin/quizs` | ADMIN, MODERATOR |
| DELETE | `/admin/quizs/:id` | ADMIN |

### Analytics

| Method | Endpoint | Roles |
|--------|----------|-------|
| GET | `/admin/analytics` | ADMIN |

### Settings

| Method | Endpoint | Roles |
|--------|----------|-------|
| GET | `/admin/settings` | ADMIN |
| PATCH | `/admin/settings/:key` | ADMIN |

## Future API Endpoints (TODO)

### Room API

```typescript
// Create room
POST /room
Request: { quizId: string }
Response: { roomId: string, pin: string }

// Join room
POST /room/join
Request: { pin: string, nickname: string }
Response: { room: Room, player: Player }

// Leave room
POST /room/leave
Request: { roomId: string }
```

### Game API

```typescript
// Start game
POST /game/start
Request: { roomId: string }
Auth: Host only

// Get current game state
GET /game/:sessionId/state

// Get leaderboard
GET /game/:sessionId/leaderboard

// Submit answer (HTTP fallback)
POST /game/answer
Request: { sessionId: string, questionId: string, answerId: string }
```

## HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation) |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 500 | Internal Error |
