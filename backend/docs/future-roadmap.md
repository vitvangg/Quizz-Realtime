# Future Roadmap

## Phase 1: Core Game (Current Priority)

### 1.1 WebSocket Gateway

**Priority**: CRITICAL

```typescript
// Files to create:
src/game/
├── game.gateway.ts       # WebSocket gateway
├── game.module.ts        # Module
├── game.service.ts       # Game logic
├── room.service.ts       # Room management
├── answer.service.ts     # Answer handling
├── timer.service.ts      # Timer sync
└── dto/
    ├── join-room.dto.ts
    ├── submit-answer.dto.ts
    └── ...
```

**Dependencies**:
- `@nestjs/websockets`
- `@nestjs/platform-socket.io`
- `socket.io`

### 1.2 Redis Integration

**Priority**: HIGH

```typescript
// Files to create:
src/redis/
├── redis.module.ts
├── redis.service.ts
└── pub-sub.service.ts
```

**Use cases**:
- Session state cache
- Pub/Sub for events
- Rate limiting
- Presence tracking

### 1.3 Game Session Implementation

**Priority**: CRITICAL

```typescript
// Implement state machine:
// WAITING → STARTING → QUESTION_ACTIVE → QUESTION_RESULT → LEADERBOARD → FINISHED

// Features needed:
// - Question emission
// - Timer handling
// - Answer validation
// - Score calculation
// - Leaderboard generation
```

## Phase 2: Enhanced Features

### 2.1 Reconnect Support

**Description**: Players can reconnect and resume game

```typescript
interface ReconnectFlow {
  // 1. Player disconnects
  // 2. State preserved in Redis
  // 3. Player reconnects with same ID
  // 4. State restored from Redis
  // 5. Continue from current question
}

// Handle cases:
// - Host disconnects (transfer to next player?)
// - All players disconnect (pause game?)
// - Single player disconnect (continue game)
```

### 2.2 Spectator Mode

**Description**: Watch games without playing

```typescript
interface SpectatorMode {
  // Separate socket namespace: /spectate
  // Can view questions and leaderboard
  // Cannot submit answers
  // Can see player nicknames
  // No score contribution
}
```

### 2.3 Question Types

**Description**: Support multiple question formats

```typescript
type QuestionType = 
  | 'multiple_choice'      // Standard
  | 'true_false'           // True/False
  | 'poll'                 // Opinion-based
  | 'word_cloud';          // Text input

interface ExtendedQuestion {
  type: QuestionType;
  // ... type-specific fields
}
```

## Phase 3: Multiplayer Features

### 3.1 Matchmaking

**Description**: Auto-match players without PIN

```typescript
interface Matchmaking {
  // Player enters queue
  // System matches players by:
  //   - Quiz preference
  //   - Player count
  //   - Skill rating (future)
  // Creates room automatically
  // Notifies when matched
}
```

### 3.2 Tournament Mode

**Description**: Multi-round competitive play

```typescript
interface Tournament {
  id: string;
  rounds: TournamentRound[];
  bracket: Bracket;
  status: 'WAITING' | 'ACTIVE' | 'FINISHED';
}

interface TournamentRound {
  roundNumber: number;
  rooms: Room[];      // Multiple rooms per round
  duration: number;
}
```

### 3.3 Team Mode

**Description**: Players form teams

```typescript
interface Team {
  id: string;
  name: string;
  members: Player[];
  score: number;
  color: string;  // Team color for UI
}
```

## Phase 4: Analytics & Insights

### 4.1 Game Analytics

**Description**: Track game metrics

```typescript
interface GameAnalytics {
  gameId: string;
  playerCount: number;
  avgAnswerTime: number;
  correctRate: number[];        // Per question
  dropoutRate: number;
  peakConcurrency: number;
}
```

### 4.2 Player Statistics

**Description**: Player performance history

```typescript
interface PlayerStats {
  userId: string;
  totalGames: number;
  totalWins: number;
  avgScore: number;
  avgRank: number;
  favoriteQuiz: string;
  strongestCategory: string;
  improvementTrend: 'UP' | 'DOWN' | 'STABLE';
}
```

### 4.3 Quiz Analytics

**Description**: Track quiz effectiveness

```typescript
interface QuizAnalytics {
  quizId: string;
  playCount: number;
  avgScore: number;
  avgTimePerQuestion: number[];
  hardestQuestion: string;
  easiestQuestion: string;
  completionRate: number;
}
```

## Phase 5: Infrastructure

### 5.1 BullMQ Jobs

**Description**: Background job processing

```typescript
// Jobs needed:
// - Send reminder notifications
// - Clean up abandoned rooms
// - Generate analytics reports
// - Export game results
// - Send follow-up emails

import { Queue, Worker } from 'bullmq';

const cleanupQueue = new Queue('room-cleanup');
const worker = new Worker('room-cleanup', async job => {
  // Cleanup logic
});
```

### 5.2 CDN for Assets

**Description**: Host images/media

```typescript
// Upload question images
// Upload quiz thumbnails
// Host player avatars
// Use S3 + CloudFront
```

### 5.3 Distributed Game Sessions

**Description**: Scale game sessions across servers

```typescript
// Current: All game logic on single server
// Future: Shard games across instances

interface GameSharding {
  // Consistent hashing for roomId → server
  shards: Map<string, string>;  // roomId → serverId
  
  // Cross-shard communication via Redis
  // Game state always in Redis
  // Any server can handle any room
}
```

## Phase 6: Mobile & SDK

### 6.1 Mobile App

**Description**: Native iOS/Android apps

```
Options:
- React Native (shared code)
- Flutter (performance)
- Native (best UX)
```

### 6.2 Public API / SDK

**Description**: Allow third-party integrations

```typescript
// REST API for:
// - Create quiz
// - Manage questions
// - View analytics

// Webhook for:
// - Game started
// - Game ended
// - Leaderboard updated
```

## Priority Order

```
Phase 1 (NOW)
├── WebSocket Gateway
├── Redis Integration
└── Game Session Logic

Phase 2 (Next Sprint)
├── Reconnect Support
├── Spectator Mode
└── Question Types

Phase 3 (Later)
├── Matchmaking
├── Tournament Mode
└── Team Mode

Phase 4 (Future)
├── Analytics
└── Insights

Phase 5 (Infrastructure)
├── BullMQ
├── CDN
└── Sharding

Phase 6 (Long Term)
├── Mobile App
└── Public SDK
```

## Contribution Ideas

Open for community/team:

- [ ] Custom themes/skins
- [ ] Sound effects library
- [ ] Achievement system
- [ ] Friend list
- [ ] Private messaging
- [ ] Live chat during game
- [ ] Replay mode
- [ ] Practice mode (solo)
