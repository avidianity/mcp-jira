import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraWorklog, JiraWorklogPage } from '@/jira/types';
import { adfToMarkdown, markdownToAdf } from '@/jira/adf';
import { textResult, toonResult } from '@/format/response';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

/**
 * Convert an ISO-8601 date/time (or "now") into the format Jira expects for
 * worklog `started`: `yyyy-MM-ddTHH:mm:ss.SSS±HHmm` (offset without a colon,
 * no trailing `Z`).
 */
export function toJiraDateTime(input?: string): string {
  const date = input !== undefined ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(input)}`);
  }
  // toISOString() yields a UTC timestamp ending in `Z`; Jira wants `+0000`.
  return date.toISOString().replace('Z', '+0000');
}

function worklogToAgentView(wl: JiraWorklog): Record<string, unknown> {
  const view: Record<string, unknown> = {
    id: wl.id,
    author: wl.author.displayName,
    timeSpent: wl.timeSpent,
    timeSpentSeconds: wl.timeSpentSeconds,
    started: wl.started,
  };
  if (wl.comment !== undefined) {
    const comment = adfToMarkdown(wl.comment);
    if (comment.length > 0) {
      view['comment'] = comment;
    }
  }
  return view;
}

export function registerWorklogTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'get_worklogs',
    {
      description:
        'Get work log entries (logged time) for a Jira issue, including who logged time, how much, when, and optional Markdown comments (TOON response).',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
      },
    },
    async ({ issueKey }) => {
      const result = await client.get<JiraWorklogPage>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
      );

      return toonResult({
        issueKey,
        total: result.total,
        worklogs: result.worklogs.map(worklogToAgentView),
      });
    },
  );

  server.registerTool(
    'add_worklog',
    {
      description:
        'Log work (time spent) on a Jira issue. timeSpent uses Jira duration syntax like "3h", "30m", "1d 2h".',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        timeSpent: z.string().describe('Duration in Jira syntax (e.g., "3h", "30m", "1d 2h")'),
        started: z
          .string()
          .optional()
          .describe('When the work started, as an ISO-8601 datetime (default: now)'),
        comment: z.string().optional().describe('Optional work description in Markdown'),
      },
    },
    async ({ issueKey, timeSpent, started, comment }) => {
      const body: Record<string, unknown> = {
        timeSpent,
        started: toJiraDateTime(started),
      };
      if (comment !== undefined) {
        body['comment'] = markdownToAdf(comment);
      }

      await client.post(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`, body);
      return textResult(`Logged ${timeSpent} on ${issueKey}`);
    },
  );

  server.registerTool(
    'update_worklog',
    {
      description:
        'Update an existing work log entry on a Jira issue. Only provide fields you want to change. Use get_worklogs to find the worklog ID.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        worklogId: z.string().describe('The worklog ID (from get_worklogs)'),
        timeSpent: z
          .string()
          .optional()
          .describe('New duration in Jira syntax (e.g., "3h", "30m")'),
        started: z.string().optional().describe('New start time as an ISO-8601 datetime'),
        comment: z.string().optional().describe('New work description in Markdown'),
      },
    },
    async ({ issueKey, worklogId, timeSpent, started, comment }) => {
      const body: Record<string, unknown> = {};
      if (timeSpent !== undefined) {
        body['timeSpent'] = timeSpent;
      }
      if (started !== undefined) {
        body['started'] = toJiraDateTime(started);
      }
      if (comment !== undefined) {
        body['comment'] = markdownToAdf(comment);
      }

      await client.put(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
        body,
      );
      return textResult(`Updated worklog ${worklogId} on ${issueKey}`);
    },
  );

  server.registerTool(
    'delete_worklog',
    {
      description:
        'Delete a work log entry from a Jira issue. Use get_worklogs to find the worklog ID. This cannot be undone.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        worklogId: z.string().describe('The worklog ID (from get_worklogs)'),
      },
    },
    async ({ issueKey, worklogId }) => {
      await client.del(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
      );
      return textResult(`Deleted worklog ${worklogId} from ${issueKey}`);
    },
  );
}
