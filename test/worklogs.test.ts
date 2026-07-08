import { describe, expect, it } from 'bun:test';
import { toJiraDateTime } from '../src/tools/worklogs.ts';

describe('toJiraDateTime', () => {
  it('formats an ISO string into Jira format with a +0000 offset and no trailing Z', () => {
    expect(toJiraDateTime('2021-01-17T12:34:00Z')).toBe('2021-01-17T12:34:00.000+0000');
  });

  it('normalizes a zoned ISO string to UTC', () => {
    expect(toJiraDateTime('2021-01-17T12:34:00+05:00')).toBe('2021-01-17T07:34:00.000+0000');
  });

  it('produces a Jira-formatted timestamp when given no input', () => {
    expect(toJiraDateTime()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+0000$/);
  });

  it('throws on an invalid date', () => {
    expect(() => toJiraDateTime('not-a-date')).toThrow('Invalid date');
  });
});
