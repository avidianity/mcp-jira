import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraComponent, JiraProject, JiraProjectPage, JiraVersion } from '@/jira/types';
import { textResult, toonResult } from '@/format/response';

function versionStatus(v: JiraVersion): string {
  return v.released ? 'Released' : v.archived ? 'Archived' : 'Unreleased';
}

function versionToAgentView(v: JiraVersion): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: v.id,
    name: v.name,
    status: versionStatus(v),
  };
  if (v.releaseDate !== undefined) {
    row['releaseDate'] = v.releaseDate;
  }
  return row;
}

function componentToAgentView(c: JiraComponent): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: c.id,
    name: c.name,
  };
  if (c.description !== undefined && c.description.length > 0) {
    row['description'] = c.description;
  }
  return row;
}

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

      const end = result.startAt + result.values.length;
      return toonResult({
        startAt: result.startAt,
        end,
        total: result.total,
        projects: result.values.map((p) => {
          const row: Record<string, unknown> = {
            key: p.key,
            name: p.name,
          };
          if (p.lead !== undefined) {
            row['lead'] = p.lead.displayName;
          }
          return row;
        }),
        ...(end < result.total ? { nextStartAt: end } : {}),
      });
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

      const view: Record<string, unknown> = {
        key: project.key,
        name: project.name,
      };

      if (project.description !== undefined && project.description.length > 0) {
        view['description'] = project.description;
      }
      if (project.lead !== undefined) {
        view['lead'] = project.lead.displayName;
      }

      if (project.issueTypes !== undefined && project.issueTypes.length > 0) {
        view['issueTypes'] = project.issueTypes.map((it) => {
          const row: Record<string, unknown> = {
            name: it.name,
            subtask: it.subtask,
          };
          if (it.description !== undefined && it.description.length > 0) {
            row['description'] = it.description;
          }
          return row;
        });
      }

      if (project.components !== undefined && project.components.length > 0) {
        view['components'] = project.components.map(componentToAgentView);
      }

      if (project.versions !== undefined && project.versions.length > 0) {
        view['versions'] = project.versions.map(versionToAgentView);
      }

      return toonResult(view);
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

      return toonResult({
        projectKeyOrId,
        versions: versions.map(versionToAgentView),
      });
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
      return textResult(`Created version "${version.name}" (id=${version.id}) in ${project.key}`);
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
      return textResult(`Updated version ${versionId}`);
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

      return toonResult({
        projectKeyOrId,
        components: components.map(componentToAgentView),
      });
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
      return textResult(
        `Created component "${component.name}" (id=${component.id}) in ${projectKey}`,
      );
    },
  );
}
