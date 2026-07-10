import { parseResearchResult, parseReviewResult } from './workflow.js';

describe('workflow result contracts', () => {
  it('accepts the exact review contract and rejects malformed findings', () => {
    const valid =
      '<reviewSpec>{"axis":"spec","verdict":"fail","blocking":true,"findings":[{"severity":"high","file":"src/a.ts","line":7,"issue":"Missing behavior","requiredFix":"Implement it"}]}</reviewSpec>';
    const invalid = '<reviewSpec>{"axis":"spec","verdict":"pass","findings":[]}</reviewSpec>';
    const wrongAxis = valid.replaceAll('reviewSpec', 'reviewStandards');

    expect(parseReviewResult(valid, 'reviewSpec')).toStrictEqual({
      axis: 'spec',
      blocking: true,
      findings: [
        {
          file: 'src/a.ts',
          issue: 'Missing behavior',
          line: 7,
          requiredFix: 'Implement it',
          severity: 'high',
        },
      ],
      verdict: 'fail',
    });
    expect(parseReviewResult(invalid, 'reviewSpec')).toBeUndefined();
    expect(parseReviewResult(wrongAxis, 'reviewStandards')).toBeUndefined();
  });

  it('requires a complete cited research result', () => {
    const stdout = `<researchResult>${JSON.stringify({
      artifactPath: 'docs/research/2026-07-09-issue-22-runtime.md',
      automationGaps: [],
      axis: 'research',
      decisions: ['Use Docker'],
      evidence: [{ claim: 'The API supports Docker', source: 'https://example.com' }],
      openQuestions: [],
      summary: 'Runtime contract',
    })}</researchResult>`;

    expect(parseResearchResult(stdout)).toStrictEqual({
      artifactPath: 'docs/research/2026-07-09-issue-22-runtime.md',
      automationGaps: [],
      axis: 'research',
      decisions: ['Use Docker'],
      evidence: [{ claim: 'The API supports Docker', source: 'https://example.com' }],
      openQuestions: [],
      summary: 'Runtime contract',
    });
    expect(
      parseResearchResult('<researchResult>{"axis":"research"}</researchResult>'),
    ).toBeUndefined();
  });
});
