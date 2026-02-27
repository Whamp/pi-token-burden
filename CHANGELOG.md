# Changelog


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
