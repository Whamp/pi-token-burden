# Changelog


## v0.3.0...main

[compare changes](https://github.com/Whamp/pi-token-burden/compare/v0.3.0...main)

### 🚀 Enhancements

- View any section in editor from sections mode ([7bd4138](https://github.com/Whamp/pi-token-burden/commit/7bd4138))

### 🩹 Fixes

- Drop md files from lint-staged oxfmt rule ([f0dc971](https://github.com/Whamp/pi-token-burden/commit/f0dc971))
- Don't delete temp file after editor exits ([bf6406f](https://github.com/Whamp/pi-token-burden/commit/bf6406f))

### 🏡 Chore

- Update memory state ([0879333](https://github.com/Whamp/pi-token-burden/commit/0879333))
- Update memory state ([6884b9f](https://github.com/Whamp/pi-token-burden/commit/6884b9f))

### ❤️ Contributors

- Will Hampson <will@ggl.slmail.me>

## v0.1.3...main

[compare changes](https://github.com/Whamp/pi-token-burden/compare/v0.1.3...main)

### 🚀 Enhancements

- Replace heuristic with BPE tokenization via gpt-tokenizer ([6366044](https://github.com/Whamp/pi-token-burden/commit/6366044))
- Replace heuristic with BPE tokenization via gpt-tokenizer ([#1](https://github.com/Whamp/pi-token-burden/pull/1))
- Add skill toggle types and fast-check dependency ([876b334](https://github.com/Whamp/pi-token-burden/commit/876b334))
- Add skill discovery module with filesystem scanning ([7fddba3](https://github.com/Whamp/pi-token-burden/commit/7fddba3))
- Add skill persistence module with settings and frontmatter support ([ad9f3b2](https://github.com/Whamp/pi-token-burden/commit/ad9f3b2))
- Add skill-toggle mode to BudgetOverlay ([80182cb](https://github.com/Whamp/pi-token-burden/commit/80182cb))
- Wire skill discovery into /token-burden command ([bdd19b6](https://github.com/Whamp/pi-token-burden/commit/bdd19b6))
- Add tmux e2e harness, vitest e2e config, and test:e2e script ([250e904](https://github.com/Whamp/pi-token-burden/commit/250e904))
- E2e TUI tests via tmux (#skill-toggle) ([86e7aaa](https://github.com/Whamp/pi-token-burden/commit/86e7aaa))
- Add getEditor() helper ([83147ea](https://github.com/Whamp/pi-token-burden/commit/83147ea))
- Open skill in editor with 'e' key in skill-toggle mode ([f755f1f](https://github.com/Whamp/pi-token-burden/commit/f755f1f))
- Support 'e' to edit AGENTS.md files in drilldown mode ([8c89ace](https://github.com/Whamp/pi-token-burden/commit/8c89ace))

### 🩹 Fixes

- **ci:** Specify pnpm version in package.json and ignore scripts dir ([1237674](https://github.com/Whamp/pi-token-burden/commit/1237674))
- **ci:** Ignore gpt-tokenizer in knip and fix gitleaks path ([8b32b66](https://github.com/Whamp/pi-token-burden/commit/8b32b66))
- Resolve disable paths from settings base dir, add rollback and package discovery ([b0bac61](https://github.com/Whamp/pi-token-burden/commit/b0bac61))
- Address code review findings (P1 nav bounds, P2 persistence/settings/scan) ([4409611](https://github.com/Whamp/pi-token-burden/commit/4409611))
- Update skill modes after successful save to prevent UI snap-back ([be38683](https://github.com/Whamp/pi-token-burden/commit/be38683))
- Scope lint ignore to src/e2e/ instead of all test files ([091eb58](https://github.com/Whamp/pi-token-burden/commit/091eb58))

### 📖 Documentation

- Add skill toggle integration plan ([3a4ac1a](https://github.com/Whamp/pi-token-burden/commit/3a4ac1a))
- Add e2e TUI tests implementation plan ([2b6df7e](https://github.com/Whamp/pi-token-burden/commit/2b6df7e))
- Update AGENTS.md with e2e test commands and file map ([bcb86bf](https://github.com/Whamp/pi-token-burden/commit/bcb86bf))
- Add open-skill-in-editor implementation plan ([8128dca](https://github.com/Whamp/pi-token-burden/commit/8128dca))

### 📦 Build

- Move gpt-tokenizer to dependencies ([f1120e5](https://github.com/Whamp/pi-token-burden/commit/f1120e5))

### 🏡 Chore

- Migrate agent memory from .gcc to .memory ([d6c96b4](https://github.com/Whamp/pi-token-burden/commit/d6c96b4))
- Update memory state ([de7676e](https://github.com/Whamp/pi-token-burden/commit/de7676e))

### ✅ Tests

- Update estimateTokens tests for BPE tokenization ([0d861fc](https://github.com/Whamp/pi-token-burden/commit/0d861fc))
- Relax totalTokens assertion to work with BPE ([974756b](https://github.com/Whamp/pi-token-burden/commit/974756b))
- Add e2e overlay rendering and navigation tests ([7fa96e7](https://github.com/Whamp/pi-token-burden/commit/7fa96e7))
- Add e2e skill-toggle mode tests ([9e9a969](https://github.com/Whamp/pi-token-burden/commit/9e9a969))
- Add failing tests for getEditor() ([f5a0d23](https://github.com/Whamp/pi-token-burden/commit/f5a0d23))
- Add e2e tests for open-skill-in-editor ([8336717](https://github.com/Whamp/pi-token-burden/commit/8336717))

### ❤️ Contributors

- Will Hampson <will@ggl.slmail.me>

## v0.1.3...main

[compare changes](https://github.com/Whamp/pi-token-burden/compare/v0.1.3...main)

### 🚀 Enhancements

- Replace heuristic with BPE tokenization via gpt-tokenizer ([6366044](https://github.com/Whamp/pi-token-burden/commit/6366044))
- Replace heuristic with BPE tokenization via gpt-tokenizer ([#1](https://github.com/Whamp/pi-token-burden/pull/1))

### 🩹 Fixes

- **ci:** Specify pnpm version in package.json and ignore scripts dir ([1237674](https://github.com/Whamp/pi-token-burden/commit/1237674))
- **ci:** Ignore gpt-tokenizer in knip and fix gitleaks path ([8b32b66](https://github.com/Whamp/pi-token-burden/commit/8b32b66))

### 📦 Build

- Move gpt-tokenizer to dependencies ([f1120e5](https://github.com/Whamp/pi-token-burden/commit/f1120e5))

### ✅ Tests

- Update estimateTokens tests for BPE tokenization ([0d861fc](https://github.com/Whamp/pi-token-burden/commit/0d861fc))
- Relax totalTokens assertion to work with BPE ([974756b](https://github.com/Whamp/pi-token-burden/commit/974756b))

### ❤️ Contributors

- Will Hampson <will@ggl.slmail.me>

## v0.1.2...main

[compare changes](https://github.com/Whamp/pi-token-burden/compare/v0.1.2...main)

### 📖 Documentation

- Add banner image to README ([e6205c0](https://github.com/Whamp/pi-token-burden/commit/e6205c0))

### ❤️ Contributors

- Will Hampson <will@ggl.slmail.me>

## v0.1.1...main

[compare changes](https://github.com/Whamp/pi-token-burden/compare/v0.1.1...main)

### 📖 Documentation

- Document changelog workflow in AGENTS.md and README.md ([b07eb9a](https://github.com/Whamp/pi-token-burden/commit/b07eb9a))
- Improve README structure, add badges and contributing section ([d64d5db](https://github.com/Whamp/pi-token-burden/commit/d64d5db))

### ❤️ Contributors

- Will Hampson <will@ggl.slmail.me>

## v0.1.0...main

[compare changes](https://github.com/Whamp/pi-token-burden/compare/v0.1.0...main)

### 🏡 Chore

- Add changelog with changelogen automation ([733e203](https://github.com/Whamp/pi-token-burden/commit/733e203))

### ❤️ Contributors

- Will Hampson <will@ggl.slmail.me>

## v0.1.0

### 🚀 Enhancements

- Add system prompt parser with section breakdown ([b44950e](https://github.com/Whamp/pi-token-burden/commit/b44950e))
- Add report formatter for parsed prompt sections ([1869f66](https://github.com/Whamp/pi-token-burden/commit/1869f66))
- Add TUI report view component for context budget ([3edf37d](https://github.com/Whamp/pi-token-burden/commit/3edf37d))
- Register /context-budget command ([1e2b236](https://github.com/Whamp/pi-token-burden/commit/1e2b236))
- Redesign report UI with overlay, visualization bars, and drill-down table ([20a9903](https://github.com/Whamp/pi-token-burden/commit/20a9903))

### 📖 Documentation

- Add context budget analyzer implementation plan ([b5185da](https://github.com/Whamp/pi-token-burden/commit/b5185da))
- Add README and MIT license ([1a31edb](https://github.com/Whamp/pi-token-burden/commit/1a31edb))
- Add report UI redesign plan ([174689a](https://github.com/Whamp/pi-token-burden/commit/174689a))

### 🏡 Chore

- Remove unused pi-ai dependency ([2861629](https://github.com/Whamp/pi-token-burden/commit/2861629))
- Pass all checks — fix lint, typecheck, dead code ([49a8176](https://github.com/Whamp/pi-token-burden/commit/49a8176))
- Declare pi runtime deps as peerDependencies ([d302264](https://github.com/Whamp/pi-token-burden/commit/d302264))
- Rename project to pi-token-burden ([336a782](https://github.com/Whamp/pi-token-burden/commit/336a782))
- Remove private flag ([845ecdc](https://github.com/Whamp/pi-token-burden/commit/845ecdc))
- Move pi packages to peerDependencies, skip devDeps on install ([45f4787](https://github.com/Whamp/pi-token-burden/commit/45f4787))
- Skip peer dep auto-install for pi install ([db835ad](https://github.com/Whamp/pi-token-burden/commit/db835ad))
- Suppress husky not-found noise on install ([2c018c3](https://github.com/Whamp/pi-token-burden/commit/2c018c3))
- Remove prepare script to silence npm install output ([4b49e81](https://github.com/Whamp/pi-token-burden/commit/4b49e81))
- Add husky to knip ignoreDependencies ([9ca396a](https://github.com/Whamp/pi-token-burden/commit/9ca396a))

### ❤️ Contributors

- Will Hampson <will@ggl.slmail.me>
