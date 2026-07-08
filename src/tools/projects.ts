import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraComponent, JiraProject, JiraProjectPage, JiraVersion } from '@/jira/types';

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

  server.registerTool(
    'list_versions',
    {
      description:
        'List the versions (releases) of a Jira project, including their release status and dates.',
      inputSchema: {
        projectKeyOrId: z.string().describe('Project key (e.g., PROJ) or numeric project ID'),
      },
    },
    async ({ projectKeyOrId }) => {
      const versions = await client.get<JiraVersion[]>(
        `/rest/api/3/project/${encodeURIComponent(projectKeyOrId)}/versions`,
      );

      if (versions.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No versions in ${projectKeyOrId}` }],
        };
      }

      const lines: string[] = [`Versions in ${projectKeyOrId}:`, ''];
      for (const v of versions) {
        const status = v.released ? 'Released' : v.archived ? 'Archived' : 'Unreleased';
        const date = v.releaseDate !== undefined ? ` (${v.releaseDate})` : '';
        lines.push(`- ${v.name} (id=${v.id}) [${status}]${date}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'create_version',
    {
      description: 'Create a new version (release) in a Jira project.',
      inputSchema: {
        projectKeyOrId: z.string().describe('Project key (e.g., PROJ) or numeric project ID'),
        name: z.string().describe('Version name (e.g., "1.2.0")'),
        description: z.string().optional().describe('Optional version description'),
        releaseDate: z.string().optional().describe('Release date (YYYY-MM-DD)'),
        startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        released: z.boolean().optional().describe('Whether the version is already released'),
      },
    },
    async ({ projectKeyOrId, name, description, releaseDate, startDate, released }) => {
      // The create-version endpoint requires a numeric projectId; resolve it from the key.
      const project = await client.get<JiraProject>(
        `/rest/api/3/project/${encodeURIComponent(projectKeyOrId)}`,
      );

      const body: Record<string, unknown> = { name, projectId: Number(project.id) };
      if (description !== undefined) {
        body['description'] = description;
      }
      if (releaseDate !== undefined) {
        body['releaseDate'] = releaseDate;
      }
      if (startDate !== undefined) {
        body['startDate'] = startDate;
      }
      if (released !== undefined) {
        body['released'] = released;
      }

      const version = await client.post<JiraVersion>('/rest/api/3/version', body);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Created version "${version.name}" (id=${version.id}) in ${project.key}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'update_version',
    {
      description:
        'Update a Jira project version. Commonly used to mark a version as released. Only provide fields you want to change. Use list_versions to find the version ID.',
      inputSchema: {
        versionId: z.string().describe('The version ID (from list_versions)'),
        name: z.string().optional().describe('New version name'),
        description: z.string().optional().describe('New description'),
        releaseDate: z.string().optional().describe('Release date (YYYY-MM-DD)'),
        released: z.boolean().optional().describe('Mark as released (true) or unreleased (false)'),
        archived: z.boolean().optional().describe('Archive (true) or unarchive (false)'),
      },
    },
    async ({ versionId, name, description, releaseDate, released, archived }) => {
      const body: Record<string, unknown> = {};
      if (name !== undefined) {
        body['name'] = name;
      }
      if (description !== undefined) {
        body['description'] = description;
      }
      if (releaseDate !== undefined) {
        body['releaseDate'] = releaseDate;
      }
      if (released !== undefined) {
        body['released'] = released;
      }
      if (archived !== undefined) {
        body['archived'] = archived;
      }

      await client.put(`/rest/api/3/version/${encodeURIComponent(versionId)}`, body);
      return {
        content: [{ type: 'text' as const, text: `Updated version ${versionId}` }],
      };
    },
  );

  server.registerTool(
    'list_components',
    {
      description: 'List the components of a Jira project, including their IDs and leads.',
      inputSchema: {
        projectKeyOrId: z.string().describe('Project key (e.g., PROJ) or numeric project ID'),
      },
    },
    async ({ projectKeyOrId }) => {
      const components = await client.get<JiraComponent[]>(
        `/rest/api/3/project/${encodeURIComponent(projectKeyOrId)}/components`,
      );

      if (components.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No components in ${projectKeyOrId}` }],
        };
      }

      const lines: string[] = [`Components in ${projectKeyOrId}:`, ''];
      for (const c of components) {
        const desc =
          c.description !== undefined && c.description.length > 0 ? ` — ${c.description}` : '';
        lines.push(`- ${c.name} (id=${c.id})${desc}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'create_component',
    {
      description: 'Create a new component in a Jira project.',
      inputSchema: {
        projectKey: z.string().describe('Project key (e.g., PROJ)'),
        name: z.string().describe('Component name'),
        description: z.string().optional().describe('Optional component description'),
        leadAccountId: z
          .string()
          .optional()
          .describe('Account ID of the component lead (use get_user)'),
      },
    },
    async ({ projectKey, name, description, leadAccountId }) => {
      const body: Record<string, unknown> = { name, project: projectKey };
      if (description !== undefined) {
        body['description'] = description;
      }
      if (leadAccountId !== undefined) {
        body['leadAccountId'] = leadAccountId;
      }

      const component = await client.post<JiraComponent>('/rest/api/3/component', body);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Created component "${component.name}" (id=${component.id}) in ${projectKey}`,
          },
        ],
      };
    },
  );
}
