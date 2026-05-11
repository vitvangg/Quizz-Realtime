# Security

## Authentication

### JWT Strategy

```typescript
// Current implementation
const accessToken = jwtService.sign({
  id: user.id,
  email: user.email
});

// Token stored in memory, sent via Authorization header
Authorization: Bearer <token>
```

### Refresh Token

```typescript
// Stored in database (AuthSession)
const refreshToken = crypto.randomBytes(64).toString('hex');
await sessionService.createSession(user.id, refreshToken, expiresAt);

// Sent via httpOnly cookie or body
```

### WebSocket Auth (TODO)

```typescript
// Handshake auth
const socket = io('http://localhost:3000/game', {
  auth: { token: accessToken }
});

// Gateway validates on connect
@WebSocketGateway()
export class GameGateway implements OnGatewayConnection {
  handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    const user = jwtService.verify(token);
    // Attach user to socket
  }
}
```

## Authorization

### Room Access

```typescript
// Only host can start game
async startGame(roomId: string, userId: string) {
  const room = await this.prisma.room.findUnique({ where: { id: roomId } });
  
  if (room.hostId !== userId) {
    throw new ForbiddenException('Only host can start game');
  }
}

// Player must be in room to play
async submitAnswer(playerId: string, sessionId: string) {
  const playerSession = await this.prisma.playerSession.findUnique({
    where: { playerId_sessionId: { playerId, sessionId } }
  });
  
  if (!playerSession) {
    throw new UnauthorizedException('Player not in session');
  }
}
```

### RBAC (Admin)

```typescript
// Admin routes use RolesGuard
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Get('admin/users')
getAllUsers() { }
```

## Input Validation

### DTOs with class-validator

```typescript
// Current: ValidationPipe enabled globally
app.useGlobalPipes(new ValidationPipe());

// Example DTO
export class CreateQuestionDto {
  @IsString()
  @MinLength(5)
  content: string;
  
  @IsInt()
  @Min(5)  // Min 5 seconds
  @Max(120)  // Max 2 minutes
  timeLimit: number;
}
```

## WebSocket Security

### Rate Limiting (TODO)

```typescript
// Prevent spam
const RATE_LIMIT = {
  join_room: { max: 5, window: 1000 },    // 5/sec
  submit_answer: { max: 3, window: 1000 },  // 3/sec
  chat: { max: 10, window: 1000 }          // 10/sec
};
```

### Message Validation

```typescript
@SubscribeMessage('submit_answer')
handleAnswer(@MessageBody() data: any) {
  // Validate structure
  if (!data.questionId || !data.answerId) {
    throw new WsException('Invalid payload');
  }
  
  // Validate types
  if (typeof data.questionId !== 'string') {
    throw new WsException('Invalid types');
  }
}
```

## Cheating Prevention

### Client Cannot Trust

```typescript
// BAD: Client tells us answer is correct
{ answerId: '123', isCorrect: true }

// GOOD: Server validates
{ answerId: '123' }

// Server checks:
// 1. Answer exists
// 2. Answer belongs to question
// 3. Answer isCorrect is true
```

### Timer Sync

```typescript
// Server is source of truth
interface QuestionStart {
  question: Question;
  startTime: number;      // Server timestamp
  timeLimit: number;      // Server time limit
}

// Client calculates remaining:
// remaining = timeLimit - (now - startTime)

// Server validates answer time
if (Date.now() > startTime + (timeLimit * 1000)) {
  throw new BadRequestException('Time expired');
}
```

### Score Calculation

```typescript
// ALWAYS calculate on server
async calculateScore(
  answerId: string,
  questionId: string,
  startedAt: Date
): Promise<number> {
  // 1. Verify answer is correct
  const answer = await this.prisma.answer.findUnique({
    where: { id: answerId }
  });
  
  if (!answer.isCorrect) return 0;
  
  // 2. Calculate time-based score
  const timeTaken = Date.now() - startedAt.getTime();
  const timeBonus = Math.max(0, 1000 - Math.floor(timeTaken / 10));
  
  return 1000 + timeBonus;
}
```

## Data Exposure

### Questions

```typescript
// When sending question to players, DON'T include correct answer
const questionPayload = {
  id: question.id,
  content: question.content,
  answers: question.answers.map(a => ({
    id: a.id,
    content: a.content
    // isCorrect: OMITTED!
  }))
};
```

### Player Answers

```typescript
// Don't reveal other players' answers during question
// Only broadcast: "player X has answered"
{
  playerId: '...',
  nickname: 'Player1',
  // answerId: OMITTED
}
```

## CORS

```typescript
// Current configuration
app.enableCors({
  origin: 'http://localhost:3000',  // Specific origin only
  credentials: true
});
```

## Security Checklist

- [x] Password hashing (bcrypt, 10 rounds)
- [x] JWT for API auth
- [x] Refresh token rotation
- [x] RBAC for admin
- [x] Input validation (class-validator)
- [x] CORS configured
- [ ] WebSocket authentication
- [ ] Rate limiting (WebSocket)
- [ ] IP rate limiting
- [ ] Request size limits
- [ ] SQL injection prevention (Prisma handles)
- [ ] XSS prevention (client concern)

## Security Headers (TODO)

```typescript
// Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
```
