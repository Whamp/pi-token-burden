# Plan: View Base Prompt in Editor

## Context

Skills and AGENTS.md files can be opened in `$VISUAL`/`$EDITOR` by pressing
`e` in drilldown or skill-toggle mode. The base prompt section has no editor
support — it's not drillable and `e` does nothing in sections mode.

The base prompt is **not a user file** — it's generated dynamically by pi's
`buildSystemPrompt()`. There's no single source file to open. The goal: let
the user press `e` on any section row to view its raw text in their editor.
This is read-only / informational.

## Approach

1. Store the raw text of each section in `PromptSection.content`.
2. Propagate it through `TableItem.content`.
3. In sections mode, handle `e` by writing the selected section's content to
   a temp file and opening it in the editor. Clean up after the editor closes.

This keeps the approach consistent — every section becomes viewable, not just
the base prompt. The same mechanism works for "SYSTEM.md / APPEND_SYSTEM.md"
and "Metadata" sections too.

Non-file sections (Base prompt, Metadata, SYSTEM.md / APPEND_SYSTEM.md) get a
read-only header comment since edits to the temp file have no effect. File-
backed sections (AGENTS.md files, Skills) skip the header — their drilldown
children already open the real files via `e`.

## Files to Modify

| File                     | Change                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `src/types.ts`           | Add `content?: string` to `PromptSection` and `TableItem`   |
| `src/parser.ts`          | Populate `content` in `measure()` helper                    |
| `src/report-view.ts`     | Handle `e` in sections mode; write temp file, open editor   |
| `src/parser.test.ts`     | Verify `content` is populated for each section              |
| `src/report-view.test.ts`| Verify `buildTableItems` propagates `content`               |

## Reuse

| What               | Where                           | How                                    |
| ------------------ | ------------------------------- | -------------------------------------- |
| `launchEditor()`   | `src/report-view.ts` line 736   | Reuse directly for temp file           |
| `getEditor()`      | `src/report-view.ts` line 100   | Already used by `launchEditor()`       |
| `measure()` helper | `src/parser.ts`                 | Extend to store content                |
| `buildTableItems()`| `src/report-view.ts`            | Extend to propagate content            |

## Steps

### Step 1: Types — add `content` field

- [ ] `types.ts` — add `content?: string` to `PromptSection` and `TableItem`

**Verify:** `pnpm run typecheck` passes (no consumers break).

### Step 2: Parser — store raw text (TDD)

- [ ] `parser.test.ts` — add test: each section in `ParsedPrompt` has a
      `content` string whose length equals `section.chars`. Test the full
      prompt fixture (base + AGENTS + skills + metadata) and assert every
      section has `content` defined and `content.length === section.chars`.
- [ ] `parser.ts` — change `measure()` to include `content: text` in the
      returned object. The AGENTS.md and Skills sections built via spread
      (`{ ...measure(...), children }`) already inherit it. The SYSTEM.md
      gap section uses `measure()` too. No extra wiring needed.

**Verify:** `pnpm run test -- src/parser.test.ts` — new test passes, existing
tests still pass.

### Step 3: Report-view — propagate content to TableItem (TDD)

- [ ] `report-view.test.ts` — add test: `buildTableItems()` propagates
      `content` from `PromptSection` to `TableItem`. Construct a `ParsedPrompt`
      with `content` set on two sections, call `buildTableItems()`, assert
      each returned item has the matching `content`.
- [ ] `report-view.ts` — in `buildTableItems()`, copy `section.content` to
      the `TableItem`.

**Verify:** `pnpm run test -- src/report-view.test.ts` — new test passes.

### Step 4: Editor support — `openSectionInEditor()` + `e` handler

- [ ] `report-view.ts` — add `openSectionInEditor()` method:
      1. Get selected `TableItem`'s `content`.
      2. Guard: return if no `content`.
      3. Sanitize label for filename (`"Base prompt"` → `"base-prompt"`).
      4. Write to temp file: `path.join(os.tmpdir(), 'pi-token-burden-<label>.md')`.
         - Non-file sections (Base prompt, Metadata, SYSTEM.md): prepend
           `<!-- Read-only view. Edits here have no effect. -->\n\n`.
         - File-backed sections (AGENTS.md, Skills): raw content, no header.
      5. Call existing `launchEditor(tempPath)`.
      6. Delete temp file in `finally` block.
- [ ] `report-view.ts` — add `isReadOnlySection()` helper: returns `true`
      for labels starting with `"Base"`, `"Metadata"`, or `"SYSTEM"`.
- [ ] `report-view.ts` — in `handleInput()`, restructure the `e` guard:
      ```ts
      if (data === "e") {
        if (this.state.mode === "sections") {
          this.openSectionInEditor();
        } else if (this.state.mode === "drilldown") {
          this.openDrilldownItemInEditor();
        }
        return;
      }
      ```
- [ ] `report-view.ts` — update sections-mode footer hints to include
      `e edit` (matching drilldown/skill-toggle).

**Verify:** `pnpm run test` — all unit tests pass. `pnpm run typecheck` clean.

### Step 5: E2e test — open section in editor via tmux

- [ ] `src/e2e/overlay.test.ts` — in the `"overlay — open in editor"` describe
      block, add a test:
      ```
      it("should open editor on 'e' in sections mode and recover overlay")
      ```
      Navigate to "Base prompt" row, press `e` (with `EDITOR: "true"`), wait
      for overlay to recover. Assert "Token Burden" and "navigate" visible.
      Follow existing patterns: `VISUAL: ""`, `EDITOR: "true"` for instant
      exit; `sleepMs(1500)` then `waitFor("Token Burden", 10_000)`.

**Verify:** `pnpm run test:e2e` — new e2e test passes alongside existing ones.

### Step 6: Full check + showboat demo

- [ ] `pnpm run check` — all checks pass (lint, format, types, tests, deadcode).
- [ ] Build a showboat demo at `docs/demos/view-base-prompt-in-editor.md`:
      1. Run unit tests, show output.
      2. Run e2e tests, show output.
      3. Show temp file creation: write section content to temp file, `cat`
         the header, then clean up — proves the read-only header works.
      4. `showboat verify` at the end to confirm reproducibility.
