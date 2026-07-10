import { decodeJson, GITHUB_ISSUE_SCHEMA } from './schema.js';

describe('Sandcastle schemas', () => {
  it('decodes complete GitHub payloads and rejects incomplete ones', () => {
    const complete = JSON.stringify({
      assignees: [],
      body: 'Body',
      createdAt: '2026-07-09T00:00:00Z',
      labels: [{ name: 'ready-for-agent' }],
      number: 42,
      state: 'OPEN',
      title: 'Issue',
    });

    expect(decodeJson(GITHUB_ISSUE_SCHEMA, complete)?.number).toBe(42);
    expect(decodeJson(GITHUB_ISSUE_SCHEMA, '{"number":42}')).toBeUndefined();
  });
});
