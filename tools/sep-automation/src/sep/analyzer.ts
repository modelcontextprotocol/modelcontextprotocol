/**
 * SEP state and staleness analysis
 */

import type { Config } from '../config.js';
import type { GitHubClient } from '../github/client.js';
import type { GitHubComment, GitHubEvent } from '../github/types.js';
import type { SEPItem, StaleAnalysis } from '../types.js';
import { BOT_COMMENT_MARKER } from '../types.js';
import { daysBetween } from '../utils/index.js';

export class SEPAnalyzer {
  private readonly config: Config;
  private readonly github: GitHubClient;

  constructor(config: Config, github: GitHubClient) {
    this.config = config;
    this.github = github;
  }

  /**
   * Analyze a SEP for staleness and determine required actions
   */
  async analyze(item: SEPItem): Promise<StaleAnalysis> {
    const now = new Date();

    // Fetch comments and events once, share across checks
    const comments = await this.github.getComments(item.number);
    const events = await this.github.getEvents(item.number);

    // Compute days since the responsible person was last active
    // (not just any activity, which includes bot pings that reset updated_at)
    const responsibleLastActive = this.findResponsiblePersonActivity(item, events, comments);
    const daysSinceActivity = daysBetween(responsibleLastActive, now);

    // Check cooldown - don't ping if we pinged recently
    const lastPingDate = this.findLastBotPingDate(comments);
    if (lastPingDate) {
      const daysSincePing = daysBetween(lastPingDate, now);
      if (daysSincePing < this.config.pingCooldownDays) {
        return {
          item,
          daysSinceActivity,
          shouldPing: false,
          shouldMarkDormant: false,
          shouldClose: false,
          pingTarget: null,
          reason: `Recently pinged ${daysSincePing} days ago (cooldown: ${this.config.pingCooldownDays} days)`,
        };
      }
    }

    // Analyze based on state
    switch (item.state) {
      case 'proposal':
        return this.analyzeProposal(item, daysSinceActivity);
      case 'draft':
        return this.analyzeDraft(item, daysSinceActivity);
      case 'accepted':
        return this.analyzeAccepted(item, daysSinceActivity);
      default:
        return {
          item,
          daysSinceActivity,
          shouldPing: false,
          shouldMarkDormant: false,
          shouldClose: false,
          pingTarget: null,
          reason: null,
        };
    }
  }

  private analyzeProposal(item: SEPItem, daysSinceActivity: number): StaleAnalysis {
    // 180+ days: mark dormant and close
    if (daysSinceActivity >= this.config.proposalDormantDays) {
      return {
        item,
        daysSinceActivity,
        shouldPing: false,
        shouldMarkDormant: true,
        shouldClose: true,
        pingTarget: null,
        reason: `Proposal inactive for ${daysSinceActivity} days (threshold: ${this.config.proposalDormantDays})`,
      };
    }

    // 90+ days: ping author
    if (daysSinceActivity >= this.config.proposalPingDays) {
      return {
        item,
        daysSinceActivity,
        shouldPing: true,
        shouldMarkDormant: false,
        shouldClose: false,
        pingTarget: 'author',
        reason: `Proposal inactive for ${daysSinceActivity} days (threshold: ${this.config.proposalPingDays})`,
      };
    }

    return {
      item,
      daysSinceActivity,
      shouldPing: false,
      shouldMarkDormant: false,
      shouldClose: false,
      pingTarget: null,
      reason: null,
    };
  }

  private analyzeDraft(item: SEPItem, daysSinceActivity: number): StaleAnalysis {
    // 90+ days: ping sponsor
    if (daysSinceActivity >= this.config.draftPingDays) {
      return {
        item,
        daysSinceActivity,
        shouldPing: true,
        shouldMarkDormant: false,
        shouldClose: false,
        pingTarget: 'sponsor',
        reason: `Draft inactive for ${daysSinceActivity} days (threshold: ${this.config.draftPingDays})`,
      };
    }

    return {
      item,
      daysSinceActivity,
      shouldPing: false,
      shouldMarkDormant: false,
      shouldClose: false,
      pingTarget: null,
      reason: null,
    };
  }

  private analyzeAccepted(item: SEPItem, daysSinceActivity: number): StaleAnalysis {
    // 30+ days: ping for reference implementation
    if (daysSinceActivity >= this.config.acceptedPingDays) {
      return {
        item,
        daysSinceActivity,
        shouldPing: true,
        shouldMarkDormant: false,
        shouldClose: false,
        pingTarget: 'author',
        reason: `Accepted SEP inactive for ${daysSinceActivity} days - awaiting reference implementation`,
      };
    }

    return {
      item,
      daysSinceActivity,
      shouldPing: false,
      shouldMarkDormant: false,
      shouldClose: false,
      pingTarget: null,
      reason: null,
    };
  }

  /**
   * Check a specific user's activity on a SEP
   */
  async checkUserActivity(item: SEPItem, username: string): Promise<{
    daysSinceActivity: number;
    shouldPing: boolean;
  }> {
    const events = await this.github.getEvents(item.number);
    const comments = await this.github.getComments(item.number);

    const lastActivity = this.findLastUserActivity(username, events, comments);

    const daysSinceActivity = daysBetween(lastActivity ?? item.createdAt, new Date());
    const shouldPing = daysSinceActivity >= this.config.maintainerInactivityDays;

    return { daysSinceActivity, shouldPing };
  }

  /**
   * Find the last activity date of the person responsible for the SEP.
   *
   * For 'proposal' and 'accepted' states, this is the author.
   * For 'draft' state, this is the first assignee (sponsor), falling back to author.
   *
   * Falls back to item.createdAt when no user-specific activity is found.
   */
  private findResponsiblePersonActivity(
    item: SEPItem,
    events: GitHubEvent[],
    comments: GitHubComment[],
  ): Date {
    const username = this.getResponsibleUsername(item);
    return this.findLastUserActivity(username, events, comments) ?? item.createdAt;
  }

  /**
   * Determine who the responsible person is for staleness tracking.
   *
   * For accepted SEPs, this is always the author (awaiting reference implementation).
   * For all other states, this is the first assignee (typically the sponsor),
   * falling back to the author if there are no assignees.
   */
  private getResponsibleUsername(item: SEPItem): string {
    if (item.state === 'accepted') {
      return item.author;
    }
    return item.assignees[0] ?? item.author;
  }

  /**
   * Find the most recent activity date for a specific user, excluding bot comments.
   */
  private findLastUserActivity(
    username: string,
    events: GitHubEvent[],
    comments: GitHubComment[],
  ): Date | null {
    let lastActivity: Date | null = null;

    for (const event of events) {
      if (event.actor?.login === username) {
        const eventDate = new Date(event.created_at);
        if (!lastActivity || eventDate > lastActivity) {
          lastActivity = eventDate;
        }
      }
    }

    for (const comment of comments) {
      if (comment?.body.includes(BOT_COMMENT_MARKER)) {
        continue;
      }
      if (comment.user?.login === username) {
        const commentDate = new Date(comment.created_at);
        if (!lastActivity || commentDate > lastActivity) {
          lastActivity = commentDate;
        }
      }
    }

    return lastActivity;
  }

  /**
   * Find the date of the last bot ping comment from pre-fetched comments.
   */
  private findLastBotPingDate(comments: GitHubComment[]): Date | null {
    for (let i = comments.length - 1; i >= 0; i--) {
      const comment = comments[i];
      if (comment?.body.includes(BOT_COMMENT_MARKER)) {
        return new Date(comment.created_at);
      }
    }
    return null;
  }
}
