# Combined Token Burden Taxonomy — Decision Map

Date: 2026-07-08
Updated: 2026-07-09 after Wayfinder resolutions
Status: Locked by user decision
Owner: `pi-token-burden`

## Problem

The existing `/token-burden` section names make it hard to understand what is actually consuming initial context-window tokens.

In particular:

- **Base prompt** sounds like pi core only, but the text can include user and extension contributions.
- **Tool definitions** are not literal system-prompt text; they are provider tool/function schemas sent alongside the prompt.
- Users need to know both **where** the burden is carried and **who/what contributed** it.

## Decision

Use **Combined** for effective runtime surfaces that aggregate pi core plus user/project/extension contributions.

Top-level rows separate the model-facing API surfaces:

1. **Combined System Prompt** — literal system/developer prompt text.
2. **Combined Tool Definitions** — active tool/function schemas sent through the tool-calling API.

Child rows explain the source or contributor of each burden.

## Locked taxonomy

### Combined System Prompt

Literal prompt text assembled from pi core, user config, project context, skills, active tool prompt text, and extension contributions.

Child rows:

| Row | Meaning |
| --- | --- |
| **Pi Core Prompt** | Default pi assistant instructions and built-in prompt text. This remains an upper bound because Pi does not expose per-extension prompt deltas. |
| **User System Prompt** | User-provided system prompt and append-system-prompt content, including `SYSTEM.md`, `APPEND_SYSTEM.md`, and equivalent CLI inputs when present. Prompt templates expand into user messages and do not belong here. |
| **Extension Prompt Additions** | Non-counted row labeled **Not separately measurable**. Unknown `before_agent_start` contributions remain inside the Pi Core Prompt upper bound rather than being guessed. |
| **Tool Prompt Text** | Exact literal `Available tools` and `Guidelines` spans. Source attribution uses available evidence and preserves shared or unattributed text honestly. This is not the tool schema payload. |
| **Project Instructions** | Project context files such as `AGENTS.md`, `CLAUDE.md`, and related discovered instruction files. |
| **Skill Catalog** | Visible skill catalog entries included in the prompt: skill names, descriptions, and locations. |
| **Session Metadata** | Runtime footer text such as current date and current working directory. |
| **Prompt Boundary Overhead** | Counted reconciliation for BPE boundary effects and separators between measured literal prompt spans. |

### Combined Tool Definitions

Tool/function schemas assembled from pi core tools plus extension/custom tools and sent beside the prompt through the active provider API.

Child rows:

| Row | Meaning |
| --- | --- |
| **Pi Core Tools** | Built-in pi tool schemas active for the current session. |
| **Extension Tools** | Tools registered by installed pi extensions and active for the current session. |
| **SDK / Custom Tools** | Tools supplied through SDK/custom integration paths and active for the current session. |
| **Inactive Available Tools** | Collapsed, non-counted counterfactual grouped into non-empty Pi Core Tools, Extension Tools, and SDK / Custom Tools children, then per-tool leaves. Source and parent totals reconcile schema-only as `+N tok schema`; do not allocate Tool Envelope Overhead. |
| **Tool Envelope Overhead** | Provider/tool-call serialization overhead needed to reconcile measured schema payload totals. |

## Naming rules

- Do not use **Base prompt** as user-facing taxonomy. It hides contribution sources and implies pi core ownership.
- Do not use **Preamble** as a user-facing bucket. It describes an implementation span, not the user’s question.
- Use **Combined** only for an effective runtime surface assembled from multiple contribution sources.
- Use child rows to answer “who/what contributed this?”
- Use top-level rows to answer “where is this carried in the model-facing request?”

## Source grounding

Primary-source research is captured in [Pi base/system prompt extension contributions](../research/pi-base-prompt-extension-contributions.md). Key facts:

- Extension tool `promptSnippet` and `promptGuidelines` can enter the literal prompt.
- Extensions can append or replace per-turn system prompt text via `before_agent_start`.
- Tool schemas are sent separately from the literal prompt through provider tool/function fields.
- Provider-payload rewrites via `before_provider_request` can affect final serialized provider instructions but are not reflected by `ctx.getSystemPrompt()`.

## Implementation implications

This is a product/spec decision, not an implementation plan.

Expected future implementation direction:

1. Replace the current flat top-level sections with the two combined top-level surfaces.
2. Decompose the old `Base prompt`, context-file, skills, metadata, and custom-system sections into **Combined System Prompt** child rows.
3. Decompose tool schema accounting into **Combined Tool Definitions** child rows by tool source.
4. Keep reconciliation honest: counted child rows plus Prompt Boundary Overhead must sum to the counted parent row; non-counted rows remain excluded.
5. Preserve uncertainty labels where source attribution is incomplete rather than guessing.

## Wayfinder resolution pointers

The final accounting and interaction details live in GitHub issues [#13](https://github.com/Whamp/pi-token-burden/issues/13), [#14](https://github.com/Whamp/pi-token-burden/issues/14), [#16](https://github.com/Whamp/pi-token-burden/issues/16), [#18](https://github.com/Whamp/pi-token-burden/issues/18), [#19](https://github.com/Whamp/pi-token-burden/issues/19), and [#20](https://github.com/Whamp/pi-token-burden/issues/20), all summarized by [Wayfinder map #9](https://github.com/Whamp/pi-token-burden/issues/9).

## Non-goals

- Do not implement the redesigned TUI as part of this decision map.
- Do not claim provider-payload rewrites are visible in `ctx.getSystemPrompt()` unless pi exposes them.
- Do not merge tool prompt text with tool schemas; they live on different model-facing surfaces.
