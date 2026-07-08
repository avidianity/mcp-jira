import { describe, expect, it } from 'bun:test';
import { adfToMarkdown, markdownToAdf } from '../src/jira/adf.ts';
import type { AdfDocument, AdfNode } from '../src/jira/types.ts';

function firstParagraph(doc: AdfDocument): AdfNode[] {
  const paragraph = doc.content[0];
  expect(paragraph?.type).toBe('paragraph');
  return paragraph?.content ?? [];
}

describe('markdownToAdf mentions', () => {
  it('converts @[accountId] into a mention node', () => {
    const doc = markdownToAdf('hey @[712020:abc-def] there');
    const nodes = firstParagraph(doc);

    expect(nodes).toEqual([
      { type: 'text', text: 'hey ' },
      { type: 'mention', attrs: { id: '712020:abc-def', text: '@712020:abc-def' } },
      { type: 'text', text: ' there' },
    ]);
  });

  it('converts @[Display Name|accountId] into a mention with a friendly label', () => {
    const doc = markdownToAdf('ping @[Ben Sandique|712020:abc-def] please');
    const nodes = firstParagraph(doc);

    expect(nodes).toEqual([
      { type: 'text', text: 'ping ' },
      { type: 'mention', attrs: { id: '712020:abc-def', text: '@Ben Sandique' } },
      { type: 'text', text: ' please' },
    ]);
  });

  it('leaves plain @username text untouched', () => {
    const doc = markdownToAdf('mention @notmatched here');
    const nodes = firstParagraph(doc);

    expect(nodes).toEqual([{ type: 'text', text: 'mention @notmatched here' }]);
  });

  it('handles multiple mentions alongside other inline markdown', () => {
    const doc = markdownToAdf('**bold** @[a:1] and @[Jane|b:2]');
    const nodes = firstParagraph(doc);

    expect(nodes).toEqual([
      { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
      { type: 'text', text: ' ' },
      { type: 'mention', attrs: { id: 'a:1', text: '@a:1' } },
      { type: 'text', text: ' and ' },
      { type: 'mention', attrs: { id: 'b:2', text: '@Jane' } },
    ]);
  });
});

describe('adfToMarkdown mentions', () => {
  it('renders a mention with id and display text as @[Name|id]', () => {
    const doc: AdfDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { id: 'b:2', text: '@Jane' } }],
        },
      ],
    };

    expect(adfToMarkdown(doc)).toBe('@[Jane|b:2]');
  });

  it('falls back to @displayName when the mention has no id', () => {
    const doc: AdfDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { text: '@Jane' } }],
        },
      ],
    };

    expect(adfToMarkdown(doc)).toBe('@Jane');
  });
});

describe('mention round-trip', () => {
  it('preserves a named mention through markdown -> adf -> markdown', () => {
    const doc = markdownToAdf('cc @[Ben Sandique|712020:abc-def]');
    expect(adfToMarkdown(doc)).toBe('cc @[Ben Sandique|712020:abc-def]');
  });
});
