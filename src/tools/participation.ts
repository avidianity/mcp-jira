import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraUser } from '@/jira/types';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

interface JiraWatchers {
  watchCount: number;
  isWatching: boolean;
  watchers?: JiraUser[] | undefined;
}

interface JiraVotes {
  votes: number;
  hasVoted: boolean;
  voters?: JiraUser[] | undefined;
}

export function registerParticipationTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'list_watchers',
    {
      description: 'List the users watching a Jira issue, along with the total watcher count.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
      },
    },
    async ({ issueKey }) => {
      const result = await client.get<JiraWatchers>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/watchers`,
      );

      const lines: string[] = [`Watchers on ${issueKey} (${String(result.watchCount)}):`, ''];
      for (const user of result.watchers ?? []) {
        const email = user.emailAddress ?? user.accountId;
        lines.push(`  ${user.displayName} (${email}) — accountId: ${user.accountId}`);
      }
      if ((result.watchers ?? []).length === 0) {
        lines.push('  (no watchers, or you lack permission to view them)');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'add_watcher',
    {
      description:
        "Add a watcher to a Jira issue. Omit accountId to add yourself. Use get_user to find another user's accountId.",
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        accountId: z
          .string()
          .optional()
          .describe('Account ID of the watcher to add (omit to add yourself)'),
      },
    },
    async ({ issueKey, accountId }) => {
      // The watcher endpoint expects a bare JSON string (the accountId) as the body,
      // or an empty body to add the current user.
      await client.post(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/watchers`,
        accountId ?? null,
      );
      const who = accountId ?? 'you';
      return {
        content: [{ type: 'text' as const, text: `Added watcher (${who}) to ${issueKey}` }],
      };
    },
  );

  server.registerTool(
    'remove_watcher',
    {
      description:
        "Remove a watcher from a Jira issue. Requires the watcher's accountId (use list_watchers or get_user to find it).",
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        accountId: z.string().describe('Account ID of the watcher to remove'),
      },
    },
    async ({ issueKey, accountId }) => {
      const params = new URLSearchParams({ accountId });
      await client.del(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/watchers?${params.toString()}`,
      );
      return {
        content: [{ type: 'text' as const, text: `Removed watcher ${accountId} from ${issueKey}` }],
      };
    },
  );

  server.registerTool(
    'get_votes',
    {
      description: 'Get the vote count and voters for a Jira issue.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
      },
    },
    async ({ issueKey }) => {
      const result = await client.get<JiraVotes>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/votes`,
      );

      const lines: string[] = [
        `Votes on ${issueKey}: ${String(result.votes)} (you have ${result.hasVoted ? '' : 'not '}voted)`,
        '',
      ];
      for (const user of result.voters ?? []) {
        lines.push(`  ${user.displayName} — accountId: ${user.accountId}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'add_vote',
    {
      description:
        'Vote for a Jira issue (as the current user). You cannot vote on your own issues.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
      },
    },
    async ({ issueKey }) => {
      await client.post(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/votes`, {});
      return { content: [{ type: 'text' as const, text: `Voted for ${issueKey}` }] };
    },
  );

  server.registerTool(
    'remove_vote',
    {
      description: 'Remove your vote from a Jira issue.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
      },
    },
    async ({ issueKey }) => {
      await client.del(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/votes`);
      return { content: [{ type: 'text' as const, text: `Removed your vote from ${issueKey}` }] };
    },
  );
}
