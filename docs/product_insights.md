# Product Insight Journal
> Chronological log of user pain points, UX friction, product hypotheses,
> positioning insights, roadmap trade-offs, experiments, and product decisions.

---

### [PI-TRUST] | 2026-06-20: Release Proof Became Part of the Product Story

**Observation:**
- Adding an installed-tarball smoke test changed release confidence from "the repo builds" to "the distributed artifact starts and exposes the intended MCP surface."

**Why It Matters:**
- Recruiter-ready and user-ready trust depends on evidence that matches the way people will actually install the product. The smoke test caught a real npm artifact issue that workspace tests missed, making release automation part of the product credibility layer rather than internal housekeeping.

**Evidence:**
- **Source:** Release implementation and verification on 2026-06-20.
- **Strength:** Strong.

**Hypothesis / Next Step:**
- If future release notes and README proof points mention clean production audit, CI, tarball smoke, and MCPB staging, seco will read as a more mature local-first product and portfolio artifact.

> **[CROSS-LOG]** Engineering milestone logged in `./docs/dev_journal.md`
> - see [CP-MILESTONE] | 2026-06-20: Release Automation and Tarball Smoke Gate.

---

### [PI-TRUST] | 2026-06-20: Recruiter-Ready Requires Proof, Not Just Passing Builds

**Observation:**
- seco already has a coherent local-first professional identity story and passing release preflight, but public/recruiter readiness depends on visible proof: clean security posture, install reliability, demoable workflows, and polished narrative artifacts.

**Why It Matters:**
- Recruiters and early users will judge trust from the surrounding evidence as much as from the code. A package with high-severity production audit findings, no CI badge/workflow, no tarball smoke artifact, no MCPB build path, and no demo/case-study material can feel unfinished even when the core product works.

**Evidence:**
- **Source:** Local repo review and release checks on 2026-06-20.
- **Strength:** Medium.

**Hypothesis / Next Step:**
- If seco ships with a clean dependency audit, automated release proof, a one-command demo path, screenshots or short walkthrough media, and a concise case-study README section, then it will read as production/distribution/recruiter-ready rather than a strong prototype.

> **[CROSS-LOG]** Engineering constraint logged in `./docs/dev_journal.md`
> - see [CP-CONSTRAINT] | 2026-06-20: Release Preflight Is Green, Production Audit Is Not.

---

### [PI-TRUST] | 2026-06-21: Diagrams Make the Product Easier to Evaluate

**Observation:**
- seco now has visible Mermaid diagrams for its information architecture and major user journeys, including text intake, voice fallback, rendering/export, JD tailoring, and release distribution.

**Why It Matters:**
- Recruiters, contributors, and early users can understand the product faster when the local-first boundaries and user journeys are visible rather than inferred from code. This reduces trust and comprehension friction during evaluation.

**Evidence:**
- **Source:** Documentation update on 2026-06-21.
- **Strength:** Medium.

**Hypothesis / Next Step:**
- If diagrams stay synchronized with the README, SPEC, and release docs, seco will present as a more mature and easier-to-review portfolio product.

> **[CROSS-LOG]** Engineering documentation logged in `./docs/dev_journal.md`
> - see [CP-MILESTONE] | 2026-06-21: Mermaid Information Architecture and User Flows.

---

### [PI-ROADMAP] | 2026-06-21: Obsidian Works Best as a Professional Workspace Mirror

**Observation:**
- The user asked whether Obsidian-based storage would make distribution easier and match professional skill workflows. The resulting direction keeps seco's reliable SQLite store while making Obsidian a first-class vault mirror for professional knowledge work.

**Why It Matters:**
- Users who live in Obsidian get a familiar, inspectable Markdown workspace without making seco's source of truth fragile or file-convention dependent. This preserves local-first trust while reducing export friction.

**Evidence:**
- **Source:** User storage/distribution question and implementation on 2026-06-21.
- **Strength:** Medium.

**Hypothesis / Next Step:**
- If generated vault notes become a common editing surface, the next product decision should be whether seco imports/reconciles edited notes back into SQLite or treats vault files as one-way publishable artifacts.

> **[CROSS-LOG]** Engineering architecture logged in `./docs/dev_journal.md`
> - see [CP-ARCHITECTURE] | 2026-06-21: Obsidian Vault Export Keeps SQLite Canonical.

---
