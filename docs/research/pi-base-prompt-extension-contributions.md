# Pi base/system prompt extension contributions

Date: 2026-07-08

## Scope

This research targets `@earendil-works/pi-coding-agent@0.80.5` and `@earendil-works/pi-ai@0.80.5`. npm identifies [`cc62baa442b5c0333923fdfdcc1d7264f445b5b0`](https://github.com/earendil-works/pi/tree/cc62baa442b5c0333923fdfdcc1d7264f445b5b0) as the source commit for both packages. All Pi links below are commit-addressed.

## Answer

Yes. Pi's assembled system prompt can include user-installed extension contributions, not just pi core text.

## Findings

1. **User/project extensions are first-class prompt contributors.** Pi auto-discovers global and trusted project-local extensions from the documented [`~/.pi/agent/extensions` and `.pi/extensions` locations](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/docs/extensions.md#L112-L119).

2. **Extension tool metadata can enter the default prompt text.** [`ToolDefinition`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/extensions/types.ts#L435-L448) exposes `promptSnippet` and `promptGuidelines`. Pi stores those fields when an extension [registers a tool](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/extensions/loader.ts#L228-L234), gathers metadata for active tools while [rebuilding the base prompt options](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/agent-session.ts#L983-L1016), and renders snippets and guidelines into the literal prompt through [`buildSystemPrompt()`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/system-prompt.ts#L88-L121). The official [`dynamic-tools.ts` example](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/examples/extensions/dynamic-tools.ts#L33-L39) sets both fields.

3. **Extensions can replace or append to the per-turn system prompt.** The [`before_agent_start` contract](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/docs/extensions.md#L513-L548) exposes the chained prompt. The runner [passes each extension the current value and accepts a replacement](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/extensions/runner.ts#L1025-L1088), and `AgentSession` [applies the result for that turn](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/agent-session.ts#L1182-L1213).

4. **Extension-discovered skills can append to the literal system prompt, but outside pi-token-burden's current Base section.** `resources_discover` can return [`skillPaths`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/extensions/types.ts#L531-L541). `AgentSession` [adds those resources and rebuilds the prompt](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/agent-session.ts#L2206-L2223), while [`formatSkillsForPrompt()`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/skills.ts#L335-L363) emits the `<available_skills>` block. The official [`dynamic-resources` example](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/examples/extensions/dynamic-resources/index.ts#L7-L14) returns a skill path. Pi-token-burden currently parses that block as a separate `Skills (...)` section rather than part of the legacy Base span.

5. **Some extension APIs affect LLM context or the provider payload without changing the base prompt snapshot.** Pi documents that [`ctx.getSystemPrompt()` excludes later provider-payload rewrites](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/docs/extensions.md#L1055-L1086). The runner chains [`before_provider_request` payload replacements](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/extensions/runner.ts#L952-L985) separately from `before_agent_start` prompt replacements.

## Tool schemas

Tool schemas are outside the literal system prompt string.

- Pi's prompt builder renders tool snippets and guideline text, not parameter schemas, into the [literal system prompt](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/coding-agent/src/core/system-prompt.ts#L88-L121).
- Pi AI models the request with separate [`systemPrompt` and `tools` fields](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/ai/src/types.ts#L431-L443).
- Anthropic sends the prompt through `params.system` and tools through [`params.tools`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/ai/src/api/anthropic-messages.ts#L923-L955), with schemas under [`input_schema`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/ai/src/api/anthropic-messages.ts#L1188-L1210).
- OpenAI Responses assigns [`convertResponsesTools(context.tools)`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/ai/src/api/openai-responses.ts#L245-L251), whose output carries each tool's [`parameters`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/ai/src/api/openai-responses-shared.ts#L273-L282).
- Google sends [`systemInstruction` and converted tools as separate request fields](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/ai/src/api/google-generative-ai.ts#L348-L363); the conversion places schemas in [`parametersJsonSchema`](https://github.com/earendil-works/pi/blob/cc62baa442b5c0333923fdfdcc1d7264f445b5b0/packages/ai/src/api/google-shared.ts#L272-L288).

## Naming recommendation for pi-token-burden

The locked taxonomy should replace the user-facing **`Base prompt`** concept rather than rename it one-for-one.

Use **Combined System Prompt** as the top-level literal-prompt surface, with source-attributed child rows for **Pi Core Prompt**, **User System Prompt**, **Extension Prompt Additions**, **Tool Prompt Text**, **Project Instructions**, **Skill Catalog**, and **Session Metadata**. Use **Combined Tool Definitions** as the separate top-level tool-schema surface.

Reason: pi-token-burden currently labels the first parsed span [`Base prompt`](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/parser.ts#L254-L256), and `/token-burden` reads the assembled string through [`ctx.getSystemPrompt()`](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/index.ts#L43-L46). That span can include pi core text plus active extension/custom tool `promptSnippet` and `promptGuidelines`; it is therefore not purely "base" or purely pi-core. The broader prompt also contains project instructions, skills, and metadata, all of which are literal prompt burden. The new taxonomy separates **where the burden is carried** (combined system prompt vs combined tool definitions) from **who or what contributed it** (child rows).

`System Prompt Preamble` was considered as a more precise replacement for the current parser span, but rejected as user-facing taxonomy because it preserves an implementation-shaped bucket. The desired UI/spec model decomposes that span into source-attributed rows instead.

Related code that should eventually follow the rename: the overlay still renders a [`Base prompt` trace breadcrumb](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/report-view.ts#L982-L1007), and trace types still use [`BasePromptTraceResult` and `baseTokens`](https://github.com/Whamp/pi-token-burden/blob/e1a5bfb096f51ad3e71acb0b3d020357a3de8300/src/base-trace/types.ts#L35-L43). No code changes were made in this research task. See [the locked decision map](../plans/2026-07-08-combined-token-burden-taxonomy.md).
