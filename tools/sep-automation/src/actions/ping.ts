/**
 * Stale pinging logic
 */

import type { Logger } from 'pino';
import type { Config } from '../config.js';
import type { GitHubClient } from '../github/client.js';
import { ActionType, type SEPItem, type ActionResult, type SEPAction, type StaleAnalysis } from '../types.js';
import { MaintainerResolver } from '../maintainers/resolver.js';
import { STATE_TRANSITIONS } from '../rules.js';
import { getErrorMessage } from '../utils/index.js';
import {
  createDraftPingComment,
  createMaintainerPingComment,
  createDormantComment,
  createAcceptedReminderComment,
} from './comment.js';

export class PingHandler {
  private readonly config: Config;
  private readonly github: GitHubClient;
  private readonly maintainers: MaintainerResolver;
  private readonly logger: Logger;

  constructor(
    config: Config,
    github: GitHubClient,
    maintainers: MaintainerResolver,
    logger: Logger
  ) {
    this.config = config;
    this.github = github;
    this.maintainers = maintainers;
    this.logger = logger;
  }

  /**
   * Execute a ping action based on stale analysis
   */
  async executePing(analysis: StaleAnalysis, dryRun: boolean): Promise<ActionResult> {
    const { item, pingTarget, daysSinceActivity, shouldMarkDormant, shouldClose } = analysis;

    // Handle dormant case first
    if (shouldMarkDormant) {
      return this.markDormant(item, daysSinceActivity, shouldClose, dryRun);
    }

    if (!pingTarget) {
      return {
        action: this.createAction(ActionType.PingAuthor, item, dryRun, 'No ping target'),
        success: true,
      };
    }

    switch (pingTarget) {
      case 'author':
        return this.pingAuthor(item, daysSinceActivity, dryRun);
      case 'maintainer':
        return this.pingMaintainer(item, daysSinceActivity, dryRun);
      default:
        return {
          action: this.createAction(ActionType.PingAuthor, item, dryRun, 'Unknown ping target'),
          success: false,
          error: `Unknown ping target: ${pingTarget}`,
        };
    }
  }

  /**
   * Ping a maintainer directly (avoids creating a fake analysis)
   */
  async pingMaintainerDirectly(
    item: SEPItem,
    maintainer: string,
    daysSinceActivity: number,
    dryRun: boolean
  ): Promise<ActionResult> {
    const action = this.createAction(
      ActionType.PingMaintainer,
      item,
      dryRun,
      `Maintainer ping after ${daysSinceActivity} days of inactivity`,
      maintainer
    );

    if (dryRun) {
      this.logger.info(
        { item: item.number, maintainer, daysSinceActivity },
        'DRY RUN: Would ping maintainer'
      );
      return { action, success: true };
    }

    try {
      const comment = createMaintainerPingComment(item, maintainer, daysSinceActivity);
      const { url } = await this.github.addComment(item.number, comment);

      this.logger.info(
        { item: item.number, maintainer, commentUrl: url },
        'Pinged maintainer'
      );
      return { action, success: true, commentUrl: url };
    } catch (error) {
      const message = getErrorMessage(error);
      return { action, success: false, error: message };
    }
  }

  private async pingAuthor(
    item: SEPItem,
    daysSinceActivity: number,
    dryRun: boolean
  ): Promise<ActionResult> {
    const action = this.createAction(
      ActionType.PingAuthor,
      item,
      dryRun,
      `Author ping after ${daysSinceActivity} days of inactivity`,
      item.author
    );

    if (dryRun) {
      this.logger.info(
        { item: item.number, author: item.author, daysSinceActivity },
        'DRY RUN: Would ping author'
      );
      return { action, success: true };
    }

    try {
      const comment = item.state === 'accepted'
        ? createAcceptedReminderComment(item, daysSinceActivity)
        : createDraftPingComment(item, daysSinceActivity);
      const { url } = await this.github.addComment(item.number, comment);

      this.logger.info(
        { item: item.number, author: item.author, commentUrl: url },
        'Pinged author'
      );
      return { action, success: true, commentUrl: url };
    } catch (error) {
      const message = getErrorMessage(error);
      return { action, success: false, error: message };
    }
  }

  private async pingMaintainer(
    item: SEPItem,
    daysSinceActivity: number,
    dryRun: boolean
  ): Promise<ActionResult> {
    const sponsor = await this.maintainers.getSponsor([...item.assignees]);

    if (!sponsor) {
      return {
        action: this.createAction(ActionType.PingMaintainer, item, dryRun, 'No maintainer found'),
        success: false,
        error: 'No maintainer assigned',
      };
    }

    return this.pingMaintainerDirectly(item, sponsor, daysSinceActivity, dryRun);
  }

  private async markDormant(
    item: SEPItem,
    daysSinceActivity: number,
    shouldClose: boolean,
    dryRun: boolean
  ): Promise<ActionResult> {
    const action = this.createAction(
      ActionType.MarkDormant,
      item,
      dryRun,
      `Marking dormant after ${daysSinceActivity} days of inactivity`
    );

    // Validate the transition is allowed
    if (item.state) {
      const validTargets = STATE_TRANSITIONS[item.state];
      if (!validTargets.includes('dormant')) {
        const error = `Invalid transition: ${item.state} → dormant. Valid targets: ${validTargets.join(', ')}`;
        this.logger.warn({ item: item.number, fromState: item.state }, error);
        return { action, success: false, error };
      }
    }

    if (dryRun) {
      this.logger.info(
        { item: item.number, daysSinceActivity, shouldClose },
        'DRY RUN: Would mark as dormant'
      );
      return { action, success: true };
    }

    try {
      // Remove current state label first (safer order - avoids dual-label state)
      if (item.state && item.state !== 'dormant') {
        await this.github.removeLabel(item.number, item.state);
      }

      // Add dormant label
      await this.github.addLabels(item.number, ['dormant']);

      // Post comment
      const comment = createDormantComment(item, daysSinceActivity);
      const { url } = await this.github.addComment(item.number, comment);

      // Close if needed
      if (shouldClose) {
        await this.github.closeIssue(item.number);
      }

      this.logger.info(
        { item: item.number, daysSinceActivity, closed: shouldClose, commentUrl: url },
        'Marked as dormant'
      );
      return { action, success: true, commentUrl: url };
    } catch (error) {
      const message = getErrorMessage(error);
      return { action, success: false, error: message };
    }
  }

  private createAction(
    type: SEPAction['type'],
    item: SEPItem,
    dryRun: boolean,
    reason: string,
    targetUser?: string
  ): SEPAction {
    return { type, item, targetUser, reason, dryRun };
  }
}
