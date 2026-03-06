# v0 OpenAI Proxy

Local OpenAI-compatible proxy for Vercel v0 `chats`.

It exposes an OpenAI-style edge for clients, persists local conversation mappings in SQLite, and serves a lightweight dashboard from the same server.

## What It Does

- Accepts `POST /v1/chat/completions`
- Exposes `GET /v1/models` and `GET /v1/models/:model`
- Uses v0 `POST /chats` and `POST /chats/{chatId}/messages` upstream
- Stores local conversation state in SQLite
- Serves a dashboard at `/` with:
  - `Overview`
  - `Usage`
  - `Conversations`

## Important Behavior

- If incoming history matches a known local prefix hash, the proxy continues the existing upstream `chatId`.
- If incoming history does not match, the proxy creates a new upstream chat.
- On that fallback create, the proxy now forwards prior conversation history to v0 by serializing earlier turns into the new chat's `system` context and sending the current user turn as the live `message`.
- The Conversations dashboard shows a merged transcript view. When an upstream fallback chat only contains the latest turn pair, the dashboard fills in the earlier turns from the proxy's local history snapshot so you can still inspect the full local conversation.

## Install

```bash
npm install
npm --prefix web install
```

## Configure

Copy `.env.template` to `.env` and set real values:

```bash
V0_API_KEY=your_v0_api_key_here
V0_API_BASE_URL=https://api.v0.dev/v1
HOST=127.0.0.1
PORT=3000
OPENAI_API_KEY=local-dev-openai-key
CHAT_STATE_FILE=.data/chat-state.db
```

Notes:

- `V0_API_KEY` is required.
- In the current implementation, clients calling the local proxy should send `Authorization: Bearer $OPENAI_API_KEY`.
- Use `HOST=0.0.0.0` if you want to reach the proxy from another device on your LAN.

## Database

Run migrations when setting up a new DB file or after adding migrations:

```bash
npm run db:migrate
```

You do not need to run migrations before every start.

## Run

Backend and bundled frontend:

```bash
npm run dev
```

This starts the Fastify server on `HOST:PORT` and serves the built frontend from `web/dist`.

If you change frontend code and are not running a separate Vite dev server, rebuild the frontend bundle:

```bash
npm --prefix web run build
```

Optional manual frontend dev server:

```bash
npm --prefix web run dev
```

That runs Vite separately, usually on `http://localhost:5173`.

## Client Base URL

For OpenAI-compatible clients:

- Base URL: `http://localhost:3000/v1`
- Chat completions: `http://localhost:3000/v1/chat/completions`

If using another device on the network, include the scheme:

- `http://192.168.x.x:3000/v1`

## Models

Current local model list:

- `v0-auto`
- `v0-mini`
- `v0-pro`
- `v0-max`
- `v0-max-fast`

Legacy aliases accepted by the proxy:

- `gpt-4` -> `v0-pro`
- `gpt-4-turbo` -> `v0-max`
- `gpt-3.5-turbo` -> `v0-mini`

## Example Request

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer local-dev-openai-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "v0-auto",
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'
```

## Dashboard

Open:

- `http://localhost:3000/`

Pages:

- `Overview` for high-level status
- `Usage` for balance, rate limits, and recent v0 usage events
- `Conversations` for local conversation list and transcript inspection

## API Surface

OpenAI-compatible:

- `GET /v1/models`
- `GET /v1/models/:model`
- `POST /v1/chat/completions`

Internal:

- `GET /internal/health`
- `GET /internal/capacity`
- `GET /internal/conversations`
- `GET /internal/conversations/:chatId/messages`
- `DELETE /internal/conversations/:chatId`

Debug-only internal DB endpoints:

- `GET /internal/db/schema`
- `POST /internal/db/query`

`/internal/db/query` is read-only and guarded, but it is still a debug surface, not part of the normal user workflow.

## Build

Backend TypeScript build:

```bash
npm run build
```

Frontend bundle build:

```bash
npm --prefix web run build
```

## Test

```bash
npm test
```
