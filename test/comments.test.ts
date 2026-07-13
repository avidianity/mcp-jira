import { describe, expect, it } from 'bun:test';
import { searchComments, sortToOrderBy, type SearchableComment } from '../src/tools/comments.ts';

function comment(
  overrides: Partial<SearchableComment> & Pick<SearchableComment, 'id'>,
): SearchableComment {
  return {
    author: 'Alice',
    body: 'hello world',
    created: '2026-01-01T00:00:00.000+0000',
    updated: '2026-01-01T00:00:00.000+0000',
    ...overrides,
  };
}

describe('sortToOrderBy', () => {
  it('maps created_asc to Jira created order', () => {
    expect(sortToOrderBy('created_asc')).toBe('created');
  });

  it('maps created_desc to Jira -created order', () => {
    expect(sortToOrderBy('created_desc')).toBe('-created');
  });
});

describe('searchComments', () => {
  const comments = [
    comment({ id: '1', author: 'Alice', body: 'Deploy failed on staging' }),
    comment({ id: '2', author: 'Bob', body: 'Please review the PR' }),
    comment({ id: '3', author: 'Carol', body: 'Staging deploy succeeded after retry' }),
    comment({ id: '4', author: 'Dave', body: 'Unrelated note about lunch' }),
  ];

  it('returns comments whose body matches the query', () => {
    const results = searchComments(comments, 'staging');
    const ids = results.map((c) => c.id);
    expect(ids).toContain('1');
    expect(ids).toContain('3');
    expect(ids).not.toContain('4');
  });

  it('tolerates small typos in the query', () => {
    const results = searchComments(comments, 'deply');
    expect(results.map((c) => c.id)).toContain('1');
  });

  it('matches author names', () => {
    const results = searchComments(comments, 'Carol');
    expect(results.map((c) => c.id)).toEqual(['3']);
  });

  it('returns empty when nothing matches', () => {
    expect(searchComments(comments, 'zzzz-no-such-thing')).toEqual([]);
  });
});
