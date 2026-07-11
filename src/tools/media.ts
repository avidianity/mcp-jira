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

const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/mpeg',
  'video/ogg',
  'video/3gpp',
  'video/3gpp2',
  'video/x-flv',
  'video/x-ms-wmv',
]);

const VIDEO_FILE_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.mpeg',
  '.mpg',
  '.ogv',
  '.3gp',
  '.3g2',
  '.flv',
  '.wmv',
  '.m4v',
]);

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'text/xml',
  'text/yaml',
  'text/x-yaml',
  'text/javascript',
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-c++src',
  'text/x-csharp',
  'text/x-ruby',
  'text/x-go',
  'text/x-rust',
  'text/x-shellscript',
  'text/x-sql',
  'text/x-log',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/javascript',
  'application/typescript',
  'application/x-sh',
  'application/sql',
  'application/graphql',
  'application/toml',
]);

const TEXT_FILE_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.rb',
  '.go',
  '.rs',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.graphql',
  '.gql',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.log',
  '.diff',
  '.patch',
  '.swift',
  '.kt',
  '.kts',
  '.scala',
  '.php',
  '.r',
  '.lua',
  '.pl',
  '.pm',
]);

function fileExtension(filename: string): string {
  return filename.lastIndexOf('.') !== -1 ? filename.slice(filename.lastIndexOf('.')) : '';
}

function isTextFile(mimeType: string, filename: string): boolean {
  if (TEXT_MIME_TYPES.has(mimeType)) return true;
  if (mimeType.startsWith('text/')) return true;
  return TEXT_FILE_EXTENSIONS.has(fileExtension(filename).toLowerCase());
}

function isVideoFile(mimeType: string, filename: string): boolean {
  if (VIDEO_MIME_TYPES.has(mimeType)) return true;
  if (mimeType.startsWith('video/')) return true;
  return VIDEO_FILE_EXTENSIONS.has(fileExtension(filename).toLowerCase());
}

function attachmentNotFound(
  issueKey: string,
  fileId: string,
): { content: [{ type: 'text'; text: string }]; isError: true } {
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

function binaryResource(
  att: JiraAttachment,
  base64: string,
): {
  content: [
    { type: 'text'; text: string },
    {
      type: 'resource';
      resource: { uri: string; mimeType: string; blob: string };
    },
  ];
} {
  return {
    content: [
      {
        type: 'text' as const,
        text: `--- ${att.filename} (${att.mimeType}, ${String(Math.round(att.size / 1024))}KB) ---`,
      },
      {
        type: 'resource' as const,
        resource: {
          uri: `jira://attachment/${att.id}/${encodeURIComponent(att.filename)}`,
          mimeType: att.mimeType,
          blob: base64,
        },
      },
    ],
  };
}

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
        return attachmentNotFound(issueKey, fileId);
      }

      if (!IMAGE_MIME_TYPES.has(att.mimeType)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Attachment "${att.filename}" is not an image (type: ${att.mimeType}). Use get_video, get_text_file, or get_binary_file as appropriate.`,
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
        'List all attachments on a Jira issue. Useful for discovering files that may not be embedded in the description or comments. Use get_image for images, get_video for videos, get_text_file for text/source files, or get_binary_file for other binary attachments.',
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
        const isVideo = isVideoFile(att.mimeType, att.filename);
        const isText = isTextFile(att.mimeType, att.filename);
        const tag = isImage ? ' [image]' : isVideo ? ' [video]' : isText ? ' [text]' : ' [binary]';
        const mediaId =
          att.mediaApiFileId !== undefined ? `, mediaFileId=${att.mediaApiFileId}` : '';
        lines.push(
          `- ${att.filename} (id=${att.id}${mediaId}, ${att.mimeType}, ${String(Math.round(att.size / 1024))}KB)${tag}`,
        );
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'get_text_file',
    {
      description:
        'Fetch a text-based file attachment from a Jira issue and return its content as plain text. Supports common text formats including .txt, .md, .csv, .json, .xml, .yaml, .log, .sql, and source code files (.js, .ts, .py, .java, etc.). Use list_attachments to discover available files. Accepts either an attachment ID (numeric) or a media file ID (UUID).',
      inputSchema: {
        issueKey: z
          .string()
          .regex(ISSUE_KEY_PATTERN)
          .describe('The issue key (e.g., PROJ-123). Required to resolve media file UUIDs.'),
        fileId: z
          .string()
          .describe(
            'The attachment ID (numeric) or media file ID (UUID) from attachment references',
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
        return attachmentNotFound(issueKey, fileId);
      }

      if (!isTextFile(att.mimeType, att.filename)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Attachment "${att.filename}" is not a text file (type: ${att.mimeType}). Use get_image for images, get_video for videos, or get_binary_file for other binaries.`,
            },
          ],
          isError: true,
        };
      }

      const text = await client.downloadUrlAsText(att.content);
      return {
        content: [
          {
            type: 'text' as const,
            text: `--- ${att.filename} (${att.mimeType}) ---\n${text}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'get_video',
    {
      description:
        'Fetch a video attachment from a Jira issue and return it as a base64 embedded resource. Supports common video formats including .mp4, .webm, .mov, .avi, .mkv, .mpeg, .ogv, and .3gp. Use list_attachments to discover available files. Accepts either an attachment ID (numeric) or a media file ID (UUID).',
      inputSchema: {
        issueKey: z
          .string()
          .regex(ISSUE_KEY_PATTERN)
          .describe('The issue key (e.g., PROJ-123). Required to resolve media file UUIDs.'),
        fileId: z
          .string()
          .describe(
            'The attachment ID (numeric) or media file ID (UUID) from attachment references',
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
        return attachmentNotFound(issueKey, fileId);
      }

      if (!isVideoFile(att.mimeType, att.filename)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Attachment "${att.filename}" is not a video (type: ${att.mimeType}). Use get_image for images, get_text_file for text, or get_binary_file for other binaries.`,
            },
          ],
          isError: true,
        };
      }

      const { base64 } = await client.downloadUrl(att.content, att.mimeType);
      return binaryResource(att, base64);
    },
  );

  server.registerTool(
    'get_binary_file',
    {
      description:
        'Fetch a binary file attachment from a Jira issue and return it as a base64 embedded resource. Use for PDFs, archives, office docs, and other non-text binaries. Prefer get_image for images, get_video for videos, and get_text_file for text/source files. Use list_attachments to discover available files. Accepts either an attachment ID (numeric) or a media file ID (UUID).',
      inputSchema: {
        issueKey: z
          .string()
          .regex(ISSUE_KEY_PATTERN)
          .describe('The issue key (e.g., PROJ-123). Required to resolve media file UUIDs.'),
        fileId: z
          .string()
          .describe(
            'The attachment ID (numeric) or media file ID (UUID) from attachment references',
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
        return attachmentNotFound(issueKey, fileId);
      }

      if (isTextFile(att.mimeType, att.filename)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Attachment "${att.filename}" is a text file (type: ${att.mimeType}). Use get_text_file instead.`,
            },
          ],
          isError: true,
        };
      }

      if (IMAGE_MIME_TYPES.has(att.mimeType)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Attachment "${att.filename}" is an image (type: ${att.mimeType}). Use get_image instead.`,
            },
          ],
          isError: true,
        };
      }

      if (isVideoFile(att.mimeType, att.filename)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Attachment "${att.filename}" is a video (type: ${att.mimeType}). Use get_video instead.`,
            },
          ],
          isError: true,
        };
      }

      const { base64 } = await client.downloadUrl(att.content, att.mimeType);
      return binaryResource(att, base64);
    },
  );

  server.registerTool(
    'add_attachment',
    {
      description:
        'Upload a file attachment to a Jira issue. Provide the content either as plain UTF-8 text (content) or as base64 (contentBase64) for binary files. Exactly one of content or contentBase64 must be given.',
      inputSchema: {
        issueKey: z.string().regex(ISSUE_KEY_PATTERN).describe('The issue key (e.g., PROJ-123)'),
        filename: z.string().describe('The filename to store the attachment as (e.g., notes.txt)'),
        content: z.string().optional().describe('File content as plain UTF-8 text'),
        contentBase64: z
          .string()
          .optional()
          .describe('File content as a base64-encoded string (for binary files)'),
        mimeType: z
          .string()
          .optional()
          .describe('MIME type of the file (default: application/octet-stream)'),
      },
    },
    async ({ issueKey, filename, content, contentBase64, mimeType }) => {
      if ((content === undefined) === (contentBase64 === undefined)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Provide exactly one of content (text) or contentBase64 (binary).',
            },
          ],
          isError: true,
        };
      }

      const data =
        contentBase64 !== undefined
          ? Buffer.from(contentBase64, 'base64')
          : Buffer.from(content ?? '', 'utf-8');
      const type = mimeType ?? (content !== undefined ? 'text/plain' : 'application/octet-stream');

      const uploaded = await client.uploadAttachment<JiraAttachment[]>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
        filename,
        data,
        type,
      );

      const first = uploaded[0];
      const idInfo = first !== undefined ? ` (id=${first.id})` : '';
      return {
        content: [
          { type: 'text' as const, text: `Attached "${filename}" to ${issueKey}${idInfo}` },
        ],
      };
    },
  );

  server.registerTool(
    'delete_attachment',
    {
      description:
        'Delete an attachment by its numeric attachment ID (from list_attachments). This cannot be undone.',
      inputSchema: {
        attachmentId: z.string().describe('The numeric attachment ID (from list_attachments)'),
      },
    },
    async ({ attachmentId }) => {
      await client.del(`/rest/api/3/attachment/${encodeURIComponent(attachmentId)}`);
      return {
        content: [{ type: 'text' as const, text: `Deleted attachment ${attachmentId}` }],
      };
    },
  );
}
