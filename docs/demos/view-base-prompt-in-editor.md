# View Base Prompt in Editor

*2026-03-11T04:32:55Z by Showboat 0.6.1*
<!-- showboat-id: ee32e4a6-017e-4f83-8de7-47a001b09898 -->

Pressing `e` in sections mode writes the section content to a unique temp file, opens the user's editor, then cleans up. Non-file sections (Base prompt, Metadata, SYSTEM.md) include a read-only header. File-backed sections (AGENTS.md, Skills) skip the header.

## Unit tests (76 pass)

```bash
cd /home/will/projects/pi-token-burden && pnpm run test 2>&1 | grep 'Tests ' | sed 's/^ *//' 
```

```output
[2m      Tests [22m [1m[32m76 passed[39m[22m[90m (76)[39m
```

## Key new tests

```bash
cd /home/will/projects/pi-token-burden && npx vitest run --reporter=verbose src/report-view.test.ts src/parser.test.ts 2>&1 | grep -E '(isReadOnly|propagate content|populates content)' | sed 's/ [0-9]*ms//'
```

```output
 [32m✓[39m src/report-view.test.ts[2m > [22mbuildTableItems — table items[2m > [22mshould propagate content from PromptSection to TableItem[32m 0[2mms[22m[39m
 [32m✓[39m src/report-view.test.ts[2m > [22misReadOnlySection — read-only detection[2m > [22mreturns true for generated sections[32m 0[2mms[22m[39m
 [32m✓[39m src/report-view.test.ts[2m > [22misReadOnlySection — read-only detection[2m > [22mreturns false for file-backed sections[32m 0[2mms[22m[39m
 [32m✓[39m src/parser.test.ts[2m > [22mparseSystemPrompt()[2m > [22mpopulates content for every section[32m 0[2mms[22m[39m
 [32m✓[39m src/parser.test.ts[2m > [22mparseSystemPrompt()[2m > [22mpopulates content for SYSTEM.md gap section[32m 0[2mms[22m[39m
```

## E2e tests (21 pass, including 2 new)
