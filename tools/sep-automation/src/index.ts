/**
 * SEP Lifecycle Automation - Entry Point
 *
 * Usage:
 *   npm start                    # Process all SEPs (full sweep)
 *   npm start -- --issue 123     # Process single issue/PR by number
 */

import pino from 'pino';
import { loadConfig } from './config.js';
import { GitHubClient } from './github/client.js';
import { MaintainerResolver } from './maintainers/resolver.js';
import { SEPDetector } from './sep/detector.js';
import { SEPAnalyzer } from './sep/analyzer.js';
import { TransitionHandler } from './actions/transition.js';
import { PingHandler } from './actions/ping.js';
import { HookRegistry } from './hooks/registry.js';
import { DiscordHook } from './hooks/discord.js';
import { SEPProcessor, type SummaryData } from './processor.js';
import { ActionType, type SEPItem, type ActionResult } from './types.js';
import type { SummaryEvent } from './hooks/types.js';
import { getErrorMessage } from './utils/index.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: {
    target: 'pino/file',
    options: { destination: 1 }, // stdout
  },
});

/** Parse command line arguments */
function parseArgs(): { issueNumber?: number } {
  const args = process.argv.slice(2);
  const issueIndex = args.indexOf('--issue');

  if (issueIndex !== -1) {
    const issueArg = args[issueIndex + 1];
    if (issueArg !== undefined) {
      const issueNumber = parseInt(issueArg, 10);
      if (!isNaN(issueNumber)) {
        return { issueNumber };
      }
    }
  }

  return {};
}

async function main(): Promise<void> {
  const { issueNumber } = parseArgs();
  const mode = issueNumber ? `single issue #${issueNumber}` : 'full sweep';

  logger.info({ mode }, 'Starting SEP Lifecycle Automation');

  // Load configuration
  const config = loadConfig();
  logger.info(
    {
      owner: config.targetOwner,
      repo: config.targetRepo,
      dryRun: config.dryRun,
      mode,
    },
    'Configuration loaded'
  );

  // Initialize components
  const github = new GitHubClient(config);
  const maintainers = new MaintainerResolver(config, github, logger);
  const detector = new SEPDetector(github);
  const analyzer = new SEPAnalyzer(config, github);
  const transitionHandler = new TransitionHandler(config, github, logger);
  const pingHandler = new PingHandler(config, github, maintainers, logger);

  // Initialize processor
  const processor = new SEPProcessor(
    config,
    analyzer,
    maintainers,
    transitionHandler,
    pingHandler,
    logger
  );

  // Initialize hooks
  const hooks = new HookRegistry(logger);
  hooks.register(new DiscordHook({ webhookUrl: config.discordWebhookUrl }, logger));

  // Track results and summary
  const allResults: ActionResult[] = [];
  const summary: SummaryData = {
    transitions: [],
    pings: [],
    needsSponsor: [],
    dormant: [],
  };

  try {
    let seps: SEPItem[];

    if (issueNumber) {
      // Single issue mode
      logger.info({ issueNumber }, 'Fetching single SEP...');
      const sep = await detector.getSEP(issueNumber);

      if (!sep) {
        logger.warn({ issueNumber }, 'Issue/PR is not a SEP or does not exist');
        return;
      }

      seps = [sep];
    } else {
      // Full sweep mode
      logger.info('Finding all open SEPs...');
      seps = await detector.findAllSEPs();
    }

    logger.info({ count: seps.length }, 'Found SEPs');

    // Process each SEP
    for (const sep of seps) {
      try {
        const result = await processor.process(sep);
        allResults.push(...result.results);

        // Merge summary data
        summary.transitions.push(...result.summaryData.transitions);
        summary.pings.push(...result.summaryData.pings);
        summary.needsSponsor.push(...result.summaryData.needsSponsor);
        summary.dormant.push(...result.summaryData.dormant);
      } catch (error) {
        logger.error(
          { item: sep.number, error: getErrorMessage(error) },
          'Failed to process SEP, continuing with next'
        );
      }
    }

    // Summary stats
    const successful = allResults.filter(r => r.success).length;
    const failed = allResults.filter(r => !r.success).length;
    logger.info(
      { total: allResults.length, successful, failed },
      'Automation complete'
    );

    // Send summary to Discord (only if there were actions and not single-issue mode)
    if (allResults.length > 0 && !issueNumber) {
      const firstSep = seps[0];
      if (firstSep) {
        const summaryEvent: SummaryEvent = {
          type: 'summary',
          timestamp: new Date(),
          dryRun: config.dryRun,
          transitions: summary.transitions,
          pings: summary.pings,
          needsSponsor: summary.needsSponsor,
          dormant: summary.dormant,
          totalProcessed: seps.length,
          failed,
        };
        await hooks.dispatch(summaryEvent, { action: { type: ActionType.Transition, item: firstSep, reason: 'summary', dryRun: config.dryRun }, success: true });
      }
    }

    // Exit with error code if any failures
    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.fatal({ error: getErrorMessage(error) }, 'Automation failed');
    process.exit(1);
  }
}

// Run
main().catch(error => {
  logger.fatal({ error: getErrorMessage(error) }, 'Unhandled error');
  process.exit(1);
});
