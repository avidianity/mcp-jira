import { describe, expect, it } from 'bun:test';
import { toJiraDateTime, worklogCommentBlocks } from '../src/tools/worklogs.ts';
import type { JiraWorklog } from '../src/jira/types.ts';

describe('toJiraDateTime', () => {
  it('formats an ISO string into Jira format with a +0000 offset and no trailing Z', () => {
    expect(toJiraDateTime('2021-01-17T12:34:00Z')).toBe('2021-01-17T12:34:00.000+0000');
  });

  it('normalizes a zoned ISO string to UTC', () => {
    expect(toJiraDateTime('2021-01-17T12:34:00+05:00')).toBe('2021-01-17T07:34:00.000+0000');
  });

  it('produces a Jira-formatted timestamp when given no input', () => {
    expect(toJiraDateTime()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+0000$/);
  });

  it('throws on an invalid date', () => {
    expect(() => toJiraDateTime('not-a-date')).toThrow('Invalid date');
  });
});

describe('worklogCommentBlocks', () => {
  function worklog(id: string, text?: string): JiraWorklog {
    const base = { id, author: { accountId: 'a', displayName: 'Ada', active: true } };
    if (text === undefined) {
      return base as unknown as JiraWorklog;
    }
    return {
      ...base,
      comment: {
        version: 1,
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    } as unknown as JiraWorklog;
  }

  it('emits one block per commented worklog, keyed by worklog ID', () => {
    expect(worklogCommentBlocks([worklog('1', 'Paired on the payload bug')])).toEqual([
      { label: 'worklog 1 comment', body: 'Paired on the payload bug' },
    ]);
  });

  it('skips worklogs with no comment', () => {
    expect(worklogCommentBlocks([worklog('1'), worklog('2', 'note')])).toEqual([
      { label: 'worklog 2 comment', body: 'note' },
    ]);
  });
});
