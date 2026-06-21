# Engineering Development Journal
> Chronological log of architecture decisions, implementation pivots,
> constraint discoveries, verification results, and engineering milestones.

---

### [CP-MILESTONE] | 2026-06-20: Release Automation and Tarball Smoke Gate

**Summary:** Added a release gate that verifies tests, build, production audit, package contents, and installed-tarball MCP startup before distribution.

**Files/Modules Affected:** `package.json`, `package-lock.json`, `scripts/smoke-packed-tarball.mjs`, `scripts/stage-mcpb.mjs`, `.github/workflows/ci.yml`, `docs/release.md`, `mcpb/manifest.json`, `README.md`.

**Key Trade-off:** Workspace tests alone were not enough because the first tarball smoke found that the installed npm package could not resolve `@anthropic-ai/sdk` from the nested `@seco/core` workspace. The fix was to make root package runtime dependencies include the core runtime requirements so the public npm artifact is self-contained.

**Evidence:** `npm run release:check` passed after the dependency-boundary fix, including 96 tests, build, `npm audit --omit=dev --cache .npm-cache`, dry-run pack, and installed tarball MCP tool-list smoke. `npm run release:stage:mcpb` also staged the MCPB directory and ran production dependency install with zero vulnerabilities. The local environment does not have the `mcpb` CLI, so final `.mcpb` packing was not executed.

**Follow-ups:** Run `npm run release:pack:mcpb` in an environment with the `mcpb` CLI installed, install the generated bundle in Claude Desktop, and bump the release version before publishing beyond the already-published `seco-mcp@1.0.0`.

> **[CROSS-LOG]** Product impact logged in `./docs/product_insights.md`
> - see [PI-TRUST] | 2026-06-20: Release Proof Became Part of the Product Story.

---

<!-- SESSION: 2026-06-20 17:00 | release readiness review -->

### [CP-CONSTRAINT] | 2026-06-20: Release Preflight Is Green, Production Audit Is Not

**Summary:** The current release preflight passes locally, but production distribution is blocked by current npm production advisories and unfinished MCPB/tarball automation.

**Files/Modules Affected:** `package.json`, `package-lock.json`, `docs/release.md`, `mcpb/manifest.json`, MCP distribution metadata.

**Key Trade-off:** Treating `npm test`, `npm run build`, and `npm pack --dry-run --cache .npm-cache` as sufficient would prove basic package shape, but not production trust. A releasable artifact also needs a clean production audit, a version beyond the already-published `seco-mcp@1.0.0`, tarball smoke testing, and MCPB staging.

**Evidence:** `npm run release:check` passed with 96 tests across core, MCP server, and web UI, followed by a successful dry-run package. `npm audit --omit=dev --cache .npm-cache` reported three high-severity production advisories in `form-data`, `hono`, and `multer`. `npm view seco-mcp versions --json --cache .npm-cache` showed only `1.0.0` is currently published.

**Follow-ups:** Remediate production dependency advisories, bump all aligned versions, add CI/release automation, implement MCPB staging, and run a real packed-tarball install smoke before public distribution.

> **[CROSS-LOG]** Product impact logged in `./docs/product_insights.md`
> - see [PI-TRUST] | 2026-06-20: Recruiter-Ready Requires Proof, Not Just Passing Builds.

---

### [CP-MILESTONE] | 2026-06-21: Mermaid Information Architecture and User Flows

**Summary:** Added a durable Mermaid diagram document that explains seco's information architecture and core user flows.

**Files/Modules Affected:** `docs/diagrams.md`, `README.md`.

**Key Trade-off:** Kept the README concise by linking to a dedicated diagrams file instead of expanding the landing document with every flow. The README retains the high-level architecture diagram, while `docs/diagrams.md` carries the fuller IA, intake, render, tailoring, and release flows.

**Evidence:** Documentation-only change. Mermaid diagrams were added for information architecture, guided text intake, voice fallback, render/export, JD tailoring, and release/distribution.

**Follow-ups:** Revisit the diagrams when MCP tool names, data ownership boundaries, or release channels change.

> **[CROSS-LOG]** Product impact logged in `./docs/product_insights.md`
> - see [PI-TRUST] | 2026-06-21: Diagrams Make the Product Easier to Evaluate.

---

<!-- SESSION: 2026-06-21 00:00 | agent-skills-garden comparison -->

### [CP-CONSTRAINT] | 2026-06-21: Journaling Adapter Made Durable in Repo Instructions

**Summary:** Compared `seco` against the journaling research and implementation in `agent-skills-garden`. The installed Codex journaling skills, hook script, and hooks config already matched the garden, but the checked-in `AGENTS.md` did not preserve the active journaling adapter for future agents.

**Files/Modules Affected:** `AGENTS.md`, `docs/dev_journal.md`.

**Key Trade-off:** The garden warns against loading research rationale in always-read agent files, so the repo now stores only the lean active-skill adapter and leaves the larger bibliography and hook design details in `agent-skills-garden`.

**Evidence:** Verified `diff -ru /Users/aidan/dev/agent-skills-garden/journaling/skills /Users/aidan/.codex/skills/journaling` and `diff -u /Users/aidan/dev/agent-skills-garden/journaling/hooks/codex-stop.sh /Users/aidan/.codex/hooks/journaling/codex-stop.sh` both produced no differences. Confirmed `~/.codex/hooks.json` wires `Stop` and `TaskCompleted` to the journaling hook.

**Follow-ups:** None identified.

---

<!-- SESSION: 2026-06-21 01:30 | Obsidian vault mirror -->

### [CP-ARCHITECTURE] | 2026-06-21: Obsidian Vault Export Keeps SQLite Canonical

**Summary:** Added an optional Obsidian vault writer for `export_obsidian_note` while preserving SQLite as seco's canonical experience store.

**Files/Modules Affected:** `packages/core/src/obsidian/vault.ts`, `packages/core/src/index.ts`, `packages/mcp-server/src/tools/definitions.ts`, `packages/mcp-server/src/tools/handler.ts`, `SPEC.md`.

**Key Trade-off:** Rejected replacing SQLite with Markdown files because seco needs transactional, queryable, schema-governed storage. Obsidian is now a vault-native mirror/export surface with explicit overwrite and path-boundary validation.

**Evidence:** `npm run test --workspace=packages/core`, `npm run test --workspace=packages/mcp-server`, `npm test`, and `npm run build` passed. An initial `--runInBand` Vitest attempt failed because this Vitest version does not support that flag.

**Follow-ups:** Consider an explicit import/reconcile flow if users begin editing generated vault notes and expect those edits to sync back into SQLite.

> **[CROSS-LOG]** Product impact logged in `./docs/product_insights.md`
> - see [PI-ROADMAP] | 2026-06-21: Obsidian Works Best as a Professional Workspace Mirror.

---
