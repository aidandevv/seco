# seco diagrams

Mermaid diagrams for product structure, user journeys, and release flow.

---

## information architecture

```mermaid
flowchart TD
  Product["seco\nlocal professional identity engine"]

  Product --> Entrypoints["User entrypoints"]
  Entrypoints --> ClaudeDesktop["Claude Desktop\nMCP server config"]
  Entrypoints --> ClaudeCode["Claude Code\nproject .mcp.json"]
  Entrypoints --> Browser["localhost browser UI\nvoice fallback and review"]

  Product --> MCPServer["packages/mcp-server\ntransport layer"]
  MCPServer --> Tools["MCP tools\nintake, CRUD, render, tailor, export"]
  MCPServer --> Prompts["Claude Code prompts\ncapture, voice, render, tailor"]
  MCPServer --> Resources["MCP resources\nrecent experiences and snapshots"]
  MCPServer --> HTTP["local HTTP server\n/api, /ws, static UI, audio upload"]
  MCPServer --> MCPApp["MCP App resource\ninline intake card"]

  Product --> Core["packages/core\nbusiness logic"]
  Core --> Config["config\nBYOK keys and seco dir"]
  Core --> Intake["intake\nsessions, questions, draft extraction"]
  Core --> Experience["experience\nCRUD and versioning"]
  Core --> Render["render\nsurface prompt builders and streaming"]
  Core --> Tailor["tailor\nJD parse, scoring, snapshots"]
  Core --> DB["db\nSQLite schema, migrations, optional Supabase adapter"]

  Product --> WebUI["packages/web-ui\ncompanion UI only"]
  WebUI --> IntakeCard["intake app\nprogress, missing fields, review"]
  WebUI --> VoiceUI["voice controls\nMediaRecorder, VAD, handoff"]

  Product --> Data["Local data"]
  Data --> SQLite["~/.seco/seco.db\nexperiences, versions, snapshots, sessions"]
  Data --> Env["~/.seco/.env\nuser-supplied API keys"]

  Product --> Providers["External BYOK providers"]
  Providers --> Anthropic["Anthropic\nextraction and rendering"]
  Providers --> Deepgram["Deepgram\noptional real-time voice"]
  Providers --> OpenAI["OpenAI Whisper\noptional chunked fallback"]
  Providers --> Supabase["Supabase\noptional sync adapter"]

  Product --> Outputs["Output surfaces"]
  Outputs --> Obsidian["Obsidian note"]
  Outputs --> Resume["Resume bullets"]
  Outputs --> LinkedIn["LinkedIn summary or post"]
  Outputs --> GitHubReadme["GitHub README"]
  Outputs --> Latex["LaTeX bullets"]
  Outputs --> Cover["Cover letter paragraph"]
  Outputs --> Bio["Short, medium, full bio"]

  Product --> Distribution["Distribution"]
  Distribution --> Npm["npm package\nnpx seco-mcp"]
  Distribution --> Registry["MCP Registry metadata\nserver.json"]
  Distribution --> MCPB["MCPB bundle\nstaged local install"]
```

## user flow: guided text intake

```mermaid
flowchart TD
  Start["User asks Claude to capture an experience"]
  Start --> StartTool["Claude calls start_intake_session\nmode text"]
  StartTool --> Card["MCP App card renders draft progress"]
  Card --> Question["Claude asks next guided question in chat"]
  Question --> Answer["User answers in Claude"]
  Answer --> Continue["Claude calls continue_intake_session"]
  Continue --> Draft["core updates transcript and draft"]
  Draft --> ReadyCheck{"Ready for review?"}
  ReadyCheck -- "No" --> Question
  ReadyCheck -- "Yes" --> Review["User opens review UI and edits structured draft"]
  Review --> Save["save_reviewed_intake_session"]
  Save --> SQLite["Experience saved to local SQLite"]
  SQLite --> Result["Claude receives saved experience summary"]
```

## user flow: voice intake fallback

```mermaid
flowchart TD
  Start["User asks for voice capture"]
  Start --> VoiceTool["Claude calls start_intake_session\nmode voice"]
  VoiceTool --> Link["Claude returns localhost intake URL"]
  Link --> Handoff["Browser handoff screen waits for user action"]
  Handoff --> Consent["User clicks Start speaking"]
  Consent --> Provider{"Deepgram key available?"}
  Provider -- "Yes" --> Deepgram["Browser streams MediaRecorder chunks to Deepgram"]
  Provider -- "No or drops" --> Whisper{"OpenAI key available?"}
  Whisper -- "Yes" --> Upload["Browser/server send chunked audio to Whisper route"]
  Whisper -- "No" --> TextFallback["User continues by typing replies"]
  Deepgram --> Transcript["Transcript appended to intake session"]
  Upload --> Transcript
  TextFallback --> Transcript
  Transcript --> Draft["core updates draft and next question"]
  Draft --> ReviewReady{"Review ready?"}
  ReviewReady -- "No" --> Consent
  ReviewReady -- "Yes" --> Review["User reviews structured memory"]
  Review --> Save["Reviewed save commits local memory"]
```

## user flow: render or export a saved experience

```mermaid
flowchart TD
  Start["User asks for resume, Obsidian, LaTeX, LinkedIn, GitHub, cover, or bio copy"]
  Start --> Identify{"Experience IDs clear?"}
  Identify -- "No" --> Browse["Claude calls list_experiences or reads recent resource"]
  Browse --> Select["User or Claude selects source experiences"]
  Identify -- "Yes" --> Select
  Select --> Surface{"Surface type"}
  Surface --> General["render_for_surface"]
  Surface --> Obsidian["export_obsidian_note"]
  Surface --> Latex["export_latex"]
  General --> CoreRender["core loads experiences and builds surface prompt"]
  Obsidian --> CoreRender
  Latex --> CoreRender
  CoreRender --> Anthropic["Anthropic generates surface-specific copy"]
  Anthropic --> Output["Claude returns paste-ready output with source IDs"]
```

## user flow: tailor to a job description

```mermaid
flowchart TD
  Start["User pastes a job description"]
  Start --> Tailor["Claude calls tailor_to_jd"]
  Tailor --> Parse["core parses required skills, preferred skills, keywords, vocabulary"]
  Parse --> Score["core scores saved experiences against the JD"]
  Score --> Select["top experiences selected"]
  Select --> Render["core renders tailored outputs"]
  Render --> Snapshot["application snapshot saved locally"]
  Snapshot --> Response["Claude returns tailored materials and gaps"]
  Response --> Iterate{"User wants edits?"}
  Iterate -- "Yes" --> Update["update_experience or rerender selected surface"]
  Iterate -- "No" --> Done["Ready to paste into application materials"]
```

## user flow: release and distribution

```mermaid
flowchart TD
  Start["Maintainer prepares release"]
  Start --> Check["npm run release:check"]
  Check --> Tests["workspace tests"]
  Tests --> Build["core, web UI, MCP server build"]
  Build --> Audit["production npm audit"]
  Audit --> PackDry["npm pack dry run"]
  PackDry --> Smoke["install tarball in temp project\nstart installed seco-mcp\nlist expected tools"]
  Smoke --> ReleaseReady{"Release gate passed?"}
  ReleaseReady -- "No" --> Fix["Fix failing dependency, package, or runtime issue"]
  Fix --> Check
  ReleaseReady -- "Yes" --> Publish["npm publish"]
  Publish --> Registry["publish server.json to MCP Registry"]
  Publish --> Stage["npm run release:stage:mcpb"]
  Stage --> PackMCPB["npm run release:pack:mcpb"]
  PackMCPB --> DesktopSmoke["Install MCPB in Claude Desktop and verify tools"]
```
