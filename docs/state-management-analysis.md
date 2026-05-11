# Ph├ón t├¡ch: Chiß║┐n l╞░ß╗úc State Management - In-Memory vs Redis

## 1. Cß║Ñu tr├║c Hiß╗çn tß║íi (In-Memory)

### 1.1 Cß║Ñu tr├║c Dß╗» liß╗çu

```typescript
// room.handler.ts
private socketInfoMap = new Map<string, RoomSocketInfo>();
private playerToSocket = new Map<string, string>();
```

```typescript
// socket-state.service.ts (tr├╣ng lß║╖p)
private socketInfoMap = new Map<string, SocketInfo>();
private playerSocketMap = new Map<string, string>();
private roomHostMap = new Map<string, string>();
```

### 1.2 ╞»u ─æiß╗âm
- **Tß╗æc ─æß╗Ö**: Truy cß║¡p O(1) trong bß╗Ö nhß╗¢, kh├┤ng c├│ network latency
- **─É╞ín giß║ún**: Dß╗à debug, dß╗à hiß╗âu
- **Kh├┤ng phß╗Ñ thuß╗Öc**: Kh├┤ng cß║ºn c├ái ─æß║╖t Redis hay any infrastructure kh├íc
- **Chi ph├¡ thß║Ñp**: Kh├┤ng tß╗æn th├¬m t├ái nguy├¬n server

### 1.3 Nh╞░ß╗úc ─æiß╗âm
- **Kh├┤ng scale ─æ╞░ß╗úc**: Nß║┐u chß║íy multiple server instances, mß╗ùi instance c├│ state ri├¬ng
- **Mß║Ñt dß╗» liß╗çu khi restart**: In-memory data bß╗ï mß║Ñt khi server restart
- **Kh├│ recover**: Khi server crash, kh├┤ng c├│ c├ích restore connection state
- **Memory leak**: Socket objects giß╗» reference, c├│ thß╗â g├óy leak nß║┐u kh├┤ng cleanup ─æ├║ng

---

## 2. Chiß║┐n l╞░ß╗úc ─Éß╗ü xuß║Ñt (Redis)

### 2.1 Cß║Ñu tr├║c Redis Keys

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `room:{pin}` | Hash | Th├┤ng tin ph├▓ng: hostSocketId, status, createdAt |
| `room:{pin}:players` | Hash | Danh s├ích players: key=socketId, value=JSON player info |
| `socket:{socketId}` | String | Mapping ng╞░ß╗úc: value={pin} |

### 2.2 ╞»u ─æiß╗âm
- **Horizontal Scaling**: Nhiß╗üu WebSocket servers c├│ thß╗â share state
- **Fault Tolerance**: State tß╗ôn tß║íi qua server restarts
- **Consistency**: Tß║Ñt cß║ú servers nh├¼n thß║Ñy c├╣ng trß║íng th├íi
- **Better Disconnect Handling**: C├│ thß╗â query socket:{socketId} ─æß╗â biß║┐t player ─æang ß╗ƒ ph├▓ng n├áo

### 2.3 Nh╞░ß╗úc ─æiß╗âm
- **Latency**: Redis operations th├¬m network hop (~1-5ms)
- **Complexity**: Cß║ºn xß╗¡ l├╜ Redis connection, error handling phß╗⌐c tß║íp h╞ín
- **Infrastructure**: Cß║ºn deploy v├á maintain Redis server
- **Overhead cho small scale**: Overkill cho single-instance deployment

---

## 3. So s├ính Chi tiß║┐t

### 3.1 Join Flow

| Aspect | In-Memory | Redis |
|--------|-----------|-------|
| Join time | ~2-5ms | ~5-15ms |
| Code complexity | Simple | Moderate |
| Error handling | Simple Map ops | Try-catch Redis errors |
| Rollback | Tß╗▒ ─æß╗Öng nß║┐u throw | Cß║ºn explicit transaction |

### 3.2 Kick Flow

| Aspect | In-Memory | Redis |
|--------|-----------|-------|
| Kick time | ~2-5ms | ~5-15ms |
| Kicked player notification | Direct via socketId lookup | Via `socket:{socketId}` mapping |
| State sync | Kh├┤ng cß║ºn (single process) | Tß╗▒ ─æß╗Öng sync |

### 3.3 Disconnect Flow (Critical)

**In-Memory:**
```typescript
handleDisconnect(client: Socket) {
  const info = this.socketInfoMap.get(client.id);
  // OK v├¼ client object c├▓n reference
}
```

**Redis:**
```typescript
handleDisconnect(client: Socket) {
  const pin = await redis.get(`socket:${client.id}`);
  // OK v├¼ lß║Ñy tß╗½ Redis
  // Cß║ºn handle case client kh├┤ng c├│ trong Redis (─æ├ú cleanup rß╗ôi)
}
```

**Nhß║¡n x├⌐t**: Redis handle disconnect **tß╗æt h╞ín** v├¼:
- C├│ thß╗â query bß║Ñt kß╗│ socketId n├áo ─æß╗â t├¼m ph├▓ng
- Kh├┤ng phß╗Ñ thuß╗Öc v├áo viß╗çc c├│ l╞░u info trong memory kh├┤ng

---

## 4. Khi n├áo N├¬n/Chuyß╗ân sang Redis?

### N├¬n d├╣ng In-Memory (hiß╗çn tß║íi):
- Single server instance
- < 1000 concurrent connections
- Kh├┤ng cß║ºn high availability
- Team nhß╗Å, muß╗æn iterate nhanh

### N├¬n chuyß╗ân sang Redis khi:
- Cß║ºn chß║íy multiple instances (Kubernetes replicas)
- > 1000 concurrent users
- Cß║ºn zero-downtime deployments
- Cß║ºn horizontal scaling tß╗▒ ─æß╗Öng
- Muß╗æn better fault tolerance

---

## 5. Khuyß║┐n nghß╗ï

### Ngß║»n hß║ín (Hiß╗çn tß║íi):
**Giß╗» In-Memory** vß╗¢i c├íc cß║úi tiß║┐n:
1. X├│a `socket-state.service.ts` tr├╣ng lß║╖p
2. Th├¬m error handling tß╗æt h╞ín cho disconnect
3. Backup state v├áo Redis **chß╗ë ─æß╗â recover**, kh├┤ng phß║úi source of truth

### Trung/D├ái hß║ín:
**Chuyß╗ân sang Redis** khi:
1. Team ─æ├ú stabilize feature set
2. Cß║ºn scale production
3. ─É├ú c├│ Redis infrastructure (Redis Cloud, ElastiCache, etc.)

### Migration Path (nß║┐u cß║ºn):
```mermaid
flowchart TD
    A[In-Memory v1] --> B[Hybrid: In-Memory + Redis Backup]
    B --> C[Full Redis v1]
    C --> D[Redis v2 + Optimizations]
```

---

## 6. Kß║┐t luß║¡n

| Criteria | Winner |
|----------|--------|
| Development Speed | In-Memory |
| Performance | In-Memory |
| Scalability | Redis |
| Reliability | Redis |
| Simplicity | In-Memory |
| Cost | In-Memory |

**─Éß╗ü xuß║Ñt**: Giß╗» In-Memory cho development/testing. Chß╗ë migrate sang Redis khi c├│ evidence cß║ºn scale hoß║╖c khi production cß║ºn high availability.

---

*Document created: 2026-05-08*
*Author: AI Analysis*
