# Standards review for issue #{{ISSUE_NUMBER}}

Review the committed diff `{{BASE_BRANCH}}...{{BRANCH}}` without editing files. Read the repository `AGENTS.md`, `.sandcastle/CODING_STANDARDS.md`, and applicable checked-in standards. Check machine gates where useful. Report only actionable standards violations with exact file and line evidence.

<reviewStandards>
{"axis":"standards","verdict":"pass","findings":[],"blocking":false}
</reviewStandards>

A failing example is:

<reviewStandards>
{"axis":"standards","verdict":"fail","findings":[{"file":"path/file.ts","line":42,"severity":"high","issue":"Rule ID and concrete violation","requiredFix":"Concrete required correction"}],"blocking":true}
</reviewStandards>
