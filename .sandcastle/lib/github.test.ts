import { IssueRoute } from './enums.js';
import { claimIssue, discoverNextIssue, escalateIssue, unassignIssue } from './github.js';
import type { CommandResult, GitHubExecutor, RoutedIssue } from './types.js';

const REPOSITORY = 'Whamp/pi-token-burden';

function result(stdout = ''): CommandResult {
  return { exitCode: 0, stderr: '', stdout };
}

function failedResult(stderr: string): CommandResult {
  return { exitCode: 1, stderr, stdout: '' };
}

function issueSnapshot(
  assigneeLogins: readonly string[],
  body = 'Implement issue 42.',
  labels = ['ready-for-agent', 'enhancement'],
): string {
  return JSON.stringify({
    assignees: assigneeLogins.map((login) => ({ login })),
    body,
    createdAt: '2026-07-09T12:00:00Z',
    labels: labels.map((name) => ({ name })),
    number: 42,
    state: 'OPEN',
    title: 'Issue 42',
  });
}

describe('unassignIssue()', () => {
  it('rejects when releasing the issue claim fails', async () => {
    const execute = vi.fn<GitHubExecutor>().mockResolvedValue(failedResult('permissions denied'));

    await expect(unassignIssue(execute, REPOSITORY, 42)).rejects.toThrow(
      'GitHub unassign failed: permissions denied',
    );
  });
});

describe('escalateIssue()', () => {
  it('rejects when the terminal label and assignee update fails', async () => {
    const execute = vi
      .fn<GitHubExecutor>()
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(failedResult('permissions denied'));

    await expect(
      escalateIssue(execute, REPOSITORY, 42, 'Runner validation failed'),
    ).rejects.toThrow('GitHub escalation failed: permissions denied');
  });
});

describe('discoverNextIssue()', () => {
  it('discovers ready issues without requiring an implementation kind label', async () => {
    const execute = vi
      .fn<GitHubExecutor>()
      .mockResolvedValue(
        result(
          `[${issueSnapshot([], 'Implement issue 42.', ['ready-for-agent', 'wayfinder:task'])}]`,
        ),
      );

    await expect(discoverNextIssue(execute, REPOSITORY)).resolves.toMatchObject({
      route: IssueRoute.Implementation,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith([
      'issue',
      'list',
      '--repo',
      REPOSITORY,
      '--search',
      'is:issue is:open label:ready-for-agent no:assignee -label:needs-info -label:needs-triage -label:ready-for-human -label:wayfinder:grilling -label:wayfinder:map -label:wayfinder:prototype -label:wontfix',
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'assignees,body,createdAt,labels,number,state,title',
    ]);
  });
});

describe('claimIssue()', () => {
  it('claims only after pre-checks and exact post-claim revalidation', async () => {
    const execute = vi
      .fn<GitHubExecutor>()
      .mockResolvedValueOnce(result('Whamp\n'))
      .mockResolvedValueOnce(result(issueSnapshot([])))
      .mockResolvedValueOnce(result('0\n'))
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result(issueSnapshot(['Whamp'])))
      .mockResolvedValueOnce(result('0\n'));
    const selection: RoutedIssue = {
      issue: {
        body: 'Implement issue 42.',
        createdAt: '2026-07-09T12:00:00Z',
        labels: ['ready-for-agent', 'enhancement'],
        number: 42,
        title: 'Issue 42',
      },
      route: IssueRoute.Implementation,
    };

    await expect(claimIssue(execute, REPOSITORY, selection)).resolves.toBeTruthy();
    expect(execute.mock.calls.map(([args]) => args)).toStrictEqual([
      ['api', 'user', '--jq', '.login'],
      [
        'issue',
        'view',
        '42',
        '--repo',
        REPOSITORY,
        '--json',
        'assignees,body,createdAt,labels,number,state,title',
      ],
      [
        'api',
        'repos/Whamp/pi-token-burden/issues/42',
        '--jq',
        '.issue_dependencies_summary.blocked_by // 0',
      ],
      ['issue', 'edit', '42', '--repo', REPOSITORY, '--add-assignee', '@me'],
      [
        'issue',
        'view',
        '42',
        '--repo',
        REPOSITORY,
        '--json',
        'assignees,body,createdAt,labels,number,state,title',
      ],
      [
        'api',
        'repos/Whamp/pi-token-burden/issues/42',
        '--jq',
        '.issue_dependencies_summary.blocked_by // 0',
      ],
    ]);
  });

  it('fails closed before assignment when native blocker status is unavailable', async () => {
    const execute = vi
      .fn<GitHubExecutor>()
      .mockResolvedValueOnce(result('Whamp\n'))
      .mockResolvedValueOnce(result(issueSnapshot([])))
      .mockResolvedValueOnce(failedResult('GitHub dependency API unavailable'))
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result(issueSnapshot(['Whamp'])))
      .mockResolvedValueOnce(failedResult('GitHub dependency API unavailable'));
    const selection: RoutedIssue = {
      issue: {
        body: 'Implement issue 42.',
        createdAt: '2026-07-09T12:00:00Z',
        labels: ['ready-for-agent', 'enhancement'],
        number: 42,
        title: 'Issue 42',
      },
      route: IssueRoute.Implementation,
    };

    await expect(claimIssue(execute, REPOSITORY, selection)).resolves.toBeFalsy();
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('rejects an open fallback blocker even when native count is zero', async () => {
    const execute = vi
      .fn<GitHubExecutor>()
      .mockResolvedValueOnce(result('Whamp\n'))
      .mockResolvedValueOnce(
        result(issueSnapshot([], 'Blocked by: #99\n\nImplementation details.')),
      )
      .mockResolvedValueOnce(result('0\n'))
      .mockResolvedValueOnce(result('OPEN\n'));
    const selection: RoutedIssue = {
      issue: {
        body: 'Blocked by: #99\n\nImplementation details.',
        createdAt: '2026-07-09T12:00:00Z',
        labels: ['ready-for-agent', 'enhancement'],
        number: 42,
        title: 'Issue 42',
      },
      route: IssueRoute.Implementation,
    };

    await expect(claimIssue(execute, REPOSITORY, selection)).resolves.toBeFalsy();
    expect(execute).toHaveBeenLastCalledWith([
      'issue',
      'view',
      '99',
      '--repo',
      REPOSITORY,
      '--json',
      'state',
      '--jq',
      '.state',
    ]);
  });
});
