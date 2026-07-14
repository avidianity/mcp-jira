import { describe, expect, it } from 'bun:test';
import {
  applyAdditionalFields,
  buildCreateIssueFields,
  namesToNamedObjects,
} from '../src/tools/issues';

describe('namesToNamedObjects', () => {
  it('maps names to { name } objects for components/versions', () => {
    expect(namesToNamedObjects(['API', 'Web'])).toEqual([{ name: 'API' }, { name: 'Web' }]);
  });
});

describe('applyAdditionalFields', () => {
  it('merges custom fields without overwriting reserved keys', () => {
    const base: Record<string, unknown> = {
      project: { key: 'GE' },
      summary: 'Title',
    };
    applyAdditionalFields(base, {
      customfield_10099: 'https://example.com',
      customfield_10046: [{ value: 'Acme' }],
      project: { key: 'HACK' },
      summary: 'nope',
    });
    expect(base).toEqual({
      project: { key: 'GE' },
      summary: 'Title',
      customfield_10099: 'https://example.com',
      customfield_10046: [{ value: 'Acme' }],
    });
  });
});

describe('buildCreateIssueFields', () => {
  it('builds core fields plus components and custom fields', () => {
    const fields = buildCreateIssueFields({
      projectKey: 'GE',
      issueType: 'Task',
      summary: 'Add header',
      components: ['API'],
      fields: {
        customfield_10099: 'https://docs.example/api',
        customfield_10046: [{ value: 'Internal' }],
      },
    });

    expect(fields).toEqual({
      project: { key: 'GE' },
      issuetype: { name: 'Task' },
      summary: 'Add header',
      components: [{ name: 'API' }],
      customfield_10099: 'https://docs.example/api',
      customfield_10046: [{ value: 'Internal' }],
    });
  });

  it('includes optional assignee, priority, labels, parent, fixVersions', () => {
    const fields = buildCreateIssueFields({
      projectKey: 'PROJ',
      issueType: 'Bug',
      summary: 'Broken',
      assigneeId: 'acc-1',
      priority: 'High',
      labels: ['urgent'],
      parentKey: 'PROJ-1',
      fixVersions: ['1.2.0'],
    });

    expect(fields['assignee']).toEqual({ accountId: 'acc-1' });
    expect(fields['priority']).toEqual({ name: 'High' });
    expect(fields['labels']).toEqual(['urgent']);
    expect(fields['parent']).toEqual({ key: 'PROJ-1' });
    expect(fields['fixVersions']).toEqual([{ name: '1.2.0' }]);
  });
});
