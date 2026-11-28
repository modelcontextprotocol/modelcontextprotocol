/**
 * GitHub-specific types
 */

export interface GitHubIssue {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly state: 'open' | 'closed';
  readonly labels: ReadonlyArray<{ readonly name: string }>;
  readonly user: { readonly login: string } | null;
  readonly assignees: ReadonlyArray<{ readonly login: string }>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly html_url: string;
  readonly pull_request?: { readonly url: string };
  readonly draft?: boolean; // pull requests only
}

export interface GitHubComment {
  readonly id: number;
  readonly body: string;
  readonly user: { readonly login: string } | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface GitHubEvent {
  readonly id: number;
  readonly event: string;
  readonly actor: { readonly login: string } | null;
  readonly created_at: string;
  readonly assignee?: { readonly login: string };
}

/** Entry of the issue timeline API. Which fields are set depends on `event`. */
export interface GitHubTimelineEntry {
  readonly event?: string;
  readonly created_at?: string; // most entries, including 'commented'
  readonly submitted_at?: string; // 'reviewed'
  readonly committer?: { readonly date?: string }; // 'committed'
  readonly user?: { readonly login: string; readonly type?: string } | null;
  readonly body?: string | null;
}

export interface GitHubTeamMembership {
  readonly state: 'active' | 'pending';
  readonly role: 'member' | 'maintainer';
}

export interface GitHubTeam {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly parent: { readonly id: number; readonly slug: string } | null;
}
