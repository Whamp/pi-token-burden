import { selectNextEligibleIssue } from './routing.js';

function githubIssue(
  labelNames: readonly string[],
  number = 42,
  createdAt = '2026-07-09T12:00:00Z',
) {
  return {
    assignees: [],
    body: `Implement issue ${number}.`,
    createdAt,
    labels: labelNames.map((name) => ({ name })),
    number,
    state: 'OPEN',
    title: `Issue ${number}`,
  };
}

describe('selectNextEligibleIssue()', () => {
  it('selects an open unassigned implementation issue from the GitHub payload', () => {
    const githubIssues = [githubIssue(['ready-for-agent', 'enhancement'])];

    expect(selectNextEligibleIssue(githubIssues)).toStrictEqual({
      issue: {
        body: 'Implement issue 42.',
        createdAt: '2026-07-09T12:00:00Z',
        labels: ['ready-for-agent', 'enhancement'],
        number: 42,
        title: 'Issue 42',
      },
      route: 'implementation',
    });
  });

  it.each([
    'needs-info',
    'needs-triage',
    'ready-for-human',
    'wayfinder:grilling',
    'wayfinder:map',
    'wayfinder:prototype',
    'wontfix',
  ])('rejects an issue carrying the %s exclusion label', (exclusionLabel) => {
    const githubIssues = [githubIssue(['ready-for-agent', 'enhancement', exclusionLabel])];

    expect(selectNextEligibleIssue(githubIssues)).toBeUndefined();
  });

  it('routes research ahead of normal implementation labels', () => {
    const githubIssues = [githubIssue(['ready-for-agent', 'enhancement', 'wayfinder:research'])];

    expect(selectNextEligibleIssue(githubIssues)?.route).toBe('research');
  });

  it('rejects a pure wayfinder task', () => {
    const githubIssues = [githubIssue(['ready-for-agent', 'wayfinder:task'])];

    expect(selectNextEligibleIssue(githubIssues)).toBeUndefined();
  });

  it.each([
    { assignees: [{ login: 'other-agent' }], state: 'OPEN' },
    { assignees: [], state: 'CLOSED' },
  ])('rejects assigned or closed issues', ({ assignees, state }) => {
    const issue = githubIssue(['ready-for-agent', 'enhancement']);

    expect(selectNextEligibleIssue([{ ...issue, assignees, state }])).toBeUndefined();
  });

  it('selects the oldest issue and uses issue number as the tie-breaker', () => {
    const githubIssues = [
      githubIssue(['ready-for-agent', 'enhancement'], 50, '2026-07-09T13:00:00Z'),
      githubIssue(['ready-for-agent', 'bug'], 43, '2026-07-09T12:00:00Z'),
      githubIssue(['ready-for-agent', 'documentation'], 41, '2026-07-09T12:00:00Z'),
    ];

    expect(selectNextEligibleIssue(githubIssues)?.issue.number).toBe(41);
  });
});
