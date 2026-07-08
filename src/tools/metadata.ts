import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraIssueType, JiraPriority, JiraStatus } from '@/jira/types';

interface JiraField {
  id: string;
  key: string;
  name: string;
  custom: boolean;
  schema?: { type: string; custom?: string } | undefined;
}

interface JiraLabelPage {
  values: string[];
  isLast: boolean;
  startAt: number;
  maxResults: number;
  total: number;
}

export function registerMetadataTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'list_issue_types',
    {
      description:
        'List all issue types available in the Jira instance (Bug, Task, Story, Epic, subtasks, etc.), with their IDs.',
      inputSchema: {},
    },
    async () => {
      const types = await client.get<JiraIssueType[]>('/rest/api/3/issuetype');
      const lines: string[] = ['Issue types:', ''];
      for (const t of types) {
        const sub = t.subtask ? ' (subtask)' : '';
        lines.push(`- ${t.name} (id=${t.id})${sub}`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'list_statuses',
    {
      description:
        'List all workflow statuses in the Jira instance, grouped with their status category (To Do / In Progress / Done).',
      inputSchema: {},
    },
    async () => {
      const statuses = await client.get<JiraStatus[]>('/rest/api/3/status');
      const lines: string[] = ['Statuses:', ''];
      for (const s of statuses) {
        lines.push(`- ${s.name} (id=${s.id}) [${s.statusCategory.name}]`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'list_priorities',
    {
      description: 'List all issue priorities available in the Jira instance, with their IDs.',
      inputSchema: {},
    },
    async () => {
      const priorities = await client.get<JiraPriority[]>('/rest/api/3/priority');
      const lines: string[] = ['Priorities:', ''];
      for (const p of priorities) {
        lines.push(`- ${p.name} (id=${p.id})`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'list_fields',
    {
      description:
        'List all fields (system and custom) in the Jira instance, including custom field IDs (e.g., customfield_10016). Essential for discovering custom field IDs to use in JQL or issue updates. Optionally filter by name substring.',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe('Case-insensitive substring to filter field names (e.g., "story points")'),
      },
    },
    async ({ query }) => {
      const fields = await client.get<JiraField[]>('/rest/api/3/field');
      const needle = query?.toLowerCase();
      const filtered =
        needle !== undefined ? fields.filter((f) => f.name.toLowerCase().includes(needle)) : fields;

      if (filtered.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No matching fields found.' }],
        };
      }

      const lines: string[] = [`Fields (${String(filtered.length)}):`, ''];
      for (const f of filtered) {
        const kind = f.custom ? 'custom' : 'system';
        const type = f.schema?.type !== undefined ? `, type=${f.schema.type}` : '';
        lines.push(`- ${f.name} (id=${f.id}, ${kind}${type})`);
      }
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'list_labels',
    {
      description: 'List labels available in the Jira instance (paginated).',
      inputSchema: {
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Maximum labels to return (default 100)'),
        startAt: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Index of the first result (for pagination, default 0)'),
      },
    },
    async ({ maxResults, startAt }) => {
      const params = new URLSearchParams();
      params.set('maxResults', String(maxResults ?? 100));
      if (startAt !== undefined) {
        params.set('startAt', String(startAt));
      }

      const result = await client.get<JiraLabelPage>(`/rest/api/3/label?${params.toString()}`);

      if (result.values.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No labels found.' }] };
      }

      const lines: string[] = [
        `Labels (${String(result.startAt + 1)}-${String(result.startAt + result.values.length)} of ${String(result.total)}):`,
        '',
        result.values.join(', '),
      ];
      if (!result.isLast) {
        lines.push('', `Use startAt=${String(result.startAt + result.values.length)} for more.`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );
}
