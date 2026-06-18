# seco

a local professional identity engine. capture professional experiences once, reuse them everywhere.

---

## what it does

seco helps you capture professional experiences through a guided local intake flow, stores reviewed memories in SQLite, and renders optimized copy for the surfaces where your work needs to show up: resumes, LinkedIn, GitHub README, Overleaf/LaTeX, cover letters, and bios.

Claude starts the intake through MCP and gives you a direct browser link. You complete the guided text or voice flow locally, review structured fields before saving, then return to Claude so it can fetch the saved experience and use it immediately in the current task.

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
> *"tailor everything to this job description: [paste JD]"*  
> *"export my internship experience as LaTeX"*

---

## guided intake flow

The browser UI is served by the same local seco server as the API and WebSocket routes. Claude returns a link like:

```text
http://localhost:3001/session/<session_id>
```

Flow:

1. Ask Claude to add or capture an experience.
2. Claude calls `start_intake_session` and gives you the `intake_url`.
3. Open the link and choose when to start the intake.
4. seco captures the story, shows draft progress, and asks targeted follow-up questions.
5. When the draft is ready, review and edit the structured fields.
6. Save the reviewed memory locally.
7. Return to Claude and say you are done; Claude calls `get_intake_session_result` and can use the saved experience immediately.

Voice mode is intentional: the microphone never starts until you click the start/speak action. Auto-listen is off by default and can be enabled only after you explicitly start voice once.

Voice requires a Deepgram key for real-time transcription, or an OpenAI key for the Whisper fallback. Text intake works without either voice key.

---

## local server

`seco` runs one local HTTP server for the browser UI, `/api/*` routes, root compatibility routes, `/ws`, and audio upload. The server starts on port `3001` when available and chooses the next open local port if needed. MCP-generated intake links use the actual selected port.

---

## output surfaces

| surface | format |
|---|---|
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
| `start_intake_session` | create a guided intake session and return a direct browser link |
| `get_intake_session_result` | poll or fetch an intake result; returns draft progress while active and the saved experience after review/save |
| `save_experience` | legacy/manual path that commits a session without the browser review flow |
| `list_experiences` | browse entries with optional filters |
| `get_experience` | retrieve a single entry |
| `render_for_surface` | generate copy for any surface |
| `tailor_to_jd` | full tailoring pipeline against a job description |
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

## license

MIT
