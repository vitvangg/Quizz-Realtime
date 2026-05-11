# MiniKahoot Admin (IT + System) – Functional & Technical Specification

## 1. Overview & Core Principles

This document defines the architecture and feature requirements for the Admin Portal of the Quizz-Realtime system. The system strictly separates administrative roles into two distinct domains to ensure security, stability, and clarity of responsibility:

*   **Admin IT (Business):** Manages application data (Users, Quizzes). Focuses on CRUD operations.
*   **Admin System (OPS):** Monitors, operates, and controls the real-time system. Focuses on observability, performance tracking, and incident management.

**Key Design Principles for AI Implementation:**
1.  **Strict Role Isolation:** Admins **DO NOT** participate in gameplay. Admin IT cannot perform system control actions. Admin System cannot alter business data.
2.  **Real-Time First:** The System Admin dashboard MUST be real-time. Use WebSockets/Server-Sent Events (SSE) to stream metrics and events without manual refreshing.
3.  **Observability:** Every critical action must be tracked, logged, and broadcasted to the OPS dashboard.
4.  **Resilience & Control:** The system must provide emergency controls (Kill switches, Maintenance mode) to prevent/recover from crashes immediately.

---

## 2. Role-Based Access Control (RBAC)

The system defines the following roles. **AI Instruction:** Implement middleware or guards to strictly enforce these boundaries at both the API (Backend) and UI (Frontend) layers.

| Role | Scope | Permissions |
| :--- | :--- | :--- |
| `SUPER_ADMIN` | Global | Full access to both IT and System domains. Can perform any action. |
| `OPS_ADMIN` | System | Access to System Dashboard, Monitoring, Audit Logs, Feature Toggles, and Incident Control. **NO** access to User/Quiz CRUD. |
| `IT_ADMIN` | Business | Access to User and Quiz Management. **NO** access to System controls. |
| `VIEWER` | Read-Only | Read-only access to dashboards. Cannot execute any actions or modify data. Useful for stakeholders. |

---

## 3. Admin IT (Business Domain)

This module handles standard business operations. **AI Instruction:** Keep implementations lightweight, optimized, and heavily rely on pagination and filtering.

### 3.1 User Management
*   **Features:** Create, Update, Delete users. Assign roles (`IT_ADMIN`, `OPS_ADMIN`, etc.). Lock/Unlock accounts.
*   **Technical Note:** Account locking must immediately invalidate active sessions (e.g., blacklist refresh tokens or emit a forced logout event via WebSocket to the specific user).

### 3.2 Quiz Management
*   **Features:** Create, Update, Delete quizzes. Publish / Unpublish.
*   **Technical Note:** Modifying, deleting or unpublishing a quiz that is currently active in a live session should be handled gracefully (e.g., prevent the action with a warning, or allow it but auto-terminate the affected session with a user-friendly notification).

---

## 4. Admin System (OPS Domain) — CORE FOCUS

This module is the heart of system operations and sets this platform apart from standard CRUD apps. **AI Instruction:** Prioritize high performance, low-latency UI updates, and robust backend event handling.

### 4.1 Real-Time System Dashboard
*   **Metrics Displayed:** Active sessions, Online users, Requests per second (RPS), Error rates.
*   **Technical Note:** Implement a `SystemMetricsService` on the backend that aggregates data (e.g., using Redis counters) and pushes updates to the frontend via WebSockets at a defined interval (e.g., every 1-3 seconds). Avoid heavy DB queries for real-time stats.

### 4.2 System Monitoring
*   **Metrics:** Server health status, Resource utilization (CPU, Memory), System latency/response times.
*   **Technical Note:** Integrate with Node.js built-in `os` module or external APM tools. Display data using time-series charts (e.g., Recharts) on the frontend to visualize trends.

### 4.3 Audit Logging & Tracking
*   **Tracked Events:** Logins, Quiz creations/modifications, Session Join/Leave, Admin actions (especially Incident Controls and Feature Toggles).
*   **Capabilities:** View history, sort, filter by user/role, filter by action type, filter by date range.
*   **Technical Note:** Create an `AuditLog` table/collection. Write logs **asynchronously** (e.g., via a message queue or background worker) to avoid blocking the main execution thread of the request.

### 4.4 Feature Toggles (Dynamic Config)
*   **Features:** Enable/Disable features at runtime without server restarts. Examples: Limit maximum player counts, Allow/Disallow guest joins, Toggle specific real-time features to save bandwidth.
*   **Technical Note:** Store configurations in a fast-access store (like Redis or an in-memory cache synchronized with DB). Backend services must check these toggles dynamically before executing related logic.

### 4.5 Incident Control (Emergency Actions)
*   **Actions:** 
    *   **Kill Switch:** Terminate all active game sessions immediately.
    *   **Lockdown:** Prevent the creation of new sessions.
    *   **Maintenance Mode:** Kick all users, prevent logins, and display a maintenance page.
*   **Technical Note:** These endpoints must be heavily secured. Actions should trigger global WebSocket broadcast events to all connected clients to force immediate UI updates (e.g., redirect to `/maintenance` or `/home`).

### 4.6 Event Stream (Real-Time Feed)
*   **Feed Content:** Live text stream of significant events (e.g., "User A joined session X", "Session Y ended", "System Error Z occurred").
*   **Technical Note:** Implement a "Live Log" or "Terminal" style component on the frontend that listens to a dedicated WebSocket channel (`admin:event-stream`).

---

## 5. Standard Architectural Flow for System Actions

When an action occurs in the system, the AI implementation should strictly follow this flow to ensure observability:

1.  **Action Execution:** The API Controller/Service processes the business logic request.
2.  **Event Generation:** Emit an internal system event (e.g., using Node.js `EventEmitter` or a pub/sub mechanism).
3.  **Audit Logging (Async):** A listener catches the event and persists it to the `AuditLog` database table.
4.  **Real-Time Broadcast (Async):** Another listener pushes the event or updated aggregated metrics to the Admin System dashboard via WebSockets.
5.  **Admin Observation:** The OPS Admin views the update immediately on their dashboard and can intervene using Incident Controls if metrics indicate a failure.

---

## 6. Implementation Guidelines for AI

When tasked to implement features based on this document, use this checklist:
*   [ ] Define Prisma schema models for `AuditLog`, `SystemConfig`, and expand `Role` enums.
*   [ ] Implement RBAC Middleware/Guards verifying `IT_ADMIN`, `OPS_ADMIN`, `SUPER_ADMIN`.
*   [ ] Setup Redis caching and pub/sub for real-time metrics and dynamic configurations.
*   [ ] Create WebSocket namespace (`/admin-ops`) specifically for pushing dashboard stats and event streams.
*   [ ] Build Frontend UI: Clear separation of `IT Dashboard` and `System Dashboard` layouts.
*   [ ] Build Incident Control API endpoints and corresponding WebSocket global broadcast handlers to disconnect clients.
