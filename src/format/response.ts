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
 */
export function encodeToon(data: unknown): string {
  return encode(data, { indent: 2 });
}

/** Structured MCP result encoded as TOON (token-efficient vs JSON). */
export function toonResult(data: unknown, options?: { isError?: boolean }): ToolTextResult {
  return textResult(encodeToon(data), options);
}
