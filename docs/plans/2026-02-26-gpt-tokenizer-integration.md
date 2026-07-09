# gpt-tokenizer Integration Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Replace the `ceil(chars/4)` heuristic with real BPE tokenization via `gpt-tokenizer`, using `o200k_base` encoding by default.

**Architecture:** The change is contained in `src/parser.ts`. The single `estimateTokens()` function switches from a character-based heuristic to calling `encode()` from `gpt-tokenizer/encoding/o200k_base`. All downstream consumers (`report-view.ts`, `utils.ts`) read the `.tokens` values the parser produces — they don't call `estimateTokens` directly, so they need zero changes. Tests update to assert real BPE token counts instead of `ceil(chars/4)`.

**Tech Stack:** `gpt-tokenizer` (pure JS, `o200k_base` encoding), Vitest, TypeScript.

---

### Task 1: Move gpt-tokenizer to dependencies

**TDD scenario:** Trivial change — use judgment.

**Files:**
- Modify: `package.json` (move `gpt-tokenizer` from `devDependencies` to `dependencies`)

**Step 1: Edit package.json**

Move the `"gpt-tokenizer": "^3.4.0"` line from `devDependencies` to a new `dependencies` block:

```json
"dependencies": {
  "gpt-tokenizer": "^3.4.0"
},
```

Remove the `"gpt-tokenizer"` line from `devDependencies`.

**Step 2: Run pnpm install**

Run: `pnpm install`
Expected: clean install, no errors.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: move gpt-tokenizer to dependencies"
```

---

### Task 2: Update estimateTokens() tests

**TDD scenario:** Modifying tested code — write the new tests first, watch them fail.

**Files:**
- Modify: `src/parser.test.ts` (lines 1-11, the `estimateTokens()` describe block)

**Step 1: Replace the estimateTokens test block**

The current tests assert `ceil(chars/4)` behavior. Replace the entire `describe("estimateTokens()")` block with tests that verify real BPE tokenization:

```typescript
describe("estimateTokens()", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns real BPE token count for English text", () => {
    // "Hello, world!" is 4 tokens in o200k_base
    const tokens = estimateTokens("Hello, world!");
    expect(tokens).toBe(4);
  });

  it("returns real BPE token count for code", () => {
    const code = 'const x = 42;\nconsole.log(x);';
    const tokens = estimateTokens(code);
    // BPE tokenizes code differently than prose; just verify it's a positive integer
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });
});
```

**Step 2: Run the tests to verify they fail**

Run: `pnpm run test`
Expected: The `"Hello, world!"` test FAILS because the heuristic returns `ceil(13/4) = 4` — wait, that happens to match. Let's verify the exact o200k_base count first.

Run: `node -e "import('gpt-tokenizer/encoding/o200k_base').then(m => console.log(m.encode('Hello, world!').length))"`
Use that value in the test. If it's 4, use a different string where the heuristic diverges, such as `"Read files before editing."` (heuristic: 8, BPE: likely ~5).

Run: `node -e "import('gpt-tokenizer/encoding/o200k_base').then(m => console.log(m.encode('Read files before editing.').length))"`

Update the test assertion to use the actual BPE count for whichever string you choose. The test must fail against the current heuristic.

**Step 3: Commit the failing test**

```bash
git add src/parser.test.ts
git commit -m "test: update estimateTokens tests for BPE tokenization"
```

---

### Task 3: Replace estimateTokens() with BPE encoding

**TDD scenario:** Making the failing test pass.

**Files:**
- Modify: `src/parser.ts` (lines 21-24)

**Step 1: Replace the function**

Change the import and function at the top of `src/parser.ts`:

```typescript
import { encode } from "gpt-tokenizer/encoding/o200k_base";
```

Replace:
```typescript
/** Token estimate using pi's built-in heuristic: ceil(chars / 4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

With:
```typescript
/** Token count using BPE tokenization (o200k_base encoding). */
export function estimateTokens(text: string): number {
  return encode(text).length;
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm run test`
Expected: The `estimateTokens` tests PASS. Some `parseSystemPrompt` tests may fail — specifically the one on line 83 that asserts `result.totalTokens === Math.ceil(prompt.length / 4)`. That's expected and fixed in the next task.

**Step 3: Commit**

```bash
git add src/parser.ts
git commit -m "feat: replace heuristic with BPE tokenization via gpt-tokenizer"
```

---

### Task 4: Fix parseSystemPrompt test assertions

**TDD scenario:** Modifying tested code — fix assertions that hardcoded the heuristic formula.

**Files:**
- Modify: `src/parser.test.ts` (line 83)

**Step 1: Fix the totalTokens assertion**

Find this line in `parser.test.ts`:
```typescript
expect(result.totalTokens).toBe(Math.ceil(prompt.length / 4));
```

Replace with:
```typescript
expect(result.totalTokens).toBeGreaterThan(0);
expect(Number.isInteger(result.totalTokens)).toBe(true);
```

We can't assert an exact BPE count for the multi-line test prompt since it would be brittle. Asserting it's a positive integer is sufficient — the `estimateTokens()` unit tests already verify BPE correctness.

**Step 2: Run tests to verify all pass**

Run: `pnpm run test`
Expected: ALL tests PASS (21 tests).

**Step 3: Commit**

```bash
git add src/parser.test.ts
git commit -m "test: relax totalTokens assertion to work with BPE"
```

---

### Task 5: Update knip config and run full checks

**TDD scenario:** Trivial change — use judgment.

**Files:**
- Possibly modify: `knip.json` (if knip flags `gpt-tokenizer` as unused — it shouldn't since it's imported in `src/parser.ts`, but verify)

**Step 1: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS with no errors.

**Step 2: Run the full check suite**

Run: `pnpm run check`
Expected: All checks pass (lint, format, typecheck, test, deadcode, duplicates, secrets).

If `knip` flags `gpt-tokenizer` as unused (unlikely since `src/parser.ts` imports it), add it to `ignoreDependencies` in `knip.json`.

**Step 3: Commit any config changes**

```bash
# Only if knip.json was modified:
git add knip.json
git commit -m "chore: update knip config for gpt-tokenizer"
```

---

### Task 6: Update documentation

**TDD scenario:** Trivial change — use judgment.

**Files:**
- Modify: `AGENTS.md` (update the "Token estimation uses `ceil(chars / 4)`" reference)

**Step 1: Update AGENTS.md**

In the Architecture section, find:
```
Token estimation uses `ceil(chars / 4)`.
```

Replace with:
```
Token estimation uses BPE tokenization via `gpt-tokenizer` (`o200k_base` encoding).
```

In the Utilities table, find:
```
| Estimate tokens from chars | `estimateTokens()`   | `src/parser.ts` |
```

Replace with:
```
| BPE token count (o200k_base) | `estimateTokens()`   | `src/parser.ts` |
```

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for BPE tokenization"
```

---

### Task 7: Final verification

**Step 1: Run the full check suite one more time**

Run: `pnpm run check`
Expected: All checks pass.

**Step 2: Manual test**

Run: `pi -e ./src/index.ts`
Then type: `/token-burden`
Expected: The overlay renders with token counts. Numbers should differ from previous runs (they'll be more accurate now).

**Step 3: Run the comparison script to verify improvement**

Run: `pnpm compare-tokenizers`
Expected: The heuristic column still shows `ceil(chars/4)` values (the script has its own heuristic function), but the BPE column should match what `/token-burden` now reports.
