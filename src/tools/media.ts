import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JiraClient } from '@/jira/client';
import type { JiraAttachment } from '@/jira/types';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/i;

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
        'Fetch an image attachment from a Jira issue. Accepts either an attachment ID (numeric) or a media file ID (UUID from [image: id=<uuid>] references in descriptions/comments). When using a UUID, the issueKey is required to resolve it.',
      inputSchema: {
        issueKey: z
          .string()
          .regex(ISSUE_KEY_PATTERN)
          .describe('The issue key (e.g., PROJ-123). Required to resolve media file UUIDs.'),
        fileId: z
          .string()
          .describe(
            'The attachment ID (numeric) or media file ID (UUID) from [image: id=<id>] references',
          ),
      },
    },
    async ({ issueKey, fileId }) => {
      const attachments = await client.get<{ fields: { attachment: JiraAttachment[] } }>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=attachment`,
      );

      const att = attachments.fields.attachment.find(
        (a) => a.id === fileId || a.mediaApiFileId === fileId,
      );

      if (att === undefined) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No attachment found matching ID "${fileId}" on ${issueKey}. Use list_attachments to see available attachments.`,
            },
          ],
          isError: true,
        };
      }

      if (!IMAGE_MIME_TYPES.has(att.mimeType)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Attachment "${att.filename}" is not an image (type: ${att.mimeType})`,
            },
          ],
          isError: true,
        };
      }

      const { base64, mimeType } = await client.downloadUrl(att.content, att.mimeType);
      return {
        content: [{ type: 'image' as const, data: base64, mimeType }],
      };
    },
  );

  server.registerTool(
    'list_attachments',
    {
      description:
        'List all attachments on a Jira issue. Useful for discovering images that may not be embedded in the description or comments. Use get_image with the attachment ID to fetch image content.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
      },
    },
    async ({ issueKey }) => {
      const result = await client.get<{ fields: { attachment: JiraAttachment[] } }>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=attachment`,
      );

      const attachments = result.fields.attachment;
      if (attachments.length === 0) {
        return { content: [{ type: 'text' as const, text: `No attachments on ${issueKey}` }] };
      }

      const lines: string[] = [`Attachments on ${issueKey} (${String(attachments.length)}):`, ''];
      for (const att of attachments) {
        const isImage = IMAGE_MIME_TYPES.has(att.mimeType);
        const tag = isImage ? ' [image]' : '';
        const mediaId =
          att.mediaApiFileId !== undefined ? `, mediaFileId=${att.mediaApiFileId}` : '';
        lines.push(
          `- ${att.filename} (id=${att.id}${mediaId}, ${att.mimeType}, ${String(Math.round(att.size / 1024))}KB)${tag}`,
        );
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );
}
