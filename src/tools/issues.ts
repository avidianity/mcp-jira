import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraIssue, JiraSearchResult } from '@/jira/types';
import { adfToMarkdown, markdownToAdf } from '@/jira/adf';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

function formatIssue(issue: JiraIssue): string {
  const f = issue.fields;
  const baseUrl = issue.self.split('/rest/')[0] ?? '';
  const lines: string[] = [
    `Issue: ${issue.key}`,
    `URL: ${baseUrl}/browse/${issue.key}`,
    `Summary: ${f.summary}`,
    `Status: ${f.status.name} (${f.status.statusCategory.name})`,
    `Type: ${f.issuetype.name}`,
  ];

  if (f.priority !== null) {
    lines.push(`Priority: ${f.priority.name}`);
  }
  if (f.assignee !== null) {
    const email = f.assignee.emailAddress ?? f.assignee.accountId;
    lines.push(`Assignee: ${f.assignee.displayName} (${email})`);
  }
  if (f.reporter !== null) {
    const email = f.reporter.emailAddress ?? f.reporter.accountId;
    lines.push(`Reporter: ${f.reporter.displayName} (${email})`);
  }
  if (f.labels.length > 0) {
    lines.push(`Labels: ${f.labels.join(', ')}`);
  }
  if (f.components.length > 0) {
    lines.push(`Components: ${f.components.map((c) => c.name).join(', ')}`);
  }
  if (f.fixVersions.length > 0) {
    lines.push(`Fix Versions: ${f.fixVersions.map((v) => v.name).join(', ')}`);
  }
  if (f.resolution !== null) {
    lines.push(`Resolution: ${f.resolution.name}`);
  }
  if (f.parent !== undefined) {
    lines.push(`Parent: ${f.parent.key} - ${f.parent.fields.summary}`);
  }

  lines.push(`Created: ${f.created}`);
  lines.push(`Updated: ${f.updated}`);

  const description = adfToMarkdown(f.description);
  if (description.length > 0) {
    lines.push('', 'Description:', description);
  }

  if (f.subtasks.length > 0) {
    lines.push('', 'Subtasks:');
    for (const subtask of f.subtasks) {
      lines.push(`  - ${subtask.key}: ${subtask.fields.summary} [${subtask.fields.status.name}]`);
    }
  }

  if (f.issuelinks.length > 0) {
    lines.push('', 'Linked Issues:');
    for (const link of f.issuelinks) {
      if (link.outwardIssue !== undefined) {
        lines.push(
          `  - ${link.type.outward} ${link.outwardIssue.key}: ${link.outwardIssue.fields.summary}`,
        );
      }
      if (link.inwardIssue !== undefined) {
        lines.push(
          `  - ${link.type.inward} ${link.inwardIssue.key}: ${link.inwardIssue.fields.summary}`,
        );
      }
    }
  }

  return lines.join('\n');
}

function formatSearchResult(result: JiraSearchResult): string {
  const lines: string[] = [
    `Found ${String(result.issues.length)} issues${result.isLast ? '' : ' (more available)'}`,
    '',
  ];

  for (const issue of result.issues) {
    const f = issue.fields;
    const assignee = f.assignee !== null ? ` → ${f.assignee.displayName}` : '';
    lines.push(`${issue.key}: ${f.summary} [${f.status.name}]${assignee}`);
  }

  if (!result.isLast && result.nextPageToken !== undefined) {
    lines.push(
      '',
      `More results available. Use nextPageToken="${result.nextPageToken}" to see more.`,
    );
  }

  return lines.join('\n');
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
      return { content: [{ type: 'text' as const, text: formatIssue(issue) }] };
    },
  );

  server.registerTool(
    'search_issues',
    {
      description:
        'Search for Jira issues using JQL (Jira Query Language). Returns a paginated list of matching issues with key, summary, status, and assignee.',
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
      return { content: [{ type: 'text' as const, text: formatSearchResult(result) }] };
    },
  );

  server.registerTool(
    'create_issue',
    {
      description:
        'Create a new Jira issue. Description should be provided as Markdown and will be converted to Jira format automatically.',
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
    }) => {
      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        issuetype: { name: issueType },
        summary,
      };

      if (description !== undefined) {
        fields['description'] = markdownToAdf(description);
      }
      if (assigneeId !== undefined) {
        fields['assignee'] = { accountId: assigneeId };
      }
      if (priority !== undefined) {
        fields['priority'] = { name: priority };
      }
      if (labels !== undefined) {
        fields['labels'] = labels;
      }
      if (parentKey !== undefined) {
        fields['parent'] = { key: parentKey };
      }

      const result = await client.post<{ id: string; key: string; self: string }>(
        '/rest/api/3/issue',
        { fields },
      );
      return {
        content: [{ type: 'text' as const, text: `Created issue: ${result.key}` }],
      };
    },
  );

  server.registerTool(
    'update_issue',
    {
      description:
        'Update fields on an existing Jira issue. Only provide fields you want to change. Description should be Markdown.',
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
      },
    },
    async ({ issueKey, summary, description, assigneeId, priority, labels }) => {
      const fields: Record<string, unknown> = {};

      if (summary !== undefined) {
        fields['summary'] = summary;
      }
      if (description !== undefined) {
        fields['description'] = markdownToAdf(description);
      }
      if (assigneeId !== undefined) {
        fields['assignee'] = assigneeId === null ? null : { accountId: assigneeId };
      }
      if (priority !== undefined) {
        fields['priority'] = { name: priority };
      }
      if (labels !== undefined) {
        fields['labels'] = labels;
      }

      await client.put(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, { fields });
      return {
        content: [{ type: 'text' as const, text: `Updated issue: ${issueKey}` }],
      };
    },
  );
}
