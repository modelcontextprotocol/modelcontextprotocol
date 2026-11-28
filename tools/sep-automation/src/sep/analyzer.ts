/**
 * SEP state and staleness analysis
 */

import type { Config } from '../config.js';
import type { GitHubClient } from '../github/client.js';
import type { GitHubComment, GitHubEvent, GitHubTimelineEntry } from '../github/types.js';
import type { SEPItem, StaleAnalysis } from '../types.js';
import { BOT_COMMENT_MARKER, INACTIVITY_WARNING_MARKER } from '../types.js';
import { daysBetween } from '../utils/index.js';

/** Result of checking a SEP pull request against the inactivity rule */
export interface InactivityAnalysis {
  readonly daysSinceProgress: number;
  readonly action: 'warn' | 'close' | null;
}

/** Bot accounts, plus anything this bot posted from a regular account */
function isFromBot(entry: GitHubTimelineEntry): boolean {
  return (
    entry.user?.type === 'Bot' ||
    entry.user?.login.endsWith('[bot]') === true ||
    entry.body?.includes(BOT_COMMENT_MARKER) === true
  );
}

/**
 * Time of a timeline entry if it counts as progress, NaN otherwise. Progress is
 * a commit, a submitted review or a comment from a non-bot account. Reopening
 * also restarts the clock, so a reopened pull request is not closed again on
 * the next run. Everything else is ignored, including the `mentioned` and
 * `subscribed` events that the bot's own pings create.
 */
function progressTime(entry: GitHubTimelineEntry): number {
  switch (entry.event) {
    case 'committed':
      return Date.parse(entry.committer?.date ?? '');
    case 'reviewed':
      return isFromBot(entry) ? NaN : Date.parse(entry.submitted_at ?? '');
    case 'commented':
      return isFromBot(entry) ? NaN : Date.parse(entry.created_at ?? '');
    case 'reopened':
      return Date.parse(entry.created_at ?? '');
    default:
      return NaN;
  }
}

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

  /**
   * Check a SEP pull request against the inactivity rule: one warning after
   * inactivityWarningDays without progress, then close once inactivityCloseDays
   * are reached and the warning has been up for the days in between.
   */
  async analyzeInactivity(item: SEPItem): Promise<InactivityAnalysis> {
    const now = Date.now();
    const { inactivityWarningDays: warnDays, inactivityCloseDays: closeDays } = this.config;
    const timeline = await this.github.getTimeline(item.number);

    // A commit date comes from its author's clock, so ignore dates in the future
    let lastProgress = item.createdAt.getTime();
    for (const entry of timeline) {
      const time = progressTime(entry);
      if (time > lastProgress && time <= now) {
        lastProgress = time;
      }
    }
    const daysSinceProgress = daysBetween(new Date(lastProgress), new Date(now));

    // Only a warning posted since the last progress counts
    const warnedAt = timeline
      .filter(e => e.event === 'commented' && e.body?.includes(INACTIVITY_WARNING_MARKER))
      .map(e => Date.parse(e.created_at ?? ''))
      .find(time => time > lastProgress);

    if (warnedAt === undefined) {
      return { daysSinceProgress, action: daysSinceProgress >= warnDays ? 'warn' : null };
    }
    const daysSinceWarning = daysBetween(new Date(warnedAt), new Date(now));
    const close = daysSinceProgress >= closeDays && daysSinceWarning >= closeDays - warnDays;
    return { daysSinceProgress, action: close ? 'close' : null };
  }

  private analyzeDraft(item: SEPItem, daysSinceActivity: number): StaleAnalysis {
    // 90+ days: check in with the author and assignees
    if (daysSinceActivity >= this.config.draftPingDays) {
      return {
        item,
        daysSinceActivity,
        shouldPing: true,
        shouldMarkDormant: false,
        shouldClose: false,
        pingTarget: 'author',
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
   * For 'accepted' state, this is the author.
   * For 'draft' state, this is the first assignee, falling back to author.
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
   * For all other states, this is the first assignee,
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
