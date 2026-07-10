import { durableGitHubUrl } from './durableGitHubUrl.js';

describe('durableGitHubUrl()', () => {
  it('builds a commit-addressed URL and rejects non-SHA references', () => {
    const commit = 'a'.repeat(40);

    expect(
      durableGitHubUrl({
        commit,
        kind: 'tree',
        path: '.sandcastle/reports/issue-42/pass-2',
        repository: 'Whamp/pi-token-burden',
      }),
    ).toBe(
      `https://github.com/Whamp/pi-token-burden/tree/${commit}/.sandcastle/reports/issue-42/pass-2`,
    );
    expect(() =>
      durableGitHubUrl({
        commit: 'sandcastle/issue-42',
        kind: 'blob',
        path: 'docs/research/result.md',
        repository: 'Whamp/pi-token-burden',
      }),
    ).toThrow('Durable GitHub URL requires a full commit SHA');
  });
});
