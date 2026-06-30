# @avidian/mcp-jira

MCP server for Jira Cloud — gives AI agents full context and control over Jira issues, projects, sprints, and workflows.

## Installation

### npm (requires Node.js ≥ 20)

```bash
npm install -g @avidian/mcp-jira
```

### Compiled binary (no runtime needed)

Download from [GitHub Releases](https://github.com/avidianity/mcp-jira/releases).

## Configuration

Set these environment variables:

| Variable | Description |
|---|---|
| `JIRA_BASE_URL` | Your Jira Cloud URL (e.g., `https://your-domain.atlassian.net`) |
| `JIRA_USER_EMAIL` | Email of the Jira user |
| `JIRA_API_TOKEN` | API token ([generate here](https://id.atlassian.com/manage-profile/security/api-tokens)) |

## Usage

### stdio (default — Claude Desktop, VS Code, Cursor)

```bash
mcp-jira
```

### HTTP (Streamable HTTP transport)

```bash
mcp-jira --transport http --port 5485
```

### MCP client configuration

```json
{
  "mcpServers": {
    "jira": {
      "command": "mcp-jira",
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_USER_EMAIL": "you@example.com",
        "JIRA_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Tools

### Read

| Tool | Description |
|---|---|
| `get_issue` | Get full issue details (description converted to Markdown) |
| `search_issues` | Search via JQL with pagination |
| `get_issue_comments` | List comments (bodies converted to Markdown) |
| `get_issue_transitions` | Get available status transitions |
| `list_projects` | List accessible projects |
| `get_project` | Get project details, issue types, components, versions |
| `get_board` | Get board configuration and columns |
| `get_sprint` | Get active/future/closed sprints for a board |
| `get_user` | Search users by name or email |

### Write

| Tool | Description |
|---|---|
| `create_issue` | Create a new issue (accepts Markdown description) |
| `update_issue` | Update issue fields |
| `add_comment` | Add a comment (accepts Markdown) |
| `transition_issue` | Change issue status |
| `assign_issue` | Assign or unassign an issue |
| `link_issues` | Link two issues together |

## Development

```bash
# Install dependencies
bun install

# Run in dev mode
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format

# Build for npm
bun run build

# Compile native binary
bun run compile
```

## License

MIT
