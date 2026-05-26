# SPEC.md — seco

Compressed technical specification. This is the implementation source of truth.
When in doubt, this file wins over any other document. Keep it current.

---

## Stack

| Concern | Technology | Decision Rationale |
|---|---|---|
| Runtime | Node.js 20+ | LTS, native fetch, good WS support |
| Language | TypeScript 5, strict | Type safety across monorepo |
| MCP Server | @modelcontextprotocol/sdk | Official SDK, stdio transport |
| Local HTTP | Express 4 + ws | Minimal, well-understood, handles WS |
| Web UI | Next.js 14 + shadcn/ui | Fast to build; Aidan knows it |
| LLM | Anthropic Claude API (claude-sonnet-4-20250514) | Streaming, tool use, best instruction following |
| STT Primary | Deepgram Streaming WebSocket | True real-time, word-by-word, low latency |
| STT Fallback | OpenAI Whisper (chunked) | File-based, ~5s chunks, higher latency |
| DB Default | SQLite via better-sqlite3 | Synchronous, zero dependencies, local-first |
| DB Optional | Supabase JS client | Cross-device sync, opt-in only |
| Package Manager | npm workspaces | Monorepo, single node_modules |
| Test Runner | Vitest | Fast, ESM-native, colocated tests |
| Distribution | npm (npx seco) | Single command install, no global install needed |

---

## Database Schema

```sql
-- 001_initial.sql

CREATE TABLE experiences (
  id            TEXT PRIMARY KEY,          -- UUID v4
  title         TEXT NOT NULL,
  organization  TEXT NOT NULL,
  role          TEXT NOT NULL,
  role_type     TEXT NOT NULL CHECK (role_type IN ('internship','full-time','project','leadership','research')),
  start_date    TEXT NOT NULL,             -- ISO 8601 date string
  end_date      TEXT,                      -- NULL if ongoing
  raw_transcript TEXT NOT NULL,
  situation     TEXT NOT NULL,
  task          TEXT NOT NULL,
  action        TEXT NOT NULL,
  result        TEXT NOT NULL,
  skills        TEXT NOT NULL DEFAULT '[]',         -- JSON string[]
  impact_metrics TEXT NOT NULL DEFAULT '[]',        -- JSON string[]
  ats_keywords  TEXT NOT NULL DEFAULT '[]',         -- JSON string[]
  tags          TEXT NOT NULL DEFAULT '[]',         -- JSON string[]
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,             -- ISO 8601 datetime
  updated_at    TEXT NOT NULL
);

CREATE TABLE experience_versions (
  id            TEXT PRIMARY KEY,          -- UUID v4
  experience_id TEXT NOT NULL REFERENCES experiences(id),
  version       INTEGER NOT NULL,
  snapshot      TEXT NOT NULL,             -- Full JSON snapshot of experience row
  created_at    TEXT NOT NULL
);

CREATE TABLE application_snapshots (
  id              TEXT PRIMARY KEY,        -- UUID v4
  role_title      TEXT NOT NULL,
  company         TEXT NOT NULL,
  jd_raw          TEXT NOT NULL,
  jd_parsed       TEXT NOT NULL,          -- JSON: { required_skills, preferred_skills, keywords, vocabulary }
  experience_ids  TEXT NOT NULL,          -- JSON string[]
  rendered_outputs TEXT NOT NULL,         -- JSON: { [surface]: string }
  gap_analysis    TEXT NOT NULL,          -- JSON: { [competency]: score }
  created_at      TEXT NOT NULL
);

CREATE TABLE intake_sessions (
  id              TEXT PRIMARY KEY,        -- UUID v4
  transcript      TEXT NOT NULL DEFAULT '',
  messages        TEXT NOT NULL DEFAULT '[]', -- JSON conversation history
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','saved','abandoned')),
  experience_id   TEXT REFERENCES experiences(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
```

---

## TypeScript Types

```typescript
// packages/core/src/experience/types.ts

export type RoleType = 'internship' | 'full-time' | 'project' | 'leadership' | 'research';

export interface Experience {
  id: string;
  title: string;
  organization: string;
  role: string;
  role_type: RoleType;
  start_date: string;
  end_date: string | null;
  raw_transcript: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  skills: string[];
  impact_metrics: string[];
  ats_keywords: string[];
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ExperienceVersion {
  id: string;
  experience_id: string;
  version: number;
  snapshot: Experience;
  created_at: string;
}

export type Surface =
  | 'resume_bullets'
  | 'linkedin_summary'
  | 'linkedin_post'
  | 'github_readme'
  | 'latex_bullets'
  | 'cover_letter_paragraph'
  | 'bio_short'
  | 'bio_medium'
  | 'bio_full';

export interface ParsedJD {
  required_skills: string[];
  preferred_skills: string[];
  keywords: string[];
  vocabulary: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface GapAnalysis {
  [competency: string]: number; // 0.0–1.0 coverage score
}

export interface ApplicationSnapshot {
  id: string;
  role_title: string;
  company: string;
  jd_raw: string;
  jd_parsed: ParsedJD;
  experience_ids: string[];
  rendered_outputs: Partial<Record<Surface, string>>;
  gap_analysis: GapAnalysis;
  created_at: string;
}

export interface IntakeSession {
  id: string;
  transcript: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  status: 'active' | 'saved' | 'abandoned';
  experience_id: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## Core Service API

The public interface exported from `packages/core/src/index.ts`. MCP tools and web UI routes call only these functions.

```typescript
// Intake
export function startIntakeSession(mode: 'voice' | 'text'): Promise<IntakeSession>
export function appendTranscript(sessionId: string, text: string): Promise<void>
export function getNextQuestion(sessionId: string): Promise<string>         // streams via callback
export function saveSession(sessionId: string): Promise<Experience>
export function abandonSession(sessionId: string): Promise<void>

// Experience CRUD
export function listExperiences(filter?: {
  tag?: string;
  role_type?: RoleType;
  keyword?: string;
  limit?: number;
  offset?: number;
}): Promise<Experience[]>
export function getExperience(id: string): Promise<Experience>
export function updateExperienceField(id: string, field: keyof Experience, value: unknown): Promise<Experience>
export function deleteExperience(id: string): Promise<void>

// Rendering
export function renderForSurface(
  experienceIds: string[],
  surface: Surface,
  jobDescription?: string,
  onChunk?: (chunk: string) => void
): Promise<string>

// Tailoring
export function tailorToJD(
  jobDescription: string,
  onProgress?: (status: string) => void
): Promise<{ snapshot: ApplicationSnapshot; selected: Experience[] }>

// Export
export function exportLatex(experienceIds: string[]): Promise<string>
```

---

## MCP Tool Definitions

```typescript
// One file per tool in packages/mcp-server/src/tools/

const tools = [
  {
    name: 'start_intake_session',
    description: 'Begin a new experience intake session. Use voice mode if the user wants to speak; text mode if they want to type.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['voice', 'text'] }
      },
      required: ['mode']
    }
  },
  {
    name: 'save_experience',
    description: 'Commit the current intake session to the database. Returns the created experience record.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' }
      },
      required: ['session_id']
    }
  },
  {
    name: 'list_experiences',
    description: 'Browse experience entries. Optionally filter by tag, role type, or keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string' },
        role_type: { type: 'string', enum: ['internship','full-time','project','leadership','research'] },
        keyword: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' }
      }
    }
  },
  {
    name: 'get_experience',
    description: 'Retrieve a single experience entry with all fields and version history.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'render_for_surface',
    description: 'Generate optimized copy for a target surface (resume_bullets, linkedin_summary, github_readme, latex_bullets, cover_letter_paragraph, bio_short, bio_medium, bio_full, linkedin_post). Optionally paste a job description to tailor the output.',
    inputSchema: {
      type: 'object',
      properties: {
        experience_ids: { type: 'array', items: { type: 'string' } },
        surface: { type: 'string' },
        job_description: { type: 'string' }
      },
      required: ['experience_ids', 'surface']
    }
  },
  {
    name: 'tailor_to_jd',
    description: 'Run the full tailoring pipeline against a job description. Parses the JD, scores your experience database, selects the best entries, and re-renders all surfaces with JD-specific language.',
    inputSchema: {
      type: 'object',
      properties: {
        job_description: { type: 'string' }
      },
      required: ['job_description']
    }
  },
  {
    name: 'export_latex',
    description: 'Export one or more experience entries as formatted LaTeX bullet blocks for Overleaf.',
    inputSchema: {
      type: 'object',
      properties: {
        experience_ids: { type: 'array', items: { type: 'string' } }
      },
      required: ['experience_ids']
    }
  },
  {
    name: 'update_experience',
    description: 'Update a specific field on an experience entry. Auto-increments the version.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        field: { type: 'string' },
        value: { type: 'string' }
      },
      required: ['id', 'field', 'value']
    }
  },
  {
    name: 'delete_experience',
    description: 'Delete an experience entry. Always confirm with the user before calling this.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    }
  }
]
```

---

## Voice Pipeline (Step by Step)

```
1. User opens localhost:3000 (web UI) and clicks "Start Intake"
2. Browser calls getUserMedia({ audio: true }) → MediaRecorder captures PCM
3. Browser opens WebSocket to Deepgram streaming endpoint with DEEPGRAM_API_KEY
4. Audio chunks sent to Deepgram WS as they arrive
5. Deepgram returns word-by-word transcript over WS → browser accumulates
6. Browser forwards completed utterances (on silence detection) to Express WS at localhost:3001
7. Express calls core: appendTranscript(sessionId, utterance)
8. Express calls core: getNextQuestion(sessionId) — streams Claude response back via callback
9. Streamed question sent back to browser over WS → rendered in UI
10. Loop continues until user says "done" or clicks End Session
11. Browser calls POST /sessions/:id/save → Express calls core: saveSession(sessionId)
12. Experience record written to SQLite → returned to browser for confirmation UI

Fallback (no Deepgram key):
- Step 3–5 replaced by: MediaRecorder chunks buffered in 5s segments
- Each segment posted to Express as audio/webm blob
- Express calls OpenAI Whisper API → returns transcript string
- Continues from step 6
```

---

## Render Surface Prompt Contracts

Each prompt builder in `core/src/render/prompts/` must conform to this contract:

```typescript
interface PromptBuilder {
  buildPrompt(experiences: Experience[], jd?: ParsedJD): string;
  systemPrompt: string;  // Static system prompt for this surface
}
```

### Surface constraints baked into each system prompt:

| Surface | Key Constraints |
|---|---|
| `resume_bullets` | Strong action verb first. Quantified result required. 1–2 lines. No first-person. ATS keywords natural. |
| `linkedin_summary` | First-person. ~300 words. Hook in first sentence. Keywords in prose. Warm professional tone. |
| `linkedin_post` | Hook-first. Short paragraphs. Conversational. 150–300 words. Story arc. |
| `github_readme` | Third-person or passive. Technical specificity. Stack named. Markdown native. Contribution framing. |
| `latex_bullets` | Valid LaTeX only. No special chars outside spec. `\item` prefixed. Indentation-aware. |
| `cover_letter_paragraph` | One experience per paragraph. Connects to company mission. Warm but formal. 100–150 words. |
| `bio_short` | Third-person. 1–2 sentences. Title + top achievement + affiliation. |
| `bio_medium` | Third-person. ~75 words. Narrative arc across 2–3 experiences. |
| `bio_full` | Third-person. ~200 words. Full career arc, technical depth, personal signal. |

---

## BYOK Key Loading

```typescript
// packages/core/src/config/keys.ts

interface SecoConfig {
  anthropicApiKey: string;
  deepgramApiKey?: string;
  openaiApiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

// Load order: ~/.seco/.env → process.env → interactive prompt (first run only)
export function loadConfig(): SecoConfig
export function validateConfig(config: SecoConfig): { valid: boolean; missing: string[] }
export function runFirstTimeSetup(): Promise<void>  // Interactive key entry, writes ~/.seco/.env
```

---

## Error Handling Reference

| Failure | Behavior |
|---|---|
| Missing `ANTHROPIC_API_KEY` | Hard fail. Print key name, signup URL, setup instructions. Exit 1. |
| Deepgram WS drops mid-session | Buffer 5s, reconnect once, fall back to Whisper silently. Log warning. |
| Anthropic rate limit (429) | Backoff: 100ms → 200ms → 400ms. Surface status string to caller. Preserve session. |
| SQLite write failure | Keep transcript in memory. Return error with retry instruction. Never drop data. |
| Supabase sync failure | `console.warn` only. Fall back to local. Never block or throw to caller. |
| Malformed JD | Return `ParsedJD` with `confidence: 'low'` and best-effort arrays. Never throw. |
| Session ID not found | Throw `SecoError('SESSION_NOT_FOUND', id)`. MCP layer surfaces as tool error. |
| Experience ID not found | Throw `SecoError('EXPERIENCE_NOT_FOUND', id)`. |

---

## First Run Flow

```
$ npx seco

  welcome to seco.

  Looks like this is your first time. Let's get your API keys set up.
  Keys are stored locally at ~/.seco/.env — never uploaded anywhere.

  Anthropic API key (required):
  > sk-ant-...

  Deepgram API key (optional — needed for real-time voice intake):
  > (enter to skip)

  OpenAI API key (optional — Whisper fallback for voice):
  > (enter to skip)

  All set. Add this to your Claude Desktop config:

  {
    "mcpServers": {
      "seco": {
        "command": "npx",
        "args": ["seco"]
      }
    }
  }

  Config file location: ~/Library/Application Support/Claude/claude_desktop_config.json

  Voice intake UI: http://localhost:3000
  seco is running.
```

---

## npm Package Entry Point

```json
{
  "name": "seco",
  "version": "1.0.0",
  "bin": {
    "seco": "./packages/mcp-server/dist/index.js"
  },
  "workspaces": [
    "packages/core",
    "packages/mcp-server",
    "packages/web-ui"
  ]
}
```
