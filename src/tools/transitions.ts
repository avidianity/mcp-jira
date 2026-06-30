import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraTransitionsResult } from '@/jira/types';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

export function registerTransitionTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'get_issue_transitions',
    {
      description:
        'Get available status transitions for a Jira issue. Use this to find valid transition IDs before calling transition_issue.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
      },
    },
    async ({ issueKey }) => {
      const result = await client.get<JiraTransitionsResult>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      );

      const lines: string[] = [`Available transitions for ${issueKey}:`, ''];
      for (const t of result.transitions) {
        lines.push(
          `  ID: ${t.id} | Name: ${t.name} | To: ${t.to.name} (${t.to.statusCategory.name})`,
        );
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'transition_issue',
    {
      description:
        'Change the status of a Jira issue by performing a transition. Use get_issue_transitions first to find the valid transition ID.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        transitionId: z.string().describe('Transition ID (from get_issue_transitions)'),
      },
    },
    async ({ issueKey, transitionId }) => {
      await client.post(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
        transition: { id: transitionId },
      });
      return {
        content: [{ type: 'text' as const, text: `Transitioned issue ${issueKey}` }],
      };
    },
  );
}
