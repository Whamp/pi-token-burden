# Implement GitHub issue #{{ISSUE_NUMBER}}

Title: {{ISSUE_TITLE}}
Route validation: {{ROUTE_VALIDATION}}
Prior output: {{PRIOR_OUTPUT}}

## Issue body

{{ISSUE_BODY}}

## Branch contract

- Work only on `{{BRANCH}}`, based on `{{BASE_BRANCH}}`.
- Read `AGENTS.md`, relevant domain documentation, and existing tests first.
- Follow red/green TDD at stable public seams.
- Implement only the issue scope.
- Commit the implementation and tests before returning.
- Do not push, create a PR, close the issue, or change issue labels.
- The runner executes validation itself; report your local observations honestly.

Return exactly:

<implementationResult>
{"axis":"implement","attempt":1,"filesChanged":["path"],"rationale":"what and why","validation":{"check":{"status":"pass","logPath":"path-or-runner-owned"},"testE2E":{"status":"skipped","logPath":"path-or-runner-owned","reasonIfSkipped":"runner executes this"}},"nextAction":"review","artifacts":["path"],"riskNotes":[]}
</implementationResult>
