/**
 * Core maintainer team lookup
 */

import type { Logger } from "pino";
import type { Config } from "../config.js";
import type { GitHubClient } from "../github/client.js";

/**
 * The root team whose members (including all subteam members) can sponsor SEPs.
 */
const SPONSOR_ROOT_TEAM = "steering-committee";

export class MaintainerResolver {
  private readonly config: Config;
  private readonly github: GitHubClient;
  private readonly logger: Logger | undefined;
  private maintainerSet: Set<string> | null = null;
  private loadAttempted = false;

  constructor(config: Config, github: GitHubClient, logger?: Logger) {
    this.config = config;
    this.github = github;
    this.logger = logger;
  }

  /**
   * Load allowed sponsors from the API by recursively traversing
   * all subteams of steering-committee.
   */
  private async ensureSponsorsLoaded(): Promise<Set<string>> {
    if (this.maintainerSet) {
      return this.maintainerSet;
    }

    if (this.loadAttempted) {
      // Already tried and failed, return empty set
      return new Set();
    }

    this.loadAttempted = true;

    try {
      // Discover all teams recursively from the root team
      const allTeams = await this.github.getAllDescendantTeams(
        this.config.targetOwner,
        SPONSOR_ROOT_TEAM,
      );

      this.logger?.debug(
        { teams: allTeams },
        "Discovered sponsor teams from steering-committee",
      );

      const allMembers = new Set<string>();

      // Fetch members from all discovered teams
      for (const team of allTeams) {
        try {
          const members = await this.github.getTeamMembers(
            this.config.targetOwner,
            team,
          );
          for (const member of members) {
            allMembers.add(member);
          }
        } catch (error) {
          this.logger?.debug(
            { team, error: String(error) },
            "Failed to load team members, continuing with others",
          );
        }
      }

      if (allMembers.size > 0) {
        this.maintainerSet = allMembers;
        this.logger?.info(
          { count: allMembers.size, teamCount: allTeams.length },
          "Loaded allowed sponsors from API",
        );
        return this.maintainerSet;
      }

      throw new Error("No team members loaded from any team");
    } catch (error) {
      this.logger?.error(
        { error: String(error) },
        "Failed to load sponsors from API",
      );
      // No fallback - return empty set
      this.maintainerSet = new Set();
      return this.maintainerSet;
    }
  }

  /**
   * Check if a user can sponsor SEPs.
   * Any member of a steering-committee subteam can sponsor.
   */
  async canSponsor(username: string): Promise<boolean> {
    const sponsors = await this.ensureSponsorsLoaded();
    return sponsors.has(username);
  }

  /**
   * Get the sponsor (allowed assignee) for a SEP
   */
  async getSponsor(assignees: string[]): Promise<string | null> {
    for (const assignee of assignees) {
      if (await this.canSponsor(assignee)) {
        return assignee;
      }
    }
    return null;
  }

  /**
   * Clear the cached sponsor list (useful for testing)
   */
  clearCache(): void {
    this.maintainerSet = null;
    this.loadAttempted = false;
  }
}
