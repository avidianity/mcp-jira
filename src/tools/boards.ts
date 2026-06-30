import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraBoard, JiraBoardConfig, JiraSprintPage } from '@/jira/types';

export function registerBoardTools(server: McpServer, client: JiraClient): void {
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

      const lines: string[] = [
        `Board: ${board.name} (ID: ${String(board.id)})`,
        `Type: ${board.type}`,
      ];

      if (board.location !== undefined) {
        lines.push(`Project: ${board.location.projectKey} — ${board.location.projectName}`);
      }

      lines.push('', 'Columns:');
      for (const col of config.columnConfig.columns) {
        const statuses = col.statuses.map((s) => s.id).join(', ');
        const statusInfo = statuses.length > 0 ? ` (status IDs: ${statuses})` : '';
        lines.push(`  - ${col.name}${statusInfo}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
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

      if (result.values.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No ${state ?? 'active'} sprints found for board ${String(boardId)}.`,
            },
          ],
        };
      }

      const lines: string[] = [`Sprints for board ${String(boardId)}:`, ''];
      for (const sprint of result.values) {
        lines.push(`Sprint: ${sprint.name} (ID: ${String(sprint.id)})`);
        lines.push(`  State: ${sprint.state}`);
        if (sprint.startDate !== undefined) {
          lines.push(`  Start: ${sprint.startDate}`);
        }
        if (sprint.endDate !== undefined) {
          lines.push(`  End: ${sprint.endDate}`);
        }
        if (sprint.goal !== undefined && sprint.goal.length > 0) {
          lines.push(`  Goal: ${sprint.goal}`);
        }
        lines.push('');
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );
}
