/**
 * GitHub API wrapper using Octokit
 */

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import type { Config } from '../config.js';
import type { GitHubIssue, GitHubComment, GitHubEvent, GitHubTeamMembership, GitHubTeam } from './types.js';
import { isHttpError } from '../utils/index.js';

/** Search query constants */
const SEARCH_QUERIES = {
  SEP_LABELED: 'label:SEP is:open',
  SEP_TITLED: 'SEP in:title is:open',
} as const;

export class GitHubClient {
  private octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private readonly config: Config;
  private initialized = false;

  constructor(config: Config) {
    this.config = config;
    this.owner = config.targetOwner;
    this.repo = config.targetRepo;

    // Prefer App auth over token (App auth has better org-level permissions)
    if (config.appId && config.appPrivateKey) {
      // Placeholder - will be initialized in ensureInitialized() with App auth
      this.octokit = new Octokit();
    } else if (config.githubToken) {
      this.octokit = new Octokit({ auth: config.githubToken });
      this.initialized = true;
    } else {
      // Placeholder - should not happen due to config validation
      this.octokit = new Octokit();
    }
  }

  /**
   * Ensure the client is initialized with proper auth.
   * For GitHub App auth, this fetches the installation ID and creates an installation token.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    if (this.config.appId && this.config.appPrivateKey) {
      // Create app-level octokit to find installation
      const appOctokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: this.config.appId,
          privateKey: this.config.appPrivateKey,
        },
      });

      // Find the installation for this repo
      const { data: installation } = await appOctokit.apps.getRepoInstallation({
        owner: this.owner,
        repo: this.repo,
      });

      // Create installation-authenticated octokit
      this.octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: this.config.appId,
          privateKey: this.config.appPrivateKey,
          installationId: installation.id,
        },
      });

      this.initialized = true;
    } else {
      throw new Error('No authentication configured');
    }
  }

  /**
   * Search for issues/PRs matching a query with pagination support
   */
  async searchIssues(query: string): Promise<GitHubIssue[]> {
    await this.ensureInitialized();
    const fullQuery = `repo:${this.owner}/${this.repo} ${query}`;
    const items = await this.octokit.paginate(
      this.octokit.search.issuesAndPullRequests,
      {
        q: fullQuery,
        per_page: 100,
        sort: 'updated',
        order: 'desc',
      },
      (response) => response.data
    );
    return items as GitHubIssue[];
  }

  /**
   * Get all issues with a specific label with pagination support
   */
  async getIssuesWithLabel(label: string): Promise<GitHubIssue[]> {
    await this.ensureInitialized();
    const items = await this.octokit.paginate(
      this.octokit.issues.listForRepo,
      {
        owner: this.owner,
        repo: this.repo,
        labels: label,
        state: 'all',
        per_page: 100,
      }
    );
    return items as GitHubIssue[];
  }

  /**
   * Get comments on an issue/PR with pagination support
   */
  async getComments(issueNumber: number): Promise<GitHubComment[]> {
    await this.ensureInitialized();
    const comments = await this.octokit.paginate(
      this.octokit.issues.listComments,
      {
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        per_page: 100,
      }
    );
    return comments as GitHubComment[];
  }

  /**
   * Get timeline events for an issue/PR with pagination support
   */
  async getEvents(issueNumber: number): Promise<GitHubEvent[]> {
    await this.ensureInitialized();
    const events = await this.octokit.paginate(
      this.octokit.issues.listEvents,
      {
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        per_page: 100,
      }
    );
    return events as GitHubEvent[];
  }

  /**
   * Add a comment to an issue/PR
   */
  async addComment(issueNumber: number, body: string): Promise<{ url: string }> {
    await this.ensureInitialized();
    const response = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
    return { url: response.data.html_url };
  }

  /**
   * Add labels to an issue/PR
   */
  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    await this.ensureInitialized();
    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels,
    });
  }

  /**
   * Remove a label from an issue/PR
   */
  async removeLabel(issueNumber: number, label: string): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.octokit.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        name: label,
      });
    } catch (error: unknown) {
      // Ignore if label doesn't exist
      if (isHttpError(error, 404)) {
        return;
      }
      throw error;
    }
  }

  /**
   * Close an issue/PR
   */
  async closeIssue(issueNumber: number): Promise<void> {
    await this.ensureInitialized();
    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      state: 'closed',
    });
  }

  /**
   * Check if a user is a member of a team
   */
  async isTeamMember(org: string, teamSlug: string, username: string): Promise<boolean> {
    await this.ensureInitialized();
    try {
      const response = await this.octokit.teams.getMembershipForUserInOrg({
        org,
        team_slug: teamSlug,
        username,
      });
      const membership = response.data as GitHubTeamMembership;
      return membership.state === 'active';
    } catch (error: unknown) {
      // 404 means not a member
      if (isHttpError(error, 404)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get all members of a team
   */
  async getTeamMembers(org: string, teamSlug: string): Promise<string[]> {
    await this.ensureInitialized();
    const members = await this.octokit.paginate(
      this.octokit.teams.listMembersInOrg,
      {
        org,
        team_slug: teamSlug,
        per_page: 100,
      }
    );
    return members.map(m => m.login);
  }

  /**
   * List all teams in an organization.
   * Only requires "Members" read permission on the org.
   */
  async listOrgTeams(org: string): Promise<GitHubTeam[]> {
    await this.ensureInitialized();
    const teams = await this.octokit.paginate(
      this.octokit.teams.list,
      {
        org,
        per_page: 100,
      }
    );
    return teams as GitHubTeam[];
  }

  /**
   * Get all teams descended from a root team (including the root itself).
   * Uses listOrgTeams and follows parent links, avoiding the need for admin
   * permissions that listChildInOrg requires.
   */
  async getAllDescendantTeams(org: string, rootTeamSlug: string): Promise<string[]> {
    const allTeams = await this.listOrgTeams(org);

    // Build a map of team slug -> team for quick lookup
    const teamBySlug = new Map<string, GitHubTeam>();
    for (const team of allTeams) {
      teamBySlug.set(team.slug, team);
    }

    // Find the root team
    const rootTeam = teamBySlug.get(rootTeamSlug);
    if (!rootTeam) {
      // Root team not found, return just the slug in case it exists but isn't visible
      return [rootTeamSlug];
    }

    // Find all teams that have the root team as an ancestor
    const descendants: string[] = [rootTeamSlug];

    for (const team of allTeams) {
      if (team.slug === rootTeamSlug) continue;

      // Walk up the parent chain to see if we reach the root
      let current: GitHubTeam | undefined = team;
      while (current?.parent) {
        if (current.parent.slug === rootTeamSlug) {
          descendants.push(team.slug);
          break;
        }
        current = teamBySlug.get(current.parent.slug);
      }
    }

    return descendants;
  }

  /**
   * Get a single issue/PR by number
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue> {
    await this.ensureInitialized();
    const response = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return response.data as GitHubIssue;
  }

  /**
   * Get search query for SEPs by label
   */
  static get SEP_LABEL_QUERY(): string {
    return SEARCH_QUERIES.SEP_LABELED;
  }

  /**
   * Get search query for SEPs by title
   */
  static get SEP_TITLE_QUERY(): string {
    return SEARCH_QUERIES.SEP_TITLED;
  }
}
