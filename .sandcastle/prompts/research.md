# Research GitHub issue #{{ISSUE_NUMBER}}

Title: {{ISSUE_TITLE}}
Labels: {{ISSUE_LABELS}}
Linked or parent references: {{LINKED_REFERENCES}}
Blocker summary: {{BLOCKER_SUMMARY}}
Previous related assets: {{PREVIOUS_ASSETS}}

## Issue body

{{ISSUE_BODY}}

Research the question using high-trust primary sources. Create a cited Markdown artifact at `docs/research/YYYY-MM-DD-issue-{{ISSUE_NUMBER}}-<slug>.md` and commit it. Do not modify production code, run product validation, push, close the issue, or change labels.

Return exactly one machine-readable block:

<researchResult>
{"axis":"research","artifactPath":"docs/research/YYYY-MM-DD-issue-{{ISSUE_NUMBER}}-<slug>.md","summary":"result","evidence":[{"source":"https://primary-source.example","claim":"supported claim"}],"decisions":["decision"],"openQuestions":[],"automationGaps":[]}
</researchResult>
