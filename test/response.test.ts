import { describe, expect, it } from 'bun:test';
import { encodeToon, textResult, toonResult } from '../src/format/response.ts';
import { issueToAgentView, searchResultToAgentView } from '../src/tools/issues.ts';
import type { AdfDocument, JiraIssue, JiraSearchResult } from '../src/jira/types.ts';

describe('encodeToon', () => {
  it('encodes objects without JSON braces noise', () => {
    const out = encodeToon({ key: 'PROJ-1', labels: ['a', 'b'] });
    expect(out).toContain('key: PROJ-1');
    expect(out).not.toContain('{');
  });

  it('encodes uniform arrays in tabular form', () => {
    const out = encodeToon({
      issues: [
        { key: 'A-1', status: 'Open' },
        { key: 'A-2', status: 'Done' },
      ],
    });
    expect(out).toContain('issues[2]');
    expect(out).toContain('A-1');
  });
});

describe('textResult / toonResult', () => {
  it('wraps plain text', () => {
    expect(textResult('ok')).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('marks errors', () => {
    expect(textResult('nope', { isError: true }).isError).toBe(true);
  });

  it('returns TOON in text content', () => {
    const result = toonResult({ n: 1 });
    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.text).toContain('n: 1');
  });
});

describe('issueToAgentView', () => {
  const description: AdfDocument = {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello **world**' }],
      },
    ],
  };

  const issue = {
    id: '1',
    key: 'PROJ-1',
    self: 'https://example.atlassian.net/rest/api/3/issue/1',
    fields: {
      summary: 'Test',
      description,
      status: {
        id: '1',
        name: 'Open',
        statusCategory: { id: 2, key: 'new', name: 'To Do' },
      },
      assignee: {
        accountId: 'acc-1',
        displayName: 'Ada',
        emailAddress: 'ada@example.com',
        active: true,
      },
      reporter: null,
      priority: { id: '3', name: 'Medium' },
      issuetype: { id: '1', name: 'Task', subtask: false },
      project: { id: '10', key: 'PROJ', name: 'Project' },
      labels: ['backend'],
      created: '2026-01-01T00:00:00.000+0000',
      updated: '2026-01-02T00:00:00.000+0000',
      resolution: null,
      components: [{ id: '1', name: 'API' }],
      fixVersions: [],
      subtasks: [],
      issuelinks: [],
    },
  } as unknown as JiraIssue;

  it('converts description ADF to Markdown and omits raw ADF', () => {
    const view = issueToAgentView(issue);
    expect(view['key']).toBe('PROJ-1');
    expect(view['url']).toBe('https://example.atlassian.net/browse/PROJ-1');
    expect(String(view['description'])).toContain('Hello');
    expect(view['description']).not.toEqual(description);
    expect(view['components']).toEqual(['API']);
    expect(view['assignee']).toEqual({
      displayName: 'Ada',
      accountId: 'acc-1',
      email: 'ada@example.com',
    });
  });
});

describe('searchResultToAgentView', () => {
  it('includes nextPageToken when more pages exist', () => {
    const result = {
      isLast: false,
      nextPageToken: 'tok',
      issues: [
        {
          id: '1',
          key: 'PROJ-1',
          self: 'https://x/rest/api/3/issue/1',
          fields: {
            summary: 'S',
            status: {
              id: '1',
              name: 'Open',
              statusCategory: { id: 2, key: 'new', name: 'To Do' },
            },
            assignee: null,
          },
        },
      ],
    } as unknown as JiraSearchResult;

    const view = searchResultToAgentView(result);
    expect(view['count']).toBe(1);
    expect(view['nextPageToken']).toBe('tok');
    expect((view['issues'] as { key: string }[])[0]?.key).toBe('PROJ-1');
  });
});
