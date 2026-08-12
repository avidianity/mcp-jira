import { encode } from '@toon-format/toon';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolTextResult {
  [key: string]: unknown;
  content: TextContent[];
  isError?: boolean;
}

/** Plain-text MCP result (success/error messages, path notices). */
export function textResult(text: string, options?: { isError?: boolean }): ToolTextResult {
  const result: ToolTextResult = {
    content: [{ type: 'text', text }],
  };
  if (options?.isError === true) {
    result.isError = true;
  }
  return result;
}

/**
 * Encode structured data as TOON for LLM-facing tool responses.
 * Prefer this over JSON.stringify for any object/array payload.
 *
 * TOON has no multi-line scalar: a value containing line breaks is encoded as a
 * single quoted physical line with `\n` escapes. Never put Markdown bodies here -
 * use `markdownBlockResult` so they keep real line breaks.
 */
export function encodeToon(data: unknown): string {
  return encode(data, { indent: 2 });
}

/** Structured MCP result encoded as TOON (token-efficient vs JSON). */
export function toonResult(data: unknown, options?: { isError?: boolean }): ToolTextResult {
  return textResult(encodeToon(data), options);
}

/** Header line that opens an inline payload: `--- label ---`. */
export function banner(label: string): string {
  return `--- ${label} ---`;
}

/** Long-form Markdown emitted verbatim below the TOON envelope, under its own banner. */
export interface MarkdownBlock {
  /** Banner label identifying the block, e.g. `comment 742603 (Ada, 2026-01-01…)`. */
  label: string;
  /** Markdown body. Emitted with real line breaks, never escaped. */
  body: string;
}

/**
 * MCP result pairing a TOON envelope with verbatim Markdown blocks.
 *
 * Encoding a Markdown body as a TOON value collapses it onto one physical line
 * with `\n` escapes, so a long body is silently cut by clients that cap line
 * length when rendering tool output. Structured fields stay in the TOON
 * envelope; prose ships below it with real line breaks.
 *
 * A body is written exactly as given, so a line inside it that looks like a
 * banner is not escaped - blocks are read by agents, never parsed back.
 */
export function markdownBlockResult(envelope: unknown, blocks: MarkdownBlock[]): ToolTextResult {
  const sections = [encodeToon(envelope)];
  for (const block of blocks) {
    sections.push(`${banner(block.label)}\n${block.body.trimEnd()}`);
  }
  return textResult(sections.join('\n\n'));
}
