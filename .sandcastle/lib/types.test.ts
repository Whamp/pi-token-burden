import { IssueRoute } from './enums.js';
import type { RoutedIssue } from './types.js';

describe('RoutedIssue', () => {
  it('carries the context needed by route handlers', () => {
    const routedIssue: RoutedIssue = {
      issue: {
        body: 'Body',
        createdAt: '2026-07-09T00:00:00Z',
        labels: ['ready-for-agent', 'enhancement'],
        number: 42,
        title: 'Issue',
      },
      route: IssueRoute.Implementation,
    };

    expect(routedIssue.issue.number).toBe(42);
  });
});
