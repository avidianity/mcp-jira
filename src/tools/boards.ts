import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraBoard, JiraBoardConfig, JiraSprint, JiraSprintPage } from '@/jira/types';
import { textResult, toonResult } from '@/format/response';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

interface JiraBoardPage {
  maxResults: number;
  startAt: number;
  total: number;
  isLast: boolean;
  values: JiraBoard[];
}

function sprintToAgentView(sprint: JiraSprint): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
  };
  if (sprint.startDate !== undefined) {
    row['startDate'] = sprint.startDate;
  }
  if (sprint.endDate !== undefined) {
    row['endDate'] = sprint.endDate;
  }
  if (sprint.goal !== undefined && sprint.goal.length > 0) {
    row['goal'] = sprint.goal;
  }
  return row;
}

export function registerBoardTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'list_boards',
    {
      description:
        'List Jira Agile boards (Scrum/Kanban), optionally filtered by project. Returns board IDs needed by get_board and get_sprint.',
      inputSchema: {
        projectKeyOrId: z
          .string()
          .optional()
          .describe('Filter boards by project key or ID (e.g., PROJ)'),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum boards to return (1-100, default 50)'),
        startAt: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Index of the first result (for pagination, default 0)'),
      },
    },
    async ({ projectKeyOrId, maxResults, startAt }) => {
      const params = new URLSearchParams();
      params.set('maxResults', String(maxResults ?? 50));
      if (startAt !== undefined) {
        params.set('startAt', String(startAt));
      }
      if (projectKeyOrId !== undefined) {
        params.set('projectKeyOrId', projectKeyOrId);
      }

      const result = await client.get<JiraBoardPage>(`/rest/agile/1.0/board?${params.toString()}`);
      const end = result.startAt + result.values.length;

      return toonResult({
        startAt: result.startAt,
        end,
        total: result.total,
        boards: result.values.map((board) => {
          const row: Record<string, unknown> = {
            id: board.id,
            name: board.name,
            type: board.type,
          };
          if (board.location !== undefined) {
            row['projectKey'] = board.location.projectKey;
          }
          return row;
        }),
        ...(!result.isLast ? { nextStartAt: end } : {}),
      });
    },
  );

  server.registerTool(
    'get_board',
    {
      description:
        'Get a Jira board configuration including its columns and statuses. Boards are used in Scrum and Kanban projects.',
      inputSchema: {
        boardId: z.number().int().positive().describe('The board ID'),
      },
    },
    async ({ boardId }) => {
      const [board, config] = await Promise.all([
        client.get<JiraBoard>(`/rest/agile/1.0/board/${String(boardId)}`),
        client.get<JiraBoardConfig>(`/rest/agile/1.0/board/${String(boardId)}/configuration`),
      ]);

      const view: Record<string, unknown> = {
        id: board.id,
        name: board.name,
        type: board.type,
        columns: config.columnConfig.columns.map((col) => ({
          name: col.name,
          statusIds: col.statuses.map((s) => s.id),
        })),
      };

      if (board.location !== undefined) {
        view['projectKey'] = board.location.projectKey;
        view['projectName'] = board.location.projectName;
      }

      return toonResult(view);
    },
  );

  server.registerTool(
    'get_sprint',
    {
      description:
        'Get sprints for a Jira board. Defaults to active sprints. Use state parameter to get future or closed sprints.',
      inputSchema: {
        boardId: z.number().int().positive().describe('The board ID'),
        state: z
          .enum(['active', 'future', 'closed'])
          .optional()
          .describe('Filter by sprint state (default: active)'),
      },
    },
    async ({ boardId, state }) => {
      const params = new URLSearchParams();
      params.set('state', state ?? 'active');

      const result = await client.get<JiraSprintPage>(
        `/rest/agile/1.0/board/${String(boardId)}/sprint?${params.toString()}`,
      );

      return toonResult({
        boardId,
        state: state ?? 'active',
        sprints: result.values.map(sprintToAgentView),
      });
    },
  );

  server.registerTool(
    'create_sprint',
    {
      description:
        'Create a new sprint on a Scrum board. The sprint starts in the "future" state; use start_sprint to activate it.',
      inputSchema: {
        boardId: z.number().int().positive().describe('The board ID to create the sprint on'),
        name: z.string().describe('Sprint name'),
        goal: z.string().optional().describe('Optional sprint goal'),
        startDate: z.string().optional().describe('Planned start date (ISO-8601)'),
        endDate: z.string().optional().describe('Planned end date (ISO-8601)'),
      },
    },
    async ({ boardId, name, goal, startDate, endDate }) => {
      const body: Record<string, unknown> = { name, originBoardId: boardId };
      if (goal !== undefined) {
        body['goal'] = goal;
      }
      if (startDate !== undefined) {
        body['startDate'] = startDate;
      }
      if (endDate !== undefined) {
        body['endDate'] = endDate;
      }

      const sprint = await client.post<JiraSprint>('/rest/agile/1.0/sprint', body);
      return textResult(
        `Created sprint "${sprint.name}" (ID: ${String(sprint.id)}) on board ${String(boardId)}`,
      );
    },
  );

  server.registerTool(
    'start_sprint',
    {
      description:
        'Start a sprint (transition it to the active state). A start and end date are required by Jira to activate a sprint.',
      inputSchema: {
        sprintId: z.number().int().positive().describe('The sprint ID (from get_sprint)'),
        startDate: z.string().describe('Sprint start date (ISO-8601)'),
        endDate: z.string().describe('Sprint end date (ISO-8601)'),
      },
    },
    async ({ sprintId, startDate, endDate }) => {
      await client.post(`/rest/agile/1.0/sprint/${String(sprintId)}`, {
        state: 'active',
        startDate,
        endDate,
      });
      return textResult(`Started sprint ${String(sprintId)}`);
    },
  );

  server.registerTool(
    'complete_sprint',
    {
      description: 'Complete (close) an active sprint.',
      inputSchema: {
        sprintId: z.number().int().positive().describe('The sprint ID (from get_sprint)'),
      },
    },
    async ({ sprintId }) => {
      await client.post(`/rest/agile/1.0/sprint/${String(sprintId)}`, { state: 'closed' });
      return textResult(`Completed sprint ${String(sprintId)}`);
    },
  );

  server.registerTool(
    'move_issues_to_sprint',
    {
      description: 'Move one or more issues into a sprint.',
      inputSchema: {
        sprintId: z.number().int().positive().describe('The target sprint ID'),
        issueKeys: z
          .array(z.string().regex(ISSUE_KEY_PATTERN))
          .min(1)
          .describe('Issue keys to move (e.g., ["PROJ-1", "PROJ-2"])'),
      },
    },
    async ({ sprintId, issueKeys }) => {
      await client.post(`/rest/agile/1.0/sprint/${String(sprintId)}/issue`, {
        issues: issueKeys,
      });
      return textResult(`Moved ${String(issueKeys.length)} issue(s) to sprint ${String(sprintId)}`);
    },
  );

  server.registerTool(
    'move_issues_to_backlog',
    {
      description: 'Move one or more issues out of their sprint and back to the backlog.',
      inputSchema: {
        issueKeys: z
          .array(z.string().regex(ISSUE_KEY_PATTERN))
          .min(1)
          .describe('Issue keys to move to the backlog'),
      },
    },
    async ({ issueKeys }) => {
      await client.post('/rest/agile/1.0/backlog/issue', { issues: issueKeys });
      return textResult(`Moved ${String(issueKeys.length)} issue(s) to the backlog`);
    },
  );

  server.registerTool(
    'add_issues_to_epic',
    {
      description:
        'Add one or more issues to an epic. Pass epicKey "none" to remove the issues from their current epic.',
      inputSchema: {
        epicKey: z.string().describe('The epic issue key (e.g., PROJ-1), or "none" to unlink'),
        issueKeys: z
          .array(z.string().regex(ISSUE_KEY_PATTERN))
          .min(1)
          .describe('Issue keys to add to the epic'),
      },
    },
    async ({ epicKey, issueKeys }) => {
      await client.post(`/rest/agile/1.0/epic/${encodeURIComponent(epicKey)}/issue`, {
        issues: issueKeys,
      });
      const action = epicKey === 'none' ? 'Removed from epic' : `Added to epic ${epicKey}`;
      return textResult(`${action}: ${String(issueKeys.length)} issue(s)`);
    },
  );
}
