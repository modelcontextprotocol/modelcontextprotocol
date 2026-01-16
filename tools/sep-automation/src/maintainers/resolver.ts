/**
 * Core maintainer team lookup
 */

import type { Config } from '../config.js';
import type { GitHubClient } from '../github/client.js';

export class MaintainerResolver {
  private readonly config: Config;
  private readonly github: GitHubClient;
  private readonly cache: Map<string, boolean> = new Map();

  constructor(config: Config, github: GitHubClient) {
    this.config = config;
    this.github = github;
  }

  /**
   * Check if a user is a core maintainer
   */
  async isCoreMaintainer(username: string): Promise<boolean> {
    // Check cache first
    const cached = this.cache.get(username);
    if (cached !== undefined) {
      return cached;
    }

    const isMember = await this.github.isTeamMember(
      this.config.targetOwner,
      this.config.maintainersTeam,
      username
    );

    this.cache.set(username, isMember);
    return isMember;
  }

  /**
   * Get the sponsor (maintainer assignee) for a SEP
   */
  async getSponsor(assignees: string[]): Promise<string | null> {
    for (const assignee of assignees) {
      if (await this.isCoreMaintainer(assignee)) {
        return assignee;
      }
    }
    return null;
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }
}
