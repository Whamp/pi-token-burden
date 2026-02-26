# Report UI Redesign

> Design validated 2026-02-26. Brainstormed from current flat text dump to an
> interactive overlay with visualization and drill-down navigation.

## Summary

Replace the current plain text report with a centered overlay (~80 columns)
featuring a context window usage bar, a stacked section bar, and an interactive
drill-down table with fuzzy search. Inspired by
[pi-skill-palette](https://github.com/nicobailon/pi-skill-palette) UI patterns.

## Layout

The `/context-budget` command opens a centered overlay (`anchor: "center"`,
width ~80) with Unicode box-drawing borders (`╭╮╰╯│─├┤`).

Three vertical zones:

```
╭──────────────── Context Budget ─────────────────╮
│                                                  │
│  Zone 1: Context window usage bar + label        │
│  ─────────────────────────────────────────────── │
│  Zone 2: Stacked section bar + legend            │
│  ─────────────────────────────────────────────── │
│  Zone 3: Interactive section table               │
│                                                  │
│  ↑↓ navigate  enter drill-in  / search  esc close│
╰──────────────────────────────────────────────────╯
```

## Zone 1: Context Window Usage Bar

A thin full-width progress bar showing total context window consumption, with
a numeric label above:

```
  9,317 / 200,000 tokens (4.7%)
  ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

- Filled portion uses theme `accent` color.
- Empty portion uses dim block character (`░`).
- Minimum 1 character filled so it's always visible.
- Hidden entirely when `contextWindow` is undefined.

## Zone 2: Stacked Section Bar

A single-line bar where each section gets a proportional colored segment,
with a one-line legend below:

```
  ██████████████████████████████████████████░░░░██
  ■ Base 5.0%  ■ AGENTS.md 25.8%  ■ Skills 68.8%  ■ Meta 0.4%
```

- Distinct ANSI colors per section (blue Base, green AGENTS.md, yellow/orange
  Skills, dim Metadata).
- Each segment minimum 1 character wide; excess stolen from largest segment.
- Color map defined as a small array for easy adjustment.

## Zone 3: Interactive Table

### Top-Level View

4-5 rows, sorted by token count descending:

```
  ▸ Skills (59)              6,414 tokens   68.8%
  · AGENTS.md files          2,400 tokens   25.8%
  · Base prompt                469 tokens    5.0%
  · Metadata (date/time)        33 tokens    0.4%
```

- Selected row: accent-colored `▸` prefix, bold text.
- Unselected rows: dim `·` prefix.
- Token counts and percentages right-aligned.
- Sections without children (Base, Metadata) are leaf items — Enter is a no-op.

### Drill-Down View

Press Enter on a section to replace the table with its children, sorted by
token count descending:

```
  Skills (59)  ←  esc to go back
  ─────────────────────────────────────────────
  ▸ omarchy                    194 tokens   2.1%
  · agent-browser              181 tokens   1.9%
  · visual-explainer           145 tokens   1.6%
  · librarian                  148 tokens   1.6%
  · variant-analysis           132 tokens   1.4%
  · ...

  ● ● ● ● ● ○ ○ ○ ○ ○  5/59
```

- ~8 visible rows with scroll tracking (rainbow progress dots).
- Breadcrumb header with "esc to go back" hint.

### Search

Press `/` to activate search. A text input appears above the list:

```
  ◎  query│type to filter...
```

- Fuzzy match filters the current level's items as you type.
- Backspace deletes characters.
- Esc exits search mode (or goes back to top level if search is empty).
- Empty results show "No matching items" in italic dim text.

## Keybindings

| Key         | Top-level          | Drill-down        | Search active                  |
| ----------- | ------------------ | ----------------- | ------------------------------ |
| `↑`/`↓`     | Navigate sections  | Navigate children | Navigate filtered results      |
| `Enter`     | Drill into section | No-op             | No-op                          |
| `/`         | Activate search    | Activate search   | —                              |
| `Esc`       | Close overlay      | Back to top-level | Exit search (or back if empty) |
| `Backspace` | —                  | —                 | Delete search char             |
| Printable   | —                  | —                 | Append to query                |

## Edge Cases

- **No children**: Leaf sections (Base, Metadata) ignore Enter. Show a dim
  indicator that they're not drillable.
- **Context window unknown**: Zone 1 hides entirely.
- **Narrow terminals**: Graceful degradation — truncate names with
  `truncateToWidth()`, shrink bars proportionally. Minimum ~40 columns.
- **Empty search results**: "No matching items" in italic dim.
- **Single-char bar segments**: Minimum 1 character per segment, excess stolen
  from the largest segment.

## File Changes

| File                      | Action      | Purpose                                 |
| ------------------------- | ----------- | --------------------------------------- |
| `src/report-view.ts`      | Rewrite     | Overlay component with all three zones  |
| `src/report-view.test.ts` | Rewrite     | Test navigation, search, drill-down     |
| `src/formatter.ts`        | Remove      | Rendering logic merges into report-view |
| `src/formatter.test.ts`   | Remove      | Tests move to report-view               |
| `src/types.ts`            | Keep        | Add new types if needed                 |
| `src/index.ts`            | Minor tweak | Pass ctx/theme to overlay               |

### Rationale for Removing formatter.ts

The current `formatter.ts` produces `ReportLine[]` which the view renders.
In the new design, formatting is inseparable from rendering — bar widths depend
on terminal width, colors depend on theme. Merging avoids an awkward abstraction
boundary.

## Testable Pure Functions

Extracted for unit testing without TUI dependencies:

- `fuzzyFilter(items, query)` — fuzzy search scoring and filtering
- `buildBarSegments(sections, barWidth)` — compute segment widths from
  proportions, enforcing minimum 1 character per segment

## Reference

UI patterns borrowed from
[pi-skill-palette](https://github.com/nicobailon/pi-skill-palette):

- Unicode box-drawing borders (`╭╮╰╯│─├┤`)
- `row()`, `emptyRow()`, `centerRow()` helper functions
- Fuzzy search with live cursor
- Rainbow progress dots for scroll position
- Dividers (`├─┤`) between sections
- Compact hint footer with italic key labels
- Centered overlay with fixed width
