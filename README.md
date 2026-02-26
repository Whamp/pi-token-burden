# pi-token-burden

[![npm version](https://img.shields.io/npm/v/pi-token-burden)](https://www.npmjs.com/package/pi-token-burden)
[![CI](https://img.shields.io/github/actions/workflow/status/Whamp/pi-token-burden/check.yml)](https://github.com/Whamp/pi-token-burden/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

See where your system prompt tokens go.

A [pi](https://github.com/mariozechner/pi) extension that parses the assembled
system prompt and shows a token-budget breakdown by section. Run `/token-burden`
to see how much of your context window is consumed by the base prompt, AGENTS.md
files, skills, SYSTEM.md overrides, and metadata.

## Install

```bash
pi install npm:pi-token-burden
```

Or from git:

```bash
pi install git:github.com/Whamp/pi-token-burden
```

To try it for a single session without installing, use `pi -e npm:pi-token-burden`.

### Requirements

- [pi](https://github.com/mariozechner/pi) v0.55.1 or later

## Usage

Type `/token-burden` in any pi session. An overlay appears with a stacked bar
and a drill-down table:

```
 Token Burden
System Prompt: 12,450 tokens (49,798 chars) — 6.2% of 200,000 context window

Base prompt                 1,250 tokens   10.0%
SYSTEM.md / APPEND_SYSTEM.md  340 tokens    2.7%
AGENTS.md files             2,860 tokens   23.0%
  ~/.pi/agent/AGENTS.md               1,100 tokens    8.8%
  /home/user/project/AGENTS.md        1,760 tokens   14.1%
Skills (42)                 7,800 tokens   62.6%
  brainstorming               180 tokens    1.4%
  tdd                         165 tokens    1.3%
  ...
Metadata (date/time, cwd)     200 tokens    1.6%

 Press Enter or Esc to close
```

Sections exceeding 10% of the system prompt are highlighted. Use arrow keys to
navigate, Enter to drill down into children, and `/` to fuzzy-search.

### What each section measures

| Section                          | Content                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| **Base prompt**                  | pi's built-in instructions, tool descriptions, guidelines        |
| **SYSTEM.md / APPEND_SYSTEM.md** | Your custom system prompt overrides                              |
| **AGENTS.md files**              | Each AGENTS.md file, listed individually                         |
| **Skills**                       | The `<available_skills>` block, with per-skill breakdown         |
| **Metadata**                     | The `Current date and time` / `Current working directory` footer |

### Token estimation

Tokens are estimated as `ceil(chars / 4)` — the same heuristic pi uses
internally. This is a rough approximation, not a tokenizer count.

## Development

```bash
git clone https://github.com/Whamp/pi-token-burden.git
cd pi-token-burden
pnpm install
pnpm run test     # 21 tests
pnpm run check    # lint, typecheck, format, dead code, duplicates, secrets, tests
```

Test locally: `pi -e ./src/index.ts`, then type `/token-burden`.

## Contributing

Contributions are welcome. Please open an issue before starting work on
larger changes.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
