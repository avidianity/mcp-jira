import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraUser } from '@/jira/types';
import { textResult, toonResult } from '@/format/response';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

function userToAgentView(user: JiraUser): Record<string, unknown> {
  const row: Record<string, unknown> = {
    displayName: user.displayName,
    accountId: user.accountId,
    active: user.active,
  };
  if (user.emailAddress !== undefined) {
    row['email'] = user.emailAddress;
  }
  return row;
}

export function registerUserTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'get_user',
    {
      description:
        'Search for a Jira user by name or email. Returns account IDs needed for assigning issues.',
      inputSchema: {
        query: z.string().describe('Search query - user display name or email address'),
      },
    },
    async ({ query }) => {
      const params = new URLSearchParams({ query });
      const users = await client.get<JiraUser[]>(`/rest/api/3/user/search?${params.toString()}`);

      return toonResult({
        query,
        users: users.map(userToAgentView),
      });
    },
  );

  server.registerTool(
    'assign_issue',
    {
      description:
        'Assign a Jira issue to a user, or unassign it by passing null. Use get_user to find the accountId.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        accountId: z
          .string()
          .nullable()
          .describe('Account ID of the assignee, or null to unassign'),
      },
    },
    async ({ issueKey, accountId }) => {
      await client.put(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`, { accountId });
      const action = accountId === null ? 'Unassigned' : `Assigned to ${accountId}`;
      return textResult(`${action}: ${issueKey}`);
    },
  );

  server.registerTool(
    'get_current_user',
    {
      description:
        'Get the currently authenticated Jira user (the account the MCP server is acting as), including their accountId.',
      inputSchema: {},
    },
    async () => {
      const user = await client.get<JiraUser>('/rest/api/3/myself');
      return toonResult(userToAgentView(user));
    },
  );

  server.registerTool(
    'list_assignable_users',
    {
      description:
        'List users who can be assigned to issues in a project (or a specific issue). Returns account IDs for use with assign_issue and create_issue.',
      inputSchema: {
        projectKey: z
          .string()
          .optional()
          .describe('Project key to list assignable users for (e.g., PROJ)'),
        issueKey: z
          .string()
          .regex(ISSUE_KEY_PATTERN)
          .optional()
          .describe('Issue key to list assignable users for (e.g., PROJ-123)'),
        query: z.string().optional().describe('Optional filter by display name or email'),
      },
    },
    async ({ projectKey, issueKey, query }) => {
      if (projectKey === undefined && issueKey === undefined) {
        return textResult('Provide either projectKey or issueKey.', { isError: true });
      }

      const params = new URLSearchParams();
      if (projectKey !== undefined) {
        params.set('project', projectKey);
      }
      if (issueKey !== undefined) {
        params.set('issueKey', issueKey);
      }
      if (query !== undefined) {
        params.set('query', query);
      }

      const users = await client.get<JiraUser[]>(
        `/rest/api/3/user/assignable/search?${params.toString()}`,
      );

      return toonResult({
        users: users.map(userToAgentView),
      });
    },
  );
}
