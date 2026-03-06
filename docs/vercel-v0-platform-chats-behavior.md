# Vercel v0 Platform API (`/v1/chats`) Behavior

## Scope

This document captures the behavior we rely on for implementing a local OpenAI-style proxy on top of the v0 Platform API.

It focuses on the `chats` workflow, not the v0 Model API `chat/completions` endpoint.

## Canonical Base URL and Auth

- Base URL: `https://api.v0.dev/v1`
- Auth header: `Authorization: Bearer <V0_API_KEY>`
- Content type: `application/json` for non-streaming requests

## Core Endpoints

- `POST /chats`
  - Create a new chat from a prompt.
- `POST /chats/{chatId}/messages`
  - Add a follow-up message to an existing chat.
- `POST /chats/init`
  - Initialize chat context from `files | repo | registry | zip | template`.
- `GET /chats/{chatId}`
  - Fetch full chat detail and generation status.
- `GET /chats/{chatId}/messages`
  - List messages for a chat with cursor pagination.

## Request/Response Modes

Both `POST /chats` and `POST /chats/{chatId}/messages` support:

- `responseMode: "sync"` (default)
  - Returns completed chat response directly when ready.
- `responseMode: "async"`
  - Returns early; caller should poll `GET /chats/{chatId}`.
- `responseMode: "experimental_stream"`
  - Returns streaming events (SSE transport).

## Request Shape Rules (Important)

- `message` is required for:
  - `POST /chats`
  - `POST /chats/{chatId}/messages`
- Request schemas are strict (`additionalProperties: false`).
  - Unknown top-level fields may cause validation errors.

## Key Body Fields We Can Use

`POST /chats`:

- `message: string` (required)
- `system?: string`
- `attachments?: [{ url: string }]`
- `chatPrivacy?: "public" | "private" | "team-edit" | "team" | "unlisted"`
- `projectId?: string`
- `modelConfiguration?: { modelId?, imageGenerations?, thinking? }`
- `responseMode?: "sync" | "async" | "experimental_stream"`
- `designSystemId?: string | null`
- `metadata?: Record<string, string>`

`POST /chats/{chatId}/messages`:

- `message: string` (required)
- `system?: string`
- `attachments?: [{ url: string }]`
- `modelConfiguration?: { modelId?, imageGenerations?, thinking? }`
- `responseMode?: "sync" | "async" | "experimental_stream"`

`POST /chats/init`:

- Shared fields: `name?`, `chatPrivacy?`, `projectId?`, `metadata?`
- Variant by `type`:
  - `files` with inline or URL files
  - `repo` with repository URL (and optional branch)
  - `registry` with registry URL
  - `zip` with zip URL
  - `template` with `templateId`

## Model Configuration Notes

OpenAPI currently lists `modelConfiguration.modelId` enum including:

- `v0-auto`
- `v0-mini`
- `v0-pro`
- `v0-max`
- `v0-max-fast`

`modelId` is documented as deprecated, but still accepted for compatibility.

## Stateful Behavior

Unlike OpenAI Chat Completions, v0 `chats` are server-side stateful.

- The server conversation identity is `chatId`.
- Follow-up requests must target the same `chatId`.
- This means a proxy must persist a mapping from local conversation key to `chatId`.

## Async and Polling Behavior

For async flows:

1. Send `POST /chats` or `POST /chats/{chatId}/messages` with `responseMode: "async"`.
2. Poll `GET /chats/{chatId}`.
3. Inspect `latestVersion.status`:
   - `pending`
   - `completed`
   - `failed`

## Streaming Behavior (Observed Contract)

When using `responseMode: "experimental_stream"`:

- Transport is SSE.
- Stream payload format differs from OpenAI chat stream chunks.
- Observed events are object-based (not OpenAI-style and not guaranteed to include `type`):
  - `{"object":"chat", ...}` snapshot (initial and final)
  - `{"object":"chat.title","delta":"..."}`
  - `{"object":"chat.name","delta":"..."}`
  - `{"object":"message.experimental_content.chunk","delta": ...}` patch-like delta payloads
  - terminal `data: [DONE]`
- Final `{"object":"chat", ...}` snapshot may contain authoritative assistant text in `text` and final message list.

For proxying, treat this as a custom upstream stream and transform to OpenAI-compatible chunk format.

## Usage, Limits, and Billing Probes

These endpoints provide account capacity and usage data:

- `GET /rate-limits`
  - `limit`, `remaining`, `reset`, `dailyLimit`
- `GET /user/plan`
  - plan and balance summary
- `GET /user/billing`
  - billing mode, cycle, and balances
- `GET /reports/usage`
  - event-level usage with `promptCost`, `completionCost`, `totalCost`, `chatId`, `messageId`

Note: `chats` responses do not expose OpenAI-style per-response token counters (`prompt_tokens`, `completion_tokens`, `total_tokens`).

## Known Documentation Mismatches to Avoid

- Some docs/examples use `async: true`; canonical field is `responseMode: "async"`.
- Some resume examples omit `/v1` in URL; canonical base path includes `/v1`.

## Minimal Probe Commands

```bash
source .env

curl -H "Authorization: Bearer $V0_API_KEY" "$V0_API_BASE_URL/rate-limits"
curl -H "Authorization: Bearer $V0_API_KEY" "$V0_API_BASE_URL/user/plan"
curl -H "Authorization: Bearer $V0_API_KEY" "$V0_API_BASE_URL/user/billing"
curl -H "Authorization: Bearer $V0_API_KEY" "$V0_API_BASE_URL/reports/usage?limit=5"
```

## Sources (Checked March 5, 2026)

- `https://api.v0.dev/v1/openapi.json`
- `https://v0.app/docs/api/platform/reference/chats/create.md`
- `https://v0.app/docs/api/platform/reference/chats/init.md`
- `https://v0.app/docs/api/platform/reference/chats/send-message.md`
- `https://v0.app/docs/api/platform/reference/chats/get-by-id.md`
- `https://v0.app/docs/api/platform/reference/chats/find-messages.md`
- `https://v0.app/docs/api/platform/reference/chats/resume.md`
- `https://github.com/vercel/v0-sdk` (core/streaming behavior)
