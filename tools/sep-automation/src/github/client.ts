/**
 * GitHub API wrapper using Octokit
 */

import { Octokit } from '@octokit/rest';
import type { Config } from '../config.js';
import type { GitHubIssue, GitHubComment, GitHubEvent, GitHubTeamMembership } from './types.js';
import { isHttpError } from '../utils/index.js';

/** Search query constants */
const SEARCH_QUERIES = {
  SEP_LABELED: 'label:SEP is:open',
  SEP_TITLED: 'SEP in:title is:open',
} as const;

export class GitHubClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(config: Config) {
    this.octokit = new Octokit({ auth: config.githubToken });
    this.owner = config.targetOwner;
    this.repo = config.targetRepo;
  }

  /**
   * Search for issues/PRs matching a query with pagination support
   */
  async searchIssues(query: string): Promise<GitHubIssue[]> {
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
   * Get a single issue/PR by number
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue> {
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
