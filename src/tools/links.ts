import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

export function registerLinkTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'link_issues',
    {
      description:
        'Create a link between two Jira issues. Common link types: "Blocks" (outward blocks inward), "Cloners" (cloned from/to), "Duplicate" (duplicates/is duplicated by), "Relates" (relates to).',
      inputSchema: {
        linkType: z
          .string()
          .describe('Link type name (e.g., "Blocks", "Cloners", "Duplicate", "Relates")'),
        inwardIssueKey: z
          .string()
          .regex(ISSUE_KEY_PATTERN)
          .describe('The inward issue key (e.g., the issue that IS BLOCKED)'),
        outwardIssueKey: z
          .string()
          .regex(ISSUE_KEY_PATTERN)
          .describe('The outward issue key (e.g., the issue that BLOCKS)'),
      },
    },
    async ({ linkType, inwardIssueKey, outwardIssueKey }) => {
      await client.post('/rest/api/3/issueLink', {
        type: { name: linkType },
        inwardIssue: { key: inwardIssueKey },
        outwardIssue: { key: outwardIssueKey },
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: `Linked ${outwardIssueKey} → ${linkType} → ${inwardIssueKey}`,
          },
        ],
      };
    },
  );
}
