# Luß╗ông Tham Gia Ph├▓ng Quiz ΓÇö Chi Tiß║┐t Redis & Database

> T├ái liß╗çu m├┤ tß║ú to├án bß╗Ö luß╗ông tß╗½ l├║c user mß╗ƒ trang ph├▓ng (`/room/{pin}`), nhß║¡p nickname, ─æß║┐n khi tham gia th├ánh c├┤ng v├áo ph├▓ng chß╗¥. Giß║úi th├¡ch r├╡ vai tr├▓ cß╗ºa Redis (hot state) v├á PostgreSQL (cold/persistent state) tß║íi tß╗½ng b╞░ß╗¢c.

---

## Mß╗Ñc lß╗Ñc

1. [Tß╗òng quan kiß║┐n tr├║c](#1-tß╗òng-quan-kiß║┐n-tr├║c)
2. [Luß╗ông Host tham gia ph├▓ng](#2-luß╗ông-host-tham-gia-ph├▓ng)
3. [Luß╗ông Player tham gia ph├▓ng](#3-luß╗ông-player-tham-gia-ph├▓ng)
4. [Chi tiß║┐t Redis keys & Database schema](#4-chi-tiß║┐t-redis-keys--database-schema)
5. [M├ú lß╗ùi & Xß╗¡ l├╜ exception](#5-m├ú-lß╗ùi--xß╗¡-l├╜-exception)
6. [S╞í ─æß╗ô tß╗òng hß╗úp](#6-s╞í-─æß╗ô-tß╗òng-hß╗úp)

---

## 1. Tß╗òng quan kiß║┐n tr├║c

```
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                    FRONTEND (Next.js)                         Γöé
Γöé                                                               Γöé
Γöé  /room/[pin]/page.tsx                                         Γöé
Γöé    Γö£ΓöÇ Token check ΓåÆ x├íc ─æß╗ïnh host hay player                 Γöé
Γöé    Γö£ΓöÇ NicknameEntry modal (player ch╞░a ─æ─âng nhß║¡p)            Γöé
Γöé    ΓööΓöÇ WaitingRoom (sau khi join th├ánh c├┤ng)                  Γöé
Γöé                                                               Γöé
Γöé  Zustand Store (gameStore.ts)                                 Γöé
Γöé    Γö£ΓöÇ room, players, currentPlayer                             Γöé
Γöé    ΓööΓöÇ isHost, isConnected                                     Γöé
Γöé                                                               Γöé
Γöé  Socket singleton (lib/socket.ts) ΓåÆ ws://localhost:3000/game   Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                            Γöé WebSocket (Socket.io)
                            Γöé REST API (Axios)
                            Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                    BACKEND (NestJS)                            Γöé
Γöé                                                               Γöé
Γöé  GameGateway (game.gateway.ts)                                 Γöé
Γöé    @SubscribeMessage('room:host_join')   ΓåÆ host                Γöé
Γöé    @SubscribeMessage('room:player_join') ΓåÆ player              Γöé
Γöé    @SubscribeMessage('game:start')       ΓåÆ host                Γöé
Γöé                                                               Γöé
Γöé  RoomHandler (handlers/room.handler.ts)                        Γöé
Γöé    Γö£ΓöÇ handleHostJoin()                                         Γöé
Γöé    Γö£ΓöÇ handlePlayerJoin()                                      Γöé
Γöé    Γö£ΓöÇ handleKickPlayer()                                      Γöé
Γöé    Γö£ΓöÇ handlePlayerLeave()                                     Γöé
Γöé    Γö£ΓöÇ handleCloseRoom()                                       Γöé
Γöé    ΓööΓöÇ handleDisconnect()                                       Γöé
Γöé                                                               Γöé
Γöé  GameService (game.service.ts)  ΓöÇΓöÇΓû║ PrismaService              Γöé
Γöé    Γö£ΓöÇ verifyAndGetHostRoom()  ΓöÇΓöÇΓû║ DB query Room               Γöé
Γöé    Γö£ΓöÇ joinRoom()             ΓöÇΓöÇΓû║ DB create Player            Γöé
Γöé    Γö£ΓöÇ leaveRoom()            ΓöÇΓöÇΓû║ DB delete Player             Γöé
Γöé    ΓööΓöÇ startGame()            ΓöÇΓöÇΓû║ DB update Room + create SessionΓöé
Γöé                                                               Γöé
Γöé  RedisService (redis.service.ts)                               Γöé
Γöé    Γö£ΓöÇ createRoom()          ΓöÇΓöÇΓû║ HSET room:{pin}               Γöé
Γöé    Γö£ΓöÇ addPlayerToRoom()     ΓöÇΓöÇΓû║ HSET room:{pin}:players        Γöé
Γöé    Γö£ΓöÇ getPlayersInRoom()    ΓöÇΓöÇΓû║ HGETALL room:{pin}:players     Γöé
Γöé    ΓööΓöÇ getPlayerBySocket()   ΓöÇΓöÇΓû║ GET socket:{socketId}         Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
               Γöé                          Γöé
               Γû╝                          Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé     Redis Cloud           Γöé  Γöé     PostgreSQL                  Γöé
Γöé  (Hot / Real-time State)  Γöé  Γöé  (Persistent / Source of Truth) Γöé
Γöé                           Γöé  Γöé                                Γöé
Γöé  room:{pin}               Γöé  Γöé  Room { id, pin, quizId,       Γöé
Γöé  room:{pin}:players       Γöé  Γöé          hostId, status }      Γöé
Γöé  socket:{socketId}        Γöé  Γöé                                Γöé
Γöé  (rate limit, buffer,     Γöé  Γöé  Player { id, roomId, nickname,Γöé
Γöé   leaderboard, session)    Γöé  Γöé           joinedAt }           Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### Vai tr├▓ ph├ón t├ích Redis vs Database

| Kh├¡a cß║ính | Redis | PostgreSQL |
|---|---|---|
| **Mß╗Ñc ─æ├¡ch** | Hot state ΓÇö th├┤ng tin ph├▓ng ─æang hoß║ít ─æß╗Öng | Cold/persistent ΓÇö dß╗» liß╗çu tß╗ôn tß║íi sau game |
| **Tß╗æc ─æß╗Ö** | O(1) cho read/write, ~1-5ms latency | ~10-50ms cho query |
| **Thß╗¥i gian sß╗æng** | TTL tß╗▒ ─æß╗Öng hoß║╖c khi ─æ├│ng ph├▓ng | V─⌐nh viß╗àn |
| **Truy cß║¡p** | Mß╗ìi NestJS instance c├╣ng thß║Ñy (cross-node) | Mß╗ùi instance truy vß║Ñn qua Prisma |
| **D├╣ng cho** | Biß║┐t ai ─æang ß╗ƒ ph├▓ng n├áo (socketΓåÆpin mapping) | L╞░u Player record, Room metadata |

---

## 2. Luß╗ông Host tham gia ph├▓ng

### 2.1 S╞í ─æß╗ô tuß║ºn tß╗▒

```
Browser (─æ├ú ─æ─âng nhß║¡p, l├á host)
    Γöé
    Γöé  GET /room/{pin}
    Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé /room/[pin]/page.tsx                                         Γöé
Γöé                                                              Γöé
Γöé  1. ─Éß╗ìc JWT token tß╗½ authStore                              Γöé
Γöé  2. Gß╗ìi roomService.getRoomByPin(pin)  [REST API ΓåÆ backend] Γöé
Γöé  3. Decode token ΓåÆ lß║Ñy userId                               Γöé
Γöé  4. So s├ính room.hostId === userId                          Γöé
Γöé     Γö£ΓöÇ ─É├║ng ΓåÆ setIsHost(true), setShowNicknameEntry(false)  Γöé
Γöé     ΓööΓöÇ Sai  ΓåÆ setIsHost(false), setShowNicknameEntry(true)  Γöé
Γöé                                                              Γöé
Γöé  5. useEffect ΓåÆ getSocket().connect()                       Γöé
Γöé  6. Socket emit 'room:host_join' { roomId }                 Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                            Γöé WebSocket
                            Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé GameGateway.handleHostJoin(client, { roomId }, server)        Γöé
Γöé                                                              Γöé
Γöé  return roomHandler.handleHostJoin(client, { roomId }, server)Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                            Γöé
                            Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé RoomHandler.handleHostJoin()                                  Γöé
Γöé                                                              Γöé
Γöé  Γæá GameService.verifyAndGetHostRoom(roomId)                  Γöé
Γöé     Γöé                                                        Γöé
Γöé     Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé     ΓööΓöÇΓöÇΓû║  Prisma: Room.findUnique({ where: { id: roomId }  Γöé  Γöé
Γöé            Γöé  include: { quiz, questions, players, host }  Γöé  Γöé
Γöé            Γöé  })                                            Γöé  Γöé
Γöé            ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé                                                              Γöé
Γöé     ΓùäΓöÇΓöÇ Trß║ú vß╗ü room object hoß║╖c error                       Γöé
Γöé                                                              Γöé
Γöé  Γæí RedisService.createRoom(pin, hostSocketId)               Γöé
Γöé     Γöé                                                        Γöé
Γöé     Γöé  HSET room:{pin} {                                     Γöé
Γöé     Γöé    hostSocketId: client.id,                            Γöé
Γöé     Γöé    status: 'waiting',                                  Γöé
Γöé     Γöé    createdAt: Date.now()                               Γöé
Γöé     Γöé  }                                                     Γöé
Γöé     Γöé                                                        Γöé
Γöé     Γöé  Key: room:{pin}  ΓåÆ  Type: HASH                       Γöé
Γöé     Γöé  TTL: none (x├│a khi ─æ├│ng ph├▓ng)                       Γöé
Γöé     Γöé                                                        Γöé
Γöé     ΓööΓöÇΓöÇΓû║ await redis.client.hset(...)                        Γöé
Γöé                                                              Γöé
Γöé  Γæó client.join('room:{room.id}')  [Socket.io channel]       Γöé
Γöé     ΓùäΓöÇΓöÇ Host join v├áo room channel ─æß╗â nhß║¡n broadcast        Γöé
Γöé                                                              Γöé
Γöé  Γæú RedisService.getPlayersInRoom(pin)                       Γöé
Γöé     Γöé                                                        Γöé
Γöé     Γöé  HGETALL room:{pin}:players                            Γöé
Γöé     Γöé  ΓåÆ Trß║ú vß╗ü players ─æang c├│ trong Redis (c├│ thß╗â c├│     Γöé
Γöé     Γöé    tß╗½ session tr╞░ß╗¢c nß║┐u host reconnect)               Γöé
Γöé     Γöé                                                        Γöé
Γöé     ΓööΓöÇΓöÇΓû║ Trß║ú vß╗ü [] nß║┐u ph├▓ng mß╗¢i                            Γöé
Γöé                                                              Γöé
Γöé  Γæñ Trß║ú vß╗ü response:                                          Γöé
Γöé     { event: 'room:joined', data: {                          Γöé
Γöé         success: true,                                        Γöé
Γöé         room: <Prisma room object>,                          Γöé
Γöé         players: [...],                                       Γöé
Γöé         isHost: true                                         Γöé
Γöé       }}                                                      Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                            Γöé
                            Γöé WebSocket emit vß╗ü client
                            Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé Frontend: socket.on('room:joined', handleRoomJoined)          Γöé
Γöé                                                              Γöé
Γöé  1. gameStore.setRoom(data.room)                             Γöé
Γöé  2. gameStore.setPlayers(unique players)                     Γöé
Γöé  3. gameStore.setCurrentPlayer(host player)                  Γöé
Γöé  4. setShowNicknameEntry(false)                             Γöé
Γöé  5. Render <WaitingRoom /> vß╗¢i isHost=true                  Γöé
Γöé                                                              Γöé
Γöé  [─Éß╗ông thß╗¥i: frontend render WaitingRoom vß╗¢i danh s├ích      Γöé
Γöé   players tß╗½ Redis, cho ph├⌐p host kick/close]               Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### 2.2 M├ú nguß╗ôn t╞░╞íng ß╗⌐ng

**Frontend** ΓÇö `frontend/app/room/[pin]/page.tsx` (d├▓ng 30ΓÇô72):

```typescript
// 1. Kiß╗âm tra host bß║▒ng JWT
const role = await checkUserRole(); // gß╗ìi roomService.getRoomByPin(pin)
if (roomData.hostId === userId) {
  setIsHost(true);  // ΓåÆ show WaitingRoom, kh├┤ng cß║ºn NicknameEntry
}

// 2. Kß║┐t nß╗æi socket v├á emit
const socket = getSocket();
socket.on('connect', () => {
  socket.emit('room:host_join', { roomId: room.id });
});
```

**Backend** ΓÇö `backend/src/game/handlers/room.handler.ts` (d├▓ng 20ΓÇô53):

```typescript
async handleHostJoin(client: Socket, payload: { roomId: string }, server: Server) {
  // Γæá X├íc thß╗▒c room tß╗½ DB
  const result = await this.gameService.verifyAndGetHostRoom(payload.roomId);
  if (!result.success) throw new WsException(...);

  // Γæí Tß║ío room state trong Redis
  await this.redisService.createRoom(room.pin, client.id);

  // Γæó Join socket.io room channel
  client.join(`room:${room.id}`);

  // Γæú Lß║Ñy players tß╗½ Redis
  const redisPlayers = await this.redisService.getPlayersInRoom(room.pin);

  return { event: 'room:joined', data: { room, players: redisPlayers, isHost: true } };
}
```

### 2.3 Redis operations cho Host

| Thao t├íc | Redis command | Key | Gi├í trß╗ï |
|---|---|---|---|
| Tß║ío ph├▓ng | `HSET` | `room:{pin}` | `{hostSocketId, status, createdAt}` |
| Kiß╗âm tra host | `HGET` | `room:{pin}` ΓåÆ `hostSocketId` | so s├ính vß╗¢i `client.id` |
| Lß║Ñy danh s├ích players | `HGETALL` | `room:{pin}:players` | `{socketId: JSON{playerId, nickname}}` |
| X├│a ph├▓ng | `DEL` | `room:{pin}` + `room:{pin}:players` | ΓÇö |

---

## 3. Luß╗ông Player tham gia ph├▓ng

### 3.1 S╞í ─æß╗ô tuß║ºn tß╗▒

```
Browser (ch╞░a ─æ─âng nhß║¡p hoß║╖c kh├┤ng phß║úi host)
    Γöé
    Γöé  GET /room/{pin}
    Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé /room/[pin]/page.tsx                                         Γöé
Γöé                                                              Γöé
Γöé  1. checkUserRole() ΓåÆ token kh├┤ng khß╗¢p hostId               Γöé
Γöé  2. setShowNicknameEntry(true)                               Γöé
Γöé  3. Render NicknameEntry modal (overlay)                     Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                            Γöé User nhß║¡p nickname ΓåÆ click "Join Room"
                            Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé NicknameEntry.tsx ΓåÆ handleSubmit                              Γöé
Γöé                                                              Γöé
Γöé  1. Validate: 2-20 k├╜ tß╗▒                                     Γöé
Γöé  2. Gß╗ìi onSubmit(trimmedNickname)                           Γöé
Γöé  3. page.tsx: handleJoinAsPlayer(nickname)                   Γöé
Γöé     ΓööΓöÇ setPendingNickname(nickname)                          Γöé
Γöé                                                              Γöé
Γöé  [─Éiß╗üu kiß╗çn trong useEffect thß╗Åa m├ún: isLoading=false       Γöé
Γöé   && pendingNickname !== null ΓåÆ tiß║┐p tß╗Ñc]                    Γöé
Γöé                                                              Γöé
Γöé  4. getSocket().connect() (nß║┐u ch╞░a connected)              Γöé
Γöé  5. socket.emit('room:player_join', { pin, nickname })      Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                            Γöé WebSocket
                            Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé GameGateway.handlePlayerJoin(client, { pin, nickname }, srv) Γöé
Γöé                                                              Γöé
Γöé  return roomHandler.handlePlayerJoin(client, { pin, nickname }, server)
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                            Γöé
                            Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé RoomHandler.handlePlayerJoin()                                Γöé
Γöé                                                              Γöé
Γöé  Γæá Validate nickname (2-20 chars)                             Γöé
Γöé     ΓööΓöÇ WsException('INVALID_NICKNAME') nß║┐u sai               Γöé
Γöé                                                              Γöé
Γöé  Γæí GameService.joinRoom(pin, nickname)                        Γöé
Γöé     Γöé                                                        Γöé
Γöé     Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé     Γöé  Γöé B╞░ß╗¢c 2a: Prisma Room.findUnique({ where: { pin }Γöé  Γöé
Γöé     Γöé  Γöé   include: { players }                           Γöé  Γöé
Γöé     Γöé  Γöé   })                                              Γöé  Γöé
Γöé     Γöé  Γöé                                                    Γöé  Γöé
Γöé     Γöé  Γöé   Kiß╗âm tra:                                       Γöé  Γöé
Γöé     Γöé  Γöé   Γö£ΓöÇ room tß╗ôn tß║íi?                                Γöé  Γöé
Γöé     Γöé  Γöé   Γö£ΓöÇ room.status === 'WAITING'?                   Γöé  Γöé
Γöé     Γöé  Γöé   Γö£ΓöÇ nickname ─æ├ú tß╗ôn tß║íi (case-insensitive)?     Γöé  Γöé
Γöé     Γöé  Γöé   ΓööΓöÇ sß╗æ l╞░ß╗úng players < 50?                      Γöé  Γöé
Γöé     Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé     Γöé                                                        Γöé
Γöé     Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé     Γöé  Γöé B╞░ß╗¢c 2b: Prisma Player.create({                  Γöé  Γöé
Γöé     Γöé  Γöé   data: { roomId: room.id, nickname }             Γöé  Γöé
Γöé     Γöé  Γöé   })                                              Γöé  Γöé
Γöé     Γöé  Γöé                                                    Γöé  Γöé
Γöé     Γöé  Γöé   ΓåÆ INSERT v├áo bß║úng players                       Γöé  Γöé
Γöé     Γöé  Γöé   ΓåÆ Trß║ú vß╗ü player object { id, roomId, nickname }Γöé  Γöé
Γöé     Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé     Γöé                                                        Γöé
Γöé     Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé     Γöé  Γöé B╞░ß╗¢c 2c: Prisma Room.findUnique({                Γöé  Γöé
Γöé     Γöé  Γöé   where: { id: room.id }                         Γöé  Γöé
Γöé     Γöé  Γöé   include: { quiz, questions, players, host }     Γöé  Γöé
Γöé     Γöé  Γöé   })                                              Γöé  Γöé
Γöé     Γöé  Γöé                                                    Γöé  Γöé
Γöé     Γöé  Γöé   ΓåÆ Lß║Ñy room mß╗¢i nhß║Ñt k├¿m players ─æß╗â gß╗¡i vß╗ü     Γöé  Γöé
Γöé     Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé     Γöé                                                        Γöé
Γöé     ΓööΓöÇΓöÇΓû║ Trß║ú vß╗ü { success: true, player, room }              Γöé
Γöé                                                              Γöé
Γöé  Γæó RedisService.addPlayerToRoom(pin, socketId, playerData)   Γöé
Γöé     Γöé                                                        Γöé
Γöé     Γöé  Pipeline (2 lß╗çnh atomic):                            Γöé
Γöé     Γöé  HSET room:{pin}:players {socketId: JSON{playerId, nickname}}
Γöé     Γöé  SET socket:{socketId} {pin}                           Γöé
Γöé     Γöé                                                        Γöé
Γöé     Γöé  ΓåÆ Mapping socketId ΓåÆ pin ─æß╗â handleDisconnect()       Γöé
Γöé     Γöé  ΓåÆ Mapping pin ΓåÆ {socketId, playerInfo} ─æß╗â broadcast   Γöé
Γöé     Γöé                                                        Γöé
Γöé     ΓööΓöÇΓöÇΓû║ await redis.pipeline().hset(...).set(...).exec()   Γöé
Γöé                                                              Γöé
Γöé  Γæú client.join('room:{room.id}')  [Socket.io channel]       Γöé
Γöé     ΓùäΓöÇΓöÇ Player join v├áo room channel ─æß╗â nhß║¡n broadcast        Γöé
Γöé                                                              Γöé
Γöé  Γæñ Gß╗¡i confirm vß╗ü cho player mß╗¢i:                            Γöé
Γöé     client.emit('room:joined', {                               Γöé
Γöé       success: true,                                          Γöé
Γöé       room, player,                                          Γöé
Γöé       isHost: false                                          Γöé
Γöé     })                                                        Γöé
Γöé                                                              Γöé
Γöé  ΓæÑ Broadcast cho c├íc player kh├íc trong ph├▓ng:               Γöé
Γöé     client.to('room:{room.id}').emit('room:updated', {        Γöé
Γöé       action: 'player_joined',                                Γöé
Γöé       player                                                 Γöé
Γöé     })                                                        Γöé
Γöé                                                              Γöé
Γöé  Γæª Trß║ú vß╗ü ACK:                                               Γöé
Γöé     { event: 'room:join_success', data: { success: true } }  Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                            Γöé
                            Γöé WebSocket events
                            Γû╝
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé Frontend: socket listeners                                   Γöé
Γöé                                                              Γöé
Γöé  1. 'room:joined' ΓåÆ handleRoomJoined:                         Γöé
Γöé     Γö£ΓöÇ gameStore.setRoom(data.room)                           Γöé
Γöé     Γö£ΓöÇ gameStore.setCurrentPlayer(data.player)               Γöé
Γöé     Γö£ΓöÇ gameStore.setPlayers(unique players)                   Γöé
Γöé     Γö£ΓöÇ setShowNicknameEntry(false)                            Γöé
Γöé     ΓööΓöÇ Render <WaitingRoom /> vß╗¢i isHost=false               Γöé
Γöé                                                              Γöé
Γöé  2. 'room:updated' ΓåÆ handleRoomUpdated:                       Γöé
Γöé     Γö£ΓöÇ action === 'player_joined'                             Γöé
Γöé     Γöé   ΓööΓöÇ gameStore.addPlayer(data.player)                  Γöé
Γöé     Γöé   ΓööΓöÇ toast.info(`${nickname} joined`)                  Γöé
Γöé     ΓööΓöÇ action === 'player_left'                               Γöé
Γöé         ΓööΓöÇ gameStore.removePlayer(playerId)                  Γöé
Γöé                                                              Γöé
Γöé  [Kß║┐t quß║ú: Tß║Ñt cß║ú players trong ph├▓ng nh├¼n thß║Ñy player mß╗¢i] Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### 3.2 M├ú nguß╗ôn t╞░╞íng ß╗⌐ng

**Frontend** ΓÇö `frontend/components/game/NicknameEntry.tsx` (d├▓ng 14ΓÇô30):

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 20) return; // validate
  onSubmit(trimmed); // ΓåÆ setPendingNickname ΓåÆ socket.emit('room:player_join')
};
```

**Backend** ΓÇö `backend/src/game/handlers/room.handler.ts` (d├▓ng 182ΓÇô219):

```typescript
async handlePlayerJoin(client: Socket, payload: { pin: string; nickname: string }, server: Server) {
  // Γæá Validate nickname
  if (!nickname || nickname.length < 2 || nickname.length > 20)
    throw new WsException({ code: 'INVALID_NICKNAME', message: '...' });

  // Γæí Tß║ío Player trong DB
  const result = await this.gameService.joinRoom(payload.pin, nickname);
  if (!result.success) throw new WsException({ ... });

  const { player, room } = result;

  // Γæó Th├¬m v├áo Redis state
  await this.redisService.addPlayerToRoom(room!.pin, client.id, {
    playerId: player!.id,
    nickname: player!.nickname,
  });

  // Γæú Join socket channel
  client.join(`room:${room!.id}`);

  // Γæñ Confirm vß╗ü player mß╗¢i
  client.emit('room:joined', { success: true, room, player, isHost: false });

  // ΓæÑ Broadcast cho players kh├íc
  client.to(`room:${room!.id}`).emit('room:updated', { action: 'player_joined', player });

  return { event: 'room:join_success', data: { success: true } };
}
```

**Backend** ΓÇö `backend/src/game/game.service.ts` (d├▓ng 95ΓÇô192) ΓÇö `joinRoom()`:

```typescript
async joinRoom(pin: string, nickname: string) {
  // B╞░ß╗¢c 2a: T├¼m ph├▓ng
  const room = await this.prisma.room.findUnique({
    where: { pin },
    include: { players: true },
  });
  // Kiß╗âm tra: room tß╗ôn tß║íi, WAITING, nickname unique, ch╞░a full

  // B╞░ß╗¢c 2b: Tß║ío player
  const player = await this.prisma.player.create({
    data: { roomId: room.id, nickname },
  });

  // B╞░ß╗¢c 2c: Lß║Ñy room mß╗¢i nhß║Ñt k├¿m data ─æß╗â gß╗¡i vß╗ü client
  const updatedRoom = await this.prisma.room.findUnique({
    where: { id: room.id },
    include: { quiz, questions, players, host },
  });

  return { success: true, player, room: updatedRoom };
}
```

### 3.3 Redis operations cho Player

| Thao t├íc | Redis command | Key | Gi├í trß╗ï |
|---|---|---|---|
| Th├¬m player | `HSET` | `room:{pin}:players` | `{socketId: JSON{playerId, nickname}}` |
| Map socketΓåÆpin | `SET` | `socket:{socketId}` | `{pin}` |
| Lß║Ñy room cß╗ºa socket | `GET` | `socket:{socketId}` | `{pin}` |
| Lß║Ñy player info | `HGET` | `room:{pin}:players` | JSON{playerId, nickname} |
| Lß║Ñy tß║Ñt cß║ú players | `HGETALL` | `room:{pin}:players` | Map<socketId, playerInfo> |
| X├│a player | `HDEL` + `DEL` | `room:{pin}:players` + `socket:{socketId}` | ΓÇö |

---

## 4. Chi tiß║┐t Redis Keys & Database Schema

### 4.1 Redis Keys cho Room Management

```
room:{pin}
Γö£ΓöÇΓöÇ hostSocketId   ΓåÆ "socket_id_cua_host"
Γö£ΓöÇΓöÇ status         ΓåÆ "waiting" | "playing"
ΓööΓöÇΓöÇ createdAt      ΓåÆ "1746691200000"

room:{pin}:players
Γö£ΓöÇΓöÇ "socket_id_player_1" ΓåÆ '{"playerId":"uuid-1","nickname":"Alice"}'
Γö£ΓöÇΓöÇ "socket_id_player_2" ΓåÆ '{"playerId":"uuid-2","nickname":"Bob"}'
ΓööΓöÇΓöÇ ...

socket:{socketId}  ΓåÆ "123456"   (PIN cß╗ºa ph├▓ng m├á socket ─æang ß╗ƒ)
```

### 4.2 Database Schema ΓÇö Bß║úng li├¬n quan

```prisma
// ΓöÇΓöÇΓöÇ ROOM: Ph├▓ng ch╞íi (tß╗ôn tß║íi v─⌐nh viß╗àn sau khi tß║ío) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
model Room {
  id        String     @id @default(uuid())
  pin       String     @unique   // M├ú PIN 6 sß╗æ, duy nhß║Ñt
  quizId    String     @map("quiz_id")
  hostId    String     @map("host_id")
  status    RoomStatus @default(WAITING)
  createdAt DateTime   @default(now())

  quiz     Quiz      @relation(fields: [quizId], references: [id])
  host     User      @relation("UserRooms", fields: [hostId], references: [id])
  players  Player[]  // Quan hß╗ç 1-N: 1 ph├▓ng c├│ nhiß╗üu players
  sessions GameSession[]

  @@index([quizId])
  @@index([hostId])
}

// ΓöÇΓöÇΓöÇ PLAYER: Ng╞░ß╗¥i ch╞íi (tß║ío khi join, x├│a khi leave/kick) ΓöÇΓöÇΓöÇ
model Player {
  id       String   @id @default(uuid())
  roomId   String   @map("room_id")
  nickname String
  joinedAt DateTime @default(now())

  room     Room     @relation(fields: [roomId], references: [id])
  sessions PlayerSession[]

  @@unique([roomId, nickname]) // Nickname kh├┤ng tr├╣ng trong 1 ph├▓ng
  @@index([roomId])
}

// ΓöÇΓöÇΓöÇ ROOMSTATUS enum ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
enum RoomStatus {
  WAITING   // Chß╗¥ ng╞░ß╗¥i ch╞íi ΓÇö chß╗ë giai ─æoß║ín n├áy mß╗¢i cho join
  PLAYING   // ─Éang ch╞íi ΓÇö kh├┤ng cho join mß╗¢i
  FINISHED  // Kß║┐t th├║c
}
```

### 4.3 So s├ính dß╗» liß╗çu Redis vs Database

| Dß╗» liß╗çu | Redis | Database | L├╜ do |
|---|---|---|---|
| `room:{pin}` metadata | Γ£à (hostSocketId, status, createdAt) | Γ£à (Room table) | Redis cho lookup nhanh, DB l├á persistent |
| `room:{pin}:players` | Γ£à (key= socketId) | Γ£à (Player table) | Redis cho broadcast real-time, DB cho persistence |
| `socket:{socketId}` ΓåÆ pin | Γ£à (reverse mapping) | Γ¥î | Cß║ºn thiß║┐t ─æß╗â handle disconnect |
| `playerId` ΓåÆ nickname | Γ¥î (chß╗ë l╞░u trong room:{pin}:players) | Γ£à | DB c├│ quan hß╗ç ─æß║ºy ─æß╗º |

---

## 5. M├ú lß╗ùi & Xß╗¡ l├╜ Exception

### 5.1 M├ú lß╗ùi tß╗½ Backend

| M├ú lß╗ùi | Nguß╗ôn | Nguy├¬n nh├ón | HTTP/WS |
|---|---|---|---|
| `ROOM_NOT_FOUND` | GameService.joinRoom, verifyAndGetHostRoom | PIN kh├┤ng tß╗ôn tß║íi trong DB | WsException |
| `ROOM_NOT_WAITING` | GameService.joinRoom | Ph├▓ng ─æang `PLAYING` hoß║╖c `FINISHED` | WsException |
| `NICKNAME_TAKEN` | GameService.joinRoom | Nickname ─æ├ú tß╗ôn tß║íi (case-insensitive) | WsException |
| `ROOM_FULL` | GameService.joinRoom | ─É├ú c├│ 50 players | WsException |
| `INVALID_NICKNAME` | RoomHandler.handlePlayerJoin | Nickname kh├┤ng 2-20 k├╜ tß╗▒ | WsException |
| `UNAUTHORIZED` | RoomHandler (kick/close/start) | Socket kh├┤ng phß║úi host | WsException |

### 5.2 Xß╗¡ l├╜ Exception tr├¬n Frontend

```typescript
// frontend/app/room/[pin]/page.tsx (d├▓ng 217ΓÇô224)
socket.on('error', (data: { code: string; message: string }) => {
  toast.error(data.message);

  if (data.code === 'ROOM_NOT_FOUND' ||
      data.code === 'ROOM_FULL' ||
      data.code === 'NICKNAME_TAKEN') {
    router.push('/'); // Redirect vß╗ü trang chß╗º
  }
});
```

### 5.3 Handle Disconnect ΓÇö Luß╗ông quan trß╗ìng

Khi mß╗Öt socket ngß║»t kß║┐t nß╗æi (mß║Ñt mß║íng, ─æ├│ng tab), hß╗ç thß╗æng xß╗¡ l├╜ qua `handleDisconnect`:

```
Client disconnect
    Γöé
    Γû╝
RoomHandler.handleDisconnect(client, server)
    Γöé
    Γö£ΓöÇΓû║ RedisService.getPlayerBySocket(client.id)
    Γöé       GET socket:{socketId}  ΓåÆ  lß║Ñy PIN
    Γöé       HGET room:{PIN}:players, client.id  ΓåÆ  lß║Ñy playerInfo
    Γöé
    Γö£ΓöÇ [Nß║┐u l├á PLAYER]
    Γöé   Γö£ΓöÇ GameService.leaveRoom(playerId)
    Γöé   Γöé   ΓööΓöÇ Prisma: Player.delete({ where: { id: playerId } })
    Γöé   Γö£ΓöÇ RedisService.removePlayerFromRoom(pin, socketId)
    Γöé   Γöé   ΓööΓöÇ HDEL room:{pin}:players {socketId}
    Γöé   Γöé   ΓööΓöÇ DEL socket:{socketId}
    Γöé   ΓööΓöÇ server.to('room:{pin}').emit('room:updated', { action: 'player_left', ... })
    Γöé
    ΓööΓöÇ [Nß║┐u l├á HOST]
        Γö£ΓöÇ server.to('room:{pin}').emit('room:removed', { reason: 'host_disconnected' })
        ΓööΓöÇ RedisService.deleteRoom(pin)
            ΓööΓöÇ DEL room:{pin} + DEL room:{pin}:players
```

---

## 6. S╞í ─æß╗ô tß╗òng hß╗úp

### 6.1 Luß╗ông ─æß║ºy ─æß╗º ΓÇö Tß╗½ URL ─æß║┐n WaitingRoom

```
ΓöîΓöÇ FRONTEND ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                                                                           Γöé
Γöé  User mß╗ƒ /room/123456                                                     Γöé
Γöé       Γöé                                                                    Γöé
Γöé       Γû╝                                                                    Γöé
Γöé  checkUserRole()                                                           Γöé
Γöé       Γöé                                                                    Γöé
Γöé       Γö£ΓöÇΓû║ C├│ JWT & hostId khß╗¢p                                           Γöé
Γöé       Γöé       ΓööΓöÇΓû║ setIsHost(true)                                         Γöé
Γöé       Γöé              ΓööΓöÇΓû║ getSocket().emit('room:host_join', { roomId })  Γöé
Γöé       Γöé                                                                    Γöé
Γöé       ΓööΓöÇΓû║ Kh├┤ng khß╗¢p (player)                                            Γöé
Γöé               ΓööΓöÇΓû║ setShowNicknameEntry(true)                              Γöé
Γöé                      ΓööΓöÇΓû║ Render NicknameEntry modal                       Γöé
Γöé                             ΓööΓöÇΓû║ User nhß║¡p "Alice"                         Γöé
Γöé                                    ΓööΓöÇΓû║ setPendingNickname("Alice")         Γöé
Γöé                                           ΓööΓöÇΓû║ socket.emit('room:player_join',
Γöé                                               { pin: "123456",            Γöé
Γöé                                                 nickname: "Alice" })       Γöé
Γöé                                                                           Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                                 Γöé WebSocket
                                 Γû╝
ΓöîΓöÇ BACKEND ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                                                                            Γöé
Γöé  GameGateway                                                                Γöé
Γöé    @SubscribeMessage('room:host_join')                                      Γöé
Γöé         Γöé                                                                   Γöé
Γöé         Γû╝                                                                   Γöé
Γöé    RoomHandler.handleHostJoin()                                             Γöé
Γöé         Γöé                                                                   Γöé
Γöé         Γö£ΓöÇΓû║ GameService.verifyAndGetHostRoom()                             Γöé
Γöé         Γöé       ΓööΓöÇΓû║ Prisma: Room.findUnique(include: quiz, players, host)  Γöé
Γöé         Γöé                                                                     Γöé
Γöé         Γö£ΓöÇΓû║ RedisService.createRoom(pin, hostSocketId)                     Γöé
Γöé         Γöé       ΓööΓöÇΓû║ HSET room:123456 {hostSocketId, status:"waiting"}      Γöé
Γöé         Γöé                                                                     Γöé
Γöé         ΓööΓöÇΓû║ client.join('room:{room.id}')                                   Γöé
Γöé                                                                            Γöé
Γöé    @SubscribeMessage('room:player_join')                                    Γöé
Γöé         Γöé                                                                   Γöé
Γöé         Γû╝                                                                   Γöé
Γöé    RoomHandler.handlePlayerJoin()                                           Γöé
Γöé         Γöé                                                                   Γöé
Γöé         Γö£ΓöÇΓû║ GameService.joinRoom(pin, nickname)                           Γöé
Γöé         Γöé       Γöé                                                           Γöé
Γöé         Γöé       Γö£ΓöÇΓû║ Prisma: Room.findUnique(where: { pin }, include: players)
Γöé         Γöé       Γö£ΓöÇΓû║ Prisma: Player.create(data: { roomId, nickname })      Γöé
Γöé         Γöé       ΓööΓöÇΓû║ Prisma: Room.findUnique(include: full data)            Γöé
Γöé         Γöé                                                                     Γöé
Γöé         Γö£ΓöÇΓû║ RedisService.addPlayerToRoom(pin, socketId, playerData)        Γöé
Γöé         Γöé       Γö£ΓöÇΓû║ HSET room:123456:players {socketId: JSON{playerId,...}}
Γöé         Γöé       ΓööΓöÇΓû║ SET socket:{socketId} "123456"                           Γöé
Γöé         Γöé                                                                     Γöé
Γöé         Γö£ΓöÇΓû║ client.join('room:{room.id}')                                   Γöé
Γöé         Γöé                                                                     Γöé
Γöé         Γö£ΓöÇΓû║ client.emit('room:joined', { success, room, player, isHost })  Γöé
Γöé         Γöé       ΓööΓöÇΓû║ Frontend: gameStore.setRoom(), WaitingRoom renders      Γöé
Γöé         Γöé                                                                     Γöé
Γöé         ΓööΓöÇΓû║ client.to('room:{room.id}').emit('room:updated',               Γöé
Γöé                 { action: 'player_joined', player })                        Γöé
Γöé                 ΓööΓöÇΓû║ C├íc players kh├íc: gameStore.addPlayer()                 Γöé
Γöé                                                                            Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
                                 Γöé
                                 Γû╝
ΓöîΓöÇ Kß║╛T QUß║ó ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                                                                          Γöé
Γöé  Host: thß║Ñy WaitingRoom vß╗¢i danh s├ích players, n├║t Start Game             Γöé
Γöé  Player: thß║Ñy WaitingRoom, biß║┐t m├¼nh ─æ├ú join th├ánh c├┤ng                   Γöé
Γöé                                                                          Γöé
Γöé  Tß║Ñt cß║ú c├╣ng ß╗ƒ trong socket.io channel 'room:{room.id}'                   Γöé
Γöé  ΓåÆ Khi c├│ player join/leave/kick ΓåÆ 'room:updated' broadcast               Γöé
Γöé  ΓåÆ Khi host kick player ΓåÆ 'room:removed' emit ─æß║┐n player bß╗ï kick          Γöé
Γöé  ΓåÆ Khi host start game ΓåÆ 'game:starting' emit, chuyß╗ân /play/{sessionId} Γöé
Γöé                                                                          Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

---

## Phß╗Ñ lß╗Ñc: File tham chiß║┐u

| File | Vai tr├▓ |
|---|---|
| `frontend/app/room/[pin]/page.tsx` | Trang ch├¡nh ΓÇö check role, socket connection, render UI |
| `frontend/components/game/NicknameEntry.tsx` | Modal nhß║¡p nickname cho player |
| `frontend/lib/socket.ts` | Socket.io client singleton |
| `frontend/stores/gameStore.ts` | Zustand store cho room/player state |
| `backend/src/game/game.gateway.ts` | WebSocket gateway ΓÇö nhß║¡n events, routing |
| `backend/src/game/handlers/room.handler.ts` | Xß╗¡ l├╜ room events ΓÇö host/player join, kick, leave |
| `backend/src/game/game.service.ts` | Business logic ΓÇö DB operations, validation |
| `backend/src/redis/redis.service.ts` | Redis operations ΓÇö room state, player mapping |
| `backend/prisma/schema.prisma` | Database schema ΓÇö Room, Player models |
