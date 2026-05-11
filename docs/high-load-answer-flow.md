# Ph├ón t├¡ch Kiß║┐n tr├║c High-Load: 1000ΓÇô10000 Players Trß║ú Lß╗¥i ─Éß╗ông Thß╗¥i

> **Phß║ím vi:** Ph├ón t├¡ch luß╗ông submit c├óu trß║ú lß╗¥i, c├ích leaderboard ─æ╞░ß╗úc cß║¡p nhß║¡t vß╗¢i ─æß╗Ö trß╗à tß╗æi thiß╗âu, c├ích load balancer hoß║ít ─æß╗Öng, v├á ─æß║╖c biß╗çt l├á c├íc bottleneck hiß╗çn tß║íi cß╗ºa codebase khi scale l├¬n 1000ΓÇô10000 players ─æß╗ông thß╗¥i.

---

## Mß╗Ñc lß╗Ñc

1. [Luß╗ông Submit Answer ΓÇö Tß╗½ Client ─Éß║┐n Redis](#1-luß╗ông-submit-answer)
2. [Kiß║┐n tr├║c Redis Buffer & Leaderboard](#2-kiß║┐n-tr├║c-redis-buffer--leaderboard)
3. [Vß║Ñn ─æß╗ü Bottleneck Hiß╗çn Tß║íi](#3-vß║Ñn-─æß╗ü-bottleneck-hiß╗çn-tß║íi)
4. [Load Balancer ΓÇö Socket.io Redis Adapter](#4-load-balancer--socketio-redis-adapter)
5. [Cß║¡p Nhß║¡t Leaderboard Vß╗¢i ─Éß╗Ö Trß╗à Thß║Ñp Nhß║Ñt](#5-cß║¡p-nhß║¡t-leaderboard-vß╗¢i-─æß╗Ö-trß╗à-thß║Ñp-nhß║Ñt)
6. [Mß╗ƒ Rß╗Öng L├¬n 10000 Players](#6-mß╗ƒ-rß╗Öng-l├¬n-10000-players)
7. [Roadmap Cß║úi Tiß║┐n](#7-roadmap-cß║úi-tiß║┐n)

---

## 1. Luß╗ông Submit Answer

### 1.1 S╞í ─æß╗ô tuß║ºn tß╗▒ ΓÇö 1000 Players C├╣ng Gß╗¡i

```
Player 1 ΓöÇΓöÇΓöÉ
Player 2 ΓöÇΓöÇΓöñ
  ...     Γöé  WebSocket submit_answer
Player N ΓöÇΓöÿ
           Γöé
           Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                  NestJS Instance A (hoß║╖c B, C...)              Γöé
Γöé                                                              Γöé
Γöé  GameGateway ΓåÆ AnswerHandler.handleSubmitAnswer()             Γöé
Γöé                                                              Γöé
Γöé  Γæá Rate limit check (Redis Lua script)                         Γöé
Γöé     Γö£ΓöÇ ZREMRANGEBYSCORE (sliding window)                     Γöé
Γöé     Γö£ΓöÇ ZCARD ΓåÆ count                                         Γöé
Γöé     Γö£ΓöÇ ZADD new entry                                        Γöé
Γöé     ΓööΓöÇ ΓåÉ { allowed: true/false }                             Γöé
Γöé                                                              Γöé
Γöé  Γæí Validate active question (In-Memory Map ΓÜá∩╕Å)               Γöé
Γöé     Γö£ΓöÇ GameService.activeQuestions.get(roomId)                Γöé
Γöé     ΓööΓöÇ ΓåÉ ActiveQuestion { sessionId, questionId, startedAt }   Γöé
Γöé                                                              Γöé
Γöé  Γæó Validate: ─æ├║ng question, ch╞░a hß║┐t giß╗¥                    Γöé
Γöé                                                              Γöé
Γöé  Γæú Redis SETNX ΓÇö Atomic deduplication (answered key)         Γöé
Γöé     Γö£ΓöÇ SETNX answered:{sessionId}:{questionId}:{playerId}     Γöé
Γöé     Γö£ΓöÇ Nß║┐u wasSet=1 ΓåÆ ch╞░a trß║ú lß╗¥i, tiß║┐p tß╗Ñc                Γöé
Γöé     ΓööΓöÇ Nß║┐u wasSet=0 ΓåÆ ─æ├ú trß║ú lß╗¥i rß╗ôi ΓåÆ reject              Γöé
Γöé                                                              Γöé
Γöé  Γæñ LPUSH ΓÇö Buffer answer v├áo Redis (O(1))                   Γöé
Γöé     Γö£ΓöÇ LPUSH buffer:{sessionId}:{questionId} JSON            Γöé
Γöé     ΓööΓöÇ EXPIRE buffer 600s                                     Γöé
Γöé                                                              Γöé
Γöé  ΓæÑ ZADD ΓÇö Cß║¡p nhß║¡t leaderboard score (O(log N))             Γöé
Γöé     Γö£ΓöÇ ZINCRBY lb:{sessionId} {deltaScore} {playerId}        Γöé
Γöé     ΓööΓöÇ Chß╗ë cß║¡p nhß║¡t nß║┐u ─æ├íp ├ín ─æ├║ng                         Γöé
Γöé                                                              Γöé
Γöé  Γæª ACK vß╗ü client (< 10ms)                                    Γöé
Γöé     ΓööΓöÇ answer:received { estimatedScore, responseTimeMs }    Γöé
Γöé                                                              Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### 1.2 Chi tiß║┐t m├ú nguß╗ôn ΓÇö AnswerHandler

**File:** `backend/src/game/handlers/answer.handler.ts`

```typescript
async handleSubmitAnswer(client: Socket, payload: SubmitAnswerPayload, server: Server) {
  // ΓöÇΓöÇΓöÇ Γæá Rate limit (Lua script ΓÇö atomic) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const rateLimit = await this.redis.checkRateLimit(playerId);
  if (!rateLimit.allowed) throw new WsException({ code: 'RATE_LIMITED', ... });

  // ΓöÇΓöÇΓöÇ Γæí Get active question (ΓÜá∩╕Å In-Memory ΓÇö bottleneck!) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const activeQuestion = await this.gameService.getActiveQuestion(roomId);
  if (!activeQuestion) throw new WsException({ code: 'NO_ACTIVE_QUESTION', ... });

  // ΓöÇΓöÇΓöÇ Γæó Time validation ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const elapsedMs = Date.now() - activeQuestion.startedAt;
  if (elapsedMs > activeQuestion.durationMs)
    throw new WsException({ code: 'TIME_EXPIRED', ... });

  // ΓöÇΓöÇΓöÇ Γæú Atomic deduplication (SETNX) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const { isFirst } = await this.redis.checkAndSetAnswered(
    sessionId, questionId, playerId, answerPayload,
  );
  if (!isFirst) throw new WsException({ code: 'ALREADY_ANSWERED', ... });

  // ΓöÇΓöÇΓöÇ Γæñ Buffer answer (LPUSH) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  await this.redis.bufferAnswer(sessionId, questionId, answerPayload);

  // ΓöÇΓöÇΓöÇ ΓæÑ Leaderboard update (ZINCRBY) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  // NOTE: ─Éiß╗âm chß╗ë ─æ╞░ß╗úc cß╗Öng khi ─æ├íp ├ín ─æ├║ng
  // Score ─æ╞░ß╗úc t├¡nh trong flushAnswersAndCalculateScores()

  // ΓöÇΓöÇΓöÇ Γæª ACK ngay vß╗ü client ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  return {
    event: 'answer:received',
    data: { success: true, responseTimeMs: elapsedMs, estimatedScore },
  };
}
```

### 1.3 Redis Lua Script cho Rate Limit

**File:** `backend/src/redis/redis.service.ts` (d├▓ng 146ΓÇô200)

```lua
-- Sliding window rate limiter ΓÇö atomic trong 1 Redis command
-- KEYS[1] = ratelimit:{playerId}
-- ARGV[1] = now (timestamp ms)
-- ARGV[2] = window (1000ms)
-- ARGV[3] = limit (5 requests/window)

ZREMRANGEBYSCORE KEY -inf now-window        -- X├│a entries c┼⌐
ZCARD KEY                                    -- ─Éß║┐m entries hiß╗çn tß║íi

if count < limit then
  ZADD KEY now now:random                    -- Th├¬m entry mß╗¢i
  EXPIRE KEY window+1                        -- Set TTL
  return {1, limit-count-1, now+window}     -- allowed, remaining, reset
else
  oldest = ZRANGE KEY 0 0 WITHSCORES        -- Lß║Ñy entry c┼⌐ nhß║Ñt
  reset = oldest[2] + window
  return {0, 0, reset}                       -- rejected
end
```

**─Éß║╖c ─æiß╗âm:**
- Atomic ΓÇö kh├┤ng c├│ race condition giß╗»a ZREMRANGEBYSCORE v├á ZADD
- Sliding window ΓÇö kh├┤ng c├│ vß║Ñn ─æß╗ü "burst" ß╗ƒ boundary
- 5 requests/gi├óy/player ΓÇö ─æß╗º ─æß╗â chß╗æng spam, kh├┤ng g├óy chß║¡m ng╞░ß╗¥i ch╞íi thß║¡t

---

## 2. Kiß║┐n tr├║c Redis Buffer & Leaderboard

### 2.1 Cß║Ñu tr├║c Redis Keys cho Game

```
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                    REDIS KEYS ΓÇö GAME                            Γöé
Γö£ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöñ
Γöé                                                                  Γöé
Γöé  ΓöîΓöÇ ANSWER BUFFER ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  Γöé  buffer:{sessionId}:{questionId}     LIST                 Γöé  Γöé
Γöé  Γöé  Γö£ΓöÇ "[{playerId, answerId, responseTimeMs, timestamp}]"  Γöé  Γöé
Γöé  Γöé  Γö£ΓöÇ "..."                                                Γöé  Γöé
Γöé  Γöé  ΓööΓöÇ LPUSH (front) / LRANGE 0 -1 (read)                  Γöé  Γöé
Γöé  Γöé  TTL: 600s (10 ph├║t)                                     Γöé  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  Γöé  ΓåÆ Mß╗ùi player submit: LPUSH 1 entry                      Γöé  Γöé
Γöé  Γöé  ΓåÆ Flush: LRANGE ΓåÆ DEL ΓåÆ batch insert DB                 Γöé  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé                                                                  Γöé
Γöé  ΓöîΓöÇ ANSWER DEDUPLICATION ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  Γöé  answered:{sessionId}:{questionId}:{playerId}  STRING     Γöé  Γöé
Γöé  Γöé  Value: JSON payload                                       Γöé  Γöé
Γöé  Γöé  TTL: 120s                                                Γöé  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  Γöé  SETNX ΓÇö chß╗ë set nß║┐u ch╞░a tß╗ôn tß║íi                        Γöé  Γöé
Γöé  Γöé  ΓåÆ Atomic: kh├┤ng race condition "tr├╣ng c├óu trß║ú lß╗¥i"       Γöé  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé                                                                  Γöé
Γöé  ΓöîΓöÇ LEADERBOARD ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  Γöé  lb:{sessionId}                           ZSET              Γöé  Γöé
Γöé  Γöé  Γö£ΓöÇ score: playerId                                           Γöé  Γöé
Γöé  Γöé  Γö£ΓöÇ "1000:player-1"                                         Γöé  Γöé
Γöé  Γöé  Γö£ΓöÇ "950:player-2"                                         Γöé  Γöé
Γöé  Γöé  ΓööΓöÇ "900:player-N"                                         Γöé  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  Γöé  ZINCRBY lb:{sessionId} {delta} {playerId}  ΓåÉ update score Γöé  Γöé
Γöé  Γöé  ZREVRANGE lb:{sessionId} 0 9 WITHSCORES  ΓåÉ top 10       Γöé  Γöé
Γöé  Γöé  ZREVRANK lb:{sessionId} {playerId}     ΓåÉ rank cß╗ºa player Γöé  Γöé
Γöé  Γöé  ZSCORE lb:{sessionId} {playerId}       ΓåÉ score cß╗ºa playerΓöé  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé                                                                  Γöé
Γöé  ΓöîΓöÇ RATE LIMIT ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  Γöé  ratelimit:{playerId}                    ZSET              Γöé  Γöé
Γöé  Γöé  Γö£ΓöÇ score: timestamp                                        Γöé  Γöé
Γöé  Γöé  ΓööΓöÇ member: timestamp:random                                Γöé  Γöé
Γöé  Γöé  TTL: 2s                                                   Γöé  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé                                                                  Γöé
Γöé  ΓöîΓöÇ ROOM STATE (cho join/leave) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  Γöé  room:{pin}                              HASH             Γöé  Γöé
Γöé  Γöé  room:{pin}:players                     HASH              Γöé  Γöé
Γöé  Γöé  socket:{socketId}                      STRING            Γöé  Γöé
Γöé  Γöé                                                             Γöé  Γöé
Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé                                                                  Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### 2.2 Tß║íi sao d├╣ng Buffer thay v├¼ ghi trß╗▒c tiß║┐p v├áo DB?

| Vß║Ñn ─æß╗ü | Giß║úi ph├íp Buffer |
|---|---|
| **1000 answers c├╣ng l├║c** | Redis LPUSH O(1), kh├┤ng c├│ lock contention |
| **DB connection exhaustion** | Batch 100-500 rows/request thay v├¼ 1000 individual INSERT |
| **Latency spike** | ACK ngay tß╗½ Redis (< 5ms), DB write l├á async |
| **Race condition tr├╣ng c├óu trß║ú lß╗¥i** | Redis SETNX atomic |
| **─Éiß╗âm cß║ºn t├¡nh to├ín** | Lua script trong Redis, atomic |

### 2.3 Flush Buffer ΓÇö Batch Insert v├áo DB

**File:** `backend/src/game/game.service.ts` (d├▓ng 622ΓÇô658)

```typescript
async flushAnswersAndCalculateScores(
  sessionId: string,
  questionId: string,
  correctAnswerId: string,
  bufferedAnswers: AnswerPayload[],
) {
  const results = [];

  for (const answer of bufferedAnswers) {
    const isCorrect = answer.answerId === correctAnswerId;

    // Score formula: 1000 - (elapsedMs / 10), min 100 nß║┐u ─æ├║ng
    const scoreEarned = isCorrect
      ? Math.max(100, 1000 - Math.floor(answer.responseTimeMs / 10))
      : 0;

    results.push({ playerId, scoreEarned, isCorrect, responseTimeMs });

    // Update leaderboard
    if (isCorrect) {
      await this.redis.updateScore(sessionId, answer.playerId, scoreEarned);
    }
  }

  // sau ─æ├│ batch insert v├áo DB (PlayerAnswer records)
  // ΓåÆ Prisma: playerAnswer.createMany()
}
```

---

## 3. Vß║Ñn ─æß╗ü Bottleneck Hiß╗çn Tß║íi

> ΓÜá∩╕Å **Cß║únh b├ío:** ─É├óy l├á c├íc vß║Ñn ─æß╗ü nghi├¬m trß╗ìng trong codebase hiß╗çn tß║íi nß║┐u muß╗æn scale l├¬n 1000+ players.

### 3.1 Bottleneck #1 ΓÇö `activeQuestions` In-Memory (CRITICAL)

**File:** `backend/src/game/game.service.ts` (d├▓ng 14, 573ΓÇô612)

```typescript
export class GameService {
  // ΓÜá∩╕Å IN-MEMORY ΓÇö KH├öNG SHARED GIß╗«A C├üC INSTANCES!
  private activeQuestions = new Map<string, ActiveQuestion>();
}
```

**Vß║Ñn ─æß╗ü:**
```
Instance A                      Instance B
    Γöé                               Γöé
    Γöé Host bß║»t ─æß║ºu c├óu hß╗Åi         Γöé
    Γöé setActiveQuestion(roomId, q)  Γöé
    Γöé ΓåÆ activeQuestions.set()       Γöé
    Γöé                               Γöé
    Γöé Player 500 kß║┐t nß╗æi ─æß║┐n A      Γöé
    Γöé submit_answer ΓåÆ Instance A Γ£à  Γöé
    Γöé                               Γöé
    Γöé Player 600 kß║┐t nß╗æi ─æß║┐n B      Γöé
    Γöé submit_answer ΓåÆ Instance B Γ¥î
    Γöé ΓåÆ getActiveQuestion(roomId)
    Γöé ΓåÆ activeQuestions.get(roomId)
    Γöé ΓåÆ undefined! (instance B kh├┤ng c├│)
    Γöé ΓåÆ NO_ACTIVE_QUESTION
```

**Hß║¡u quß║ú:** Trong multi-instance, **player c├│ thß╗â kh├┤ng submit ─æ╞░ß╗úc c├óu trß║ú lß╗¥i** nß║┐u kh├┤ng kß║┐t nß╗æi ─æ├║ng instance ─æang host c├óu hß╗Åi.

**Giß║úi ph├íp:** Di chuyß╗ân `activeQuestions` v├áo Redis:

```typescript
// Trong RedisService
async setActiveQuestion(roomId: string, data: ActiveQuestion): Promise<void> {
  const key = `game:active:${roomId}`;
  await this.client.hset(key, {
    sessionId: data.sessionId,
    questionId: data.questionId,
    startedAt: data.startedAt.toString(),
    durationMs: data.durationMs.toString(),
    questionIndex: data.questionIndex.toString(),
  });
  await this.client.expire(key, 3600); // 1h
}

async getActiveQuestion(roomId: string): Promise<ActiveQuestion | null> {
  const key = `game:active:${roomId}`;
  const data = await this.client.hgetall(key);
  if (!data || Object.keys(data).length === 0) return null;
  return {
    sessionId: data.sessionId,
    questionId: data.questionId,
    startedAt: parseInt(data.startedAt),
    durationMs: parseInt(data.durationMs),
    questionIndex: parseInt(data.questionIndex),
  };
}
```

### 3.2 Bottleneck #2 ΓÇö `SocketStateService` In-Memory (CRITICAL)

**File:** `backend/src/game/services/socket-state.service.ts`

```typescript
export class SocketStateService {
  // ΓÜá∩╕Å IN-MEMORY ΓÇö CHß╗ê TR├èN 1 INSTANCE!
  private socketInfoMap = new Map<string, SocketInfo>();
  private playerSocketMap = new Map<string, string>();
  private roomHostMap = new Map<string, string>();
}
```

**Vß║Ñn ─æß╗ü:**
```
Instance A                      Instance B
    Γöé                               Γöé
    Γöé Player join ΓåÆ Instance A      Γöé
    Γöé registerPlayer(socketA, ...)  Γöé
    Γöé                               Γöé
    Γöé Player 200 join ΓåÆ Instance A  Γöé
    Γöé Γ£à getSocketInfo() works      Γöé
    Γöé                               Γöé
    Γöé Host kick Player 200          Γöé
    Γöé ΓåÆ Host ß╗ƒ Instance A          Γöé
    Γöé ΓåÆ SocketState lookup OK       Γöé
    Γöé                               Γöé
    Γöé Player 500 join ΓåÆ Instance B  Γöé
    Γöé registerPlayer(socketB, ...)  Γöé
    Γöé                               Γöé
    Γöé Host ß╗ƒ Instance A kick P.500  Γöé
    Γöé ΓåÆ getPlayerSocketId(playerId) Γöé
    Γöé ΓåÆ lookup ß╗ƒ Instance A        Γöé
    Γöé ΓåÆ Player 500 ß╗ƒ Instance B Γ¥î  Γöé
    Γöé ΓåÆ undefined! Socket not found Γöé
```

**Giß║úi ph├íp:** Thay ho├án to├án bß║▒ng Redis operations (─æ├ú c├│ sß║╡n trong `RedisService`):

```typescript
// Sß╗¡ dß╗Ñng Redis thay v├¼ SocketStateService
// ─É├ú implement trong RedisService:
async addPlayerToRoom(pin, socketId, playerData)
async getPlayerBySocket(socketId)
async isHostSocket(socketId, pin)
async getSocketRoom(socketId)
```

> **L╞░u ├╜:** Code hiß╗çn tß║íi c├│ DUAL state ΓÇö vß╗½a d├╣ng `SocketStateService` (in-memory) trong `AnswerHandler`/`HostHandler`/`PlayerHandler`, vß╗½a d├╣ng `RedisService` trong `RoomHandler`. ─É├óy l├á inconsistency nghi├¬m trß╗ìng cß║ºn consolidate.

### 3.3 Bottleneck #3 ΓÇö Socket.io Fan-out khi Broadcast

**Vß║Ñn ─æß╗ü:**

```
Khi 1 c├óu hß╗Åi kß║┐t th├║c, cß║ºn broadcast kß║┐t quß║ú cho N players:

Instance A (1000 players) ΓöÇΓöÇΓåÆ server.to('room:{id}').emit('question:end', ...)
                               Γöé
                               Γö£ΓöÇΓöÇΓåÆ WebSocket msg ΓåÆ Player 1
                               Γö£ΓöÇΓöÇΓåÆ WebSocket msg ΓåÆ Player 2
                               Γö£ΓöÇΓöÇΓåÆ ...
                               ΓööΓöÇΓöÇΓåÆ WebSocket msg ΓåÆ Player 1000
                               
Thß╗¥i gian fan-out: ~50ms cho 1000 clients (single instance)
Thß╗¥i gian fan-out: ~50ms ├ù M instances (M instances c├╣ng broadcast)
```

**Vß║Ñn ─æß╗ü vß╗¢i 10000 players:**
- Mß╗ùi WebSocket message phß║úi ─æ╞░ß╗úc gß╗¡i ri├¬ng lß║╗
- CPU bound tr├¬n instance ph├ít s├│ng
- Vß╗¢i 10 instances ├ù 1000 players = 10 ├ù 50ms = 500ms ─æß╗â broadcast hß║┐t

**Giß║úi ph├íp:** Xem phß║ºn 5.

### 3.4 Bottleneck #4 ΓÇö Prisma Batch Insert

**Vß║Ñn ─æß╗ü:**

```typescript
// Hiß╗çn tß║íi: insert tß╗½ng PlayerAnswer mß╗Öt
for (const answer of bufferedAnswers) {
  await this.prisma.playerAnswer.create({ data: answerRecord });
}
```

Vß╗¢i 1000 players ΓåÆ 1000 individual DB writes ΓåÆ ~200-500ms ΓåÆ latency cao.

**Giß║úi ph├íp:**

```typescript
// Tß╗æt h╞ín: batch insert
await this.prisma.playerAnswer.createMany({
  data: answerRecords,  // 1 round-trip cho 1000 rows
});

// Hoß║╖c vß╗¢i prisma.$executeRawBatch (thß║¡m ch├¡ nhanh h╞ín)
await this.prisma.$executeRaw`
  INSERT INTO player_answers (id, player_session_id, ...)
  VALUES ${Prisma.join(answerRecords.map(r => Prisma.sql`(${r})`))}
```

### 3.5 Tß╗òng hß╗úp Bottleneck

| Bottleneck | Mß╗⌐c ─æß╗Ö | ß║ónh h╞░ß╗ƒng | Giß║úi ph├íp |
|---|---|---|---|
| `activeQuestions` in-memory | **CRITICAL** | Multi-instance: player kh├┤ng submit ─æ╞░ß╗úc | Redis HASH |
| `SocketStateService` in-memory | **CRITICAL** | Multi-instance: kick/leave kh├┤ng hoß║ít ─æß╗Öng | Chß╗ë d├╣ng Redis |
| Fan-out broadcast 10K players | HIGH | Trß╗à broadcast, CPU spike | Redis Pub/Sub + sharding |
| Prisma individual insert | MEDIUM | DB latency ~200-500ms | `createMany` batch |
| No sticky sessions | MEDIUM | Socket state kh├┤ng sync | Redis state (khi ─æ├ú fix) |
| No connection pooling tuning | LOW | Connection exhaustion | PgBouncer |

---

## 4. Load Balancer ΓÇö Socket.io Redis Adapter

### 4.1 C├ích Hoß║ít ─Éß╗Öng

**File:** `backend/src/game/game.gateway.ts` (d├▓ng 31ΓÇô60)

```typescript
async afterInit(server: Server) {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    this.logger.warn('Redis not configured - running without Redis adapter');
    return;
  }

  const redisConfig = this.parseRedisUrl(redisUrl);

  try {
    const Redis = require('ioredis');
    const { createAdapter } = require('socket.io-redis-adapter');

    // 2 Redis clients ΓÇö 1 cho publish, 1 cho subscribe
    const pubClient = new Redis({ host, port, password, tls });
    const subClient = pubClient.duplicate();

    await pubClient.ping();
    this.logger.log('Redis adapter connected');

    // Gß║»n Redis adapter v├áo Socket.io server
    server.adapter(createAdapter(pubClient, subClient));
  } catch (error) {
    this.logger.error('Failed to connect Redis adapter:', error.message);
  }
}
```

### 4.2 S╞í ─æß╗ô Load Balancer

```
                          ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                          Γöé                    Redis                           Γöé
                          Γöé                                                   Γöé
                          Γöé  Pub/Sub channel: "room:{roomId}"               Γöé
                          Γöé  State: room:{pin}, lb:{sessionId}               Γöé
                          ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                          PubClient Γû▓      Γöé     Γû▓ SubClient
                          pub/sub    Γöé      Γöé      Γöé
                          ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ      Γöé      ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
                                           Γöé
                    ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                    Γöé                      Γöé                          Γöé
             ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ        ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ         ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
             Γöé  Instance A Γöé        Γöé  Instance B Γöé         Γöé  Instance C  Γöé
             Γöé  (NestJS)   Γöé        Γöé  (NestJS)   Γöé         Γöé  (NestJS)    Γöé
             Γöé             Γöé        Γöé             Γöé         Γöé              Γöé
             Γöé Players     Γöé        Γöé Players     Γöé         Γöé Players      Γöé
             Γöé 1-333       Γöé        Γöé 334-666     Γöé         Γöé 667-1000     Γöé
             Γöé             Γöé        Γöé             Γöé         Γöé              Γöé
             Γöé activeQ: {} Γöé        Γöé activeQ: {} Γöé         Γöé activeQ: {}  Γöé
             Γöé ΓÜá∩╕Å in-memoryΓöé        Γöé ΓÜá∩╕Å in-memoryΓöé         Γöé ΓÜá∩╕Å in-memory Γöé
             ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ        ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ         ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                   Γöé                      Γöé                        Γöé
                   ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                                          Γöé
                         ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                         Γöé       Load Balancer              Γöé
                         Γöé  (Nginx / Cloud LB / Kubernetes) Γöé
                         Γöé                                 Γöé
                         Γöé  Sticky sessions: Bß║¼T (cookies) Γöé
                         Γöé  hoß║╖c: Tß║«T + d├╣ng Redis state  Γöé
                         ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                                          Γöé
                    ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                    Γöé                     Γöé                     Γöé
              ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ         ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ        ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
              Γöé  Player 1  Γöé         Γöé Player 2  Γöé        Γöé Player 3   Γöé
              Γöé (Chrome)   Γöé         Γöé (Mobile)  Γöé        Γöé (Tab mß╗¢i)  Γöé
              ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ         ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ        ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### 4.3 Socket.io Redis Adapter ΓÇö Chi Tiß║┐t

**Kh├┤ng c├│ Redis Adapter:**
```
Player 1 ΓåÆ Instance A  ΓöÇΓöÇΓåÆ  client.join('room:X')
Player 2 ΓåÆ Instance A  ΓöÇΓöÇΓåÆ  client.join('room:X')
Player 3 ΓåÆ Instance B  ΓöÇΓöÇΓåÆ  client.join('room:X')  ΓåÉ B kh├┤ng biß║┐t A c├│ members
Player 4 ΓåÆ Instance C  ΓöÇΓöÇΓåÆ  client.join('room:X')  ΓåÉ C kh├┤ng biß║┐t A/B c├│ members

Instance A: server.to('room:X').emit('question:end', ...)
ΓåÆ Chß╗ë gß╗¡i ─æß║┐n Player 1, 2 (c├╣ng instance)
ΓåÆ Player 3, 4 KH├öNG NHß║¼N ─É╞»ß╗óC! Γ¥î
```

**C├│ Redis Adapter:**
```
Player 1 ΓåÆ Instance A  ΓöÇΓöÇΓåÆ  client.join('room:X')
  ΓåÆ Adapter gß╗¡i "join room:X" l├¬n Redis Pub/Sub
  ΓåÆ Instance B, C nhß║¡n ─æ╞░ß╗úc notification
  ΓåÆ B, C th├¬m Player 1 v├áo local socket room mapping

Player 2 ΓåÆ Instance B  ΓöÇΓöÇΓåÆ  client.join('room:X')
  ΓåÆ T╞░╞íng tß╗▒, A, C biß║┐t Player 2

Instance A: server.to('room:X').emit('question:end', ...)
  ΓåÆ Adapter gß╗¡i message l├¬n Redis Pub/Sub
  ΓåÆ B, C nhß║¡n ─æ╞░ß╗úc v├á forward ─æß║┐n local clients
  ΓåÆ Player 1, 2, 3, 4 ─Éß╗ÇU NHß║¼N ─É╞»ß╗óC! Γ£à
```

### 4.4 Sticky Sessions ΓÇö C├│ N├¬n D├╣ng?

| Chß║┐ ─æß╗Ö | ╞»u ─æiß╗âm | Nh╞░ß╗úc ─æiß╗âm |
|---|---|---|
| **Sticky Sessions Bß║¼T** | ─É╞ín giß║ún, kh├┤ng cß║ºn sync state | Player lu├┤n ─æß║┐n c├╣ng instance; 1 instance qu├í tß║úi = kh├┤ng c├ón bß║▒ng |
| **Sticky Sessions Tß║«T** | C├ón bß║▒ng tß║úi tß╗æt h╞ín | Cß║ºn shared state (Redis) cho mß╗ìi thß╗⌐ |
| **Hybrid (Khuyß║┐n nghß╗ï)** | Host sticky (lu├┤n c├╣ng instance ─æß╗â control game flow) | Players kh├┤ng sticky, d├╣ng Redis state |

**Khuyß║┐n nghß╗ï cho project n├áy:**
- **Host:** Sticky session (─æß║úm bß║úo host + question control c├╣ng instance)
- **Players:** Kh├┤ng sticky (c├ón bß║▒ng tß║úi), d├╣ng Redis state cho mß╗ìi lookup

---

## 5. Cß║¡p Nhß║¡t Leaderboard Vß╗¢i ─Éß╗Ö Trß╗à Thß║Ñp Nhß║Ñt

### 5.1 Write Path ΓÇö ─Éiß╗âm Sß╗æ ─É╞░ß╗úc Ghi Nh╞░ Thß║┐ N├áo

```
Player submit answer ─æ├║ng
    Γöé
    Γöé  (─æß╗úi ─æß║┐n khi c├óu hß╗Åi kß║┐t th├║c ΓÇö handleQuestionEnd ─æ╞░ß╗úc gß╗ìi)
    Γöé
    Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé AnswerHandler.handleQuestionEnd()                            Γöé
Γöé                                                              Γöé
Γöé  1. Flush buffer: LRANGE + DEL (Redis)                       Γöé
Γöé     ΓööΓöÇ Lß║Ñy tß║Ñt cß║ú buffered answers tß╗½ Redis                 Γöé
Γöé                                                              Γöé
Γöé  2. T├¡nh ─æiß╗âm: scoreEarned = 1000 - floor(responseTime/10)  Γöé
Γöé     Γö£ΓöÇ Trß║ú lß╗¥i trong 500ms ΓåÆ 950 ─æiß╗âm                      Γöé
Γöé     Γö£ΓöÇ Trß║ú lß╗¥i trong 5s    ΓåÆ 500 ─æiß╗âm                      Γöé
Γöé     ΓööΓöÇ Trß║ú lß╗¥i sai          ΓåÆ 0 ─æiß╗âm                        Γöé
Γöé                                                              Γöé
Γöé  3. Batch INSERT PlayerAnswer v├áo PostgreSQL (Prisma)        Γöé
Γöé                                                              Γöé
Γöé  4. ZINCRBY cho tß╗½ng ─æ├íp ├ín ─æ├║ng:                           Γöé
Γöé     ΓööΓöÇ Redis: ZINCRBY lb:{sessionId} {scoreEarned} {playerId}Γöé
Γöé                                                              Γöé
Γöé  5. Broadcast 'question:end' vß╗¢i top 10:                    Γöé
Γöé     ΓööΓöÇ Redis: ZREVRANGE lb:{sessionId} 0 9 WITHSCORES        Γöé
Γöé     ΓööΓöÇ Gß╗¡i ─æß║┐n tß║Ñt cß║ú players qua Socket.io                 Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### 5.2 Read Path ΓÇö Top 10 Leaderboard

```typescript
// backend/src/game/handlers/answer.handler.ts (d├▓ng 192ΓÇô205)
async handleGetLeaderboard(client: Socket, sessionId: string) {
  // Redis ZREVRANGE ΓÇö O(log N + M) vß╗¢i M=10 ΓåÆ gß║ºn nh╞░ O(1)
  const topScores = await this.redis.getTopScores(sessionId, 10);

  // Enrich vß╗¢i nickname tß╗½ DB (cache ─æ╞░ß╗úc)
  const enriched = await this.gameService.enrichLeaderboard(topScores);

  return {
    event: 'leaderboard:update',
    data: { sessionId, leaderboard: enriched, updatedAt: Date.now() },
  };
}
```

**─Éß╗Ö phß╗⌐c tß║íp:** `ZREVRANGE lb:sessionId 0 9 WITHSCORES` ΓåÆ ~0.1ms vß╗¢i 10000 players tr├¬n Redis.

### 5.3 Broadcast Leaderboard Cho 1000ΓÇô10000 Players

**Vß║Ñn ─æß╗ü cß╗æt l├╡i:** Socket.io fan-out gß╗¡i message ri├¬ng cho tß╗½ng client.

```
Traditional approach (HIGH LATENCY):
  for each player in room:
    send WebSocket message
  ΓåÆ 1000 players = 1000 WebSocket writes
  ΓåÆ ~50ms vß╗¢i 1 instance

Redis Pub/Sub approach (LOW LATENCY):
  1. Host instance publish 'leaderboard:{sessionId}' l├¬n Redis
  2. Mß╗ùi instance nhß║¡n qua subClient
  3. Mß╗ùi instance broadcast ─æß║┐n local clients
  ΓåÆ chß╗ë 1 Redis publish, N instances tß╗▒ forward
```

**Cß║úi tiß║┐n ─æß╗ü xuß║Ñt ΓÇö Redis Pub/Sub cho Leaderboard:**

```typescript
// Tß║ío 1 Pub/Sub channel ri├¬ng cho leaderboard updates
async broadcastLeaderboardUpdate(sessionId: string, roomId: string) {
  const topScores = await this.redis.getTopScores(sessionId, 10);
  const enriched = await this.gameService.enrichLeaderboard(topScores);

  // Publish l├¬n Redis channel
  const channel = `lb:update:${sessionId}`;
  await this.redis.getClient().publish(channel, JSON.stringify({
    leaderboard: enriched,
    updatedAt: Date.now(),
  }));

  // C├╣ng instance: gß╗¡i trß╗▒c tiß║┐p
  this.server.to(`room:${roomId}`).emit('leaderboard:update', {
    sessionId, leaderboard: enriched,
  });
}

// Sau ─æ├│ mß╗ùi instance subscribe:
// subClient.subscribe('lb:update:*', (channel, message) => {
//   const sessionId = extractSessionId(channel);
//   this.server.to(`room:${sessionId}`).emit('leaderboard:update', JSON.parse(message));
// });
```

### 5.4 Score Formula ΓÇö Chi Tiß║┐t

```typescript
function calculateScore(isCorrect: boolean, responseTimeMs: number): number {
  if (!isCorrect) return 0;

  const BASE_SCORE = 1000;       // ─Éiß╗âm tß╗æi ─æa
  const PENALTY_PER_10MS = 1;   // Mß╗ùi 10ms trß╗½ 1 ─æiß╗âm
  const MIN_SCORE = 100;        // Tß╗æi thiß╗âu vß║½n ─æ╞░ß╗úc 100 ─æiß╗âm

  const penalty = Math.floor(responseTimeMs / 10);
  return Math.max(MIN_SCORE, BASE_SCORE - penalty);
}

// V├¡ dß╗Ñ:
// Trß║ú lß╗¥i ─æ├║ng trong   500ms  ΓåÆ 1000 - 50  =   950 ─æiß╗âm
// Trß║ú lß╗¥i ─æ├║ng trong  2,000ms  ΓåÆ 1000 - 200 =   800 ─æiß╗âm
// Trß║ú lß╗¥i ─æ├║ng trong  9,000ms  ΓåÆ 1000 - 900 =   100 ─æiß╗âm (floor)
// Trß║ú lß╗¥i sai               ΓåÆ              =     0 ─æiß╗âm
```

---

## 6. Mß╗ƒ Rß╗Öng L├¬n 10000 Players

### 6.1 Kiß║┐n tr├║c Target

```
                        ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                        Γöé              Redis Cluster / Redis Cloud        Γöé
                        Γöé                                                Γöé
                        Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ              Γöé
                        Γöé  Γöé  Shard 1    Γöé  Γöé  Shard 2    Γöé              Γöé
                        Γöé  Γöé lb:session1 Γöé  Γöé lb:session2 Γöé              Γöé
                        Γöé  Γöé buf:*       Γöé  Γöé buf:*       Γöé              Γöé
                        Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ              Γöé
                        Γöé                                                Γöé
                        Γöé  Pub/Sub channels (all instances subscribe)    Γöé
                        ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                                                Γöé
                 ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                 Γöé                              Γöé                              Γöé
          ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ               ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ              ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
          Γöé  Instance 1 Γöé               Γöé  Instance 2  Γöé              Γöé   Instance N    Γöé
          Γöé  (NestJS)    Γöé               Γöé  (NestJS)    Γöé              Γöé   (NestJS)      Γöé
          Γöé              Γöé               Γöé              Γöé              Γöé                  Γöé
          Γöé Players:     Γöé               Γöé Players:      Γöé              Γöé Players:        Γöé
          Γöé 1 - 3000     Γöé               Γöé 3001-6000     Γöé              Γöé 6001-10000      Γöé
          Γöé              Γöé               Γöé              Γöé              Γöé                  Γöé
          Γöé pub/sub      Γöé               Γöé pub/sub       Γöé              Γöé pub/sub         Γöé
          Γöé (shared)     Γöé               Γöé (shared)       Γöé              Γöé (shared)        Γöé
          ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ               ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ              ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                 Γöé                              Γöé                              Γöé
                 ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                                                Γöé
                        ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                        Γöé           Kubernetes / Load Balancer             Γöé
                        Γöé                                                Γöé
                        Γöé  - L7 HTTP/WS Load Balancer                     Γöé
                        Γöé  - Health checks (liveness/readiness probes)    Γöé
                        Γöé  - Horizontal Pod Autoscaler (HPA)             Γöé
                        Γöé  - Sticky sessions cho host (session affinity) Γöé
                        ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                                                Γöé
                        ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                        Γöé                        Γöé                        Γöé
                 ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ          ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ         ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
                 Γöé  Player 1   Γöé          Γöé Player 2    Γöé         Γöé Player 10K  Γöé
                 ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ          ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ         ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### 6.2 Horizontal Pod Autoscaler (HPA) ΓÇö Tß╗▒ ─Éß╗Öng Scale

```yaml
# kubernetes/hpa-game.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: game-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: game-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70  # Scale up khi CPU > 70%
    - type: Pods
      pods:
        metric:
          name: websocket_connections_per_pod
        target:
          type: AverageValue
          averageValue: "1000"  # Scale khi > 1000 connections/pod
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30  # ─Éß╗úi 30s tr╞░ß╗¢c khi scale up th├¬m
      policies:
        - type: Percent
          value: 100  # T─âng tß╗æi ─æa gß║Ñp ─æ├┤i mß╗ùi lß║ºn
          periodSeconds: 30
    scaleDown:
      stabilizationWindowSeconds: 300  # ─Éß╗úi 5 ph├║t tr╞░ß╗¢c khi scale down
```

### 6.3 Deployment Config ΓÇö Kubernetes

```yaml
# kubernetes/deployment-game.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: game-server
spec:
  replicas: 5
  selector:
    matchLabels:
      app: game-server
  template:
    spec:
      containers:
        - name: game-server
          image: quiz-game:latest
          ports:
            - containerPort: 3000
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-credentials
                  key: url
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "2000m"  # 2 cores cho xß╗¡ l├╜ WS
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            tcpSocket:
              port: 3000
            initialDelaySeconds: 30
```

### 6.4 C├íc Con Sß╗æ ╞»ß╗¢c T├¡nh

| Metric | 100 players | 1000 players | 10000 players |
|---|---|---|---|
| **Answer buffer size** | ~50 answers (1 question) | ~500 | ~5000 |
| **Redis throughput** | 50 LPUSH/s | 500/s | 5000/s |
| **Redis memory/game** | ~50 KB | ~500 KB | ~5 MB |
| **DB batch insert** | 50 rows ├ù 1 query | 500 rows ├ù 1 query | 5000 rows ├ù 1 query |
| **DB latency (batch)** | ~10ms | ~30ms | ~100ms |
| **Fan-out broadcast** | ~5ms | ~50ms | ~500ms (needs optimization) |
| **Socket.io connections/pod** | 20 | 200 | 2000 |
| **Sß╗æ pods cß║ºn thiß║┐t** | 1 | 1-2 | 5-10 |

---

## 7. Roadmap Cß║úi Tiß║┐n

### Phase 1 ΓÇö Fix Critical Bottlenecks (Tuß║ºn 1-2)

```
Γûí 1.1 Thay thß║┐ SocketStateService bß║▒ng Redis
      Γö£ΓöÇ Loß║íi bß╗Å ho├án to├án in-memory Maps
      Γö£ΓöÇ Chß╗ë d├╣ng RedisService.getPlayerBySocket() trong mß╗ìi handler
      ΓööΓöÇ Test: 2 instances, verify kick/leave hoß║ít ─æß╗Öng cross-instance

Γûí 1.2 Di chuyß╗ân activeQuestions v├áo Redis
      Γö£ΓöÇ Th├¬m game:active:{roomId} HASH trong RedisService
      Γö£ΓöÇ Loß║íi bß╗Å GameService.activeQuestions Map
      ΓööΓöÇ Test: Player submit tß╗½ instance kh├íc instance host

Γûí 1.3 Thß╗æng nhß║Ñt handlers ΓÇö d├╣ng RoomHandler cho tß║Ñt cß║ú
      Γö£ΓöÇ Loß║íi bß╗Å duplicate code trong HostHandler, PlayerHandler
      ΓööΓöÇ Chß╗ë giß╗» RoomHandler duy nhß║Ñt

Γûí 1.4 Prisma batch insert thay v├¼ loop
      ΓööΓöÇ $executeRaw batch cho PlayerAnswer
```

### Phase 2 ΓÇö Tß╗æi ╞»u Leaderboard & Broadcast (Tuß║ºn 3-4)

```
Γûí 2.1 Redis Pub/Sub cho leaderboard updates
      Γö£ΓöÇ Mß╗ùi instance subscribe 'lb:update:*'
      ΓööΓöÇ Giß║úm fan-out latency tß╗½ O(N) xuß╗æng O(instances)

Γûí 2.2 Stale leaderboard cho real-time feel
      Γö£ΓöÇ Broadcast top 10 mß╗ùi 2-5s thay v├¼ chß╗¥ flush
      ΓööΓöÇ D├╣ng Redis ZREVRANGE (rß║╗) cho top 10 th╞░ß╗¥ng xuy├¬n

Γûí 2.3 CDN/WebSocket edge cho fan-out
      Γö£ΓöÇ Socket.io v4: hybrid adapter (Redis + local)
      ΓööΓöÇ Cloudflare Durable Objects cho ultra-low latency
```

### Phase 3 ΓÇö Observability & Testing (Tuß║ºn 5-6)

```
Γûí 3.1 Prometheus metrics
      Γö£ΓöÇ redis_buffer_size (gauge)
      Γö£ΓöÇ answer_throughput (counter)
      Γö£ΓöÇ fan_out_duration_ms (histogram)
      ΓööΓöÇ leaderboard_read_latency_ms (histogram)

Γûí 3.2 Load test vß╗¢i 10000 mock connections
      Γö£ΓöÇ Socket.io-client stress test
      ΓööΓöÇ Artillery.io / k6

Γûí 3.3 PgBouncer setup
      Γö£ΓöÇ pool_mode = transaction
      Γö£ΓöÇ max_client_conn = 1000
      ΓööΓöÇ default_pool_size = 20
```

### Phase 4 ΓÇö Production Hardening (Tuß║ºn 7-8)

```
Γûí 4.1 Kubernetes deployment
      Γö£ΓöÇ HPA vß╗¢i custom metrics
      Γö£ΓöÇ PodDisruptionBudget (0 disruption)
      ΓööΓöÇ Rolling update strategy

Γûí 4.2 Redis Cluster (nß║┐u > 5000 connections ─æß╗ông thß╗¥i)
      ΓööΓöÇ Shard theo sessionId

Γûí 4.3 Redis Sentinel hoß║╖c Redis Cloud
      ΓööΓöÇ Automatic failover
```

---

## Phß╗Ñ lß╗Ñc: File Tham Chiß║┐u

| File | Nß╗Öi dung |
|---|---|
| `backend/src/game/handlers/answer.handler.ts` | Xß╗¡ l├╜ submit answer, rate limit, buffer, dedup |
| `backend/src/game/game.service.ts` | GameService: activeQuestions Map, flush buffer, score calculation |
| `backend/src/redis/redis.service.ts` | Tß║Ñt cß║ú Redis operations: buffer, leaderboard, rate limit, room state |
| `backend/src/game/game.gateway.ts` | afterInit() ΓÇö Socket.io Redis Adapter setup |
| `backend/src/game/services/socket-state.service.ts` | ΓÜá∩╕Å In-memory state ΓÇö cß║ºn loß║íi bß╗Å |
| `backend/src/game/handlers/host.handler.ts` | Host flow d├╣ng SocketStateService (inconsistent) |
| `backend/src/game/handlers/player.handler.ts` | Player flow d├╣ng SocketStateService (inconsistent) |
| `backend/src/game/handlers/room.handler.ts` | Room flow d├╣ng RedisService (consistent) ΓÇö N├èN giß╗» |
| `docs/high-scale-architecture.md` | T├ái liß╗çu thiß║┐t kß║┐ high-scale gß╗æc |
| `docs/state-management-analysis.md` | So s├ính In-Memory vs Redis |
