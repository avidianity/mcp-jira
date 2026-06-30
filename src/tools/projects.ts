import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraProject, JiraProjectPage } from '@/jira/types';

export function registerProjectTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'list_projects',
    {
      description: 'List all accessible Jira projects with their key, name, and lead.',
      inputSchema: {
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum projects to return (1-100, default 50)'),
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
      params.set('maxResults', String(maxResults ?? 50));
      if (startAt !== undefined) {
        params.set('startAt', String(startAt));
      }

      const result = await client.get<JiraProjectPage>(
        `/rest/api/3/project/search?${params.toString()}`,
      );

      const lines: string[] = [
        `Projects (${String(result.startAt + 1)}-${String(result.startAt + result.values.length)} of ${String(result.total)})`,
        '',
      ];
      for (const project of result.values) {
        const lead = project.lead !== undefined ? ` (Lead: ${project.lead.displayName})` : '';
        lines.push(`${project.key}: ${project.name}${lead}`);
      }

      if (result.startAt + result.values.length < result.total) {
        lines.push(
          '',
          `Use startAt=${String(result.startAt + result.values.length)} to see more projects.`,
        );
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'get_project',
    {
      description:
        'Get detailed information about a Jira project including issue types, components, and versions.',
      inputSchema: {
        projectKeyOrId: z.string().describe('Project key (e.g., PROJ) or numeric project ID'),
      },
    },
    async ({ projectKeyOrId }) => {
      const project = await client.get<JiraProject>(
        `/rest/api/3/project/${encodeURIComponent(projectKeyOrId)}`,
      );

      const lines: string[] = [`Project: ${project.key}`, `Name: ${project.name}`];

      if (project.description !== undefined && project.description.length > 0) {
        lines.push(`Description: ${project.description}`);
      }
      if (project.lead !== undefined) {
        lines.push(`Lead: ${project.lead.displayName}`);
      }

      if (project.issueTypes !== undefined && project.issueTypes.length > 0) {
        lines.push('', 'Issue Types:');
        for (const it of project.issueTypes) {
          const desc =
            it.description !== undefined && it.description.length > 0 ? ` — ${it.description}` : '';
          const sub = it.subtask ? ' (subtask)' : '';
          lines.push(`  - ${it.name}${sub}${desc}`);
        }
      }

      if (project.components !== undefined && project.components.length > 0) {
        lines.push('', 'Components:');
        for (const c of project.components) {
          const desc =
            c.description !== undefined && c.description.length > 0 ? ` — ${c.description}` : '';
          lines.push(`  - ${c.name}${desc}`);
        }
      }

      if (project.versions !== undefined && project.versions.length > 0) {
        lines.push('', 'Versions:');
        for (const v of project.versions) {
          const status = v.released ? 'Released' : v.archived ? 'Archived' : 'Unreleased';
          const date = v.releaseDate !== undefined ? ` (${v.releaseDate})` : '';
          lines.push(`  - ${v.name} [${status}]${date}`);
        }
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );
}
