import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraCommentPage } from '@/jira/types';
import { adfToMarkdown, markdownToAdf } from '@/jira/adf';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

function formatComments(result: JiraCommentPage): string {
  const lines: string[] = [
    `Comments (${String(result.startAt + 1)}-${String(result.startAt + result.comments.length)} of ${String(result.total)})`,
    '',
  ];

  for (const comment of result.comments) {
    const author = comment.author.displayName;
    const date = comment.created;
    const edited = comment.updated !== comment.created ? `, edited ${comment.updated}` : '';
    const body = adfToMarkdown(comment.body);
    lines.push(`--- [id ${comment.id}] ${author} (${date}${edited}) ---`);
    lines.push(body);
    lines.push('');
  }

  if (result.startAt + result.comments.length < result.total) {
    lines.push(
      `Use startAt=${String(result.startAt + result.comments.length)} to see more comments.`,
    );
  }

  return lines.join('\n');
}

export function registerCommentTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'get_issue_comments',
    {
      description:
        'Get comments on a Jira issue, ordered by creation date. Comment bodies are converted from Jira format to Markdown.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum comments to return (1-100, default 20)'),
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
      params.set('maxResults', String(maxResults ?? 20));
      if (startAt !== undefined) {
        params.set('startAt', String(startAt));
      }
      params.set('orderBy', 'created');

      const result = await client.get<JiraCommentPage>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params.toString()}`,
      );
      return { content: [{ type: 'text' as const, text: formatComments(result) }] };
    },
  );

  server.registerTool(
    'add_comment',
    {
      description:
        'Add a comment to a Jira issue. The comment body should be written in Markdown and will be converted to Jira format automatically. ' +
        "To mention/tag a user, use @[accountId] or @[Display Name|accountId] — use get_user to look up a user's accountId. " +
        'Plain @Username text is NOT converted to a mention.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        body: z
          .string()
          .describe(
            'Comment body in Markdown format. Mention users with @[accountId] or @[Display Name|accountId].',
          ),
      },
    },
    async ({ issueKey, body }) => {
      const adfBody = markdownToAdf(body);
      await client.post(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
        body: adfBody,
      });
      return {
        content: [{ type: 'text' as const, text: `Added comment to ${issueKey}` }],
      };
    },
  );

  server.registerTool(
    'update_comment',
    {
      description:
        'Edit an existing comment on a Jira issue. The new body replaces the old one and should be written in Markdown. Use get_issue_comments to find the comment ID. Mention users with @[accountId] or @[Display Name|accountId].',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        commentId: z.string().describe('The comment ID (from get_issue_comments)'),
        body: z
          .string()
          .describe('New comment body in Markdown format (replaces the existing body)'),
      },
    },
    async ({ issueKey, commentId, body }) => {
      const adfBody = markdownToAdf(body);
      await client.put(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment/${encodeURIComponent(commentId)}`,
        { body: adfBody },
      );
      return {
        content: [{ type: 'text' as const, text: `Updated comment ${commentId} on ${issueKey}` }],
      };
    },
  );

  server.registerTool(
    'delete_comment',
    {
      description:
        'Delete a comment from a Jira issue. Use get_issue_comments to find the comment ID. This cannot be undone.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        commentId: z.string().describe('The comment ID (from get_issue_comments)'),
      },
    },
    async ({ issueKey, commentId }) => {
      await client.del(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment/${encodeURIComponent(commentId)}`,
      );
      return {
        content: [{ type: 'text' as const, text: `Deleted comment ${commentId} from ${issueKey}` }],
      };
    },
  );
}
