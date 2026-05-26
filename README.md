# seco

a local professional identity engine. one intake session, every surface.

---

## what it does

seco coaches you through a voice conversation about your work, stores your experiences locally, and renders optimized copy for wherever you need to show up professionally — resume, LinkedIn, GitHub, Overleaf, cover letters.

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

> *"start a new intake session"*  
> *"render my last three experiences as resume bullets"*  
> *"tailor everything to this job description: [paste JD]"*  
> *"export my internship experience as LaTeX"*

---

## voice intake

for the voice-coached intake flow, open [http://localhost:3000](http://localhost:3000) after starting seco. this requires a Deepgram key for real-time transcription, or an OpenAI key for the Whisper fallback.

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
| `start_intake_session` | begin a voice or text coaching session |
| `save_experience` | commit session to local database |
| `list_experiences` | browse entries with optional filters |
| `get_experience` | retrieve a single entry |
| `render_for_surface` | generate copy for any surface |
| `tailor_to_jd` | full tailoring pipeline against a job description |
| `export_latex` | emit LaTeX bullet blocks |
| `update_experience` | targeted field edit |
| `delete_experience` | remove an entry |

---

## data

experiences are stored in a local SQLite database at `~/.seco/seco.db`. nothing is sent to any server except your own API calls to Anthropic and Deepgram.

optional cross-device sync via Supabase — set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `~/.seco/.env` to enable.

---

## contributing

see [AGENTS.md](./AGENTS.md) for the architectural rules before opening a PR.

the most welcome contribution is a new render surface — add a prompt builder in `packages/core/src/render/prompts/` and register it in the surface map. no other files need to change.

---

## license

MIT
