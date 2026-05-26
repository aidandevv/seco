# seco — Implementation Design

**Date:** 2026-05-22  
**Status:** Approved  
**Approach:** Option A — Sequential by package (core → mcp-server → web-ui)

---

## Summary

seco is a locally-run professional identity engine. It ingests experiences via voice or text coaching, stores them in a local SQLite database, and renders optimized copy for 9 professional surfaces. Distributed as `npx seco`, which launches a stdio MCP server for Claude Desktop plus a local Express server and Next.js voice intake UI.

---

## Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript 5, strict mode |
| MCP Server | @modelcontextprotocol/sdk (stdio) |
| Local HTTP + WS | Express 4 + ws |
| Web UI | Next.js 15 + shadcn/ui (basic, functional) |
| LLM | Anthropic Claude API (`claude-sonnet-4-6`) |
| STT Primary | Deepgram Streaming WebSocket |
| STT Fallback | OpenAI Whisper (chunked, 5s segments) |
| DB Default | SQLite via better-sqlite3 (synchronous) |
| DB Optional | Supabase JS client (opt-in sync) |
| Package Manager | npm workspaces |
| Test Runner | Vitest (colocated tests) |
| Distribution | npm (`npx seco`) |

**Model note:** Spec referenced `claude-sonnet-4-20250514`; using `claude-sonnet-4-6` (current latest).

---

## Monorepo Structure

```
seco/
├── package.json              ← workspace root, bin: mcp-server/dist/index.js
├── tsconfig.base.json        ← shared TS config (strict, ESM, target ES2022)
├── packages/
│   ├── core/                 ← @seco/core — ALL business logic
│   ├── mcp-server/           ← @seco/mcp-server — stdio MCP + Express
│   └── web-ui/               ← @seco/web-ui — Next.js voice intake UI
├── AGENTS.md
├── SPEC.md
└── README.md
```

---

## Package 1: @seco/core

All business logic. Transport-agnostic. The only package MCP server and web-ui import from.

### Internal build order

1. **`db/`** — Migration runner (reads numbered `.sql` files), `better-sqlite3` client singleton, Supabase sync adapter (loaded only when `SUPABASE_URL` is set, mirrors SQLite interface exactly)
2. **`config/keys.ts`** — Loads `~/.seco/.env`, validates required keys, interactive first-run setup that writes `~/.seco/.env`
3. **`experience/crud.ts`** — Full CRUD + auto-versioning to `experience_versions`
4. **`intake/`** — In-memory session state manager, coached question tree, STAR field extractor (calls Claude)
5. **`render/`** — Anthropic streaming wrapper + 9 prompt builders (resume, linkedin summary, linkedin post, github readme, latex, cover letter, bio short/medium/full) + surface dispatch map
6. **`tailor/`** — JD parser, experience scorer, application snapshot builder + persistence
7. **`index.ts`** — Public service API (the only export MCP/web-ui use)

### Key contracts

```typescript
// All exported from packages/core/src/index.ts
startIntakeSession(mode: 'voice' | 'text'): Promise<IntakeSession>
appendTranscript(sessionId: string, text: string): Promise<void>
getNextQuestion(sessionId: string): Promise<string>
saveSession(sessionId: string): Promise<Experience>
abandonSession(sessionId: string): Promise<void>
listExperiences(filter?): Promise<Experience[]>
getExperience(id: string): Promise<Experience>
updateExperienceField(id, field, value): Promise<Experience>
deleteExperience(id: string): Promise<void>
renderForSurface(experienceIds, surface, jd?, onChunk?): Promise<string>
tailorToJD(jobDescription, onProgress?): Promise<{ snapshot, selected }>
exportLatex(experienceIds: string[]): Promise<string>
```

### Database

4-table SQLite schema (see SPEC.md). Migrations numbered `001_initial.sql` etc. in `db/migrations/`. Schema.sql is the source of truth — never modify DB structure outside a migration file.

### Error types

`SecoError` with codes: `SESSION_NOT_FOUND`, `EXPERIENCE_NOT_FOUND`. All other failures follow the error handling table in SPEC.md (backoff on 429, warn-only on Supabase, best-effort on malformed JD, never drop transcript data).

### Testing

Unit tests colocated with each file (`*.test.ts`). Coverage: all CRUD operations, STAR extraction, JD parser, scorer, each prompt builder.

---

## Package 2: @seco/mcp-server

Thin transport layer only. No business logic.

### Entry point (`src/index.ts`)

On startup:
1. Call `loadConfig()` / `runFirstTimeSetup()` if keys missing
2. Print first-run instructions if applicable (Claude Desktop config snippet, voice UI URL)
3. Start Express on port 3001 (REST routes + WebSocket for voice pipeline)
4. Start stdio MCP server with 9 registered tools

### MCP tools (one file each in `src/tools/`)

`start_intake_session`, `save_experience`, `list_experiences`, `get_experience`, `render_for_surface`, `tailor_to_jd`, `export_latex`, `update_experience`, `delete_experience`

Each tool file pattern: validate input → call core → return well-formed MCP response.

### Express routes

```
GET  /config                → { deepgramKeyAvailable: boolean, deepgramKey?: string, whisperAvailable: boolean }
POST /sessions              → startIntakeSession
POST /sessions/:id/transcript → appendTranscript
GET  /sessions/:id/question → getNextQuestion (SSE stream)
POST /sessions/:id/save     → saveSession
POST /sessions/:id/abandon  → abandonSession
POST /audio/whisper          → Whisper fallback chunked transcription
WS   /ws                    → voice pipeline WebSocket
```

**Note:** `GET /config` exposes the Deepgram key to the browser so it can open its direct Deepgram WebSocket. Safe because this is a localhost-only tool.

### Voice WebSocket protocol

Browser sends: `{ type: 'utterance', sessionId, text }`  
Server sends: `{ type: 'question', text }` (streamed) | `{ type: 'status', status }`

### Testing

Integration tests per tool: input validation + correct core delegation.

---

## Package 3: @seco/web-ui

Next.js 15 app. Basic and functional — no design polish. Lives at `localhost:3000`.

### Routes

- `/` — lists existing experiences + "Start new session" button (text or voice mode)
- `/session/[id]` — intake UI: mic toggle, live transcript, Claude's questions, End Session / Save buttons

### Voice pipeline (browser side)

1. `getUserMedia({ audio: true })` → `MediaRecorder`
2. Open Deepgram WebSocket directly from browser with user's `DEEPGRAM_API_KEY`
3. Stream audio chunks → accumulate word-by-word transcript
4. Forward completed utterances to Express WS at `localhost:3001/ws`
5. Render streamed questions back from WS

Fallback (no Deepgram key): buffer 5s `audio/webm` chunks → POST to `/audio/whisper` → get transcript string.

### Rules

- No business logic in components — all state via API calls to Express
- No `localStorage` / `sessionStorage` — session state lives in `core/intake/session.ts`
- shadcn/ui for components, minimal custom styling

---

## Data Flow (end-to-end)

```
User (voice) → browser MediaRecorder → Deepgram WS → Express WS → core/intake → Claude
                                                                              ↓
                                                                  SQLite (experience saved)
                                                                              ↓
User (Claude Desktop) → MCP tool → core/render → Claude streaming → MCP response
```

---

## First-Run UX

```
$ npx seco

  welcome to seco.

  Anthropic API key (required): sk-ant-...
  Deepgram API key (optional — real-time voice): (enter to skip)
  OpenAI API key (optional — Whisper fallback): (enter to skip)

  All set. Add to Claude Desktop config: { "mcpServers": { "seco": { "command": "npx", "args": ["seco"] } } }
  Config location: ~/Library/Application Support/Claude/claude_desktop_config.json

  Voice intake UI: http://localhost:3000
  seco is running.
```

---

## Non-Goals (from AGENTS.md)

No LinkedIn/GitHub/Overleaf API integrations, no cloud hosting, no multi-user/auth, no VS Code extension, no mobile UI, no automated job application submission.
