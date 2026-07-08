import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraIssueLinkType } from '@/jira/types';

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

  server.registerTool(
    'get_link_types',
    {
      description:
        'List the available issue link types with their inward and outward descriptions. Use these names with link_issues.',
      inputSchema: {},
    },
    async () => {
      const result = await client.get<{ issueLinkTypes: JiraIssueLinkType[] }>(
        '/rest/api/3/issueLinkType',
      );

      const lines: string[] = ['Issue link types:', ''];
      for (const t of result.issueLinkTypes) {
        lines.push(`- ${t.name}: outward "${t.outward}", inward "${t.inward}"`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'delete_issue_link',
    {
      description:
        'Delete a link between two issues by its link ID. The link ID is shown by get_issue in the linked-issues section (or via the Jira API). This cannot be undone.',
      inputSchema: {
        linkId: z.string().describe('The issue link ID to delete'),
      },
    },
    async ({ linkId }) => {
      await client.del(`/rest/api/3/issueLink/${encodeURIComponent(linkId)}`);
      return { content: [{ type: 'text' as const, text: `Deleted issue link ${linkId}` }] };
    },
  );

  server.registerTool(
    'add_remote_link',
    {
      description:
        'Attach a remote/web link (e.g., a URL to a document, PR, or external system) to a Jira issue.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        url: z.string().url().describe('The URL to link to'),
        title: z.string().describe('Display title for the link'),
        summary: z.string().optional().describe('Optional summary/description of the link'),
      },
    },
    async ({ issueKey, url, title, summary }) => {
      const object: Record<string, unknown> = { url, title };
      if (summary !== undefined) {
        object['summary'] = summary;
      }
      await client.post(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/remotelink`, {
        object,
      });
      return {
        content: [{ type: 'text' as const, text: `Added remote link "${title}" to ${issueKey}` }],
      };
    },
  );
}
