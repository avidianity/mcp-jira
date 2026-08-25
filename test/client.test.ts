import { afterEach, describe, expect, it } from 'bun:test';
import { JiraClient } from '../src/jira/client.ts';

const config = {
  jiraBaseUrl: 'https://example.atlassian.net',
  jiraUserEmail: 'user@example.com',
  jiraApiToken: 'token',
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('JiraClient attachment download', () => {
  it('downloads by numeric id through attachment/content with redirect=false', async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      return new Response(Buffer.from('png-bytes'), { status: 200 });
    }) as typeof fetch;

    const client = new JiraClient(config);
    const result = await client.downloadAttachment('42', 'image/png');

    expect(requested).toEqual([
      'https://example.atlassian.net/rest/api/3/attachment/content/42?redirect=false',
    ]);
    expect(result.mimeType).toBe('image/png');
    expect(Buffer.from(result.base64, 'base64').toString()).toBe('png-bytes');
  });

  it('rejects a redirect instead of following it', async () => {
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://api.media.atlassian.com/file/abc/binary' },
      })) as typeof fetch;

    const client = new JiraClient(config);
    await expect(client.downloadAttachment('42', 'image/png')).rejects.toThrow(
      'Failed to download attachment 42 (302): redirected to https://api.media.atlassian.com/file/abc/binary',
    );
  });

  it('includes status and body when a download fails', async () => {
    globalThis.fetch = (async () =>
      new Response('nope', { status: 403 })) as typeof fetch;

    const client = new JiraClient(config);
    await expect(client.downloadAttachment('42', 'image/png')).rejects.toThrow(
      'Failed to download attachment 42 (403): nope',
    );
  });

  it('getAttachmentContent downloads by id, not the metadata content URL', async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith('/rest/api/3/attachment/99')) {
        return jsonResponse({
          id: '99',
          filename: 'a.png',
          mimeType: 'image/png',
          content: 'https://example.atlassian.net/secure/attachment/99/a.png',
        });
      }
      return new Response(Buffer.from('img'), { status: 200 });
    }) as typeof fetch;

    const client = new JiraClient(config);
    await client.getAttachmentContent('99');

    expect(requested[1]).toBe(
      'https://example.atlassian.net/rest/api/3/attachment/content/99?redirect=false',
    );
  });
});
