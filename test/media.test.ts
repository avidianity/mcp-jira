import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'bun:test';
import {
  findAttachment,
  getTextAttachment,
  loadIssueAttachment,
  writeAttachmentToTemp,
  type TextAttachmentClient,
} from '../src/tools/media.ts';
import type { AdfDocument, JiraAttachment } from '../src/jira/types.ts';

function makeAttachment(overrides: Partial<JiraAttachment> = {}): JiraAttachment {
  return {
    id: '42',
    self: 'https://example.atlassian.net/rest/api/3/attachment/42',
    filename: 'demo.mp4',
    mimeType: 'video/mp4',
    size: 12,
    created: '2026-01-01T00:00:00.000+0000',
    content: 'https://example.atlassian.net/secure/attachment/42/demo.mp4',
    author: {
      accountId: 'acc',
      displayName: 'Test',
      active: true,
    },
    ...overrides,
  };
}

interface FakeClient extends TextAttachmentClient {
  calls: { downloadAttachment: number; downloadAttachmentAsText: number; get: string[] };
}

/**
 * A minimal fake JiraClient. `rawBytes` is what the byte-faithful download
 * returns; `decodedText` is what the UTF-8 text path returns (deliberately
 * different, so a test can prove which path was taken).
 */
function mediaDescription(id: string, filename: string): AdfDocument {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'mediaSingle',
        content: [
          {
            type: 'media',
            attrs: { id, type: 'file', alt: filename },
          },
        ],
      },
    ],
  };
}

function fakeClient(
  att: JiraAttachment | undefined,
  opts: {
    rawBytes?: Buffer;
    decodedText?: string;
    description?: AdfDocument | null;
    commentBodies?: AdfDocument[];
  } = {},
): FakeClient {
  const calls = { downloadAttachment: 0, downloadAttachmentAsText: 0, get: [] as string[] };
  return {
    calls,
    get: async <T>(path: string) => {
      calls.get.push(path);
      return {
        fields: {
          attachment: att !== undefined ? [att] : [],
          description: opts.description ?? null,
          comment: {
            startAt: 0,
            maxResults: 50,
            total: opts.commentBodies?.length ?? 0,
            comments: (opts.commentBodies ?? []).map((body, i) => ({
              id: String(i),
              self: '',
              author: { accountId: 'acc', displayName: 'Test', active: true },
              body,
              created: '2026-01-01T00:00:00.000+0000',
              updated: '2026-01-01T00:00:00.000+0000',
            })),
          },
        },
      } as T;
    },
    downloadAttachment: async (_id: string, mimeType: string) => {
      calls.downloadAttachment++;
      return { base64: (opts.rawBytes ?? Buffer.alloc(0)).toString('base64'), mimeType };
    },
    downloadAttachmentAsText: async () => {
      calls.downloadAttachmentAsText++;
      return opts.decodedText ?? '';
    },
  };
}

function savedPathFrom(text: string): string {
  const first = text.split('\n')[0] ?? '';
  return first.replace('Saved: ', '');
}

describe('writeAttachmentToTemp', () => {
  it('writes base64 bytes under tmpdir with attachment id and original filename', async () => {
    const payload = Buffer.from('hello-video');
    const att = makeAttachment();
    const filePath = await writeAttachmentToTemp(att, payload.toString('base64'));

    expect(filePath.startsWith(tmpdir())).toBe(true);
    expect(filePath).toContain('jira-attachment-42-demo.mp4');
    expect(await readFile(filePath)).toEqual(payload);

    await unlink(filePath);
  });

  it('sanitizes path separators in the original filename', async () => {
    const att = makeAttachment({ filename: '../../evil/name.mov', id: '99' });
    const filePath = await writeAttachmentToTemp(att, Buffer.from('x').toString('base64'));

    expect(filePath).toContain('jira-attachment-99-name.mov');
    expect(filePath.includes('..')).toBe(false);

    await unlink(filePath);
  });
});

describe('getTextAttachment', () => {
  const harJson = '{"log":{"version":"1.2","creator":{"name":"x","version":"1"},"entries":[]}}';

  it('path mode writes a clean, parser-safe file from the raw bytes (no banner)', async () => {
    const rawBytes = Buffer.from(harJson, 'utf-8');
    const att = makeAttachment({
      id: '77',
      filename: 'capture.har',
      mimeType: 'text/plain',
      size: rawBytes.length,
      content: 'https://example.atlassian.net/secure/attachment/77/capture.har',
    });
    // The decoded-text path returns something different; if path mode used it,
    // the on-disk bytes would not equal the source fixture.
    const client = fakeClient(att, { rawBytes, decodedText: 'DECODED-SHOULD-NOT-BE-USED' });

    const result = await getTextAttachment(client, {
      issueKey: 'PROJ-1',
      fileId: '77',
      output: 'path',
    });

    expect(client.calls.downloadAttachment).toBe(1);
    expect(client.calls.downloadAttachmentAsText).toBe(0);

    const filePath = savedPathFrom(result.content[0]?.text ?? '');
    const onDisk = await readFile(filePath);

    // Byte-for-byte faithful to the source.
    expect(onDisk.equals(rawBytes)).toBe(true);
    // First byte is real content, not a banner.
    expect(onDisk[0]).toBe('{'.charCodeAt(0));
    // Parses as JSON with no pre-stripping.
    expect(() => JSON.parse(onDisk.toString('utf-8'))).not.toThrow();

    await unlink(filePath);
  });

  it('path mode preserves bytes exactly, including a UTF-8 BOM and multibyte chars', async () => {
    const rawBytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('{"note":"café ☕"}', 'utf-8'),
    ]);
    const att = makeAttachment({
      id: '78',
      filename: 'bom.json',
      mimeType: 'application/json',
      size: rawBytes.length,
      content: 'https://example.atlassian.net/secure/attachment/78/bom.json',
    });
    const client = fakeClient(att, { rawBytes, decodedText: 'stripped-of-bom' });

    const result = await getTextAttachment(client, {
      issueKey: 'PROJ-1',
      fileId: '78',
      output: 'path',
    });

    const filePath = savedPathFrom(result.content[0]?.text ?? '');
    const onDisk = await readFile(filePath);

    // The BOM survives, proving we wrote raw bytes rather than decoded text.
    expect(onDisk.equals(rawBytes)).toBe(true);
    expect([onDisk[0], onDisk[1], onDisk[2]]).toEqual([0xef, 0xbb, 0xbf]);

    await unlink(filePath);
  });

  it('text mode (default) returns inline content with a banner, via the text path', async () => {
    const att = makeAttachment({
      id: '79',
      filename: 'capture.har',
      mimeType: 'text/plain',
      content: 'https://example.atlassian.net/secure/attachment/79/capture.har',
    });
    const client = fakeClient(att, { decodedText: harJson });

    const result = await getTextAttachment(client, {
      issueKey: 'PROJ-1',
      fileId: '79',
      output: 'text',
    });

    expect(client.calls.downloadAttachmentAsText).toBe(1);
    expect(client.calls.downloadAttachment).toBe(0);
    expect(result.content[0]?.text).toBe(`--- capture.har (text/plain) ---\n${harJson}`);
  });

  it('rejects a non-text attachment in either mode', async () => {
    const att = makeAttachment({
      id: '80',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      content: 'https://example.atlassian.net/secure/attachment/80/report.pdf',
    });
    const client = fakeClient(att, { rawBytes: Buffer.from('%PDF') });

    const result = await getTextAttachment(client, {
      issueKey: 'PROJ-1',
      fileId: '80',
      output: 'path',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('is not a text file');
    expect(client.calls.downloadAttachment).toBe(0);
  });

  it('reports when the attachment id is not found', async () => {
    const client = fakeClient(undefined);

    const result = await getTextAttachment(client, {
      issueKey: 'PROJ-1',
      fileId: 'missing',
      output: 'path',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('No attachment found');
  });

  it('resolves a media UUID through the description filename map', async () => {
    const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const att = makeAttachment({
      id: '77',
      filename: 'capture.har',
      mimeType: 'text/plain',
    });
    const client = fakeClient(att, {
      decodedText: harJson,
      description: mediaDescription(uuid, 'capture.har'),
    });

    const result = await getTextAttachment(client, {
      issueKey: 'PROJ-1',
      fileId: uuid,
      output: 'text',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain(harJson);
    expect(client.calls.downloadAttachmentAsText).toBe(1);
  });
});

describe('findAttachment', () => {
  it('matches a numeric attachment id', () => {
    const att = makeAttachment({ id: '42' });
    expect(findAttachment([att], '42')).toBe(att);
  });

  it('matches a UUID found in the content URL', () => {
    const uuid = '11111111-2222-4333-8444-555555555555';
    const att = makeAttachment({
      id: '9',
      content: `https://media.example/file/${uuid}/binary`,
    });
    expect(findAttachment([att], uuid)).toBe(att);
  });

  it('matches a UUID via ADF filename map when metadata has no mediaApiFileId', () => {
    const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const att = makeAttachment({ id: '9', filename: 'shot.png' });
    const map = new Map([[uuid, 'shot.png']]);
    expect(findAttachment([att], uuid, map)).toBe(att);
  });
});

describe('loadIssueAttachment', () => {
  it('resolves a UUID from a comment media node', async () => {
    const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const att = makeAttachment({ id: '12', filename: 'notes.txt', mimeType: 'text/plain' });
    const client = fakeClient(att, {
      commentBodies: [mediaDescription(uuid, 'notes.txt')],
    });

    const found = await loadIssueAttachment(client, 'PROJ-1', uuid);
    expect(found?.id).toBe('12');
  });
});
