# pi-token-burden

See where your system prompt tokens go.

A [pi](https://github.com/mariozechner/pi) extension that parses the assembled system prompt and shows a token-budget breakdown by section. Run `/context-budget` to see how much of your context window is consumed by the base prompt, AGENTS.md files, skills, SYSTEM.md overrides, and metadata.

## Install

```bash
pi install git:github.com/Whamp/pi-token-burden
```

Or try it for a single session:

```bash
pi -e git:github.com/Whamp/pi-token-burden
```

## Usage

Once installed, type `/context-budget` in any pi session. A TUI panel shows:

```
 Context Budget
System Prompt: 12,450 tokens (49,798 chars) — 6.2% of 200,000 context window

Base prompt                 1,250 tokens   10.0%
SYSTEM.md / APPEND_SYSTEM.md  340 tokens    2.7%
AGENTS.md files             2,860 tokens   23.0%
  /home/user/.pi/agent/AGENTS.md       1,100 tokens    8.8%
  /home/user/project/AGENTS.md         1,760 tokens   14.1%
Skills (42)                 7,800 tokens   62.6%
  brainstorming               180 tokens    1.4%
  tdd                         165 tokens    1.3%
  ...
Metadata (date/time, cwd)     200 tokens    1.6%

 Press Enter or Esc to close
```

Sections exceeding 10% of the system prompt are highlighted.

## Sections

| Section                          | What it measures                                                 |
| -------------------------------- | ---------------------------------------------------------------- |
| **Base prompt**                  | pi's built-in instructions, tool descriptions, guidelines        |
| **SYSTEM.md / APPEND_SYSTEM.md** | Your custom system prompt overrides                              |
| **AGENTS.md files**              | Each AGENTS.md file, listed individually                         |
| **Skills**                       | The `<available_skills>` block, with per-skill breakdown         |
| **Metadata**                     | The `Current date and time` / `Current working directory` footer |

## Token estimation

Tokens are estimated as `ceil(chars / 4)` — the same heuristic pi uses internally. This is a rough approximation, not a tokenizer count.

## Requirements

- [pi](https://github.com/mariozechner/pi) v0.55.1 or later

## Development

```bash
git clone https://github.com/Whamp/pi-token-burden.git
cd pi-token-burden
pnpm install
pnpm run test     # 15 tests
pnpm run check    # lint, typecheck, format, dead code, duplicates, secrets, tests
```

Test locally without installing:

```bash
pi -e ./src/index.ts
```

## License

[MIT](LICENSE)
