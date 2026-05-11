# Database Schema

## Overview

Sử dụng PostgreSQL với Prisma ORM.

## Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    User      │       │    Quiz      │       │   Question   │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id           │──┐    │ id           │──┐    │ id           │
│ email        │  │    │ title        │  │    │ quizId (FK)  │
│ passwordHash │  │    │ createdBy(FK)│──┘    │ content      │
│ roleId (FK)  │  │    │ createdAt    │       │ timeLimit    │
└──────────────┘  │    └──────────────┘       │ orderIndex   │
                  │                           └──────┬───────┘
                  │                                  │
                  │                           ┌──────┴───────┐
                  │                           │              │
                  │                    ┌──────────────┐ ┌──────────────┐
                  │                    │   Answer     │ │PlayerAnswer  │
                  │                    ├──────────────┤ ├──────────────┤
                  │                    │ id           │ │ id           │
                  │                    │ questionId   │ │ playerSession│
                  │                    │ content      │ │ questionId   │
                  │                    │ isCorrect    │ │ answerId     │
                  └───────────────────▶│              │ │ isCorrect    │
                           (host)       └──────────────┘ │ scoreEarned  │
                                                       └──────────────┘
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    Room      │       │   Player     │       │GameSession   │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id           │──┐    │ id           │  ┌───▶│ id           │
│ pin (unique) │  │    │ roomId (FK)  │──┘    │ roomId (FK)  │
│ quizId (FK)  │  │    │ nickname     │       │ status       │
│ hostId (FK)  │──┘    │ joinedAt     │       │ startedAt    │
│ status       │       └──────────────┘       │ endedAt      │
└──────────────┘                             │ currentQIdx   │
       │                                      └──────┬───────┘
       │                                             │
       │                                    ┌────────┴────────┐
       │                             ┌──────────────┐ ┌──────────────┐
       │                             │PlayerSession │ │PlayerSession │
       │                             ├──────────────┤ ├──────────────┤
       │                             │ id           │ │ id           │
       │                             │ playerId(FK) │ │ playerId(FK) │
       │                             │ sessionId(FK)│ │ sessionId(FK)│
       │                             │ score        │ │ score        │
       │                             └──────────────┘ └──────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AUTH & AUDIT                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AuthSession ─────────────────────────────────────────────────  │
│  ┌──────────────┐      RolePermission ──── Permission         │
│  │ id           │      ┌──────────────┐      ┌──────────────┐│
│  │ userId (FK)  │─────▶│ id           │      │ id           ││
│  │ refreshToken │      │ roleId (FK)  │─────▶│ action       ││
│  │ expiresAt    │      │ permissionId │      │ subject      ││
│  └──────────────┘      └──────────────┘      └──────────────┘│
│                                                                  │
│  AuditLog ──────────────────────────────────────────────────── │
│  ┌──────────────┐                                               │
│  │ id           │                                               │
│  │ action       │                                               │
│  │ entity       │                                               │
│  │ entityId     │                                               │
│  │ userId (FK)  │                                               │
│  │ details      │                                               │
│  │ ipAddress    │                                               │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Table Definitions

### User

```sql
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id      UUID REFERENCES roles(id),
  status       VARCHAR(50) DEFAULT 'ACTIVE',
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_users_role ON users(role_id);
```

### Quiz

```sql
CREATE TABLE quizzes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title     VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP  -- Soft delete
);
CREATE INDEX idx_quizzes_created_by ON quizzes(created_by);
CREATE INDEX idx_quizzes_deleted ON quizzes(deleted_at);
```

### Question

```sql
CREATE TABLE questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id     UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  time_limit  INT NOT NULL,  -- seconds
  order_index INT NOT NULL
);
CREATE INDEX idx_questions_quiz ON questions(quiz_id);
```

### Answer

```sql
CREATE TABLE answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_correct  BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_answers_question ON answers(question_id);
```

### Room

```sql
CREATE TABLE rooms (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin       VARCHAR(6) UNIQUE NOT NULL,
  quiz_id   UUID REFERENCES quizzes(id),
  host_id   UUID REFERENCES users(id),
  status    VARCHAR(20) DEFAULT 'WAITING',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_rooms_pin ON rooms(pin);
CREATE INDEX idx_rooms_host ON rooms(host_id);
```

### Player

```sql
CREATE TABLE players (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id   UUID REFERENCES rooms(id) ON DELETE CASCADE,
  nickname  VARCHAR(50) NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(room_id, nickname)
);
CREATE INDEX idx_players_room ON players(room_id);
```

### GameSession

```sql
CREATE TABLE game_sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                UUID REFERENCES rooms(id),
  status                 VARCHAR(20) DEFAULT 'WAITING',
  started_at             TIMESTAMP DEFAULT NOW(),
  ended_at               TIMESTAMP,
  current_question_index INT DEFAULT 0,
  question_started_at    TIMESTAMP
);
CREATE INDEX idx_game_sessions_room ON game_sessions(room_id);
```

### PlayerSession

```sql
CREATE TABLE player_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID REFERENCES players(id),
  session_id UUID REFERENCES game_sessions(id),
  score      INT DEFAULT 0,
  UNIQUE(player_id, session_id)
);
CREATE INDEX idx_player_sessions_session ON player_sessions(session_id);
```

### PlayerAnswer

```sql
CREATE TABLE player_answers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_session_id UUID REFERENCES player_sessions(id),
  question_id       UUID REFERENCES questions(id),
  answer_id         UUID REFERENCES answers(id),
  question_content  TEXT,
  answer_content    TEXT,
  is_correct        BOOLEAN,
  score_earned      INT DEFAULT 0,
  time_answered     TIMESTAMP DEFAULT NOW(),
  UNIQUE(player_session_id, question_id)
);
CREATE INDEX idx_player_answers_session ON player_answers(player_session_id);
CREATE INDEX idx_player_answers_correct ON player_answers(player_session_id, is_correct);
```

## Missing Tables (TODO)

### Leaderboard (Snapshot)

```sql
-- Optional: Store leaderboard snapshots
CREATE TABLE leaderboard_snapshots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id),
  player_id  UUID REFERENCES players(id),
  rank       INT,
  score      INT,
  snapshot_at TIMESTAMP DEFAULT NOW()
);
```

### RoomPIN History

```sql
-- Track PIN usage for analytics
CREATE TABLE room_pin_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin        VARCHAR(6),
  room_id    UUID REFERENCES rooms(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Indexes for Performance

```sql
-- Frequently queried combinations
CREATE INDEX idx_players_room_nickname ON players(room_id, nickname);
CREATE INDEX idx_player_answers_composite ON player_answers(player_session_id, question_id);
CREATE INDEX idx_game_sessions_active ON game_sessions(room_id, status) WHERE ended_at IS NULL;
```

## Migrations

```bash
# Generate migration
npx prisma migrate dev --name add_game_tables

# Apply migrations
npx prisma migrate deploy

# Reset database
npx prisma migrate reset
```
