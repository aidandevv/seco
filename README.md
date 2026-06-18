# seco

a local professional identity engine. capture professional experiences once, reuse them everywhere.

---

## what it does

seco helps you capture professional experiences through a guided local intake flow, stores reviewed memories in SQLite, and renders optimized copy for the surfaces where your work needs to show up: Obsidian vault notes, resumes, LinkedIn, GitHub README, Overleaf/LaTeX, cover letters, and bios.

Claude starts intake through MCP and renders a native seco intake card in chat. Text intake stays in Claude: seco returns targeted follow-up questions, tracks draft progress in the card, and opens a focused review UI before saving. The localhost browser flow remains available as a voice fallback.

your data stays on your machine. you bring your own API keys.

---

## install

```bash
npx seco-mcp
```

on first run, seco walks you through key setup and prints the one-line config to add to Claude Desktop.

---

## requirements

- Node.js 20+
- [Anthropic API key](https://console.anthropic.com) — required
- [Deepgram API key](https://console.deepgram.com) — optional, for real-time voice intake
- [OpenAI API key](https://platform.openai.com) — optional, Whisper fallback for voice

---

## claude desktop setup

after running `npx seco-mcp` once, add this to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "seco": {
      "command": "npx",
      "args": ["seco-mcp"]
    }
  }
}
```

restart Claude Desktop. you can now say things like:

> *"add an experience from my website redesign project"*  
> *"render my last three experiences as resume bullets"*  
> *"turn this experience into an Obsidian note for my career vault"*  
> *"tailor everything to this job description: [paste JD]"*  
> *"export my internship experience as LaTeX"*

---

## claude code setup

This repo includes a project `.mcp.json` for Claude Code:

```bash
npm run build
claude
```

Claude Code can then use seco as a terminal-native MCP server. Useful entrypoints:

- `/mcp__seco__capture_experience` — guided text intake in Claude Code chat
- `/mcp__seco__capture_voice_experience` — voice intake through the localhost microphone fallback
- `/mcp__seco__review_draft <session_id>` — review an active intake before saving
- `/mcp__seco__render_obsidian_note` — render saved experiences as Obsidian vault-ready Markdown
- `/mcp__seco__render_resume` — render saved experiences as resume bullets
- `/mcp__seco__tailor_to_jd` — tailor saved experiences to a pasted job description

Claude Code resources are available for @-mentions:

- `@seco:experiences://recent`
- `@seco:experience://<experience_id>`
- `@seco:snapshots://recent`
- `@seco:snapshot://<snapshot_id>`

In Claude Code, text intake does not require the browser. The browser UI remains available for voice fallback and compatibility.

---

## guided intake flow

Claude renders the MCP App intake card inline. The browser UI is still served by the same local seco server for voice fallback and compatibility links like `http://localhost:3001/session/<session_id>`.

Flow:

1. Ask Claude to add or capture an experience.
2. Claude calls `start_intake_session`, renders the seco intake card, and asks the first guided question in chat.
3. Answer in Claude; Claude calls `continue_intake_session` after each reply.
4. The card shows draft progress, confidence, missing fields, and review readiness.
5. When ready, open the card review UI, edit structured fields, and save the memory locally.
6. The saved experience is returned to Claude immediately for the current task.

Voice mode is intentional: the microphone never starts until you click the start/speak action. Auto-listen is off by default and can be enabled only after you explicitly start voice once.

Voice requires a Deepgram key for real-time transcription, or an OpenAI key for the Whisper fallback. Text intake works without either voice key.

---

## local server

`seco` runs one local HTTP server for the browser UI, `/api/*` routes, root compatibility routes, `/ws`, and audio upload. The server starts on port `3001` when available and chooses the next open local port if needed. MCP-generated intake links use the actual selected port.

---

## output surfaces

| surface | format |
|---|---|
| obsidian note | vault-ready Markdown with YAML frontmatter, tags, backlinks, STAR evidence, and reusable copy angles |
| resume bullets | ATS-optimized, action verb + metric |
| linkedin summary | ~300 words, first-person prose |
| linkedin post | hook-first, 150–300 words |
| github readme | markdown, technical framing |
| overleaf / latex | `\item` blocks, paste-ready |
| cover letter paragraph | modular, one experience per paragraph |
| bio (short / medium / full) | third-person, variable length |

---

## mcp tools

| tool | description |
|---|---|
| `start_intake_session` | create a guided intake session and render the native MCP App card |
| `continue_intake_session` | continue guided text intake with the latest Claude-chat answer |
| `save_reviewed_intake_session` | save a reviewed draft from the MCP App review UI |
| `get_intake_session_result` | poll or fetch an intake result; returns draft progress while active and the saved experience after review/save |
| `save_experience` | legacy/manual path that commits a session without the browser review flow |
| `list_experiences` | browse entries with optional filters |
| `get_experience` | retrieve a single entry |
| `render_for_surface` | generate copy for any surface |
| `tailor_to_jd` | full tailoring pipeline against a job description |
| `export_obsidian_note` | emit an Obsidian vault-ready Markdown note |
| `export_latex` | emit LaTeX bullet blocks |
| `update_experience` | targeted field edit |
| `delete_experience` | remove an entry |

---

## data

experiences are stored in a local SQLite database at `~/.seco/seco.db`. Drafts are recomputed from the local session transcript/messages and are saved only after review. nothing is sent to any server except your own API calls to Anthropic, Deepgram, and optionally OpenAI for Whisper fallback.

optional cross-device sync via Supabase — set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `~/.seco/.env` to enable.

---

## contributing

see [AGENTS.md](./AGENTS.md) for the architectural rules before opening a PR.

the most welcome contribution is a new render surface — add a prompt builder in `packages/core/src/render/prompts/` and register it in the surface map. no other files need to change.

---

## distribution checklist

The recommended distribution path is npm first, then registry/directory metadata:

1. Publish the local server as the `seco-mcp` npm package after `npm run build` and `npm test`.
2. Keep both package binaries available: `seco` for humans and `seco-mcp` for `npx seco-mcp` MCP configs.
3. Keep `package.json#mcpName` and `server.json#name` aligned as `io.github.aidandevv/seco`.
4. Submit `server.json` to the MCP Registry once the npm artifact is published.
5. Use `mcpb/manifest.json` as the manifest template for a staged `.mcpb` bundle; do not pack the repo root directly.
6. Follow the full release checklist in `docs/release.md` before publishing npm, registry metadata, or an MCPB.
7. Keep the default deployment local-first. Do not host user data or add auth unless the product direction changes.

---

## license

MIT
