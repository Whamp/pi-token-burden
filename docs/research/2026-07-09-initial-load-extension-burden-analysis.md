# Initial-load extension burden analysis

Date: 2026-07-09
Issue: [Brute-force extension burden analysis](https://github.com/Whamp/pi-token-burden/issues/20)
Status: Decision recorded for wayfinding

## Decision

Support extension burden analysis as an **optional deep analysis**, not as part of the initial `/token-burden` display.

Do **not** make brute-force subprocess diffing the default architecture. Use a smarter staged strategy:

1. **Fast display stays deterministic and local.** `/token-burden` reads an observed current-prompt snapshot plus structured base inputs from `ctx.getSystemPrompt()`, `ctx.getSystemPromptOptions()`, `pi.getAllTools()`, and `pi.getActiveTools()`.
2. **Primary attribution uses structured runtime data and literal spans.** Measure exact costs from the rendered prompt or tool payload, then attribute only where Pi exposes sufficient source evidence.
3. **Differential subprocess runs are a fallback.** Use isolated Pi runs only for optional deep analysis when structured attribution leaves an unexplained extension-owned delta.
4. **Turn-start and provider-payload behavior stays clearly labeled.** The current prompt can retain the latest turn's `before_agent_start` rewrite until the next prompt path resets it, but the command cannot isolate that rewrite by extension. `before_provider_request` payload rewrites remain outside `ctx.getSystemPrompt()`.

This matches the product goal: provide useful data without making the slowest brute-force path the default.

## Recommended measurement strategy

### 1. Fast current-session snapshot

The fast path should use APIs available inside the command handler:

- `ctx.getSystemPrompt()` for the observed current prompt. Because extension commands run before the next prompt path resets state, this string can retain the latest turn's `before_agent_start` rewrite.
- `ctx.getSystemPromptOptions()` for structured base inputs: selected tools, tool snippets, flattened prompt guidelines, appended system prompt text, cwd, context files, and loaded skills.
- `pi.getAllTools()` for all configured tool schemas, prompt guidelines, and `sourceInfo`.
- `pi.getActiveTools()` for currently active tool names.

This path supports exact measurement with evidence-qualified attribution:

| Surface | Measurement and attribution source | Counted? | Notes |
| --- | --- | --- | --- |
| Combined Tool Definitions | Serialized active schemas plus `ToolInfo.sourceInfo` from `pi.getAllTools()` | Yes | Group active schemas into Pi Core Tools, Extension Tools, and SDK / Custom Tools. Group inactive tools by the same sources in a non-counted schema-only counterfactual branch; allocate no envelope overhead to it. |
| Tool Prompt Text | Exact literal `Available tools` and `Guidelines` spans, then prompt options, `ToolInfo.promptGuidelines`, `sourceInfo`, and extension inspection as evidence | Yes | Attribute unique matches. Preserve duplicate evidence as **Shared (multiple sources)** and unmatched text as **Unattributed**. A custom system prompt can omit default tool snippets and guidelines, so measure rendered spans rather than assuming metadata appeared. |
| Skill Catalog | Rendered catalog plus `ctx.getSystemPromptOptions().skills[].sourceInfo` | Yes | Extension/package-provided visible skills are source-attributed; Pi's formatter excludes skills with disabled model invocation. |
| Project Instructions | Rendered context spans plus `contextFiles[].path` and content | Yes | Context files expose path/content rather than `SourceInfo`; use proven path rules and honest fallback labels. |
| Extension Prompt Additions | No separable command-context delta | No | Show **Not separately measurable** with 0 counted tokens. Unknown additions remain inside the Pi Core Prompt upper bound unless deep analysis produces evidence. |

### 2. Optional deep extension analysis

Add an explicit user-triggered analysis mode that can run one or more subprocess probes:

```bash
PI_DUMP_OUT=/tmp/token-burden-snapshot.json \
  pi --no-session --offline --no-extensions \
  -e <probe-extension-file> [-e <resolved-target-extension-file>] \
  -p /<probe-command>
```

The probe command writes a JSON snapshot containing prompt text/options, active tools, all tools, and source metadata, then exits without invoking the LLM because extension commands are handled before the agent prompt path.

Use this for:

- baseline Pi with no discovered extensions;
- one extension file at a time, including a package's resolved extension entry point;
- optional selected extension sets when interactions matter.

The subprocess strategy can measure net startup deltas for loaded tools, prompt snippets or guidelines, and extension-discovered skills represented in the snapshot. It should not be treated as exact per-extension attribution when multiple extensions interact or when dynamic turn-start hooks are involved.

### 3. Special observation modes

Some extension behavior cannot be separated by the fast snapshot:

- `before_agent_start` runs only when a user prompt starts an agent turn. Its final rewrite can remain in the observed current prompt after that turn, but the command receives neither the baseline string nor per-extension deltas. A last-loaded observer can measure the aggregate final turn-start prompt; exact per-extension attribution requires isolated runs or deeper runner instrumentation.
- `context` handlers mutate messages before each LLM call, not the system prompt string.
- `before_provider_request` can rewrite provider payloads after provider serialization. It is not reflected by `ctx.getSystemPrompt()` and should remain out of scope for `/token-burden` prompt attribution unless a separate provider-payload analysis is explicitly designed.

## TUI trigger model

Keep opening `/token-burden` fast.

Recommended UI behavior:

1. Initial overlay renders immediately from the current session snapshot.
2. Source/extension rows show a hint such as `d deep analysis` or an action in the trace view.
3. Pressing the deep-analysis action starts async work from inside the overlay, reusing the current trace-loading pattern.
4. The overlay shows cached results when available, a loading row while running, and partial/error rows when probes fail.
5. `r refresh` invalidates the cache and reruns the selected analysis.

Do not run subprocess probes during extension startup or before the overlay appears.

## Cache and invalidation

The current source trace cache is per-overlay and unkeyed. Deep extension analysis needs a keyed cache.

Recommended cache key fields:

- analysis mode: `quick`, `structured`, `deep-diff`, `turn-start-observer`;
- Pi version / package version;
- cwd and agent dir;
- model API/provider and counted tool envelope;
- active tool names;
- hash of `ctx.getSystemPrompt()`;
- normalized `ctx.getSystemPromptOptions()` fields used for attribution;
- relevant settings files and package filters (`settings.json`, project `.pi/settings.json` when present);
- extension/resource paths, source labels, mtimes, sizes, package versions or git commits when available;
- context file and skill paths plus mtimes/content hashes.

Use in-memory keyed caching for the first implementation. Add a persisted cache later only if subprocess analysis remains expensive in real use.

## Honest labels

Use exact labels only where the source is known.

Recommended labels:

- **Pi Core Tools** — active built-in tool schemas.
- **Extension Tools** — active extension/package tool schemas.
- **SDK / Custom Tools** — active SDK/custom tool schemas.
- **Inactive Available Tools** — collapsed, non-counted counterfactual grouped by Pi Core, Extension, and SDK / Custom sources; display additive schema-only totals as `+N tok schema` with no envelope allocation.
- **Pi Core** — uniquely proven built-in Tool Prompt Text evidence.
- **SDK / Custom** — uniquely proven SDK/custom Tool Prompt Text evidence.
- **Extension: `<source path>`** — one bucket per extension with uniquely proven evidence, labeled from its source path.
- **Shared (multiple sources)** — prompt text proven to more than one contributor.
- **Unattributed** — measured prompt text with no provable source.
- **Skill Catalog › Extension Skills** — extension/package-provided visible skill entries.
- **Extension Prompt Additions — Not separately measurable** — fast-path label when no deep evidence exists.
- **Observed extension-load delta — source mixed** — deep subprocess net delta when exact attribution is not possible.
- **Turn-start prompt additions — aggregate only** — observer-mode result for chained `before_agent_start` prompt changes.
- **Provider payload rewrites — not measured** — `before_provider_request` behavior.
- **Unexplained delta** — remaining measured difference after exact structured attribution.

## Evidence

### Pi 0.80.5

npm identifies [`cc62baa442b5c0333923fdfdcc1d7264f445b5b0`](https://github.com/earendil-works/pi/tree/cc62baa442b5c0333923fdfdcc1d7264f445b5b0) as the source commit for both `@earendil-works/pi-coding-agent@0.80.5` and `@earendil-works/pi-ai@0.80.5`.

- The CLI parser accepts repeatable [`--extension` / `-e` paths and `--no-extensions`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/cli/args.ts#L149-L154); its help states that [explicit `-e` paths still work when discovery is disabled](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/cli/args.ts#L262-L263).
- Resource loading honors that isolation: with `noExtensions`, Pi uses only [CLI-enabled extensions](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/resource-loader.ts#L390-L421); otherwise it merges CLI and enabled discovered/configured paths.
- [`ctx.getSystemPromptOptions()`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/docs/extensions.md#L1075-L1086) exposes the base prompt inputs and explicitly excludes per-turn `before_agent_start`, later `context`, and `before_provider_request` changes.
- [`pi.getActiveTools()` and `pi.getAllTools()`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/docs/extensions.md#L1614-L1634) expose active names and all tool metadata. The runtime includes each tool's [`sourceInfo`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/agent-session.ts#L868-L875).
- Changing active tools [rebuilds the prompt](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/agent-session.ts#L883-L902). The rebuild records selected tools, snippets, guidelines, skills, context files, custom prompt, and appended prompt in [`_baseSystemPromptOptions`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/agent-session.ts#L983-L1016).
- [`buildSystemPrompt()`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/system-prompt.ts#L88-L121) renders tool snippets and guidelines. The same builder appends [project context, skills, date, and cwd](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/system-prompt.ts#L145-L172).
- `resources_discover` results [extend resource paths and rebuild the prompt](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/agent-session.ts#L2206-L2223).
- `before_agent_start` [chains prompt replacements](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/extensions/runner.ts#L1025-L1088), and `AgentSession` [applies or resets the override in the prompt path](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/agent-session.ts#L1182-L1213). Extension commands [run before that path](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/agent-session.ts#L1076-L1092), so a command can observe the latest retained override.
- `before_provider_request` [chains provider-payload replacements](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/extensions/runner.ts#L952-L985), and Pi documents that those changes [do not appear in `ctx.getSystemPrompt()`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/docs/extensions.md#L670-L680).

### pi-token-burden at the decision point

These links pin the repository evidence to commit [`e1a5bfb096f51ad3e71acb0b3d020357a3de8300`](https://github.com/Whamp/pi-token-burden/tree/e1a5bfb096f51ad3e71acb0b3d020357a3de8300).

- `/token-burden` performs [prompt parsing and tool-schema counting before rendering](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/index.ts#L43-L64).
- Source tracing is [user-triggered through `onRunTrace`](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/index.ts#L70-L117), not part of the initial display.
- Tool accounting separates [active counted tools, inactive counterfactual tools, and envelope reconciliation](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/parser.ts#L546-L637), with [active/inactive regression coverage](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/parser.test.ts#L450-L542).
- Current trace extraction reads only extension tool [`promptSnippet` and `promptGuidelines`](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/base-trace/extractContributions.ts#L16-L37).
- The current [`SourceTraceReportCache`](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/source-trace-report-cache.ts#L1-L22) stores one in-memory result and supports explicit refresh, but has no input key.

## Implementation handoff notes

For the taxonomy implementation, do the exact structured attribution first:

1. Extend tool entries with non-counted source metadata.
2. Group Combined Tool Definitions by tool `sourceInfo`.
3. Measure Tool Prompt Text from exact literal spans, then attribute unique evidence through prompt options, tool metadata, and extension inspection; preserve shared and unattributed evidence explicitly.
4. Group Skill Catalog rows by `skills[].sourceInfo`.
5. Keep Extension Prompt Additions as the previously decided non-counted, honest fallback row.
6. Add optional deep-diff UI and cache only after the fast structured taxonomy works test-first.

## Residual risks

- Isolated subprocess runs execute extension code. Keep the action explicit and user-triggered.
- A one-extension-at-a-time diff can misattribute interaction effects when extensions depend on load order or on other extensions.
- Date/cwd and resource discovery must be controlled or normalized in diffs.
- Provider-payload burden depends on model/provider serialization and is not a system-prompt measurement.
