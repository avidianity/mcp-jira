import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraChangelogPage, JiraIssue, JiraSearchResult, JiraUser } from '@/jira/types';
import { adfToMarkdown, markdownToAdf } from '@/jira/adf';
import { textResult, toonResult } from '@/format/response';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

/** Field keys set by dedicated create/update params; not overridable via `fields`. */
const RESERVED_ISSUE_FIELD_KEYS = new Set([
  'project',
  'issuetype',
  'summary',
  'description',
  'assignee',
  'priority',
  'labels',
  'parent',
  'components',
  'fixVersions',
]);

export function namesToNamedObjects(names: string[]): { name: string }[] {
  return names.map((name) => ({ name }));
}

export function applyAdditionalFields(
  target: Record<string, unknown>,
  additional: Record<string, unknown> | undefined,
): void {
  if (additional === undefined) {
    return;
  }
  for (const [key, value] of Object.entries(additional)) {
    if (RESERVED_ISSUE_FIELD_KEYS.has(key)) {
      continue;
    }
    target[key] = value;
  }
}

export interface BuildCreateIssueFieldsInput {
  projectKey: string;
  issueType: string;
  summary: string;
  descriptionAdf?: unknown;
  assigneeId?: string | undefined;
  priority?: string | undefined;
  labels?: string[] | undefined;
  parentKey?: string | undefined;
  components?: string[] | undefined;
  fixVersions?: string[] | undefined;
  fields?: Record<string, unknown> | undefined;
}

export function buildCreateIssueFields(
  input: BuildCreateIssueFieldsInput,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    issuetype: { name: input.issueType },
    summary: input.summary,
  };

  if (input.descriptionAdf !== undefined) {
    fields['description'] = input.descriptionAdf;
  }
  if (input.assigneeId !== undefined) {
    fields['assignee'] = { accountId: input.assigneeId };
  }
  if (input.priority !== undefined) {
    fields['priority'] = { name: input.priority };
  }
  if (input.labels !== undefined) {
    fields['labels'] = input.labels;
  }
  if (input.parentKey !== undefined) {
    fields['parent'] = { key: input.parentKey };
  }
  if (input.components !== undefined) {
    fields['components'] = namesToNamedObjects(input.components);
  }
  if (input.fixVersions !== undefined) {
    fields['fixVersions'] = namesToNamedObjects(input.fixVersions);
  }

  applyAdditionalFields(fields, input.fields);
  return fields;
}

export interface BuildUpdateIssueFieldsInput {
  summary?: string | undefined;
  descriptionAdf?: unknown;
  assigneeId?: string | null | undefined;
  priority?: string | undefined;
  labels?: string[] | undefined;
  components?: string[] | undefined;
  fixVersions?: string[] | undefined;
  fields?: Record<string, unknown> | undefined;
}

export function buildUpdateIssueFields(
  input: BuildUpdateIssueFieldsInput,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (input.summary !== undefined) {
    fields['summary'] = input.summary;
  }
  if (input.descriptionAdf !== undefined) {
    fields['description'] = input.descriptionAdf;
  }
  if (input.assigneeId !== undefined) {
    fields['assignee'] = input.assigneeId === null ? null : { accountId: input.assigneeId };
  }
  if (input.priority !== undefined) {
    fields['priority'] = { name: input.priority };
  }
  if (input.labels !== undefined) {
    fields['labels'] = input.labels;
  }
  if (input.components !== undefined) {
    fields['components'] = namesToNamedObjects(input.components);
  }
  if (input.fixVersions !== undefined) {
    fields['fixVersions'] = namesToNamedObjects(input.fixVersions);
  }

  applyAdditionalFields(fields, input.fields);
  return fields;
}

const additionalFieldsSchema = z
  .record(z.unknown())
  .optional()
  .describe(
    'Extra Jira fields by field ID (e.g. customfield_10099). Values must match the Jira REST API shape for that field type. ' +
      'Use list_fields to find IDs and get_create_meta for required fields and allowed values. ' +
      'Examples: string/URL → "https://…"; single select → {"value":"Option"}; multi-select → [{"value":"A"},{"value":"B"}]. ' +
      'Cannot override dedicated params (project, summary, components, etc.).',
  );

function userView(
  user: JiraUser | null,
): { displayName: string; accountId: string; email?: string } | undefined {
  if (user === null) {
    return undefined;
  }
  const view: { displayName: string; accountId: string; email?: string } = {
    displayName: user.displayName,
    accountId: user.accountId,
  };
  if (user.emailAddress !== undefined) {
    view.email = user.emailAddress;
  }
  return view;
}

/** Agent-facing issue view: structured fields + Markdown description (never raw ADF). */
export function issueToAgentView(issue: JiraIssue): Record<string, unknown> {
  const f = issue.fields;
  const baseUrl = issue.self.split('/rest/')[0] ?? '';
  const description = adfToMarkdown(f.description);

  const view: Record<string, unknown> = {
    key: issue.key,
    url: `${baseUrl}/browse/${issue.key}`,
    summary: f.summary,
    status: f.status.name,
    statusCategory: f.status.statusCategory.name,
    type: f.issuetype.name,
    created: f.created,
    updated: f.updated,
  };

  const assignee = userView(f.assignee);
  if (assignee !== undefined) {
    view['assignee'] = assignee;
  }
  const reporter = userView(f.reporter);
  if (reporter !== undefined) {
    view['reporter'] = reporter;
  }
  if (f.priority !== null) {
    view['priority'] = f.priority.name;
  }
  if (f.labels.length > 0) {
    view['labels'] = f.labels;
  }
  if (f.components.length > 0) {
    view['components'] = f.components.map((c) => c.name);
  }
  if (f.fixVersions.length > 0) {
    view['fixVersions'] = f.fixVersions.map((v) => v.name);
  }
  if (f.resolution !== null) {
    view['resolution'] = f.resolution.name;
  }
  if (f.parent !== undefined) {
    view['parent'] = {
      key: f.parent.key,
      summary: f.parent.fields.summary,
      status: f.parent.fields.status.name,
    };
  }
  if (description.length > 0) {
    view['description'] = description;
  }
  if (f.subtasks.length > 0) {
    view['subtasks'] = f.subtasks.map((subtask) => ({
      key: subtask.key,
      summary: subtask.fields.summary,
      status: subtask.fields.status.name,
    }));
  }
  if (f.issuelinks.length > 0) {
    const links: { relation: string; key: string; summary: string }[] = [];
    for (const link of f.issuelinks) {
      if (link.outwardIssue !== undefined) {
        links.push({
          relation: link.type.outward,
          key: link.outwardIssue.key,
          summary: link.outwardIssue.fields.summary,
        });
      }
      if (link.inwardIssue !== undefined) {
        links.push({
          relation: link.type.inward,
          key: link.inwardIssue.key,
          summary: link.inwardIssue.fields.summary,
        });
      }
    }
    view['links'] = links;
  }

  return view;
}

export function searchResultToAgentView(result: JiraSearchResult): Record<string, unknown> {
  const view: Record<string, unknown> = {
    count: result.issues.length,
    isLast: result.isLast,
    issues: result.issues.map((issue) => {
      const row: Record<string, unknown> = {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
      };
      const assignee = userView(issue.fields.assignee);
      if (assignee !== undefined) {
        row['assignee'] = assignee.displayName;
      }
      return row;
    }),
  };
  if (!result.isLast && result.nextPageToken !== undefined) {
    view['nextPageToken'] = result.nextPageToken;
  }
  return view;
}

export function registerIssueTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'get_issue',
    {
      description:
        'Get detailed information about a Jira issue including summary, description (converted to Markdown), status, assignee, priority, labels, components, subtasks, and linked issues.',
      inputSchema: {
        issueKey: z
          .string()
          .regex(ISSUE_KEY_PATTERN, 'Must be a valid issue key like PROJ-123')
          .describe('The issue key (e.g., PROJ-123)'),
      },
    },
    async ({ issueKey }) => {
      const issue = await client.get<JiraIssue>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      );
      return toonResult(issueToAgentView(issue));
    },
  );

  server.registerTool(
    'search_issues',
    {
      description:
        'Search for Jira issues using JQL (Jira Query Language). Returns a paginated list of matching issues with key, summary, status, and assignee (TOON format).',
      inputSchema: {
        jql: z.string().describe('JQL query string (e.g., "project = PROJ AND status = Open")'),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum results to return (1-100, default 20)'),
        nextPageToken: z
          .string()
          .optional()
          .describe('Token for fetching the next page of results (returned from previous search)'),
      },
    },
    async ({ jql, maxResults, nextPageToken }) => {
      const params = new URLSearchParams({ jql });
      if (maxResults !== undefined) {
        params.set('maxResults', String(maxResults));
      } else {
        params.set('maxResults', '20');
      }
      if (nextPageToken !== undefined) {
        params.set('nextPageToken', nextPageToken);
      }
      params.set('fields', 'summary,status,assignee');

      const result = await client.get<JiraSearchResult>(
        `/rest/api/3/search/jql?${params.toString()}`,
      );
      return toonResult(searchResultToAgentView(result));
    },
  );

  server.registerTool(
    'create_issue',
    {
      description:
        'Create a new Jira issue. Description should be Markdown (converted to Jira format). ' +
        'For projects with mandatory custom fields, call get_create_meta first, then pass those via fields ' +
        '(and components/fixVersions by name when needed).',
      inputSchema: {
        projectKey: z.string().describe('Project key (e.g., PROJ)'),
        issueType: z.string().describe('Issue type name (e.g., Bug, Task, Story, Epic)'),
        summary: z.string().describe('Issue title/summary'),
        description: z.string().optional().describe('Issue description in Markdown format'),
        assigneeId: z
          .string()
          .optional()
          .describe('Account ID of the assignee (use get_user to find)'),
        priority: z.string().optional().describe('Priority name (e.g., High, Medium, Low)'),
        labels: z.array(z.string()).optional().describe('Array of label strings'),
        parentKey: z
          .string()
          .regex(ISSUE_KEY_PATTERN)
          .optional()
          .describe('Parent issue key for subtasks (e.g., PROJ-100)'),
        components: z
          .array(z.string())
          .optional()
          .describe('Component names (use list_components). Sent as [{"name":"..."}].'),
        fixVersions: z
          .array(z.string())
          .optional()
          .describe('Fix version names (use list_versions). Sent as [{"name":"..."}].'),
        fields: additionalFieldsSchema,
      },
    },
    async ({
      projectKey,
      issueType,
      summary,
      description,
      assigneeId,
      priority,
      labels,
      parentKey,
      components,
      fixVersions,
      fields: additional,
    }) => {
      const fields = buildCreateIssueFields({
        projectKey,
        issueType,
        summary,
        descriptionAdf: description !== undefined ? markdownToAdf(description) : undefined,
        assigneeId,
        priority,
        labels,
        parentKey,
        components,
        fixVersions,
        fields: additional,
      });

      const result = await client.post<{ id: string; key: string; self: string }>(
        '/rest/api/3/issue',
        { fields },
      );
      return textResult(`Created issue: ${result.key}`);
    },
  );

  server.registerTool(
    'update_issue',
    {
      description:
        'Update fields on an existing Jira issue. Only provide fields you want to change. Description should be Markdown. ' +
        'Supports components, fixVersions, and arbitrary fields (custom fields) the same way as create_issue.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        summary: z.string().optional().describe('New summary/title'),
        description: z.string().optional().describe('New description in Markdown format'),
        assigneeId: z
          .string()
          .nullable()
          .optional()
          .describe('Account ID of the assignee, or null to unassign'),
        priority: z.string().optional().describe('Priority name (e.g., High, Medium, Low)'),
        labels: z.array(z.string()).optional().describe('Replace all labels with this array'),
        components: z
          .array(z.string())
          .optional()
          .describe('Replace components with these names (use list_components).'),
        fixVersions: z
          .array(z.string())
          .optional()
          .describe('Replace fix versions with these names (use list_versions).'),
        fields: additionalFieldsSchema,
      },
    },
    async ({
      issueKey,
      summary,
      description,
      assigneeId,
      priority,
      labels,
      components,
      fixVersions,
      fields: additional,
    }) => {
      const fields = buildUpdateIssueFields({
        summary,
        descriptionAdf: description !== undefined ? markdownToAdf(description) : undefined,
        assigneeId,
        priority,
        labels,
        components,
        fixVersions,
        fields: additional,
      });

      await client.put(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, { fields });
      return textResult(`Updated issue: ${issueKey}`);
    },
  );

  server.registerTool(
    'delete_issue',
    {
      description:
        'Delete a Jira issue. This is permanent and cannot be undone. Set deleteSubtasks to true to also delete any subtasks (otherwise deletion fails if subtasks exist).',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        deleteSubtasks: z
          .boolean()
          .optional()
          .describe('Also delete subtasks (default false). Required when the issue has subtasks.'),
      },
    },
    async ({ issueKey, deleteSubtasks }) => {
      const params = new URLSearchParams({
        deleteSubtasks: deleteSubtasks === true ? 'true' : 'false',
      });
      await client.del(`/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params.toString()}`);
      return textResult(`Deleted issue: ${issueKey}`);
    },
  );

  server.registerTool(
    'get_issue_changelog',
    {
      description:
        'Get the change history (field-by-field audit log) of a Jira issue - who changed what and when. Useful for understanding how an issue reached its current state.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum history entries to return (1-100, default 50)'),
        startAt: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Index of the first result (for pagination, default 0)'),
      },
    },
    async ({ issueKey, maxResults, startAt }) => {
      const params = new URLSearchParams();
      params.set('maxResults', String(maxResults ?? 50));
      if (startAt !== undefined) {
        params.set('startAt', String(startAt));
      }

      const result = await client.get<JiraChangelogPage>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?${params.toString()}`,
      );

      const end = result.startAt + result.values.length;
      return toonResult({
        issueKey,
        startAt: result.startAt,
        end,
        total: result.total,
        entries: result.values.map((entry) => ({
          author: entry.author.displayName,
          created: entry.created,
          changes: entry.items.map((item) => ({
            field: item.field,
            from: item.fromString,
            to: item.toString,
          })),
        })),
        ...(end < result.total ? { nextStartAt: end } : {}),
      });
    },
  );
}
