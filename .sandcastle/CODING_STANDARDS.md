# Sandcastle agent guardrails

The repository root `AGENTS.md` is authoritative. Child agents must read it before changing files and must use the project’s existing domain language and tests.

- Work only on the claimed issue and deterministic `sandcastle/issue-<n>` branch.
- Use red/green TDD at stable public seams.
- Do not use `any`, unchecked type assertions, or unvalidated external JSON.
- Do not push, create or merge PRs, close issues, or change labels; the runner owns lifecycle operations.
- Implementation and fix agents commit their code. Review agents never edit files.
- Do not report validation success; the runner executes and records validation.
- Preserve unrelated work and avoid speculative cleanup.
