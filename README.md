# @avidian/mcp-jira

MCP server for Jira Cloud — gives AI agents full context and control over Jira issues, projects, sprints, and workflows.

## Installation

### npm (requires Node.js ≥ 20)

```bash
npm install -g @avidian/mcp-jira
```

### Compiled binary (no runtime needed)

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/avidianity/mcp-jira/main/install.sh)"
```

Or download manually from [GitHub Releases](https://github.com/avidianity/mcp-jira/releases).

## Configuration

Set these environment variables:

| Variable          | Description                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `JIRA_BASE_URL`   | Your Jira Cloud URL (e.g., `https://your-domain.atlassian.net`)                          |
| `JIRA_USER_EMAIL` | Email of the Jira user                                                                   |
| `JIRA_API_TOKEN`  | API token ([generate here](https://id.atlassian.com/manage-profile/security/api-tokens)) |

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

### Issues

| Tool                    | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `get_issue`             | Get full issue details (description converted to Markdown) |
| `search_issues`         | Search via JQL with pagination                             |
| `create_issue`          | Create a new issue (accepts Markdown description)          |
| `update_issue`          | Update issue fields                                        |
| `delete_issue`          | Delete an issue (optionally its subtasks)                  |
| `get_issue_transitions` | Get available status transitions                           |
| `transition_issue`      | Change issue status                                        |
| `get_issue_changelog`   | Get the field-by-field change history                      |

### Comments

| Tool                 | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `get_issue_comments` | List comments with IDs (bodies converted to Markdown) |
| `add_comment`        | Add a comment (Markdown, supports `@[id]` mentions)   |
| `update_comment`     | Edit an existing comment                              |
| `delete_comment`     | Delete a comment                                      |

### Worklogs

| Tool             | Description                          |
| ---------------- | ------------------------------------ |
| `get_worklogs`   | List logged work on an issue         |
| `add_worklog`    | Log time (e.g. `3h`, `30m`, `1d 2h`) |
| `update_worklog` | Edit a work log entry                |
| `delete_worklog` | Delete a work log entry              |

### Participation

| Tool             | Description                        |
| ---------------- | ---------------------------------- |
| `list_watchers`  | List watchers on an issue          |
| `add_watcher`    | Add a watcher (self or by account) |
| `remove_watcher` | Remove a watcher                   |
| `get_votes`      | Get vote count and voters          |
| `add_vote`       | Vote for an issue                  |
| `remove_vote`    | Remove your vote                   |

### Links & attachments

| Tool                | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `link_issues`       | Link two issues together                                      |
| `get_link_types`    | List available issue link types                               |
| `delete_issue_link` | Delete a link by ID                                           |
| `add_remote_link`   | Attach an external URL to an issue                            |
| `list_attachments`  | List all attachments on an issue (shows image/media file IDs) |
| `get_image`         | Fetch an image by attachment ID or ADF media UUID             |
| `get_text_file`     | Fetch a text/source-file attachment as text                   |
| `add_attachment`    | Upload a file (text or base64 binary)                         |
| `delete_attachment` | Delete an attachment by ID                                    |

### Boards & sprints

| Tool                     | Description                                  |
| ------------------------ | -------------------------------------------- |
| `list_boards`            | List boards (optionally by project)          |
| `get_board`              | Get board configuration and columns          |
| `get_sprint`             | Get active/future/closed sprints for a board |
| `create_sprint`          | Create a sprint                              |
| `start_sprint`           | Start (activate) a sprint                    |
| `complete_sprint`        | Complete (close) a sprint                    |
| `move_issues_to_sprint`  | Move issues into a sprint                    |
| `move_issues_to_backlog` | Move issues to the backlog                   |
| `add_issues_to_epic`     | Add issues to an epic (`none` to unlink)     |

### Projects

| Tool               | Description                                  |
| ------------------ | -------------------------------------------- |
| `list_projects`    | List accessible projects                     |
| `get_project`      | Get project details, issue types, components |
| `list_versions`    | List project versions/releases               |
| `create_version`   | Create a version                             |
| `update_version`   | Update a version (e.g. mark released)        |
| `list_components`  | List project components                      |
| `create_component` | Create a component                           |

### Users & metadata

| Tool                    | Description                              |
| ----------------------- | ---------------------------------------- |
| `get_user`              | Search users by name or email            |
| `get_current_user`      | Get the authenticated user               |
| `list_assignable_users` | List users assignable to a project/issue |
| `assign_issue`          | Assign or unassign an issue              |
| `list_issue_types`      | List issue types                         |
| `list_statuses`         | List workflow statuses                   |
| `list_priorities`       | List priorities                          |
| `list_fields`           | List fields incl. custom field IDs       |
| `list_labels`           | List labels                              |

### Mentions

`add_comment` and `update_comment` accept Jira user mentions in the Markdown body:

- `@[accountId]` — mention by account ID
- `@[Display Name|accountId]` — mention with a friendly label

Use `get_user` or `list_assignable_users` to look up account IDs.

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
