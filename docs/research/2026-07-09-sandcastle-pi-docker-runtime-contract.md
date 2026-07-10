# Sandcastle Pi/Docker runtime contract for pi-token-burden

Issue: [Research Sandcastle Pi/Docker runtime contract for pi-token-burden](https://github.com/Whamp/pi-token-burden/issues/22)

## Decision summary

Use Sandcastle’s Docker bind-mount sandbox with Sandcastle’s built-in `pi()` agent provider, but check in a repo-specific `.sandcastle/` scaffold instead of relying on the current upstream Pi Dockerfile template verbatim.

The scaffold should:

1. run the whole Pi agent process inside Docker, not host Pi with routed tools;
2. pass model-provider secrets through `.sandcastle/.env`/environment variables, not by mounting Will’s host `~/.pi/agent`;
3. pass GitHub auth through `GH_TOKEN` for issue operations and PR creation;
4. install this repo’s Node dependencies inside the Linux sandbox with `pnpm install --frozen-lockfile`, using a mounted pnpm store/cache for speed;
5. include `tmux` in the image because `pnpm run test:e2e` launches real tmux sessions;
6. keep Pi session capture enabled so Sandcastle can resume/fix/review with filesystem-backed Pi JSONL sessions;
7. report e2e harness failures as automation gaps unless the failure is clearly a product regression.

## Evidence

### Sandcastle + Pi execution model

Sandcastle’s `pi()` provider runs Pi in print/json mode and sends the prompt over stdin:

```text
pi -p --mode json --model <model> [--thinking <level>] [--session <id>]
```

It deliberately does **not** add `--no-session`; fresh runs persist sessions so later phases can resume them. Source: [`src/AgentProvider.ts:637-653`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/AgentProvider.ts#L637-L653).

Sandcastle parses Pi JSON output for:

- `session` headers as `session_id`;
- `message_update` text deltas;
- `tool_execution_start` events;
- `agent_error`/`error` events emitted on stdout;
- final assistant messages from `agent_end`.

Source: [`src/AgentProvider.ts:546-610`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/AgentProvider.ts#L546-L610).

Pi sessions are filesystem JSONL records under `~/.pi/agent/sessions/`, organized by working directory. Source: [Pi 0.80.5 session documentation](https://unpkg.com/@earendil-works/pi-coding-agent@0.80.5/docs/sessions.md).

Sandcastle supports resume only for agents with filesystem-backed sessions, and explicitly treats Pi as one of those file-backed agents. Source: [`docs/adr/0016-resume-requires-filesystem-backed-sessions.md:5-15`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/docs/adr/0016-resume-requires-filesystem-backed-sessions.md#L5-L15).

For Pi specifically, Sandcastle captures a sandbox session, rewrites the JSONL `cwd` from sandbox path to host path, and writes it under the host project’s encoded Pi session directory; resume reverses that transfer into the sandbox. Source: [`src/AgentProvider.ts:500-543`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/AgentProvider.ts#L500-L543).

### Docker boundary and file access

Pi’s own docs recommend “Plain Docker” when the whole Pi process should be isolated. In that pattern, provider API keys enter the container, the project directory is bind-mounted, and mounting the host `~/.pi/agent` exposes host auth/session files. Source: [Pi 0.80.5 containerization documentation](https://unpkg.com/@earendil-works/pi-coding-agent@0.80.5/docs/containerization.md).

Sandcastle’s Docker provider is a bind-mount sandbox provider: it mounts the Sandcastle worktree and git directories into a Docker container, uses `/home/agent` as the sandbox home, injects environment variables, and runs as the host UID/GID by default. Source: [`src/sandboxes/docker.ts:126-199`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/sandboxes/docker.ts#L126-L199).

Sandcastle’s Docker image build command injects host UID/GID build args by default. Source: [`src/cli.ts:545-569`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/cli.ts#L545-L569); rationale in [`docs/adr/0014-docker-uid-alignment-via-build-arg.md:9-47`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/docs/adr/0014-docker-uid-alignment-via-build-arg.md#L9-L47).

### Do not mount Will’s host Pi auth/config

Pi auth can live in `~/.pi/agent/auth.json` or provider-specific environment variables. Auth-file credentials take priority over env vars, and the auth file is also where subscription OAuth tokens live. Source: [Pi 0.80.5 provider and authentication documentation](https://unpkg.com/@earendil-works/pi-coding-agent@0.80.5/docs/providers.md).

Because mounting host `~/.pi/agent` exposes host auth and session files, this workflow should not mount it. Use a sandbox-local `/home/agent/.pi/agent` plus explicit env vars instead. Pi’s Docker docs call out this exposure risk directly. Source: [Pi 0.80.5 containerization documentation](https://unpkg.com/@earendil-works/pi-coding-agent@0.80.5/docs/containerization.md).

Pi project trust matters for non-interactive runs: `-p`, `--mode json`, and `--mode rpc` cannot prompt, so they use `defaultProjectTrust` unless `--approve`/`--no-approve` is passed. Source: [Pi 0.80.5 settings documentation](https://unpkg.com/@earendil-works/pi-coding-agent@0.80.5/docs/settings.md).

Contract: create sandbox-local Pi settings, not secrets, during setup:

```json
{
  "defaultProjectTrust": "never",
  "enableInstallTelemetry": false,
  "retry": { "provider": { "maxRetryDelayMs": 60000 } }
}
```

Use explicit CLI `--model` through Sandcastle’s `pi(model, ...)`; do not depend on a host settings file. If later implementation needs project-local `.pi/settings.json` inside the sandbox, change the runner to pass `--approve` or set `defaultProjectTrust: "always"` in the sandbox-local settings for this repo only.

### Required environment variables

Sandcastle resolves env vars only from `.sandcastle/.env`, with process env as fallback for keys declared there. Repo-root `.env` is not part of Sandcastle env resolution. Source: [`src/EnvResolver.ts:49-70`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/EnvResolver.ts#L49-L70).

Sandcastle init generates `.sandcastle/.gitignore` with `.env`, `logs/`, and `worktrees/`, and generates `.env.example` from the selected agent plus issue tracker env blocks. Source: [`src/InitService.ts:7-10`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/InitService.ts#L7-L10), [`:1052-1072`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/InitService.ts#L1052-L1072).

Check in `.sandcastle/.env.example`; do not check in `.sandcastle/.env`.

Recommended `.sandcastle/.env.example`:

```dotenv
# GitHub CLI token for issue claim/comment/close and PR creation.
# Minimum for issue-only runs: Metadata: read, Issues: read/write.
# For implementation PRs add Contents: read/write and Pull requests: read/write.
GH_TOKEN=

# Pick exactly the provider key used by SANDCASTLE_PI_MODEL.
# Anthropic example:
ANTHROPIC_API_KEY=

# Optional alternatives supported by Pi; uncomment only what the selected model needs.
# OPENAI_API_KEY=
# OPENROUTER_API_KEY=
# GEMINI_API_KEY=
# ZAI_API_KEY=

# Sandcastle runner defaults.
SANDCASTLE_PI_MODEL=anthropic/claude-sonnet-4.5
SANDCASTLE_PI_THINKING=medium
```

GitHub CLI uses `GH_TOKEN` before `GITHUB_TOKEN`, avoiding interactive auth prompts. Source: [GitHub CLI v2.96.0 environment-help implementation](https://github.com/cli/cli/blob/b300f2ec7ec9dc9addc39b2ad88c54097ded7ca0/pkg/cmd/root/help_topic.go#L42-L55).

Sandcastle’s GitHub Issues scaffold currently documents `GH_TOKEN` with required repository permissions “Issues (Read and write)” and “Metadata (Read)”. Source: [`src/InitService.ts:530-543`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/InitService.ts#L530-L543).

PR-opening runs also need PR and branch push rights. GitHub’s fine-grained PAT permissions docs map PR creation to `Pull requests: write`; branch pushes require contents write access. Sources: GitHub's pinned OpenAPI definitions for [creating pull requests](https://github.com/github/rest-api-description/blob/a9dce36dbdd2476e3b52d76044de6caba729d6d0/descriptions/api.github.com/api.github.com.json#L67897-L67907) and [creating Git references](https://github.com/github/rest-api-description/blob/a9dce36dbdd2476e3b52d76044de6caba729d6d0/descriptions/api.github.com/api.github.com.json#L58654-L58665).

### Docker image contents

Use a repo-specific Dockerfile, based on Sandcastle’s generated Pi Dockerfile but updated for this repo:

- `node:24-bookworm` or `node:24-bookworm-slim`, matching Pi’s current Node 24 docs;
- `git`, `curl`, `jq`, `gh`, `tmux`, `ca-certificates`, and shell basics;
- `corepack enable` plus pnpm 10.3.0, matching `package.json`;
- current Pi package `@earendil-works/pi-coding-agent`, not deprecated `@mariozechner/pi-coding-agent`.

Evidence:

- Pi docs’ Dockerfile installs `@earendil-works/pi-coding-agent` on Node 24. Source: [Pi 0.80.5 containerization documentation](https://unpkg.com/@earendil-works/pi-coding-agent@0.80.5/docs/containerization.md).
- Sandcastle 0.12.0’s current Pi template still installs deprecated `@mariozechner/pi-coding-agent`. Source: [`src/InitService.ts:242-263`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/InitService.ts#L242-L263); npm marks `@mariozechner/pi-coding-agent@0.73.1` deprecated in favor of `@earendil-works/pi-coding-agent`.
- This repo declares `packageManager: "pnpm@10.3.0"` and scripts for `check` and `test:e2e`. Source: `package.json:23-37`, `package.json:71`.
- `pnpm run test:e2e` uses Vitest’s e2e config. Source: `vitest.config.e2e.ts:1-10`.
- The e2e harness shells out to `tmux`, launches `pi -e ./src/index.ts`, and defaults to `--provider zai --model glm-4.7`. Source: `src/e2e/tmux-harness.ts:56-85`.

Recommended Dockerfile sketch:

```dockerfile
FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash ca-certificates curl git jq ripgrep tmux \
  && rm -rf /var/lib/apt/lists/*

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list >/dev/null \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

ARG AGENT_UID=1000
ARG AGENT_GID=1000
RUN groupmod -o -g $AGENT_GID node \
  && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node

RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent
RUN corepack enable && corepack prepare pnpm@10.3.0 --activate

USER ${AGENT_UID}:${AGENT_GID}
ENV HOME=/home/agent
WORKDIR /home/agent
ENTRYPOINT ["sleep", "infinity"]
```

### Dependencies: install in sandbox, do not copy host `node_modules` by default

Sandcastle templates commonly use `copyToWorktree: ["node_modules"]` for speed, with a sandbox install hook as a fallback. Source: [`src/InitService.ts:675`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/InitService.ts#L675) and [`src/templates/parallel-planner/main.mts`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/templates/parallel-planner/main.mts).

For this repo’s AFK workflow, prefer correctness and reproducibility over copying `node_modules`:

```ts
hooks: {
  sandbox: {
    onSandboxReady: [
      { command: "mkdir -p ~/.pi/agent && printf '%s\n' '{\"defaultProjectTrust\":\"never\",\"enableInstallTelemetry\":false}' > ~/.pi/agent/settings.json" },
      { command: "pnpm install --frozen-lockfile" }
    ]
  }
}
```

Use Docker `mounts` for caches instead of copying dependency trees:

```ts
sandbox: docker({
  mounts: [
    { hostPath: ".sandcastle/cache/pnpm-store", sandboxPath: "/home/agent/.local/share/pnpm/store" }
  ]
})
```

Rationale: the sandbox is Linux with its own Node/Pi/gh/tmux versions; installing inside the image/worktree avoids host/container ABI or package-manager drift. The cache mount keeps repeat runs fast without treating host `node_modules` as an input artifact.

### Commands available in the sandbox

The checked-in workflow should be able to assume these commands exist inside the sandbox:

- `pi` — agent provider command used by Sandcastle;
- `node`, `npm`, `corepack`, `pnpm` — repo build/test toolchain;
- `git` — Sandcastle worktree/branch operations and agent git inspection;
- `gh` — issue claim/comment/close and PR creation;
- `tmux` — e2e TUI test harness;
- `jq`, `ripgrep`, `bash`, `curl`, `ca-certificates` — prompt shell expressions, diagnostics, and script glue.

Sandcastle prompt shell expressions run inside the sandbox after `sandbox.onSandboxReady` hooks complete, so `gh`, `pnpm`, and any dynamic-context command used by prompts must work in the sandbox before the agent starts. Source: [`README.md:579-583`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/README.md#L579-L583).

### e2e risks in AFK/container execution

`pnpm run test:e2e` is required for implementation work by the map. It is higher-risk than unit checks in a Sandcastle Docker run because:

1. It starts real tmux sessions and kills stale sessions by fixed names; concurrent AFK runs in the same sandbox/container can collide if names are not unique. Source: `src/e2e/tmux-harness.ts:45-85`, `:123-135`.
2. It launches nested Pi processes with `pi -e ./src/index.ts`; those nested Pi processes need provider credentials for `--provider zai --model glm-4.7` unless tests are adjusted to use a provider available in the sandbox. Sources: `src/e2e/tmux-harness.ts:56-85` and the [Pi 0.80.5 provider environment-variable reference](https://unpkg.com/@earendil-works/pi-coding-agent@0.80.5/docs/providers.md).
3. It relies on temp `PI_CODING_AGENT_DIR` directories to isolate user settings; the sandbox must allow temp-dir creation and cleanup. Source: `src/e2e/agent-dir.ts:5-23`.
4. The test timeout is 30s per e2e test and hook timeout is 20s, while at least one e2e setup waits up to 120s for Pi startup; slow cold installs, network stalls, or provider delays can look like harness failure. Source: `vitest.config.e2e.ts:3-10`, `src/e2e/overlay.test.ts:134-153`.

Contract: implementation runs must execute `pnpm run check` and `pnpm run test:e2e`. If e2e fails because `tmux`, `pi`, provider credentials, terminal behavior, or sandbox permissions are missing, the workflow should report an “automation gap” with logs and leave the ticket/PR blocked rather than silently skipping e2e.

## Implementation-ready runtime contract

### Minimal runner shape

```ts
import { resolve } from "node:path";

import { createSandbox, pi } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

const sandbox = await createSandbox({
  baseBranch: "main",
  branch: "sandcastle/issue-<number>",
  sandbox: docker({
    imageName: "pi-token-burden-sandcastle:local",
    mounts: [
      {
        hostPath: resolve(".sandcastle", "cache", "pnpm-store"),
        sandboxPath: "/home/agent/.local/share/pnpm/store",
      },
    ],
  }),
});

await sandbox.exec(
  "mkdir -p ~/.pi/agent && printf '%s\\n' " +
    "'{\"defaultProjectTrust\":\"never\",\"enableInstallTelemetry\":false}' " +
    "> ~/.pi/agent/settings.json",
);
await sandbox.exec(
  "pnpm install --frozen-lockfile --store-dir /home/agent/.local/share/pnpm/store",
);

const result = await sandbox.run({
  agent: pi("anthropic/claude-sonnet-4.5", {
    captureSessions: true,
    thinking: "medium",
  }),
  name: "implement",
  promptArgs: { ISSUE_NUMBER: "<number>" },
  promptFile: ".sandcastle/prompts/implement.md",
});
```

Use one warm sandbox per claimed issue so implement → review → fix can use `result.resume(...)` / `sandbox.run({ resumeSession })` without losing session context. Sandcastle documents `createSandbox()` as keeping the same branch/container alive across multiple runs so installed dependencies and build artifacts persist. Source: [`README.md:292-312`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/README.md#L292-L312). Sandcastle 0.11.0+ added `createSandbox().run()` resume support inside an existing warm sandbox; changelog evidence is in [`CHANGELOG.md`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/CHANGELOG.md) under 0.11.0.

Runtime limitations the orchestration must respect:

- bind-mount `run()` defaults to `branchStrategy: { type: "head" }`, and `copyToWorktree` is invalid in head mode; use `createSandbox()` or an explicit branch strategy for per-ticket branches. Source: [`src/run.ts:507-531`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/run.ts#L507-L531).
- `resumeSession` is one iteration only and cannot be combined with `maxIterations > 1`. Source: [`src/run.ts:534-539`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/run.ts#L534-L539).
- default logs are written under `.sandcastle/logs/`. Source: [`src/run.ts:646-655`](https://github.com/mattpocock/sandcastle/blob/e99f832f26dc9d245c019a9ddd19fa5dee792427/src/run.ts#L646-L655).

### Validation policy

- Research tickets: no default `pnpm run check`; produce a cited Markdown artifact and issue comment.
- Implementation tickets: run `pnpm run check`, then `pnpm run test:e2e`.
- A missing e2e prerequisite is a workflow failure/automation gap, not success.

### Branch and PR policy dependencies

This ticket does not choose branch names or PR creation rules; those belong to [Design Sandcastle AFK loop orchestration](https://github.com/Whamp/pi-token-burden/issues/24). Runtime constraints that issue must honor:

- use a deterministic per-ticket branch, e.g. `sandcastle/issue-<number>`;
- token must support issue writes, branch push, and PR write;
- keep PRs as the default landing surface until reliability is proven, matching the map’s Notes.

## Open risks for downstream design

- Sandcastle’s current Pi Dockerfile template still uses deprecated `@mariozechner/pi-coding-agent`; this repo’s scaffold should override it with `@earendil-works/pi-coding-agent`.
- The e2e harness currently hardcodes `--provider zai --model glm-4.7`; the Sandcastle env must include `ZAI_API_KEY`, or the implementation should update the harness/runner to inject a provider/model available in AFK.
- `defaultProjectTrust: "never"` is safest for AFK, but any future dependence on project-local `.pi/settings.json` or project-local Pi packages requires an explicit trust decision in the sandbox contract.
