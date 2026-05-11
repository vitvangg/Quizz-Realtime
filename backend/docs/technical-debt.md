# Technical Debt

## Overview

Liệt kê các vấn đề kỹ thuật và refactoring cần thiết.

## Critical Issues

### 1. No WebSocket Implementation

```typescript
// CURRENT: No GameGateway exists
// PROBLEM: Cannot have realtime gameplay
// FIX: Create src/game/game.gateway.ts
```

### 2. Room/Game Session Stubs

```typescript
// CURRENT: RoomService only has stubs
// src/room/room.service.ts

async create(createRoomDto: CreateRoomDto) {
  // TODO: Implement
}

// PROBLEM: Cannot create or join rooms
// FIX: Full implementation required
```

### 3. GameSessionService Stubs

```typescript
// CURRENT: GameSessionService only returns strings
// src/admin/game-session/game-session.service.ts

create(createGameSessionDto: CreateGameSessionDto) {
  return 'This action adds a new gameSession';  // STUB!
}

// PROBLEM: Cannot manage game sessions
// FIX: Implement full game logic
```

## Medium Issues

### 4. Duplicate Code

```typescript
// AnswersService and QuestionsService both have owner checks
// with identical logic

// answers.service.ts
async checkQuestionOwner(questionId: string, userId: string) {
  const question = await this.prismaService.question.findUnique({
    where: { id: questionId },
    select: { quiz: { select: { createdBy: true } } },
  });
  // ...
}

// questions.service.ts (same logic duplicated)
async checkQuestionOwner(questionId: string, userId: string) {
  const question = await this.prismaService.question.findUnique({
    where: { id: questionId },
    select: { quiz: { select: { createdBy: true } } },
  });
  // ...
}
```

**FIX**: Extract to shared service/utility

### 5. Magic Strings

```typescript
// Error messages in multiple languages
throw new NotFoundException('khong ton tai quétion');
throw new NotFoundException('Quiz not found');
throw new ForbiddenException('not alloewd');

// FIX: Use i18n or constants
const ERROR_MESSAGES = {
  QUESTION_NOT_FOUND: 'Question not found',
  NOT_AUTHORIZED: 'Not authorized'
};
```

### 6. No Redis Integration

```typescript
// CURRENT: Direct DB queries for everything
// PROBLEM: 
//   - Slow game state reads
//   - No cross-instance sync
//   - Can't scale

// FIX: Add Redis caching layer
```

## Low Priority Issues

### 7. No Unit Tests

```typescript
// CURRENT: Some .spec.ts files exist but most are empty
// questions.service.spec.ts exists but no actual tests

// FIX: Add comprehensive unit tests
```

### 8. No Error Codes

```typescript
// CURRENT: Generic HTTP error codes
throw new BadRequestException('Room not found');

// BETTER: Structured error responses
{
  code: 'ROOM_NOT_FOUND',
  message: 'Room not found',
  details: { roomId: '123' }
}

// FIX: Create error codes enum/constant
```

### 9. Logging

```typescript
// CURRENT: console.log scattered
// FIX: Use proper logger (NestJS Logger)

constructor(private readonly logger: Logger) {
  this.logger.log('Prisma connected');
}
```

### 10. Soft Delete Not Enforced

```typescript
// Quiz has deletedAt but no global filter
// Queries still return deleted quizzes

// FIX: Add Prisma middleware for soft delete
this.prisma.$use(async (params, next) => {
  if (params.model === 'Quiz' && params.action === 'findMany') {
    params.args.where = { ...params.args.where, deletedAt: null };
  }
  return next(params);
});
```

## Code Smells

### 11. Method Naming Inconsistency

```typescript
// QuizzsService uses plural 'Quizzs' (double s)
// Should be 'Quizzes' or 'Quiz'
findAll()          // OK
findByUserId()     // OK
findOne()          // OK
```

### 12. No Interface Contracts

```typescript
// CURRENT: Services return Prisma types directly
return this.prismaService.quiz.findMany();

// BETTER: Return DTOs
return quizzes.map(q => QuizDto.fromEntity(q));
```

### 13. No Transaction Wrapping

```typescript
// CURRENT: Multi-step operations without transactions
async removeQuiz(id: string) {
  // Delete answers first
  await this.prisma.answer.deleteMany({ where: { question: { quizId: id } } });
  // Delete questions
  await this.prisma.question.deleteMany({ where: { quizId: id } });
  // Delete quiz
  await this.prisma.quiz.delete({ where: { id } });
  
  // PROBLEM: If step 2 fails, step 1 already committed!
}

// FIX: Wrap in transaction
await this.prisma.$transaction(async (tx) => {
  // all operations here
});
```

## Refactoring Plan

### Phase 1: Core Game Logic
1. Create GameGateway
2. Implement RoomService
3. Implement GameSessionService
4. Add Redis integration

### Phase 2: Code Quality
1. Extract duplicate ownership checks
2. Add error codes
3. Create DTOs for all returns
4. Add transactions where needed

### Phase 3: Polish
1. Add unit tests
2. Set up soft delete middleware
3. Improve logging
4. Add health checks

## Quick Wins

| Issue | Effort | Impact |
|-------|--------|--------|
| Add transaction to delete | 10min | High |
| Error codes | 1hr | Medium |
| Extract shared service | 30min | Medium |
| Add soft delete middleware | 30min | High |

## Debt Priority Matrix

```
        HIGH IMPACT
             │
    Fix      │    Strategic
    Now      │    Refactor
             │
LOW ─────────┼───────── HIGH
EFFORT       │      EFFORT
             │
    Quick    │    Consider
    Fix      │    Abandon
             │
        LOW IMPACT
```
