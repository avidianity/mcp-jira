import { z } from 'zod';

const configSchema = z.object({
  jiraBaseUrl: z
    .string({ required_error: 'JIRA_BASE_URL is required' })
    .url('JIRA_BASE_URL must be a valid URL'),
  jiraUserEmail: z
    .string({ required_error: 'JIRA_USER_EMAIL is required' })
    .email('JIRA_USER_EMAIL must be a valid email'),
  jiraApiToken: z
    .string({ required_error: 'JIRA_API_TOKEN is required' })
    .min(1, 'JIRA_API_TOKEN must not be empty'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    jiraBaseUrl: process.env['JIRA_BASE_URL'],
    jiraUserEmail: process.env['JIRA_USER_EMAIL'],
    jiraApiToken: process.env['JIRA_API_TOKEN'],
  });

  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  return result.data;
}
