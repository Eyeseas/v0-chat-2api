# Implementation Plan: OpenAI-Compatible Proxy on v0 `chats`

## 1. Objective

Build a local reverse proxy that:

- accepts standard OpenAI-style `POST /v1/chat/completions` requests,
- fulfills them via v0 Platform API `chats` endpoints,
- serves a lightweight dashboard from the same host/port,
- includes a practical conversation-history dashboard for local state visibility.

## 2. Scope and Constraints

### In Scope

- OpenAI chat-completions compatibility (core fields, non-stream and stream).
- v0 `chats`-based continuation (`/chats`, `/chats/{chatId}/messages`).
- Internal conversation tracking with no client-side contract changes.
- Single-process, single-port API + dashboard serving.
- Mobile-first dashboard with Tailwind + shadcn + dark/light mode.
- Conversation browsing with transcript pagination and thread deletion.

### Out of Scope (Initial Release)

- Full parity for every advanced OpenAI option/tooling edge case.
- Multi-tenant auth model.
- Distributed state backend (Redis/Postgres).
- Write-capable SQL in dashboard.

## 3. Non-Negotiable Requirements

- Use v0 Platform API `chats` endpoints (not v0 Model API `chat/completions`).
- Require no additional request metadata from client callers.
- Persist conversation mapping for at least 10 to a few hundred active threads.
- Keep deterministic and explicit behavior for ambiguous history cases.
- Expose read-only operational and state visibility in dashboard.

## 4. Best-Practice Design Principles

- Contract-first: explicit request/response schemas for local and internal APIs.
- Safe-by-default: strict validation and deterministic errors.
- Least privilege: SQL explorer is read-only with strict statement allowlist.
- Operational clarity: request IDs, structured logs, health and probe endpoints.
- Incremental delivery: non-stream first, stream later, dashboard after core reliability.

## 5. Architecture (Target)

## 5.1 Runtime

- Server: Fastify (Node + TypeScript).
- Frontend: Vite React SPA (`web/`) built to static assets.
- Serving model:
  - Dev: Fastify + Vite middleware mode (single port).
  - Prod: Fastify serves static `web/dist` (same port as API).

## 5.2 External API

- `POST /v1/chat/completions` (OpenAI-style proxy endpoint).

## 5.3 Upstream v0 API

- `POST /v1/chats`
- `POST /v1/chats/{chatId}/messages`
- `GET /v1/chats/{chatId}` (polling/support)
- Optional support endpoint: `GET /v1/chats/{chatId}/messages`

## 5.4 State Model

- Storage: SQLite (WAL mode).
- Core tables:
  - `conversations` (logical thread metadata and active chat mapping)
  - `history_prefixes` (canonical-prefix hash -> chat mapping)
  - `requests_audit` (lightweight diagnostics)
- Required indexes:
  - prefix hash lookup index
  - conversation recency index
  - chatId index

## 5.5 Internal Admin API

- `GET /internal/health`
- `GET /internal/capacity` (rate limits + plan + billing + usage summary)
- `GET /internal/conversations` (paginated local mapping list)
- `GET /internal/conversations/{chatId}/messages` (paginated transcript from v0)
- `DELETE /internal/conversations/{chatId}` (delete upstream + local thread mapping)
- `GET /internal/db/schema`
- `POST /internal/db/query` (read-only with guardrails)

## 6. Conversation Resolution Strategy

Given OpenAI-style `messages[]`:

1. Canonicalize messages into stable representation.
2. Compute prefix hash for prior history.
3. Resolve mapping:
   - no prior history -> create new `chat`.
   - mapped prefix -> continue with `chatId`.
   - unmapped non-first turn -> apply policy.

Default policy:

- `strict`: return deterministic conflict-style error for unknown history.

Future optional policy:

- `bootstrap`: compact prior transcript and create a new chat as best-effort fallback.

Known edge case:

- Two concurrent threads with identical history are inherently ambiguous without client hints. This is documented and treated deterministically.

## 7. API Compatibility Contracts

Reference:

- `docs/vercel-v0-platform-chats-behavior.md`
- `docs/openai-standard-vs-v0-chats-comparison.md`

Adapter guarantees:

- Stable OpenAI-like response envelope for non-streaming.
- Stream mode transformed to OpenAI-compatible SSE chunking with terminal `[DONE]`.
- Unsupported fields: explicit allowlist/denylist policy with stable error codes.

## 8. Security and Safety Guardrails

## 8.1 Input/Output Safety

- Schema validation on inbound proxy requests.
- Strict upstream payload shaping (`additionalProperties` avoided).
- Sanitized error responses (no secrets, no raw stack traces in client responses).

## 8.2 SQL Explorer Safety

- Allowed statements:
  - `SELECT ...`
  - `WITH ... SELECT ...`
  - safe read-only `PRAGMA` subset
- Blocked statements:
  - `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `ATTACH`, `DETACH`, etc.
- Limits:
  - default max rows: 200 (configurable)
  - timeout: 2s (configurable)
  - optional pagination for large result sets

## 9. Observability and Operations

- Structured JSON logs with request ID correlation.
- Upstream call timing and status metrics.
- Local error taxonomy with stable codes.
- Capacity/probe endpoint for v0 usage and limits.
- Audit table retention policy (time- or size-based pruning).

## 10. Delivery Plan (Reorganized)

### Phase A: Contracts and Skeleton

Deliverables:

- Repo structure and TypeScript baseline.
- Env/config validation module.
- Contract docs and API schema stubs.
- Fastify + Vite single-port dev wiring.

Gate:

- Server boots, health endpoint responds, dashboard shell loads from same port.

---

### Phase B: Upstream Client + Error Model

Deliverables:

- Typed v0 client wrapper (`create`, `sendMessage`, `getChat`).
- Retry/backoff policy for transient upstream failures.
- Unified local error model.

Gate:

- Probe commands work through wrapper; errors mapped deterministically.

---

### Phase C: SQLite State + Resolver Core

Deliverables:

- DB schema + migrations + repository layer.
- Canonicalization and prefix-hash logic.
- Resolver implementation with `strict` policy.

Gate:

- Multi-turn continuation resolves correct `chatId` after restart.

---

### Phase D: Core Proxy Endpoint (Non-Streaming)

Deliverables:

- `POST /v1/chat/completions` non-stream path.
- OpenAI input mapping and response shaping.
- Unsupported-field policy enforcement.

Gate:

- Standard client flow works end-to-end for first and follow-up turns.

---

### Phase E: Internal Ops + SQL APIs

Deliverables:

- `/internal/capacity`
- `/internal/db/schema`
- `/internal/db/query` with guardrails

Gate:

- Operational snapshot and read-only DB exploration function correctly and safely.

---

### Phase F: Streaming Adapter

Deliverables:

- `stream=true` path with v0 stream transform to OpenAI-style SSE.
- `[DONE]` emission and chunk correctness.

Gate:

- Streaming clients consume transformed output without parser errors.

---

### Phase G: Dashboard UX

Deliverables:

- Mobile-first, modern minimal UI with shadcn components.
- Dark/light mode toggle (system default).
- Pages/panels:
  - overview (health/capacity snapshot)
  - conversation list with search + pagination
  - transcript viewer with message pagination
  - thread deletion controls

Gate:

- Responsive on mobile/desktop; conversation browsing is usable and safe by default.

---

### Phase H: Hardening, Tests, and Runbook

Deliverables:

- Unit tests:
  - canonicalization/hash stability
  - resolver behavior matrix
  - request/response mappings
  - SQL query guard validator
- Integration tests:
  - create + continuation
  - unknown-prefix strict error
  - streaming happy path
  - SQL guardrail enforcement
- Operator documentation and troubleshooting guide.

Gate:

- Green tests and reproducible local run from clean checkout.

## 11. Acceptance Criteria (Final)

- No client changes required to use local `/v1/chat/completions`.
- Conversation continuity is reliable for 10–200+ threads.
- State persists across restarts.
- Capacity/usage is observable from the dashboard.
- Dashboard and proxy run on the same port.
- SQL explorer is read-only, fast, and guarded.

## 12. Risks and Mitigations

- Ambiguous identical histories:
  - deterministic resolver behavior + explicit limitation documentation.
- Upstream schema drift:
  - periodic `openapi.json` contract checks + strict payload shaping.
- Stream format drift:
  - isolated parser/transformer with fixture tests.
- SQL misuse:
  - allowlist parser, timeout, row limits, deterministic blocked-query errors.
