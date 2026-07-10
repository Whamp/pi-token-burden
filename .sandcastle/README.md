# Sandcastle AFK runner

The checked-in runner drains eligible `ready-for-agent` issues using the routing and orchestration contracts resolved in issues #22–#24.

## Files

- `afk-runner.ts` — thin queue-draining entrypoint.
- `lib/` — validated routing, atomic GitHub claims, and warm-sandbox workflows.
- `prompts/` — research, implementation, parallel review, and fix contracts.
- `Dockerfile` — pinned Pi execution image.
- `.env.example` — host and sandbox environment variables.

## Setup

```bash
cp .sandcastle/.env.example .sandcastle/.env
# Fill GH_TOKEN and the provider key selected by SANDCASTLE_PI_MODEL.

docker build \
  --build-arg AGENT_UID="$(id -u)" \
  --build-arg AGENT_GID="$(id -g)" \
  -f .sandcastle/Dockerfile \
  -t pi-token-burden-sandcastle:local .

pnpm install --frozen-lockfile
pnpm run sandcastle
```

The runner loads `.sandcastle/.env` itself; do not `source` it. Sandcastle injects those variables into the Docker sandbox without mounting host Pi configuration.

## Behavior

1. Run one coarse GitHub search per supported route label, merge results, and sort by `createdAt` then issue number.
2. Immediately revalidate route, exact assignee set, and native or fallback blockers before and after claim.
3. Create one warm Docker sandbox on `sandcastle/issue-<number>`.
4. Research tickets create and commit a cited `docs/research/` artifact without product validation.
5. Implementation tickets run parallel Standards and Spec reviews, persist JSON and logs under `.sandcastle/reports/issue-<number>/`, resume the implementation session for fixes, and allow at most three passes.
6. The runner executes `pnpm run check` and `pnpm run test:e2e` after every implementation pass. Skips and runtime gaps fail closed.
7. Successful branches are pushed before reporting. Implementations open or reuse a PR; terminal failures are commented, relabeled `ready-for-human`, and unassigned.
8. Discovery continues until no eligible issue remains.

## Local verification

```bash
pnpm run test:sandcastle
pnpm run typecheck:sandcastle
pnpm run check
pnpm run test:e2e
```
