import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'bun:test';
import { writeAttachmentToTemp } from '../src/tools/media.ts';
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
