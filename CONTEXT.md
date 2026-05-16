# pi-token-burden Context

This context names the project-specific concepts used when discussing token-budget analysis and skill management in `pi-token-burden`.

## Language

**Token Budget Pipeline**:
The flow that turns pi's assembled prompt and tool schemas into measured budget sections.
_Avoid_: parser flow, reporting pipeline

**Budget Section**:
A measured part of the model-facing context, such as Base prompt, AGENTS files, Skills, Metadata, or Tool definitions.
_Avoid_: component, bucket

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
An attribution report that connects Base prompt lines back to built-in pi behavior or extension contributions.
_Avoid_: provenance view, attribution mode

## Relationships

- The **Token Budget Pipeline** produces **Budget Sections**.
- A **Skill Management Session** changes **Skill Visibility State** values before persistence.
- A **Skill Visibility Store** persists **Skill Visibility State** values after a **Skill Management Session** save.
- **Skill Visibility State** affects the Skills **Budget Section** token count.
- A **Source Trace** explains selected Base prompt **Budget Section** lines.

## Example dialogue

> **Dev:** "When the user cycles a skill in the **Skill Management Session**, should the Skills **Budget Section** update immediately?"
> **Domain expert:** "Yes — pending **Skill Visibility State** changes should update the displayed token impact before they are saved."

## Flagged ambiguities

- "disabled" can mean either unavailable to pi or hidden from model invocation. Resolved: use **Skill Visibility State** values: Enabled, Hidden, Disabled.
