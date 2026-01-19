/**
 * SEP Processing - core business logic for SEP lifecycle automation
 */

import type { Logger } from 'pino';
import type { Config } from './config.js';
import type { SEPAnalyzer } from './sep/analyzer.js';
import type { MaintainerResolver } from './maintainers/resolver.js';
import type { TransitionHandler } from './actions/transition.js';
import type { PingHandler } from './actions/ping.js';
import { ActionType, type SEPItem, type ActionResult, type SEPState } from './types.js';

/** Summary data collected during processing */
export interface SummaryData {
  transitions: Array<{ item: SEPItem; fromState: SEPState | null; toState: SEPState; sponsor: string }>;
  pings: Array<{ item: SEPItem; pingTarget: 'author' | 'sponsor' | 'maintainer'; targetUser: string; daysSinceActivity: number }>;
  needsSponsor: Array<{ item: SEPItem; daysSinceActivity: number }>;
  dormant: Array<{ item: SEPItem; daysSinceActivity: number; wasClosed: boolean }>;
}

/** Result of processing a SEP */
export interface ProcessResult {
  results: ActionResult[];
  summaryData: SummaryData;
}

/**
 * SEP Processor - handles all SEP processing logic
 */
export class SEPProcessor {
  constructor(
    private readonly config: Config,
    private readonly analyzer: SEPAnalyzer,
    private readonly maintainers: MaintainerResolver,
    private readonly transitionHandler: TransitionHandler,
    private readonly pingHandler: PingHandler,
    private readonly logger: Logger
  ) {}

  /**
   * Process a single SEP
   */
  async process(sep: SEPItem): Promise<ProcessResult> {
    const results: ActionResult[] = [];
    const summaryData: SummaryData = {
      transitions: [],
      pings: [],
      needsSponsor: [],
      dormant: [],
    };

    this.logger.debug({ number: sep.number, title: sep.title, state: sep.state }, 'Processing SEP');

    // Skip closed SEPs
    if (sep.isClosed) {
      this.logger.debug({ number: sep.number }, 'Skipping closed SEP');
      return { results, summaryData };
    }

    // Check for auto-transition
    const transitionResult = await this.checkAutoTransition(sep);
    if (transitionResult) {
      results.push(transitionResult);
      if (transitionResult.success && transitionResult.action.toState) {
        summaryData.transitions.push({
          item: sep,
          fromState: sep.state,
          toState: transitionResult.action.toState,
          sponsor: transitionResult.action.targetUser ?? 'unknown',
        });
      }
      return { results, summaryData }; // Don't check staleness if we just transitioned
    }

    // Check staleness
    const stalenessResult = await this.checkStaleness(sep);
    if (stalenessResult) {
      results.push(stalenessResult);
      this.updateSummaryFromStaleness(stalenessResult, sep, summaryData);
    }

    // Check maintainer accountability
    if (sep.state === 'draft' || sep.state === 'in-review') {
      const maintainerResults = await this.checkMaintainerAccountability(sep);
      results.push(...maintainerResults);
      for (const result of maintainerResults) {
        if (result.success && result.action.targetUser) {
          const activity = await this.analyzer.checkMaintainerActivity(sep, result.action.targetUser);
          summaryData.pings.push({
            item: sep,
            pingTarget: 'maintainer',
            targetUser: result.action.targetUser,
            daysSinceActivity: activity.daysSinceActivity,
          });
        }
      }
    }

    return { results, summaryData };
  }

  /**
   * Check if auto-transition should occur (proposal → draft)
   */
  private async checkAutoTransition(sep: SEPItem): Promise<ActionResult | null> {
    if (sep.state !== 'proposal' || sep.assignees.length === 0) {
      return null;
    }

    const sponsor = await this.maintainers.getSponsor([...sep.assignees]);
    if (!sponsor) {
      return null;
    }

    this.logger.info({ number: sep.number, sponsor }, 'Auto-transitioning proposal to draft');

    return this.transitionHandler.executeTransition(
      sep,
      'draft',
      sponsor,
      this.config.dryRun
    );
  }

  /**
   * Check for staleness and take appropriate action
   */
  private async checkStaleness(sep: SEPItem): Promise<ActionResult | null> {
    const analysis = await this.analyzer.analyze(sep);

    if (!analysis.shouldPing && !analysis.shouldMarkDormant) {
      return null;
    }

    return this.pingHandler.executePing(analysis, this.config.dryRun);
  }

  /**
   * Check maintainer accountability and ping inactive maintainers.
   * Only pings assignees who are verified core maintainers.
   */
  private async checkMaintainerAccountability(sep: SEPItem): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const assignee of sep.assignees) {
      // Only ping core maintainers, not regular assignees
      const isMaintainer = await this.maintainers.isCoreMaintainer(assignee);
      if (!isMaintainer) {
        this.logger.debug(
          { number: sep.number, assignee },
          'Skipping non-maintainer assignee for accountability check'
        );
        continue;
      }

      const activity = await this.analyzer.checkMaintainerActivity(sep, assignee);

      if (activity.shouldPing) {
        this.logger.info(
          { number: sep.number, maintainer: assignee, daysSinceActivity: activity.daysSinceActivity },
          'Maintainer inactive, pinging'
        );

        const result = await this.pingHandler.pingMaintainerDirectly(
          sep,
          assignee,
          activity.daysSinceActivity,
          this.config.dryRun
        );
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Update summary data from a staleness result
   */
  private async updateSummaryFromStaleness(
    result: ActionResult,
    sep: SEPItem,
    summary: SummaryData
  ): Promise<void> {
    if (!result.success) {
      return;
    }

    const analysis = await this.analyzer.analyze(sep);

    switch (result.action.type) {
      case ActionType.NeedsSponsor:
        summary.needsSponsor.push({
          item: sep,
          daysSinceActivity: analysis.daysSinceActivity,
        });
        break;
      case ActionType.MarkDormant:
        summary.dormant.push({
          item: sep,
          daysSinceActivity: analysis.daysSinceActivity,
          wasClosed: analysis.shouldClose,
        });
        break;
      case ActionType.PingAuthor:
      case ActionType.PingSponsor:
      case ActionType.PingMaintainer:
        if (analysis.pingTarget) {
          const targetUser = await this.getTargetUser(sep, analysis.pingTarget);
          summary.pings.push({
            item: sep,
            pingTarget: analysis.pingTarget,
            targetUser: targetUser ?? sep.author,
            daysSinceActivity: analysis.daysSinceActivity,
          });
        }
        break;
    }
  }

  /**
   * Get the target user for a ping
   */
  private async getTargetUser(
    sep: SEPItem,
    pingTarget: 'author' | 'sponsor' | 'maintainer'
  ): Promise<string | null> {
    switch (pingTarget) {
      case 'author':
        return sep.author;
      case 'sponsor':
      case 'maintainer':
        return this.maintainers.getSponsor([...sep.assignees]);
      default:
        return null;
    }
  }
}
