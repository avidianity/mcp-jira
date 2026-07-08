import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import { registerIssueTools } from '@/tools/issues';
import { registerCommentTools } from '@/tools/comments';
import { registerTransitionTools } from '@/tools/transitions';
import { registerProjectTools } from '@/tools/projects';
import { registerBoardTools } from '@/tools/boards';
import { registerUserTools } from '@/tools/users';
import { registerLinkTools } from '@/tools/links';
import { registerMediaTools } from '@/tools/media';
import { registerParticipationTools } from '@/tools/participation';
import { registerWorklogTools } from '@/tools/worklogs';
import { registerMetadataTools } from '@/tools/metadata';

export function createServer(client: JiraClient): McpServer {
  const server = new McpServer({
    name: '@avidian/mcp-jira',
    version: '0.1.0',
  });

  registerIssueTools(server, client);
  registerCommentTools(server, client);
  registerTransitionTools(server, client);
  registerProjectTools(server, client);
  registerBoardTools(server, client);
  registerUserTools(server, client);
  registerLinkTools(server, client);
  registerMediaTools(server, client);
  registerParticipationTools(server, client);
  registerWorklogTools(server, client);
  registerMetadataTools(server, client);

  return server;
}
