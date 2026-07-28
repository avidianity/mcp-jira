# mcp-jira

An MCP server for Jira Cloud that gives AI agents context and control over issues, projects, sprints, and workflows. This glossary pins the terms that are specific to how this server exposes Jira, especially around the agent boundary and attachment handling.

## Language

### Data boundary

**Markdown**:
The rich-text format at the agent boundary. Agents send Markdown for issue descriptions, comments, and worklog comments; the server converts it to Jira's ADF before calling the REST API, and converts ADF back to Markdown on the way out. Agents never see raw ADF.
_Avoid_: rich text, HTML.

**TOON**:
The structured-data format the server returns to agents (lists, issue details, search hits, metadata). Chosen for token efficiency over JSON.
_Avoid_: JSON output.

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
The `--- filename (mimeType) ---` header line prepended to **inline text** content only. It is never written to a path download.
_Avoid_: header, prefix.
