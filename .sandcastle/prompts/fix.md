# Fix pass {{ATTEMPT}} for issue #{{ISSUE_NUMBER}}

Continue the existing implementation session on `{{BRANCH}}` based on `{{BASE_BRANCH}}`.

Resolve every actionable item in this fix context. Add or adjust tests first where behavior changes. Commit the fixes. Do not push, create a PR, close the issue, or change labels. The runner executes authoritative validation.

## Fix context

{{FINDINGS}}

Return exactly:

<implementationResult>
{"axis":"implement","attempt":{{ATTEMPT}},"filesChanged":["path"],"rationale":"what was fixed","validation":{"check":{"status":"pass","logPath":"path-or-runner-owned"},"testE2E":{"status":"skipped","logPath":"path-or-runner-owned","reasonIfSkipped":"runner executes this"}},"nextAction":"review","artifacts":["path"],"riskNotes":[]}
</implementationResult>
