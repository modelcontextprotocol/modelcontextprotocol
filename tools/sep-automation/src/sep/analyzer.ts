/**
 * SEP state and staleness analysis
 */

import type { Config } from '../config.js';
import type { GitHubClient } from '../github/client.js';
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
    const daysSinceActivity = daysBetween(item.updatedAt, now);

    // Check cooldown - don't ping if we pinged recently
    const lastPingDate = await this.getLastBotPingDate(item.number);
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
   * Check maintainer activity on a SEP
   */
  async checkMaintainerActivity(item: SEPItem, maintainerUsername: string): Promise<{
    daysSinceActivity: number;
    shouldPing: boolean;
  }> {
    const events = await this.github.getEvents(item.number);
    const comments = await this.github.getComments(item.number);

    // Find last activity by this maintainer
    let lastActivity: Date | null = null;

    for (const event of events) {
      if (event.actor?.login === maintainerUsername) {
        const eventDate = new Date(event.created_at);
        if (!lastActivity || eventDate > lastActivity) {
          lastActivity = eventDate;
        }
      }
    }

    for (const comment of comments) {
      if (comment.user?.login === maintainerUsername) {
        const commentDate = new Date(comment.created_at);
        if (!lastActivity || commentDate > lastActivity) {
          lastActivity = commentDate;
        }
      }
    }

    // If no activity found, use assignment date or item update date
    if (!lastActivity) {
      lastActivity = item.updatedAt;
    }

    const daysSinceActivityValue = daysBetween(lastActivity, new Date());
    const shouldPing = daysSinceActivityValue >= this.config.maintainerInactivityDays;

    return { daysSinceActivity: daysSinceActivityValue, shouldPing };
  }

  /**
   * Get the date of the last bot ping comment
   */
  private async getLastBotPingDate(issueNumber: number): Promise<Date | null> {
    const comments = await this.github.getComments(issueNumber);

    // Find most recent bot comment with our marker
    for (let i = comments.length - 1; i >= 0; i--) {
      const comment = comments[i];
      if (comment?.body.includes(BOT_COMMENT_MARKER)) {
        return new Date(comment.created_at);
      }
    }

    return null;
  }
}
