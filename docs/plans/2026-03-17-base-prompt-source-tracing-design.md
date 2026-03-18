# Base Prompt Source Tracing — Design

Date: 2026-03-17
Status: Validated via iterative review
Owner: `pi-token-burden`

## 1) Problem Statement

`/token-burden` currently reports total token usage by high-level sections. The
**Base prompt** bucket can include additions from extensions (notably tool
`promptSnippet` and `promptGuidelines`) but does not show provenance.

Users need actionable answers to:
- Which extension is adding how many Base prompt tokens?
- Which exact lines came from each extension?
- What is built-in vs extension-added vs unknown?

## 2) Constraints (Hard)

1. **No pi-core API changes.**
2. **No always-on brute-force subprocess diffing** due latency.
3. If expensive tracing is needed, it must be **user-triggered from TUI**.
4. Results must be **honest**: never fabricate certainty; unknown stays unknown.

## 3) Goals / Non-Goals

### Goals
- Deterministically attribute Base prompt additions to extension sources when
  evidence exists.
- Keep normal `/token-burden` performance unchanged (trace is on-demand).
- Provide drillable, line-level evidence for every attributed token.
- Preserve additive accounting (all displayed buckets reconcile).

### Non-Goals (v1)
- Tracing all possible extension side effects outside tool snippet/guideline
  additions.
- Automatic background tracing on every `/token-burden` open.
- Modifying pi runtime behavior.

## 4) Recommended Approach

Use a **one-pass extension introspection analyzer** (not subprocess diffing)
that reuses pi’s exported extension loading/discovery APIs to gather tool
registration metadata per extension, then matches those normalized additions
against the current Base prompt lines.

This provides high-confidence attribution with bounded latency.

## 5) Alternatives Considered

### A. Runtime introspection (chosen)
- Load/discover extensions once in analyzer mode.
- Read each tool’s `promptSnippet` and `promptGuidelines` with source path.
- Match against current Base prompt lines.

**Pros:** deterministic for tool-driven additions, much faster than N process
runs, good provenance.

**Cons:** executes extension factory code once during trace action.

### B. Static source parsing
- Parse extension TS/JS for `registerTool()` call sites.

**Pros:** no runtime execution.

**Cons:** brittle for dynamic code and wrappers; low reliability.

### C. Counterfactual subprocess diffing
- Launch many `pi` invocations and diff prompts.

**Pros:** exact contribution deltas.

**Cons:** high latency and operational complexity.

> Decision: implement A for v1. Keep C as a future explicit fallback only if
> introspection cannot explain enough lines and user asks to run deeper tracing.

## 6) User Experience (TUI)

Tracing is explicit and on-demand.

### Entry point
- In **sections mode**, when `Base prompt` is selected, footer shows: `t trace`.
- Press `t` to run trace (or open cached trace if valid).

### Trace view
- New mode: `trace` (parallel to sections/drilldown/skill-toggle).
- Rows:
  - per-extension source row (name/path)
  - `Built-in/core`
  - `Shared (multi-extension)`
  - `Unattributed`
- Columns: tokens, % of Base prompt, matched-line count.

### Controls
- `enter`: drill into evidence lines for selected row.
- `r`: refresh trace.
- `e`: open extension file/path when applicable.
- `esc`: back.

### Status states
- `Analyzing extensions…`
- `Trace complete`
- `Trace partial (N errors)`

## 7) Attribution Semantics

### Source evidence
A line is attributed only if it exactly matches normalized extension-contributed
candidate text after applying the same normalization semantics used by pi core:
- snippet normalization: collapse newlines/whitespace to one line
- guideline normalization: trim and dedupe

### Buckets
- **Extension:<path/name>**: uniquely attributable lines.
- **Shared (multi-extension)**: same normalized line produced by multiple
  extensions; line counted once, contributors listed.
- **Built-in/core**: known built-in tool lines and built-in guideline lines.
- **Unattributed**: remaining Base prompt lines with no provable source.

### Accounting rule
All displayed token totals must reconcile for the traced subset:

`extension + shared + built-in + unattributed = traced Base prompt tokens`

## 8) Technical Architecture

### 8.1 New modules

1. `src/base-trace/types.ts`
   - trace domain types and result schema.

2. `src/base-trace/extension-inspector.ts`
   - discovers + loads extensions via exported pi APIs.
   - extracts tool additions with source paths.

3. `src/base-trace/base-lines.ts`
   - extracts Base prompt `Available tools` and `Guidelines` bullet lines from
     current prompt snapshot.

4. `src/base-trace/attribution.ts`
   - normalization + matching + bucket aggregation + token math.

5. `src/base-trace/cache.ts`
   - in-memory cache keyed by extension fingerprint.

### 8.2 Existing modules touched
- `src/parser.ts` (reuse existing Base prompt section extraction)
- `src/report-view.ts` (new trace mode + key handling + rendering)
- `src/types.ts` (minimal additions for trace table/drilldown items)

### 8.3 Extension discovery/loading
Use exports from `@mariozechner/pi-coding-agent`:
- `SettingsManager` for configured extension paths
- `discoverAndLoadExtensions` for standard discovery + configured paths
- loaded extension objects include `tools` with `extensionPath`

No subprocess launch required.

## 9) Data Model (v1)

```ts
interface TraceLineEvidence {
  line: string;
  tokens: number;
  kind: "tool-line" | "guideline-line";
  contributors: string[]; // extension paths or ["built-in"]
  bucket: "extension" | "shared" | "built-in" | "unattributed";
}

interface TraceBucket {
  id: string;              // extension path, "built-in", "shared", "unattributed"
  label: string;
  tokens: number;
  lineCount: number;
  pctOfBase: number;
}

interface BasePromptTraceResult {
  fingerprint: string;
  generatedAt: string;
  baseTokens: number;
  buckets: TraceBucket[];
  evidence: TraceLineEvidence[];
  errors: { source: string; message: string }[];
}
```

## 10) Caching & Staleness

### Fingerprint inputs
- discovered extension resolved path
- file mtime
- file size
- selected active tool names (current prompt context)

### Behavior
- valid fingerprint => instant reuse
- changed fingerprint => stale indicator + re-run required
- manual `r` always bypasses cache

## 11) Error Handling

- Extension load failure:
  - capture in `errors`
  - continue trace with partial data
  - keep unexplained lines in `Unattributed`
- Analyzer timeout:
  - return partial buckets + errors
- Invalid/missing extension path:
  - skip, record error

No fatal trace errors should break `/token-burden` overlay.

## 12) Performance Expectations

- Default `/token-burden`: unchanged (no trace work).
- Trace action: one discovery/load/match pass; expected interactive but slower
  than normal render.
- Cache makes repeated view opens fast within same overlay session.

## 13) Trust & Explainability Requirements

- Every non-zero extension bucket must be drillable to exact matched lines.
- Shared lines must display all contributors.
- Unknowns must remain labeled `Unattributed`.
- Never infer ownership from weak heuristics in v1.

## 14) Implementation Plan (TDD Slices)

### Slice 1 — Pure attribution core
- Add failing tests for normalization + matching + reconciliation.
- Implement `base-lines` + `attribution` pure functions.

### Slice 2 — Extension inspector
- Add failing tests with mocked extension discovery/load outputs.
- Implement metadata extraction (`promptSnippet`, `promptGuidelines`, source).

### Slice 3 — Cache
- Add tests for fingerprint changes and stale invalidation.
- Implement in-memory trace cache.

### Slice 4 — TUI integration
- Add tests for `t`, `r`, `enter`, `esc` transitions and footer hints.
- Implement trace mode rendering and drilldowns.

### Slice 5 — E2E
- Add fixture extension(s) with known snippet/guideline content.
- Verify attributed rows, drilldown evidence, shared collision handling,
  and partial-error display.

### Slice 6 — Docs
- Update README and usage notes for on-demand trace.

## 15) Acceptance Criteria

1. User can press `t` on Base prompt and get a source-attributed token view.
2. View includes per-extension rows plus built-in/shared/unattributed buckets.
3. Line-level drilldown shows tokenized evidence and source paths.
4. Trace is on-demand only and does not slow default overlay behavior.
5. All tests (unit + e2e + check suite) pass.

## 16) Future Work (Explicitly Deferred)

- Optional “deep diff mode” (subprocess counterfactual) behind an explicit user
  action for pathological cases.
- Cross-session persisted cache.
- Attribution beyond tool snippet/guidelines if additional reliable signals are
  discovered.
