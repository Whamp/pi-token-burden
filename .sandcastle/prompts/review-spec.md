# Specification review for issue #{{ISSUE_NUMBER}}

Title: {{ISSUE_TITLE}}

## Issue body

{{ISSUE_BODY}}

Review the committed diff `{{BASE_BRANCH}}...{{BRANCH}}` without editing files. Determine whether it completely implements this issue without scope creep. Inspect linked or parent issue context referenced by the body. Report exact file and line evidence.

<reviewSpec>
{"axis":"spec","verdict":"pass","findings":[],"blocking":false}
</reviewSpec>

A failing example is:

<reviewSpec>
{"axis":"spec","verdict":"fail","findings":[{"file":"path/file.ts","line":42,"severity":"high","issue":"Missing or incorrect requirement","requiredFix":"Concrete required correction"}],"blocking":true}
</reviewSpec>
