import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

/** GitHub issue payload returned by `gh issue list/view --json`. */
export const GITHUB_ISSUE_SCHEMA = Type.Object(
  {
    assignees: Type.Array(Type.Object({ login: Type.String() })),
    body: Type.String(),
    createdAt: Type.String(),
    labels: Type.Array(Type.Object({ name: Type.String() })),
    number: Type.Integer(),
    state: Type.String(),
    title: Type.String(),
  },
  { additionalProperties: true },
);

/** GitHub issue-list payload. */
export const GITHUB_ISSUE_LIST_SCHEMA = Type.Array(GITHUB_ISSUE_SCHEMA);

/** Exact implementation/fix output contract from issue #24. */
export const IMPLEMENTATION_RESULT_SCHEMA = Type.Object({
  artifacts: Type.Array(Type.String()),
  attempt: Type.Integer({ minimum: 1, maximum: 3 }),
  axis: Type.Literal('implement'),
  filesChanged: Type.Array(Type.String()),
  nextAction: Type.Union([
    Type.Literal('abort'),
    Type.Literal('done'),
    Type.Literal('fix'),
    Type.Literal('review'),
  ]),
  rationale: Type.String(),
  riskNotes: Type.Array(Type.String()),
  validation: Type.Object({
    check: Type.Object({
      logPath: Type.String(),
      status: Type.Union([Type.Literal('fail'), Type.Literal('pass')]),
    }),
    testE2E: Type.Object({
      logPath: Type.String(),
      reasonIfSkipped: Type.String(),
      status: Type.Union([Type.Literal('fail'), Type.Literal('pass'), Type.Literal('skipped')]),
    }),
  }),
});

const REVIEW_FINDING_SCHEMA = Type.Object({
  file: Type.String(),
  issue: Type.String(),
  line: Type.Integer(),
  requiredFix: Type.String(),
  severity: Type.Union([Type.Literal('high'), Type.Literal('low'), Type.Literal('medium')]),
});

/** Exact two-axis reviewer output contract from issue #24. */
export const REVIEW_RESULT_SCHEMA = Type.Object({
  axis: Type.Union([Type.Literal('standards'), Type.Literal('spec')]),
  blocking: Type.Boolean(),
  findings: Type.Array(REVIEW_FINDING_SCHEMA),
  verdict: Type.Union([Type.Literal('pass'), Type.Literal('fail')]),
});

/** Exact research output contract from issue #24. */
export const RESEARCH_RESULT_SCHEMA = Type.Object({
  artifactPath: Type.String(),
  automationGaps: Type.Array(Type.String()),
  axis: Type.Literal('research'),
  decisions: Type.Array(Type.String()),
  evidence: Type.Array(Type.Object({ claim: Type.String(), source: Type.String() })),
  openQuestions: Type.Array(Type.String()),
  summary: Type.String(),
});

/** Decode JSON text through a TypeBox runtime schema. */
export function decodeJson<T extends TSchema>(schema: T, text: string): Static<T> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return Value.Decode(schema, parsed);
  } catch {
    return undefined;
  }
}

/** Decode an unknown external value through a TypeBox runtime schema. */
export function decodeValue<T extends TSchema>(schema: T, value: unknown): Static<T> | undefined {
  try {
    return Value.Decode(schema, value);
  } catch {
    return undefined;
  }
}
