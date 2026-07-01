import type { Config } from '@/config';

const MAX_RETRIES = 3;

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: Config) {
    this.baseUrl = config.jiraBaseUrl.replace(/\/$/, '');
    const credentials = Buffer.from(`${config.jiraUserEmail}:${config.jiraApiToken}`).toString(
      'base64',
    );
    this.authHeader = `Basic ${credentials}`;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const extraHeaders: Record<string, string> =
      options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : Array.isArray(options.headers)
          ? Object.fromEntries(options.headers as [string, string][])
          : ((options.headers as Record<string, string> | undefined) ?? {});

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...extraHeaders,
        },
      });

      if (response.status === 429) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`Jira API rate limited after ${String(MAX_RETRIES)} retries`);
        }
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter !== null ? parseInt(retryAfter, 10) * 1000 : 1000 * (attempt + 1);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Jira API error (${String(response.status)}): ${body}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    }

    throw new Error('Exhausted retries without returning');
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async getAttachmentContent(attachmentId: string): Promise<{ base64: string; mimeType: string }> {
    const meta = await this.get<{
      id: string;
      filename: string;
      mimeType: string;
      content: string;
    }>(`/rest/api/3/attachment/${attachmentId}`);

    return this.downloadUrl(meta.content, meta.mimeType);
  }

  async downloadUrl(url: string, mimeType: string): Promise<{ base64: string; mimeType: string }> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });

      if (response.status === 429) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`Jira API rate limited after ${String(MAX_RETRIES)} retries`);
        }
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter !== null ? parseInt(retryAfter, 10) * 1000 : 1000 * (attempt + 1);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Failed to download (${String(response.status)})`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return { base64, mimeType };
    }

    throw new Error('Exhausted retries without returning');
  }

  async downloadUrlAsText(url: string): Promise<string> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });

      if (response.status === 429) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`Jira API rate limited after ${String(MAX_RETRIES)} retries`);
        }
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter !== null ? parseInt(retryAfter, 10) * 1000 : 1000 * (attempt + 1);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Failed to download (${String(response.status)})`);
      }

      return await response.text();
    }

    throw new Error('Exhausted retries without returning');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
