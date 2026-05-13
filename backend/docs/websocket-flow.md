# WebSocket Flow - Room & Game Session

## Architecture Overview

### Two Namespaces
| Namespace | Purpose | Gateway |
|-----------|---------|---------|
| `/game` (default) | Room management | `RoomGateway` |
| `/game` (game ns) | Game session | `GameGateway` |

Both gateways use the same namespace `/game` but are separate classes.

### Socket Identity Maps
```typescript
// RoomGateway
private socketMap = Map<socketId, { playerId, roomId, nickname, isHost, userId? }>
private roomSockets = Map<roomId, Set<socketId>>

// GameGateway
private socketMap = Map<socketId, PlayerIdentity>
private sessionSockets = Map<sessionId, Set<socketId>>
```

---

## Flow 1: Create Room & Host Game

```
┌─────────────┐                    ┌─────────────┐                    ┌──────────┐
│   Client    │                    │   Backend   │                    │  Prisma  │
└──────┬──────┘                    └──────┬──────┘                    └────┬─────┘
       │                                  │                               │
       │  POST /room (HTTP)               │                               │
       │  { quizId, pin? }                │                               │
       │─────────────────────────────────>│                               │
       │                                  │  room.create()                │
       │                                  │───────────────────────────────>│
       │                                  │<───────────────────────────────│
       │  { roomId, pin }                │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  WebSocket: join_room           │                               │
       │  { pin, nickname }              │                               │
       │─────────────────────────────────>│                               │
       │                                  │  roomService.joinRoom()       │
       │                                  │  - Create/update Player       │
       │                                  │  - Add to room.players        │
       │                                  │───────────────────────────────>│
       │  { playerId, roomId }           │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
```

---

## Flow 2: Host Starts Game

```
┌─────────────┐                    ┌─────────────┐                    ┌──────────┐
│   Client    │                    │   Backend   │                    │  Prisma  │
│   (Host)    │                    │ GameGateway │                    │  Redis   │
└──────┬──────┘                    └──────┬──────┘                    └────┬─────┘
       │                                  │                               │
       │  WebSocket: host_start_game     │                               │
       │  { roomId, jwt }                │                               │
       │────────────────────────────────>│                               │
       │                                  │  verify JWT                  │
       │                                  │  gameSessionService.startGame │
       │                                  │───────────────────────────────>│
       │                                  │  - Create GameSession         │
       │                                  │  - Create PlayerSession(s)    │
       │                                  │  - Update room.status=PLAYING │
       │                                  │                               │
       │                                  │  Set game:{sessionId} cache   │
       │                                  │───────────────────────────────>│
       │                                  │                               │
       │                                  │  Init leaderboard             │
       │                                  │───────────────────────────────>│
       │                                  │                               │
       │  ACK: { success, sessionId }    │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  1. Emit: game_starting         │                               │
       │     { sessionId, countdown: 5 } │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  2. For i=5..1:                 │                               │
       │     Emit: countdown_tick         │                               │
       │     { remaining: i-1 }          │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  3. Emit: game_redirect         │                               │
       │     { url, sessionId }          │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  4. Emit: question_start        │                               │
       │     (to BOTH room & session)   │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  window.location.href           │                               │
       │  /game/{sessionId}              │                               │
       │─────────────────────────────────>│                               │
       │                                  │  New socket connects          │
       │  WebSocket: host_join_game      │                               │
       │  { sessionId, jwt }             │                               │
       │────────────────────────────────>│                               │
       │  { success, isActualHost, state }                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  Schedule timer:                │                               │
       │  handleQuestionEnd after X sec  │                               │
       │                                  │                               │
```

---

## Flow 3: Player Joins Room

```
┌─────────────┐                    ┌─────────────┐                    ┌──────────┐
│   Client    │                    │   Backend   │                    │  Prisma  │
│  (Player)   │                    │RoomGateway │                    │          │
└──────┬──────┘                    └──────┬──────┘                    └────┬─────┘
       │                                  │                               │
       │  POST /room/join (HTTP)         │                               │
       │  { pin, nickname }              │                               │
       │─────────────────────────────────>│                               │
       │                                  │  roomService.joinRoom()       │
       │                                  │───────────────────────────────>│
       │  { playerId, roomId }           │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  WebSocket: join_room           │                               │
       │  { pin, nickname }              │                               │
       │─────────────────────────────────>│                               │
       │  { success, playerId, roomId,   │                               │
       │    hostId, quiz, players }      │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  Emit: player_joined            │                               │
       │  (to all in room)               │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
```

---

## Flow 4: Player Receives Game Start

```
┌─────────────┐                    ┌─────────────┐
│   Client    │                    │   Backend   │
│  (Player)   │                    │RoomGateway │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  from host_start_game:          │
       │  Emit: game_redirect            │
       │  { url, sessionId }             │
       │<────────────────────────────────│
       │                                  │
       │  window.location.href            │
       │  /game/{sessionId}              │
       │─────────────────────────────────>
       │                                  │
       │  WebSocket: join_game           │
       │  { sessionId, jwt? }            │
       │─────────────────────────────────>
       │  { success, playerId, state }   │
       │<─────────────────────────────────
       │                                  │
       │  Also receives:                  │
       │  question_start (if sent         │
       │  before navigation complete)    │
       │<─────────────────────────────────
       │                                  │
```

---

## Flow 5: Answer Question (Player)

```
┌─────────────┐                    ┌─────────────┐                    ┌──────────┐
│   Client    │                    │   Backend   │                    │  Redis   │
│  (Player)   │                    │ GameGateway │                    │          │
└──────┬──────┘                    └──────┬──────┘                    └────┬─────┘
       │                                  │                               │
       │  Click answer button            │                               │
       │  WebSocket: submit_answer       │                               │
       │  { sessionId, playerId,        │                               │
       │    questionId, answerId,        │                               │
       │    clientTimestamp }            │                               │
       │────────────────────────────────>│                               │
       │                                  │  Check: already answered?     │
       │                                  │  Check: within time limit?    │
       │                                  │                               │
       │                                  │  Calculate score:             │
       │                                  │  basePoints * timeMultiplier  │
       │                                  │  timeMultiplier = timeLeft /  │
       │                                  │           totalTime            │
       │                                  │                               │
       │                                  │  Update leaderboard           │
       │                                  │───────────────────────────────>│
       │                                  │                               │
       │  ACK: { success, pointsEarned } │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  Emit: score_update             │                               │
       │  (to all in session)            │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
```

---

## Flow 6: Question Timer Ends (Automatic)

```
┌─────────────┐                    ┌─────────────┐                    ┌──────────┐
│   Client    │                    │   Backend   │                    │  Redis   │
│  (Player)   │                    │GameSessionSvc│                   │          │
└──────┬──────┘                    └──────┬──────┘                    └────┬─────┘
       │                                  │                               │
       │  Timer expires                  │                               │
       │  (setTimeout)                    │                               │
       │──────────────────────────────────│                               │
       │                                  │                               │
       │                                  │  handleQuestionEnd()          │
       │                                  │  - Get correct answer         │
       │                                  │  - Update cache status        │
       │                                  │  - Update Redis cache         │
       │                                  │───────────────────────────────>│
       │                                  │                               │
       │                                  │  Emit: question_result       │
       │  Emit: question_result           │  (callback from timer)        │
       │  { questionIndex, correctAnswer, │──────────────────────────────>│
       │    leaderboard, isLastQuestion } │                               │
       │<─────────────────────────────────│                               │
       │                                  │                               │
       │  If isLastQuestion:              │                               │
       │  Emit: game_ended                │                               │
       │<─────────────────────────────────│                               │
       │                                  │                               │
```

---

## Flow 7: Host Advances Question

```
┌─────────────┐                    ┌─────────────┐
│   Client    │                    │   Backend   │
│   (Host)    │                    │ GameGateway │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  WebSocket: host_next_question  │
       │  { sessionId }                   │
       │────────────────────────────────>│
       │                                  │
       │                                  │  Verify: isHost
       │                                  │  Cancel current timer
       │                                  │  nextQuestion()
       │                                  │
       │  ACK: { success }               │
       │<────────────────────────────────│
       │                                  │
       │  Emit: question_start            │
       │  (to all in session)             │
       │<────────────────────────────────│
       │                                  │
       │  Schedule new timer             │
       │                                  │
```

---

## Flow 8: Host Closes Room (Game Finished)

```
┌─────────────┐                    ┌─────────────┐
│   Client    │                    │   Backend   │
│   (Host)    │                    │ GameGateway │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  Click "Ve Quiz"                │
       │  WebSocket: host_close_room     │
       │  { sessionId, roomId }          │
       │────────────────────────────────>│
       │                                  │
       │                                  │  Verify: isHost
       │                                  │  Cancel timers
       │                                  │
       │                                  │  Emit: room_closed
       │                                  │  (to all sockets in session)
       │                                  │
       │  ACK: { success }               │
       │<────────────────────────────────│
       │                                  │
       │  Router: /quiz                  │
       │─────────────────────────────────>
       │
       │
       │  [Other Players receive:        │
       │   room_closed event]            │
       │<────────────────────────────────│
       │                                  │
       │  Toast: "Host da roi phong"     │
       │  Router: /                      │
       │─────────────────────────────────>
```

---

## Flow 9: Player Leaves Room

```
┌─────────────┐                    ┌─────────────┐                    ┌──────────┐
│   Client    │                    │   Backend   │                    │  Prisma  │
│  (Player)   │                    │RoomGateway │                    │          │
└──────┬──────┘                    └──────┬──────┘                    └────┬─────┘
       │                                  │                               │
       │  Click "Roi phong"              │                               │
       │  WebSocket: leave_room          │                               │
       │  { roomId }                     │                               │
       │────────────────────────────────>│                               │
       │                                  │  roomService.leaveRoom()      │
       │                                  │  - Remove from room.players   │
       │                                  │───────────────────────────────>│
       │                                  │                               │
       │  ACK: { success }               │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
       │  Emit: player_left              │                               │
       │  { playerId }                   │                               │
       │<────────────────────────────────│                               │
       │                                  │                               │
```

---

## WebSocket Events Summary

### RoomGateway (namespace: /game)

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join_room` | Client→Server | `{ pin, nickname }` | Join room by PIN |
| `join_room_by_id` | Client→Server | `{ roomId, nickname }` | Join room by ID |
| `leave_room` | Client→Server | `{ roomId }` | Leave room |
| `start_game` | Client→Server | `{ roomId, jwt }` | Host starts game |
| `player_joined` | Server→Client | `{ player }` | New player joined |
| `player_left` | Server→Client | `{ playerId }` | Player left |
| `host_left` | Server→Client | `{ roomId }` | Host disconnected |
| `game_redirect` | Server→Client | `{ url, sessionId }` | Navigate to game |
| `game_starting` | Server→Client | `{ sessionId, countdown }` | Game countdown |

### GameGateway (namespace: /game)

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `host_join_game` | Client→Server | `{ sessionId, jwt? }` | Host joins game session |
| `join_game` | Client→Server | `{ sessionId, jwt? }` | Player joins game session |
| `submit_answer` | Client→Server | `{ sessionId, playerId, questionId, answerId, clientTimestamp }` | Submit answer |
| `host_next_question` | Client→Server | `{ sessionId }` | Host advances question |
| `host_end_game` | Client→Server | `{ sessionId }` | Host ends game |
| `host_close_room` | Client→Server | `{ sessionId, roomId }` | Host closes room, kicks all |
| `host_play_again` | Client→Server | `{ sessionId, roomId }` | Host restarts game |
| `countdown_tick` | Server→Client | `{ remaining }` | Countdown update |
| `question_start` | Server→Client | `{ sessionId, questionIndex, question, totalQuestions }` | New question |
| `question_result` | Server→Client | `{ questionIndex, correctAnswer, leaderboard, isLastQuestion }` | Question ended |
| `game_ended` | Server→Client | `{ sessionId, finalLeaderboard }` | Game finished |
| `score_update` | Server→Client | `{ playerId, score, rank }` | Score changed |
| `room_closed` | Server→Client | `{ reason }` | Room closed by host |
| `game_redirect` | Server→Client | `{ url, sessionId }` | Navigation redirect |

---

## Game States

```typescript
enum GameState {
  WAITING = 'WAITING',           // Room created, waiting for players
  STARTING = 'STARTING',         // Countdown 5-4-3-2-1
  QUESTION_ACTIVE = 'QUESTION_ACTIVE', // Question displayed, answering
  QUESTION_RESULT = 'QUESTION_RESULT',  // Showing correct answer
  LEADERBOARD = 'LEADERBOARD',   // Showing leaderboard
  FINISHED = 'FINISHED',         // Game over
}
```

## State Transitions

```
WAITING ──(host_start_game)──> STARTING
STARTING ──(countdown ends)──> QUESTION_ACTIVE
QUESTION_ACTIVE ──(timer/host)──> QUESTION_RESULT
QUESTION_RESULT ──(host_next)──> QUESTION_ACTIVE or FINISHED
QUESTION_RESULT ──(last question)──> FINISHED
FINISHED ──(host_play_again)──> STARTING
FINISHED/any ──(host_close_room)──> (all redirect to /quiz or /)
```
