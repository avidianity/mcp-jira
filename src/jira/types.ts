export interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: AdfMark[];
}

export interface AdfDocument {
  version: number;
  type: 'doc';
  content: AdfNode[];
}

export interface JiraUser {
  accountId: string;
  emailAddress?: string | undefined;
  displayName: string;
  active: boolean;
  avatarUrls?: Record<string, string> | undefined;
  self?: string | undefined;
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string;
    name: string;
  };
}

export interface JiraPriority {
  id: string;
  name: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  description?: string | undefined;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  self: string;
  lead?: JiraUser | undefined;
  description?: string | undefined;
  issueTypes?: JiraIssueType[] | undefined;
  components?: JiraComponent[] | undefined;
  versions?: JiraVersion[] | undefined;
}

export interface JiraComponent {
  id: string;
  name: string;
  description?: string | undefined;
}

export interface JiraVersion {
  id: string;
  name: string;
  released: boolean;
  archived: boolean;
  releaseDate?: string | undefined;
}

export interface JiraIssueLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

export interface JiraIssueLink {
  id: string;
  type: JiraIssueLinkType;
  inwardIssue?: JiraLinkedIssue | undefined;
  outwardIssue?: JiraLinkedIssue | undefined;
}

export interface JiraLinkedIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: JiraStatus;
    issuetype: JiraIssueType;
  };
}

export interface JiraIssueFields {
  summary: string;
  description: AdfDocument | null;
  status: JiraStatus;
  assignee: JiraUser | null;
  reporter: JiraUser | null;
  priority: JiraPriority | null;
  issuetype: JiraIssueType;
  project: { id: string; key: string; name: string };
  labels: string[];
  created: string;
  updated: string;
  resolution: { name: string } | null;
  components: JiraComponent[];
  fixVersions: JiraVersion[];
  subtasks: JiraIssue[];
  issuelinks: JiraIssueLink[];
  parent?: { key: string; fields: { summary: string; status: JiraStatus } } | undefined;
  [key: string]: unknown;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: JiraIssueFields;
}

export interface JiraSearchResult {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraComment {
  id: string;
  self: string;
  author: JiraUser;
  body: AdfDocument;
  created: string;
  updated: string;
}

export interface JiraCommentPage {
  startAt: number;
  maxResults: number;
  total: number;
  comments: JiraComment[];
}

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraStatus;
}

export interface JiraTransitionsResult {
  transitions: JiraTransition[];
}

export interface JiraSprint {
  id: number;
  self: string;
  state: string;
  name: string;
  startDate?: string | undefined;
  endDate?: string | undefined;
  completeDate?: string | undefined;
  goal?: string | undefined;
}

export interface JiraSprintPage {
  maxResults: number;
  startAt: number;
  isLast: boolean;
  values: JiraSprint[];
}

export interface JiraBoard {
  id: number;
  self: string;
  name: string;
  type: string;
  location?:
    | {
        projectId: number;
        projectName: string;
        projectKey: string;
      }
    | undefined;
}

export interface JiraBoardConfig {
  id: number;
  name: string;
  type: string;
  columnConfig: {
    columns: { name: string; statuses: { id: string; self: string }[] }[];
  };
}

export interface JiraProjectPage {
  startAt: number;
  maxResults: number;
  total: number;
  values: JiraProject[];
}
