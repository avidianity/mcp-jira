import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraIssueType, JiraPriority, JiraStatus } from '@/jira/types';
import { textResult, toonResult } from '@/format/response';

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

interface CreateMetaIssueType {
  id: string;
  name: string;
}

interface CreateMetaField {
  required: boolean;
  name: string;
  key?: string | undefined;
  fieldId?: string | undefined;
  schema?: { type: string; items?: string; custom?: string; system?: string } | undefined;
  allowedValues?: { id?: string; name?: string; value?: string }[] | undefined;
  hasDefaultValue?: boolean | undefined;
}

interface CreateMetaFieldsPage {
  startAt: number;
  maxResults: number;
  total: number;
  fields: CreateMetaField[];
}

function createMetaFieldToAgentView(field: CreateMetaField): Record<string, unknown> {
  const id = field.fieldId ?? field.key ?? field.name;
  const view: Record<string, unknown> = {
    name: field.name,
    id,
    required: field.required,
    type: field.schema?.type ?? 'unknown',
  };
  if (field.schema?.items !== undefined) {
    view['items'] = field.schema.items;
  }
  if (field.allowedValues !== undefined && field.allowedValues.length > 0) {
    view['allowedValues'] = field.allowedValues.slice(0, 12).map((v) => {
      if (v.name !== undefined) return v.name;
      if (v.value !== undefined) return v.value;
      if (v.id !== undefined) return `id:${v.id}`;
      return '?';
    });
    if (field.allowedValues.length > 12) {
      view['allowedValuesTotal'] = field.allowedValues.length;
    }
  }
  return view;
}

async function fetchAllCreateMetaFields(
  client: JiraClient,
  projectKey: string,
  issueTypeId: string,
): Promise<CreateMetaField[]> {
  const pageSize = 50;
  const all: CreateMetaField[] = [];
  let startAt = 0;
  let total = Number.POSITIVE_INFINITY;

  while (all.length < total) {
    const params = new URLSearchParams();
    params.set('startAt', String(startAt));
    params.set('maxResults', String(pageSize));
    const page = await client.get<CreateMetaFieldsPage>(
      `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(issueTypeId)}?${params.toString()}`,
    );
    total = page.total;
    if (page.fields.length === 0) {
      break;
    }
    all.push(...page.fields);
    startAt += page.fields.length;
  }

  return all;
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
      return toonResult({
        issueTypes: types.map((t) => ({
          id: t.id,
          name: t.name,
          subtask: t.subtask,
        })),
      });
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
      return toonResult({
        statuses: statuses.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.statusCategory.name,
        })),
      });
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
      return toonResult({
        priorities: priorities.map((p) => ({
          id: p.id,
          name: p.name,
        })),
      });
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

      return toonResult({
        fields: filtered.map((f) => {
          const row: Record<string, unknown> = {
            id: f.id,
            name: f.name,
            kind: f.custom ? 'custom' : 'system',
          };
          if (f.schema?.type !== undefined) {
            row['type'] = f.schema.type;
          }
          return row;
        }),
      });
    },
  );

  server.registerTool(
    'get_create_meta',
    {
      description:
        'Discover fields available when creating an issue in a project for a given issue type, including which are required and allowed values. ' +
        'Call this before create_issue when a project enforces mandatory custom fields (components, customfield_*, etc.).',
      inputSchema: {
        projectKey: z.string().describe('Project key (e.g., PROJ)'),
        issueType: z.string().describe('Issue type name or numeric ID (e.g., Task, Bug, or 10001)'),
      },
    },
    async ({ projectKey, issueType }) => {
      const issueTypesPage = await client.get<{
        issueTypes?: CreateMetaIssueType[];
        values?: CreateMetaIssueType[];
      }>(`/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`);
      const issueTypes = issueTypesPage.issueTypes ?? issueTypesPage.values ?? [];

      const match = issueTypes.find(
        (t) => t.id === issueType || t.name.toLowerCase() === issueType.toLowerCase(),
      );
      if (match === undefined) {
        const names = issueTypes.map((t) => `${t.name} (id=${t.id})`).join(', ');
        return textResult(
          `Issue type "${issueType}" not found for project ${projectKey}. Available: ${names || '(none)'}`,
          { isError: true },
        );
      }

      const allFields = await fetchAllCreateMetaFields(client, projectKey, match.id);
      const required = allFields.filter((f) => f.required);
      const optional = allFields.filter((f) => !f.required);

      return toonResult({
        projectKey,
        issueType: { id: match.id, name: match.name },
        requiredFields: required.map(createMetaFieldToAgentView),
        optionalFields: optional.map(createMetaFieldToAgentView),
      });
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
      const end = result.startAt + result.values.length;

      return toonResult({
        startAt: result.startAt,
        end,
        total: result.total,
        labels: result.values,
        ...(!result.isLast ? { nextStartAt: end } : {}),
      });
    },
  );
}
