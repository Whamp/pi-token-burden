import { IssueRoute } from './enums.js';

describe('IssueRoute', () => {
  it('uses stable prompt and reporting values', () => {
    expect(Object.values(IssueRoute)).toStrictEqual(['implementation', 'research']);
  });
});
