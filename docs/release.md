# seco release checklist

This checklist is the contract for the future release script. Keep it current with
`README.md`, `SPEC.md`, `server.json`, `mcpb/manifest.json`, and `package.json`.

## release channels

1. npm package: primary install artifact for `npx seco-mcp`.
2. MCP Registry metadata: discovery layer that points to the npm package.
3. MCPB bundle: one-click Claude Desktop install for local-first users.

## preflight

1. Confirm the working tree contains only intended release changes.
2. Confirm `package.json#version`, `package-lock.json`, `server.json#version`, and `mcpb/manifest.json#version` match.
3. Confirm `package.json#mcpName` and `server.json#name` both equal `io.github.aidandevv/seco`.
4. Confirm `README.md`, `SPEC.md`, and `AGENTS.md` mention any new tools, surfaces, distribution paths, or setup behavior.
5. Confirm no API keys, local database files, `.env` files, screenshots with private data, or Obsidian vault content are staged.

## validation commands

Run these before any publish step:

```bash
npm run release:check
```

`release:check` runs the full local release gate and fails on the first non-zero
exit:

```bash
npm test
npm run build
npm audit --omit=dev --cache .npm-cache
npm pack --dry-run --cache .npm-cache
npm run release:smoke:tarball
```

The smoke test creates a real npm tarball, installs it into a temporary project,
starts the installed `seco-mcp` binary through the MCP SDK stdio client, and
verifies that the expected tools are listed. Use the repo-local `.npm-cache`
path so release validation does not depend on machine-global npm cache ownership.

## npm package

1. Build from a clean checkout or CI job.
2. Run `npm pack --dry-run` and inspect the included files.
3. Verify the package includes:
   - `packages/mcp-server/dist`
   - `packages/core/dist`
   - `packages/core/package.json`
   - `packages/web-ui/dist`
   - `server.json`
   - `mcpb/manifest.json`
   - `README.md`
4. Verify the package excludes compiled test artifacts:
   - no `*.test.js`
   - no `*.test.d.ts`
   - no `*.spec.js`
   - no `*.spec.d.ts`
5. Smoke-test the packed tarball in a temporary directory:
   - run `npm run release:smoke:tarball`
   - verify the script installs the tarball
   - verify the installed `seco-mcp` binary initializes and lists tools
6. Publish with `npm publish --access public` only after the tarball smoke test passes.

## MCP Registry

1. Confirm the published npm version matches `server.json`.
2. Run `mcp-publisher login github` if needed.
3. Run `mcp-publisher publish` from the repo root.
4. Verify the registry response includes `io.github.aidandevv/seco`.

## MCPB bundle

The MCPB should be built from a staging directory, not directly from the repo root.
The staging directory must contain only install-time files:

```text
dist/mcpb/seco/
├── manifest.json
├── package.json
├── package-lock.json
├── node_modules/
└── packages/
    ├── core/
    │   ├── dist/
    │   └── package.json
    ├── mcp-server/
    │   ├── dist/
    │   └── package.json
    └── web-ui/
        └── dist/
```

Staging steps implemented by `npm run release:stage:mcpb`:

1. Remove and recreate `dist/mcpb/seco`.
2. Copy `mcpb/manifest.json` to `dist/mcpb/seco/manifest.json`.
3. Copy root `package.json` and `package-lock.json`.
4. Copy each workspace `package.json` needed by production resolution.
5. Copy built `dist` folders from `packages/core`, `packages/mcp-server`, and `packages/web-ui`.
6. Run production dependency installation inside the staging directory.
7. Run `mcpb pack dist/mcpb/seco` via `npm run release:pack:mcpb`.
8. Install the generated `.mcpb` in Claude Desktop and verify:
   - required Anthropic key is prompted as sensitive config
   - tools list successfully
   - text intake can start
   - `render_for_surface` includes `obsidian_note`
   - `export_obsidian_note` returns Markdown

## release scripts

Release scripts:

```json
{
  "scripts": {
    "release:check": "npm test && npm run build && npm audit --omit=dev --cache .npm-cache && npm pack --dry-run --cache .npm-cache && npm run release:smoke:tarball",
    "release:smoke:tarball": "node scripts/smoke-packed-tarball.mjs",
    "release:stage:mcpb": "node scripts/stage-mcpb.mjs",
    "release:pack:mcpb": "npm run release:stage:mcpb && mcpb pack dist/mcpb/seco"
  }
}
```

The `scripts/stage-mcpb.mjs` implementation uses explicit allowlists for copied
paths and never copies `.git`, `.env`, `~/.seco`, `node_modules` from the source
checkout, test fixtures with private data, or generated local databases.
