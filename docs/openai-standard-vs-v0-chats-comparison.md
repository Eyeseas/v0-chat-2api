# Standard OpenAI Endpoints vs v0 `chats` Endpoints

## Purpose

This document defines the compatibility gap between a standard OpenAI-style client interface and the v0 Platform `chats` API, so we can build a deterministic adapter.

## What "Standard OpenAI" Means Here

For this project, "standard OpenAI" means local clients sending requests in OpenAI chat-completions style:

- `POST /v1/chat/completions`

Note:

- OpenAI also has `POST /v1/responses` as the newer primary API shape.
- Our proxy contract here is chat-completions compatibility at the edge.

## High-Level Comparison

| Area | OpenAI Chat Completions | v0 Platform Chats |
|---|---|---|
| Primary endpoint | `POST /v1/chat/completions` | `POST /v1/chats`, `POST /v1/chats/{chatId}/messages` |
| Conversation state | Stateless in request payload (`messages[]`) | Stateful server object (`chatId`) |
| Continuation model | Send full or recent message history each request | Send single follow-up message to existing `chatId` |
| Streaming schema | OpenAI chunk format (`chat.completion.chunk`) | v0 custom stream event format |
| Usage in response | Commonly includes `usage` token counters | No OpenAI-style per-call token counters in `chats` responses |
| Account capacity probe | OpenAI billing/rate interfaces | `/rate-limits`, `/user/plan`, `/user/billing`, `/reports/usage` |

## Endpoint Mapping (Proxy View)

| Local Endpoint (Expose) | Upstream v0 Endpoint (Call) | Condition |
|---|---|---|
| `POST /v1/chat/completions` | `POST /v1/chats` | First message for a local conversation key |
| `POST /v1/chat/completions` | `POST /v1/chats/{chatId}/messages` | Existing mapped conversation |
| Optional admin/debug | `GET /v1/chats/{chatId}` | Poll async completion and inspect status |
| Optional admin/debug | `GET /v1/chats/{chatId}/messages` | Backfill/inspect message history |

## Request Field Mapping

| OpenAI-style Input | v0 `chats` Input | Notes |
|---|---|---|
| `messages[]` | `message` + optional `system` | For continuation, use latest user message as `message`; map one system message if present |
| `model` | `modelConfiguration.modelId` | Model namespaces differ; proxy needs explicit model map |
| `stream` | `responseMode` | `true -> "experimental_stream"`, `false -> "sync"` (or `"async"` by policy) |
| `metadata` | `metadata` | v0 supports metadata on chat create/init |
| image/file content in messages | `attachments: [{url}]` | Requires URL-accessible assets; base64 passthrough is not 1:1 in `chats` |

## Field Gaps (Not 1:1)

These OpenAI-style fields do not have direct guaranteed `chats` equivalents and should be ignored, validated, or explicitly rejected by policy:

- `n`
- `logprobs`, `top_logprobs`
- `logit_bias`
- `seed`
- strict `response_format` JSON-mode semantics
- some advanced tool-calling controls

Proxy policy should decide:

- pass through only mapped fields
- return a deterministic validation error for unsupported fields

## Response Mapping Strategy

Map v0 chat detail to OpenAI-style response envelope:

- `id`: derived from latest v0 message ID (or chat/message composite)
- `object`: `chat.completion`
- `created`: unix timestamp
- `model`: mapped upstream model id or configured local alias
- `choices[0].message.role`: `assistant`
- `choices[0].message.content`: assistant message text
- `choices[0].finish_reason`: mapped from v0 finish reason when available

For streaming:

- transform v0 upstream stream events into OpenAI chunk events
- emit terminal `[DONE]`

## State and Determinism Requirements

Because v0 is stateful, proxy determinism depends on stable state mapping:

- key: local `conversation_id` (or derived stable hash)
- value: upstream `chatId`

Required behavior:

- create mapping on first successful `POST /chats`
- reuse mapping for follow-up calls
- handle missing/expired mapping with controlled fallback (new chat or explicit error)

## Async Policy Recommendation

Internally allow both:

- `sync` for simple calls
- `async` with polling when latency is high

Externally to local clients:

- keep response deterministic
- either block until completion or expose a documented async extension

## Usage and Capacity Policy

Since `chats` lacks OpenAI-style usage token counters per completion:

- provide optional proxy-side `usage_estimate` (tokenizer-based) if needed
- expose internal metrics endpoint backed by:
  - `GET /rate-limits`
  - `GET /user/plan`
  - `GET /user/billing`
  - `GET /reports/usage`

## Implementation Checklist

- Build strict input validator for OpenAI-style request body.
- Add model alias map (`openai_name -> v0 modelConfiguration.modelId`).
- Add persistent state adapter (`conversation -> chatId`).
- Implement `create` vs `sendMessage` routing.
- Implement response shaper (non-stream).
- Implement stream transformer (v0 SSE -> OpenAI SSE).
- Implement deterministic unsupported-field policy.
- Add probe endpoint for usage/limits snapshot.

## Sources (Checked March 5, 2026)

- OpenAI:
  - `https://platform.openai.com/docs/api-reference/chat/create`
  - `https://platform.openai.com/docs/api-reference/responses/create`
  - `https://developers.openai.com/resources/`
- v0:
  - `https://api.v0.dev/v1/openapi.json`
  - `https://v0.app/docs/api/platform/reference/chats/create.md`
  - `https://v0.app/docs/api/platform/reference/chats/send-message.md`
  - `https://v0.app/docs/api/platform/reference/chats/init.md`
  - `https://v0.app/docs/api/platform/reference/chats/get-by-id.md`
