/**
 * Discord webhook integration
 */

import type { Logger } from 'pino';
import type { SEPHook, SEPHookEvent, SummaryEvent } from './types.js';
import type { ActionResult } from '../types.js';

export interface DiscordConfig {
  webhookUrl: string | null;
}

export class DiscordHook implements SEPHook {
  name = 'discord';
  enabled: boolean;
  private webhookUrl: string | null;
  private logger: Logger;

  constructor(config: DiscordConfig, logger: Logger) {
    this.webhookUrl = config.webhookUrl;
    this.enabled = !!config.webhookUrl;
    this.logger = logger;
  }

  async onEvent(event: SEPHookEvent, result: ActionResult): Promise<void> {
    if (!this.enabled || !this.webhookUrl) {
      return;
    }

    // Only handle summary events - ignore individual events
    if (event.type !== 'summary') {
      return;
    }

    const embeds = this.createSummaryEmbeds(event);

    // Don't send if nothing happened
    if (embeds.length === 0) {
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.logger.error(
          { status: response.status },
          'Failed to send Discord summary'
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      this.logger.error(
        { error: message, timeout: isTimeout },
        isTimeout ? 'Discord notification timed out' : 'Error sending Discord notification'
      );
    }
  }

  private createSummaryEmbeds(event: SummaryEvent): Array<Record<string, unknown>> {
    const embeds: Array<Record<string, unknown>> = [];

    // Main summary embed
    const hasActivity = event.transitions.length > 0 || event.pings.length > 0 || event.dormant.length > 0;

    if (!hasActivity) {
      return [];
    }

    const summaryEmbed: Record<string, unknown> = {
      title: event.dryRun ? '🧪 SEP Lifecycle Summary (DRY RUN)' : '📋 SEP Lifecycle Summary',
      color: event.dryRun ? 0x9b59b6 : (event.failed > 0 ? 0xffa500 : 0x00ff00),
      description: this.buildSummaryDescription(event),
      timestamp: event.timestamp.toISOString(),
      footer: { text: event.dryRun ? 'SEP Lifecycle Bot • No actions were taken' : 'SEP Lifecycle Bot' },
    };

    embeds.push(summaryEmbed);

    // Transitions section (no inactivity to sort by)
    if (event.transitions.length > 0) {
      const transitionLines = event.transitions.map(t =>
        `• [#${t.item.number}](${t.item.url}): **${t.fromState ?? 'none'}** → **${t.toState}** (sponsor: @${t.sponsor})`
      );
      embeds.push({
        title: '🔄 State Transitions',
        description: transitionLines.join('\n'),
        color: 0x3498db,
      });
    }

    // Pings section - sorted by days inactive (longest first)
    if (event.pings.length > 0) {
      const sortedPings = [...event.pings].sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
      const pingLines = sortedPings.map(p =>
        `• [#${p.item.number}](${p.item.url}) \`${p.item.state ?? 'unknown'}\`: pinged ${p.pingTarget} @${p.targetUser} (**${p.daysSinceActivity}d** inactive)`
      );
      embeds.push({
        title: '🔔 Stale Pings',
        description: pingLines.join('\n'),
        color: 0xf39c12,
      });
    }

    // Dormant section - sorted by days inactive (longest first)
    if (event.dormant.length > 0) {
      const sortedDormant = [...event.dormant].sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
      const dormantLines = sortedDormant.map(d =>
        `• [#${d.item.number}](${d.item.url}) \`${d.item.state ?? 'unknown'}\` → \`dormant\`: after **${d.daysSinceActivity}d**${d.wasClosed ? ' (closed)' : ''}`
      );
      embeds.push({
        title: '💤 Marked Dormant',
        description: dormantLines.join('\n'),
        color: 0x95a5a6,
      });
    }

    return embeds;
  }

  private buildSummaryDescription(event: SummaryEvent): string {
    const parts: string[] = [];

    if (event.transitions.length > 0) {
      parts.push(`**${event.transitions.length}** transition${event.transitions.length !== 1 ? 's' : ''}`);
    }
    if (event.pings.length > 0) {
      parts.push(`**${event.pings.length}** ping${event.pings.length !== 1 ? 's' : ''}`);
    }
    if (event.dormant.length > 0) {
      parts.push(`**${event.dormant.length}** marked dormant`);
    }
    if (event.failed > 0) {
      parts.push(`**${event.failed}** failed`);
    }

    let description = parts.join(' • ') + `\n\nProcessed ${event.totalProcessed} SEPs`;
    if (event.dryRun) {
      description += '\n\n⚠️ **DRY RUN** - No comments were posted or labels changed';
    }
    return description;
  }
}
