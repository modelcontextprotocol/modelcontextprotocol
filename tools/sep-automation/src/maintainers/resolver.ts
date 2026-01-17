/**
 * Core maintainer team lookup
 */

import type { Logger } from 'pino';
import type { Config } from '../config.js';
import type { GitHubClient } from '../github/client.js';

/**
 * Subteams of steering-committee whose members can sponsor SEPs.
 */
const SPONSOR_TEAMS = [
  'core-maintainers',
  'moderators',
  'working-groups',
  'interest-groups',
  'sdk-maintainers',
  'inspector-maintainers',
  'mcpb-maintainers',
  'docs-maintainers',
  'lead-maintainers',
];

/**
 * Fallback list of allowed sponsors.
 * Used when the GitHub Teams API is not accessible.
 * Keep this in sync with the steering-committee subteams.
 *
 * Generated from: steering-committee subteams
 * Last updated: 2026-01-16
 */
const FALLBACK_SPONSORS = new Set([
  // core-maintainers
  'jspahrsummers', 'pcarleton', 'CaitieM20', 'pwwpche', 'kurtisvg',
  'localden', 'nickcoai', '000-000-000-000-000', 'dsp-ant', 'bhosmer-ant',
  // moderators
  'jonathanhefner', 'cliffhall', 'evalstate', 'tadasant', 'maheshmurag',
  'olaservo', 'jerome3o-anthropic',
  // working-groups
  'toby', 'aaronpk', 'felixweinberger', 'domdomegg', 'rdimitrov',
  'an-dustin', 'LucaButBoring', 'D-McAdams', 'jenn-newton', 'og-ant', 'petery-ant',
  // interest-groups
  'sambhav', 'PederHP',
  // sdk-maintainers
  'mattt', 'koic', 'michaelneale', 'fabpot', 'atesgoral', 'halter73',
  'nicolas-grekas', 'markpollack', 'ochafik', 'stallent', 'ignatov',
  'alexhancock', 'KKonstantinov', 'ansaba', 'pronskiy', 'Nyholm',
  'tzolov', 'kpavlov', 'topherbullock', 'movetz', 'chemicL', 'stephentoub',
  'eiriktsarpalis', 'chr-hertel', 'maciej-kisiel', 'e5l', 'jamadeo',
  // inspector-maintainers (KKonstantinov, cliffhall, olaservo already listed)
  // mcpb-maintainers
  'felixrieseberg', 'MarshallOfSound', 'asklar', 'joan-anthropic',
  // docs-maintainers
  'ihrpr', 'a-akimov',
  // lead-maintainers (dsp-ant already listed)
]);

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
   * Load allowed sponsors from the API (all steering-committee subteams),
   * falling back to static list on error.
   */
  private async ensureSponsorsLoaded(): Promise<Set<string>> {
    if (this.maintainerSet) {
      return this.maintainerSet;
    }

    if (this.loadAttempted) {
      // Already tried and failed, use fallback
      return FALLBACK_SPONSORS;
    }

    this.loadAttempted = true;

    try {
      const allMembers = new Set<string>();

      // Fetch members from all sponsor teams
      for (const team of SPONSOR_TEAMS) {
        try {
          const members = await this.github.getTeamMembers(
            this.config.targetOwner,
            team
          );
          for (const member of members) {
            allMembers.add(member);
          }
        } catch (error) {
          this.logger?.debug(
            { team, error: String(error) },
            'Failed to load team, continuing with others'
          );
        }
      }

      if (allMembers.size > 0) {
        this.maintainerSet = allMembers;
        this.logger?.info(
          { count: allMembers.size },
          'Loaded allowed sponsors from API'
        );
        return this.maintainerSet;
      }

      // All teams failed, use fallback
      throw new Error('No team members loaded from any team');
    } catch (error) {
      this.logger?.warn(
        { error: String(error) },
        'Failed to load sponsors from API, using fallback list'
      );
      this.maintainerSet = FALLBACK_SPONSORS;
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
   * Alias for canSponsor (for backward compatibility)
   */
  async isCoreMaintainer(username: string): Promise<boolean> {
    return this.canSponsor(username);
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
