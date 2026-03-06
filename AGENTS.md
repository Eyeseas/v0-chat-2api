# AGENTS.md

## Project Objective

Build a local reverse proxy that exposes an OpenAI-style chat completion interface to local clients, while forwarding requests to the Vercel v0 Platform API.

## Mandatory API Requirement

This project must use the v0 **Platform API chats endpoints**:

- `POST /v1/chats`
- `POST /v1/chats/{chatId}/messages`
- `GET /v1/chats/{chatId}`
- `GET /v1/chats/{chatId}/messages`
- `POST /v1/chats/init` (when initializing from files/repo/zip/template)

Do **not** use v0 Model API `POST /v1/chat/completions` for this project.

## Implementation Intent

- Local clients should call a familiar OpenAI-style endpoint.
- The proxy should translate that request into the correct `/v1/chats` workflow.
- The proxy should maintain chat state (`conversation -> chatId`) so follow-up messages are sent to the correct chat.
- The proxy should return responses in an OpenAI-compatible shape to local callers.
