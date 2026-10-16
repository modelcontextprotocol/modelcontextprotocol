/**
 * Configuration loading from environment variables
 *
 * Default values are defined in rules.ts and can be overridden via env vars.
 */

import {
  STALENESS_RULES,
  MAINTAINER_INACTIVITY_DAYS,
  PING_COOLDOWN_DAYS,
} from './rules.js';

export interface Config {
  // Authentication - either token OR app credentials
  githubToken: string | null;
  appId: string | null;
  appPrivateKey: string | null;
  // Target repository
  targetOwner: string;
  targetRepo: string;
  maintainersTeam: string;
  // Timing thresholds
  proposalPingDays: number;
  proposalDormantDays: number;
  draftPingDays: number;
  acceptedPingDays: number;
  maintainerInactivityDays: number;
  pingCooldownDays: number;
  // Behavior
  dryRun: boolean;
  discordWebhookUrl: string | null;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvRequired(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

// Extract defaults from rules
const proposalRule = STALENESS_RULES.find(r => r.state === 'proposal');
const draftRule = STALENESS_RULES.find(r => r.state === 'draft');
const acceptedRule = STALENESS_RULES.find(r => r.state === 'accepted');

export function loadConfig(): Config {
  const githubToken = process.env['GITHUB_TOKEN'] ?? null;
  const appId = process.env['APP_ID'] ?? null;
  const appPrivateKey = process.env['APP_PRIVATE_KEY'] ?? null;

  // Require either token or app credentials
  if (!githubToken && (!appId || !appPrivateKey)) {
    throw new Error(
      'Authentication required: set GITHUB_TOKEN or both APP_ID and APP_PRIVATE_KEY'
    );
  }

  return {
    githubToken,
    appId,
    appPrivateKey,
    targetOwner: getEnvOrDefault('TARGET_OWNER', 'modelcontextprotocol'),
    targetRepo: getEnvOrDefault('TARGET_REPO', 'modelcontextprotocol'),
    maintainersTeam: getEnvOrDefault('MAINTAINERS_TEAM', 'core-maintainers'),
    proposalPingDays: getEnvNumber('PROPOSAL_PING_DAYS', proposalRule?.pingAfterDays ?? 90),
    proposalDormantDays: getEnvNumber('PROPOSAL_DORMANT_DAYS', proposalRule?.dormantAfterDays ?? 180),
    draftPingDays: getEnvNumber('DRAFT_PING_DAYS', draftRule?.pingAfterDays ?? 90),
    acceptedPingDays: getEnvNumber('ACCEPTED_PING_DAYS', acceptedRule?.pingAfterDays ?? 30),
    maintainerInactivityDays: getEnvNumber('MAINTAINER_INACTIVITY_DAYS', MAINTAINER_INACTIVITY_DAYS),
    pingCooldownDays: getEnvNumber('PING_COOLDOWN_DAYS', PING_COOLDOWN_DAYS),
    dryRun: getEnvBoolean('DRY_RUN', false),
    discordWebhookUrl: process.env['DISCORD_WEBHOOK_URL'] ?? null,
  };
}
