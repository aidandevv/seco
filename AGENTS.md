# AGENTS.md — seco

Operating instructions for AI coding agents working in this repository.
Read this file before touching any code. The rules here are not suggestions.

---

## Active Skills — Journaling

**Engineering Journal:**
Follow skill at `~/.codex/skills/journaling/engineering-journal/SKILL.md`.
Maintain `./docs/dev_journal.md`. At the end of meaningful engineering work,
evaluate whether a checkpoint should be logged. Prefer Lightweight schema in
long or compressed sessions. Never overwrite. Never fabricate.

**Product Insight Journal:**
Follow skill at `~/.codex/skills/journaling/product-insight-journal/SKILL.md`.
Maintain `./docs/product_insights.md`. At the end of meaningful product, UX,
growth, onboarding, retention, or roadmap work, evaluate whether a product
insight should be logged. Never overwrite. Never fabricate.

**Cross-Log Rule:**
When an observation has both an engineering dimension and a product dimension
worth preserving independently, write separate entries in both files and add a
`[CROSS-LOG]` marker in each entry linking to the other.

---

## Git Delivery Pipeline

Use this delivery flow for all changes:

```text
working branch → dev → stable → main
```

- Create short-lived working branches from `dev` using `<type>/<short-description>`.
- Merge a working branch into `dev` through a focused pull request with a squash merge.
- Promote `dev` to `stable` through a pull request with a merge commit after integration validation.
- Promote `stable` to `main` through a pull request with a merge commit after release validation.
- Protect `dev`, `stable`, and `main`: require pull requests and passing CI; do not push directly to these branches.
- Use conventional commits: `<type>(<optional-scope>): <imperative summary>`.
- Create Semantic Versioning tags only from `main`. Do not push, publish, create a pull request, merge, or tag without explicit approval.

Before committing, inspect the diff, stage only task-relevant files, check for secrets and unrelated work, and run the relevant validation. At meaningful checkpoints, report:

```text
Git Status: in progress | checkpoint committed | GitHub-ready | blocked
Branch: <branch>
Commit: <hash and message, if created>
Verification: <passed, failed, or not-run checks>
Next: <single concrete next step>
```

---

## What seco is

seco is a locally-run, open-source professional identity engine. It ingests professional
experiences via a guided text or voice intake flow, stores reviewed memories in a local
SQLite database, and renders optimized copy for multiple professional surfaces (resume,
LinkedIn, Obsidian, GitHub README, Overleaf/LaTeX, cover letters) on demand. It is distributed as
an npx-installable MCP server that runs locally via Claude Desktop and serves a localhost
browser UI for the guided intake flow.

All API keys are user-supplied (BYOK). No data leaves the user's machine except for
calls to external APIs (Anthropic, Deepgram) using their own keys.

---

## Monorepo Structure

```
seco/
├── packages/
│   ├── core/          ← ALL business logic lives here. Transport-agnostic.
│   ├── mcp-server/    ← Thin stdio MCP wrapper over core. No logic here.
│   └── web-ui/        ← Vite React localhost UI for guided intake only. No logic here.
├── AGENTS.md
├── SPEC.md
├── README.md
├── docs/
│   └── release.md     ← Release checklist and release script contract
├── mcpb/
│   └── manifest.json  ← MCPB bundle manifest template
├── server.json        ← MCP Registry metadata
└── package.json       ← Workspace root (npm workspaces)
```

### The single most important architectural rule

**All business logic belongs in `packages/core/`. The MCP server and web UI are
thin transport wrappers only.** If you find yourself writing logic in `mcp-server/`
or `web-ui/` that isn't directly about transport concerns, stop and move it to `core/`.

This rule exists so that both surfaces always stay in sync and so contributors can
add features to core without touching transport code.

---

## Core Package Structure

```
packages/core/src/
├── db/
│   ├── schema.sql         ← Source of truth for DB schema
│   ├── migrations/        ← Numbered migration files
│   ├── client.ts          ← SQLite client singleton (better-sqlite3)
│   └── adapters/
│       └── supabase.ts    ← Optional sync adapter (only loaded if SUPABASE_URL set)
├── intake/
│   ├── session.ts         ← Session state manager (in-memory)
│   ├── questions.ts       ← Coached question tree and follow-up logic
│   └── extractor.ts       ← STAR field extraction from transcript
├── render/
│   ├── index.ts           ← render(experienceIds, surface, jd?) entry point
│   ├── prompts/
│   │   ├── resume.ts      ← ATS resume bullet prompt builder
│   │   ├── linkedin.ts    ← LinkedIn summary prompt builder
│   │   ├── readme.ts      ← GitHub README prompt builder
│   │   ├── obsidian.ts    ← Obsidian vault note prompt builder
│   │   ├── latex.ts       ← Overleaf/LaTeX prompt builder
│   │   ├── cover.ts       ← Cover letter paragraph prompt builder
│   │   └── bio.ts         ← Bio (short/med/full) prompt builder
│   └── stream.ts          ← Shared streaming wrapper for Anthropic calls
├── tailor/
│   ├── parser.ts          ← JD parser — extracts skills, keywords, vocabulary
│   ├── scorer.ts          ← Scores experience DB entries against parsed JD
│   └── snapshot.ts        ← Application snapshot builder and persistence
├── experience/
│   ├── crud.ts            ← Create, read, update, delete operations
│   └── types.ts           ← Experience and Snapshot TypeScript types
├── config/
│   └── keys.ts            ← BYOK key loading, validation, and first-run setup
└── index.ts               ← Public service API — the only import MCP/web-ui should use
```

---

## How to Add a New Render Surface

This is the most common contribution. The change is isolated to `core/` only:

1. Add a new prompt builder file at `packages/core/src/render/prompts/<surface>.ts`
2. Export a function matching the signature: `buildPrompt(experiences: Experience[], jd?: ParsedJD): string`
3. Register the surface in `packages/core/src/render/index.ts` — add it to the `Surface` union type and the prompt builder map
4. The MCP tool `render_for_surface` picks it up from the core surface registry

Do not touch `mcp-server/` or `web-ui/` when adding a surface.

---

## TypeScript Rules

- Strict mode is on. `"strict": true` in all tsconfig files. Never disable it.
- No `any`. Use `unknown` with a type guard if the shape is genuinely unknown.
- Explicit return types on all exported functions.
- All async functions must handle errors explicitly — no unhandled promise rejections.
- Use named exports throughout. Avoid default exports unless a framework entrypoint requires one.

---

## BYOK Key Rules

- Keys are loaded from `~/.seco/.env` via the `config/keys.ts` module.
- **Never access `process.env` directly outside of `config/keys.ts`.** All other modules receive keys as function arguments or via the config module's typed exports.
- Never log key values, even partially. Never include them in error messages.
- On first run, `config/keys.ts` detects missing required keys and enters interactive setup mode, writing to `~/.seco/.env`.
- Required keys: `ANTHROPIC_API_KEY`. Optional: `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

---

## Database Rules

- `packages/core/src/db/schema.sql` is the canonical schema. Never modify DB structure outside of a migration file.
- Migrations are numbered sequentially: `001_initial.sql`, `002_add_snapshots.sql`, etc.
- All DB operations go through `packages/core/src/experience/crud.ts`. No raw SQL queries outside of `db/` and `experience/`.
- The SQLite client is synchronous (`better-sqlite3`). Do not introduce async DB calls unless switching adapters.
- The Supabase adapter in `db/adapters/supabase.ts` is only loaded if `SUPABASE_URL` is set. It must mirror the SQLite interface exactly — no Supabase-specific methods in calling code.

---

## MCP Server Rules

`packages/mcp-server/src/tools/` contains one file per MCP tool. Each tool file:
- Imports from `@seco/core` only — never from `web-ui`
- Defines the tool's name, description, and input schema
- Calls the appropriate core service function
- Handles errors and returns a well-formed MCP response

Do not put business logic in tool files. A tool file should read like: validate input → call core → return result.

---

## Web UI Rules

The web UI at `packages/web-ui/` is a Vite React static app served by the MCP Express server. It is companion tooling for guided intake, not the primary interface.

- The local Express server serves the static UI, `/api/*` routes, root compatibility routes, `/ws`, and audio upload from one origin.
- MCP intake links must point directly to `/session/:sessionId` on the actual selected Express port.
- The browser flow starts with an explicit handoff screen. Do not auto-start the microphone before the user clicks start/speak.
- Text intake must remain first-class; voice is optional and depends on Deepgram or Whisper configuration.
- The voice pipeline: browser `MediaRecorder` -> Deepgram WebSocket or Whisper upload -> Express WS/API -> `core/intake/session.ts`
- High-confidence completion must move to review, not automatic persistence. Memory is committed only by the reviewed save path.
- No business logic in React components. Components call local API routes; routes call core.
- No `localStorage` or `sessionStorage`. Session state lives in `core/intake/session.ts`.

---

## Error Handling

| Scenario | Required Behavior |
|---|---|
| Missing required API key | Hard fail with clear setup instructions. Print the exact env var name and link to where to get the key. |
| Deepgram WS drops mid-session | Buffer last 5s, attempt reconnect once, fall back to Whisper chunked mode silently |
| Anthropic rate limit | Exponential backoff (100ms, 200ms, 400ms). Preserve session state. Surface status to user. |
| SQLite write failure | Keep session transcript in memory. Prompt user to retry. Never silently drop data. |
| Supabase sync failure | Log warning. Fall back to local SQLite. Never block local operations. |
| Malformed JD input | Return best-effort parse with `confidence: 'low'` flag. Never throw. |

---

## Testing Expectations

- `core/` — unit tests for all CRUD operations, STAR extraction, JD parser, scorer, and each prompt builder
- `mcp-server/` — integration tests per tool verifying input validation and correct core delegation
- `web-ui/` — component tests for the intake UI state machine; no e2e required initially
- Test runner: Vitest
- Test files colocated with source: `session.test.ts` alongside `session.ts`

---

## What Not to Build (Non-Goals)

Do not implement any of the following without explicit instruction:

- Direct API integrations with LinkedIn, GitHub, or Overleaf — outputs are text/LaTeX only
- Hosted/cloud deployment of any kind
- Multi-user or authentication systems
- VS Code / Cursor extension
- Mobile interface
- Automated job application submission
