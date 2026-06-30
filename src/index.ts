import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import cors from '@fastify/cors';
import { program } from 'commander';
import Fastify from 'fastify';
import { loadConfig } from '@/config';
import { JiraClient } from '@/jira/client';
import { createServer } from '@/server';

const DEFAULT_PORT = 5485;

program
  .name('mcp-jira')
  .version('0.1.0')
  .description('MCP server for Jira Cloud')
  .option('--transport <type>', 'Transport type: stdio or http', 'stdio')
  .option(
    '--port <number>',
    `Port for HTTP transport (default: PORT env or ${String(DEFAULT_PORT)})`,
  )
  .parse();

const opts = program.opts<{ transport: string; port?: string }>();

async function main(): Promise<void> {
  const transportName = opts.transport;
  const portEnv = process.env['PORT'];
  const port =
    opts.port !== undefined
      ? parseInt(opts.port, 10)
      : portEnv !== undefined && portEnv.length > 0
        ? parseInt(portEnv, 10)
        : DEFAULT_PORT;

  const config = loadConfig();
  const client = new JiraClient(config);

  if (transportName === 'stdio') {
    const server = createServer(client);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else if (transportName === 'http') {
    const app = Fastify();
    await app.register(cors, {
      origin: '*',
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'mcp-session-id'],
      exposedHeaders: ['mcp-session-id'],
    });

    const sessions = new Map<string, StreamableHTTPServerTransport>();

    app.all('/mcp', async (req, reply) => {
      const rawSessionId = req.headers['mcp-session-id'];
      const sessionId = typeof rawSessionId === 'string' ? rawSessionId : undefined;

      if (sessionId !== undefined) {
        const transport = sessions.get(sessionId);
        if (transport !== undefined) {
          await transport.handleRequest(req.raw, reply.raw, req.body);
          return reply;
        }
        return reply.status(404).send({ error: 'Session not found' });
      }

      if (req.method !== 'POST') {
        return reply.status(400).send({ error: 'New sessions require POST' });
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid !== undefined) {
          sessions.delete(sid);
        }
      };

      const server = createServer(client);
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);

      const sid = transport.sessionId;
      if (sid !== undefined) {
        sessions.set(sid, transport);
      }

      return reply;
    });

    app.get('/health', async (_req, reply) => {
      return reply.send({ status: 'ok', sessions: sessions.size });
    });

    await app.listen({ port, host: '0.0.0.0' });
    console.info(`@avidian/mcp-jira server listening on http://localhost:${String(port)}`);
    console.info(`  MCP endpoint: http://localhost:${String(port)}/mcp`);
  } else {
    console.error(`Unknown transport: ${transportName}. Use 'stdio' or 'http'.`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
