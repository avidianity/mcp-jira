import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
]);

export function registerMediaTools(server: McpServer, client: JiraClient): void {
  server.registerTool(
    'get_image',
    {
      description:
        'Fetch an image attachment from Jira by its attachment ID. Use this to retrieve images referenced as [image: id=<id>] in issue descriptions or comments. Returns the image as base64-encoded data.',
      inputSchema: {
        attachmentId: z
          .string()
          .describe(
            'The attachment ID from the [image: id=<id>] reference in issue descriptions or comments',
          ),
      },
    },
    async ({ attachmentId }) => {
      const { base64, mimeType } = await client.getAttachmentContent(attachmentId);

      if (!IMAGE_MIME_TYPES.has(mimeType)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Attachment ${attachmentId} is not an image (type: ${mimeType})`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: 'image' as const, data: base64, mimeType }],
      };
    },
  );
}
