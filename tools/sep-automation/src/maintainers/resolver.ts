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
  private sponsorSet: Set<string> | null = null;
  private loadAttempted = false;

  constructor(config: Config, github: GitHubClient, logger?: Logger) {
    this.config = config;
    this.github = github;
    this.logger = logger;
  }

  /**
   * Load allowed sponsors from the API by finding all teams descended from
   * steering-committee and collecting their members.
   */
  private async ensureSponsorsLoaded(): Promise<Set<string>> {
    if (this.sponsorSet) {
      return this.sponsorSet;
    }

    if (this.loadAttempted) {
      // Already tried and failed, return empty set
      return new Set();
    }

    this.loadAttempted = true;

    try {
      // Find all teams descended from the root team
      // This uses listOrgTeams + parent traversal, avoiding admin permissions
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
        this.sponsorSet = allMembers;
        this.logger?.info(
          { count: allMembers.size, teamCount: allTeams.length },
          "Loaded allowed sponsors from API",
        );
        return this.sponsorSet;
      }

      throw new Error("No team members loaded from any team");
    } catch (error) {
      this.logger?.error(
        { error: String(error) },
        "Failed to load sponsors from API",
      );
      // No fallback - return empty set
      this.sponsorSet = new Set();
      return this.sponsorSet;
    }
  }

  /**
   * Check if a user can sponsor SEPs.
   * Any member of steering-committee or its subteams can sponsor.
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
    this.sponsorSet = null;
    this.loadAttempted = false;
  }
}
