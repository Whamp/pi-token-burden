# pi-token-burden Context

This context names the project-specific concepts used when discussing token-budget analysis and skill management in `pi-token-burden`.

## Language

**Token Budget Pipeline**:
The flow that turns pi's assembled prompt and tool schemas into measured budget sections.
_Avoid_: parser flow, reporting pipeline

**Budget Section**:
A measured part of the model-facing context, such as Combined System Prompt, Combined Tool Definitions, Project Instructions, Skill Catalog, Session Metadata, or Prompt Boundary Overhead.
_Avoid_: component, bucket, Base prompt

**Combined System Prompt**:
The effective literal system/developer prompt text assembled from pi core, user config, active tool prompt text, project instructions, skills, metadata, and extension contributions.
_Avoid_: Base prompt, preamble, core instructions

**Prompt Boundary Overhead**:
The counted reconciliation row under Combined System Prompt for token or character differences caused by BPE boundaries and separators between measured literal prompt spans.
_Avoid_: Base prompt overhead, unattributed prompt text

**Combined Tool Definitions**:
The effective tool/function schema payload assembled from active pi core tools, extension tools, SDK/custom tools, and provider envelope overhead. This is not literal system-prompt text.
_Avoid_: tool prompt, tool text, tools in prompt

**Skill Management Session**:
A pending editing session for skill visibility states before changes are saved to pi settings and skill frontmatter.
_Avoid_: skill toggle state, skill UI state

**Skill Visibility State**:
The user-visible state of a skill: Enabled, Hidden, or Disabled.
_Avoid_: disable mode, toggle value

**Skill Visibility Store**:
The durable persistence module for Skill Visibility State in pi settings and skill frontmatter.
_Avoid_: skill persistence, toggle storage

**Source Trace**:
An attribution report for the exact Tool Prompt Text spans. It connects visible `Available tools` and `Guidelines` text to Pi Core, SDK/custom, extension, shared, or unattributed evidence.
_Avoid_: provenance view, attribution mode, Base prompt trace

**Source Trace Report**:
The interactive view model for Source Trace buckets, evidence lookup, labels, and cached trace results.
_Avoid_: trace UI state, attribution helper

## Relationships

- The **Token Budget Pipeline** produces **Budget Sections**.
- **Combined System Prompt** and **Combined Tool Definitions** are top-level **Budget Sections** for separate model-facing API surfaces.
- **Combined System Prompt** child rows explain literal prompt-text contributors; **Prompt Boundary Overhead** reconciles measured spans with the parent.
- **Combined Tool Definitions** child rows explain tool-schema contributors.
- A **Skill Management Session** changes **Skill Visibility State** values before persistence.
- A **Skill Visibility Store** persists **Skill Visibility State** values after a **Skill Management Session** save.
- **Skill Visibility State** affects the Skill Catalog **Budget Section** token count.
- A **Source Trace** explains the selected Tool Prompt Text **Budget Section** spans.
- A **Source Trace Report** presents **Source Trace** buckets and evidence to the overlay.

## Example dialogue

> **Dev:** "When the user cycles a skill in the **Skill Management Session**, should the Skill Catalog **Budget Section** update immediately?"
> **Domain expert:** "Yes — pending **Skill Visibility State** changes should update the displayed token impact before they are saved."

## Flagged ambiguities

- "disabled" can mean either unavailable to pi or hidden from model invocation. Resolved: use **Skill Visibility State** values: Enabled, Hidden, Disabled.
- "Base prompt" can mean pi core, a parser span, or all literal prompt text. Resolved for new product language: use **Combined System Prompt** for the literal prompt surface and source-attributed child rows for contributors.
