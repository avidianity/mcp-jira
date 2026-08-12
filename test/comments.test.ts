import { describe, expect, it } from 'bun:test';
import {
  commentBlockLabel,
  commentsToAgentView,
  searchComments,
  sortToOrderBy,
  type SearchableComment,
} from '../src/tools/comments.ts';
import { markdownBlockResult } from '../src/format/response.ts';

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

describe('commentBlockLabel', () => {
  it('carries author and creation time next to the body', () => {
    expect(commentBlockLabel(comment({ id: '742603', author: 'Cyril' }))).toBe(
      'comment 742603 (Cyril, 2026-01-01T00:00:00.000+0000)',
    );
  });

  it('notes the edit time only when the comment was edited', () => {
    const edited = comment({ id: '1', updated: '2026-01-02T00:00:00.000+0000' });
    expect(commentBlockLabel(edited)).toContain('edited 2026-01-02T00:00:00.000+0000');
  });
});

describe('commentsToAgentView', () => {
  it('keeps only pagination in the envelope and puts bodies in blocks', () => {
    const view = commentsToAgentView([comment({ id: '1', body: 'line a\nline b' })], 3, 0);

    expect(view.envelope).toEqual({ startAt: 0, end: 1, total: 3, nextStartAt: 1 });
    expect(view.blocks).toEqual([
      { label: 'comment 1 (Alice, 2026-01-01T00:00:00.000+0000)', body: 'line a\nline b' },
    ]);
  });

  it('omits nextStartAt on the last page', () => {
    const view = commentsToAgentView([comment({ id: '1' })], 1, 0);
    expect(view.envelope['nextStartAt']).toBeUndefined();
  });

  it('renders a long body without escaping it onto one physical line', () => {
    const body = Array.from({ length: 30 }, (_, i) => `note ${i} ${'y'.repeat(90)}`).join('\n');
    const view = commentsToAgentView([comment({ id: '742603', body })], 1, 0);
    const out = markdownBlockResult(view.envelope, view.blocks).content[0]?.text ?? '';

    expect(out.length).toBeGreaterThan(2000);
    expect(out).not.toContain('\\n');
    expect(Math.max(...out.split('\n').map((line) => line.length))).toBeLessThan(200);
    expect(out).toContain('note 29');
  });
});
