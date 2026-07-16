import Fuse from 'fuse.js';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraComment, JiraCommentPage } from '@/jira/types';
import { adfToMarkdown, markdownToAdf } from '@/jira/adf';
import { textResult, toonResult } from '@/format/response';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

const commentSortSchema = z
  .enum(['created_asc', 'created_desc'])
  .default('created_desc')
  .describe(
    'Sort order by creation time: created_asc (oldest first) or created_desc (newest first)',
  );

export type CommentSort = z.infer<typeof commentSortSchema>;

export interface SearchableComment {
  id: string;
  author: string;
  body: string;
  created: string;
  updated: string;
}

/** Max comments loaded client-side when fuzzy-searching across an issue. */
const SEARCH_FETCH_CAP = 500;

export function sortToOrderBy(sort: CommentSort): string {
  return sort === 'created_desc' ? '-created' : 'created';
}

export function toSearchableComment(comment: JiraComment): SearchableComment {
  return {
    id: comment.id,
    author: comment.author.displayName,
    body: adfToMarkdown(comment.body),
    created: comment.created,
    updated: comment.updated,
  };
}

export function searchComments(comments: SearchableComment[], query: string): SearchableComment[] {
  const fuse = new Fuse(comments, {
    keys: [
      { name: 'body', weight: 0.7 },
      { name: 'author', weight: 0.3 },
    ],
    threshold: 0.45,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  });
  return fuse.search(query.trim()).map((result) => result.item);
}

export function commentsToAgentView(
  comments: SearchableComment[],
  total: number,
  startAt: number,
): Record<string, unknown> {
  const end = startAt + comments.length;
  const view: Record<string, unknown> = {
    startAt,
    end,
    total,
    comments: comments.map((comment) => {
      const row: Record<string, unknown> = {
        id: comment.id,
        author: comment.author,
        created: comment.created,
        body: comment.body,
      };
      if (comment.updated !== comment.created) {
        row['updated'] = comment.updated;
      }
      return row;
    }),
  };
  if (end < total) {
    view['nextStartAt'] = end;
  }
  return view;
}

async function fetchAllComments(
  client: JiraClient,
  issueKey: string,
  orderBy: string,
  cap: number,
): Promise<JiraComment[]> {
  const pageSize = 100;
  const all: JiraComment[] = [];
  let startAt = 0;

  while (all.length < cap) {
    const params = new URLSearchParams();
    params.set('maxResults', String(Math.min(pageSize, cap - all.length)));
    params.set('startAt', String(startAt));
    params.set('orderBy', orderBy);

    const page = await client.get<JiraCommentPage>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params.toString()}`,
    );
    all.push(...page.comments);

    if (page.comments.length === 0 || startAt + page.comments.length >= page.total) {
      break;
    }
    startAt += page.comments.length;
  }

  return all;
}

export function registerCommentTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'get_issue_comments',
    {
      description:
        'Get comments on a Jira issue. Bodies are Markdown (converted from Jira ADF). ' +
        'Response is TOON. Use sort to order by creation time, and search for fuzzy matching over author and body.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum comments to return (1-100, default 5)'),
        startAt: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Index of the first result (for pagination, default 0)'),
        sort: commentSortSchema,
        search: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Fuzzy search query over comment body and author. When set, comments are loaded (up to 500) and ranked by relevance; sort still controls fetch order before ranking.',
          ),
      },
    },
    async ({ issueKey, maxResults, startAt, sort, search }) => {
      const limit = maxResults ?? 5;
      const offset = startAt ?? 0;
      const orderBy = sortToOrderBy(sort);

      if (search !== undefined) {
        const raw = await fetchAllComments(client, issueKey, orderBy, SEARCH_FETCH_CAP);
        const searchable = raw.map(toSearchableComment);
        const matched = searchComments(searchable, search);
        const page = matched.slice(offset, offset + limit);
        return toonResult(commentsToAgentView(page, matched.length, offset));
      }

      const params = new URLSearchParams();
      params.set('maxResults', String(limit));
      if (offset > 0) {
        params.set('startAt', String(offset));
      }
      params.set('orderBy', orderBy);

      const result = await client.get<JiraCommentPage>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params.toString()}`,
      );
      return toonResult(
        commentsToAgentView(result.comments.map(toSearchableComment), result.total, result.startAt),
      );
    },
  );

  server.registerTool(
    'add_comment',
    {
      description:
        'Add a comment to a Jira issue. The comment body should be written in Markdown and will be converted to Jira ADF automatically. ' +
        "To mention/tag a user, use @[accountId] or @[Display Name|accountId] - use get_user to look up a user's accountId. " +
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
      return textResult(`Added comment to ${issueKey}`);
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
      return textResult(`Updated comment ${commentId} on ${issueKey}`);
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
      return textResult(`Deleted comment ${commentId} from ${issueKey}`);
    },
  );
}
