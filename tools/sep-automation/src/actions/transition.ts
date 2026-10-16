/**
 * State transition handling
 */

import type { Logger } from 'pino';
import type { Config } from '../config.js';
import type { GitHubClient } from '../github/client.js';
import { ActionType, type SEPItem, type SEPState, type SEPStateOrNone, type ActionResult, type SEPAction } from '../types.js';
import { isValidTransition, STATE_TRANSITIONS } from '../rules.js';
import { createTransitionComment } from './comment.js';
import { getErrorMessage } from '../utils/index.js';

export class TransitionHandler {
  private readonly config: Config;
  private readonly github: GitHubClient;
  private readonly logger: Logger;

  constructor(config: Config, github: GitHubClient, logger: Logger) {
    this.config = config;
    this.github = github;
    this.logger = logger;
  }

  /**
   * Execute a state transition
   */
  async executeTransition(
    item: SEPItem,
    toState: SEPState,
    sponsor: string,
    dryRun: boolean
  ): Promise<ActionResult> {
    const fromState = item.state;
    const action: SEPAction = {
      type: ActionType.Transition,
      item,
      fromState: fromState ?? undefined,
      toState,
      targetUser: sponsor,
      reason: `Transitioning from ${fromState ?? 'none'} to ${toState}`,
      dryRun,
    };

    // Validate the transition
    if (fromState) {
      const validation = this.validateTransition(fromState, toState);
      if (!validation.valid) {
        this.logger.warn({ item: item.number, fromState, toState }, validation.reason);
        return { action, success: false, error: validation.reason };
      }
    }

    if (dryRun) {
      this.logger.info(
        { item: item.number, fromState, toState, sponsor },
        'DRY RUN: Would transition state'
      );
      return { action, success: true };
    }

    try {
      // Remove old state label if present
      if (fromState) {
        await this.github.removeLabel(item.number, fromState);
      }

      // Add new state label
      await this.github.addLabels(item.number, [toState]);

      // Post comment
      const fromStateOrNone: SEPStateOrNone = fromState ?? 'none';
      const comment = createTransitionComment(item, fromStateOrNone, toState, sponsor);
      const { url } = await this.github.addComment(item.number, comment);

      this.logger.info(
        { item: item.number, fromState, toState, sponsor, commentUrl: url },
        'Transitioned state'
      );

      return { action, success: true, commentUrl: url };
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error({ item: item.number, error: message }, 'Failed to transition state');
      return { action, success: false, error: message };
    }
  }

  /**
   * Validate if a state transition is allowed (exposed for testing)
   */
  validateTransition(fromState: SEPState | null, toState: SEPState): { valid: boolean; reason: string } {
    if (isValidTransition(fromState, toState)) {
      return { valid: true, reason: fromState ? 'Valid transition' : 'Initial state assignment' };
    }

    const validTargets = fromState ? STATE_TRANSITIONS[fromState] : [];
    return {
      valid: false,
      reason: `Invalid transition: ${fromState} → ${toState}. Valid targets: ${validTargets.join(', ')}`,
    };
  }
}
