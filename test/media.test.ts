import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'bun:test';
import {
  getTextAttachment,
  writeAttachmentToTemp,
  type TextAttachmentClient,
} from '../src/tools/media.ts';
import type { JiraAttachment } from '../src/jira/types.ts';

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
  calls: { downloadUrl: number; downloadUrlAsText: number };
}

/**
 * A minimal fake JiraClient. `rawBytes` is what the byte-faithful download
 * returns; `decodedText` is what the UTF-8 text path returns (deliberately
 * different, so a test can prove which path was taken).
 */
function fakeClient(
  att: JiraAttachment | undefined,
  opts: { rawBytes?: Buffer; decodedText?: string } = {},
): FakeClient {
  const calls = { downloadUrl: 0, downloadUrlAsText: 0 };
  return {
    calls,
    get: async <T>() => ({ fields: { attachment: att !== undefined ? [att] : [] } }) as T,
    downloadUrl: async (_url: string, mimeType: string) => {
      calls.downloadUrl++;
      return { base64: (opts.rawBytes ?? Buffer.alloc(0)).toString('base64'), mimeType };
    },
    downloadUrlAsText: async () => {
      calls.downloadUrlAsText++;
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

    expect(client.calls.downloadUrl).toBe(1);
    expect(client.calls.downloadUrlAsText).toBe(0);

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

    expect(client.calls.downloadUrlAsText).toBe(1);
    expect(client.calls.downloadUrl).toBe(0);
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
    expect(client.calls.downloadUrl).toBe(0);
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
});
