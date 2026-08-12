# mcp-jira

An MCP server for Jira Cloud that gives AI agents context and control over issues, projects, sprints, and workflows. This glossary pins the terms that are specific to how this server exposes Jira, especially around the agent boundary and attachment handling.

## Language

### Data boundary

**Markdown**:
The rich-text format at the agent boundary. Agents send Markdown for issue descriptions, comments, and worklog comments; the server converts it to Jira's ADF before calling the REST API, and converts ADF back to Markdown on the way out. Agents never see raw ADF.
_Avoid_: rich text, HTML.

**TOON**:
The structured-data format the server returns to agents (lists, issue details, search hits, metadata). Chosen for token efficiency over JSON. TOON has no multi-line scalar, so it never carries a Markdown body - that goes in a Markdown block.
_Avoid_: JSON output.

**Envelope**:
The TOON part of a response that also carries Markdown blocks - the structured fields and pagination counters, with all prose lifted out.
_Avoid_: header, wrapper.

**Markdown block**:
A Markdown body emitted below the envelope, under its own banner, with real line breaks. Used for comment bodies, issue descriptions, and worklog comments. Keeps prose out of TOON, where line breaks would be escaped onto one physical line and cut by clients that cap line length.
_Avoid_: section, chunk, prose field.

### Attachments

**Attachment kind**:
The routing classification of an attachment - one of `image`, `video`, `text`, or `binary`. `list_attachments` reports it, and each kind has exactly one owning `get_*` tool that accepts it.
_Avoid_: file type, category.

**Output mode**:
How an attachment fetch returns content. **Inline** (`base64` or `text`) embeds the content in the MCP response; **path** writes the attachment to a local temp file and returns its path for other tools to open.
_Avoid_: return type, format.

**Path download**:
A fetch in path output mode. Always produces a faithful file.
_Avoid_: file export, save-to-disk.

**Faithful (byte-for-byte)**:
A property of a path download: the on-disk bytes equal the attachment's bytes as stored in Jira, with no banner, decoding, or re-encoding applied.
_Avoid_: exact copy, lossless.

**Banner**:
The `--- label ---` header line that opens an inline payload. Labels an **inline text** attachment as `--- filename (mimeType) ---`, and a Markdown block as `--- comment 742603 (Ada, 2026-01-01…) ---`, `--- description ---`, or `--- worklog 10001 comment ---`. It is never written to a path download.
_Avoid_: header, prefix.
