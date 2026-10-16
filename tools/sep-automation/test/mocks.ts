/**
 * Centralized typed mock factories for tests
 */

import { vi, type Mock } from 'vitest';
import type { Config } from '../src/config.js';
import type { SEPItem, SEPState } from '../src/types.js';
import type { GitHubClient } from '../src/github/client.js';
import type { MaintainerResolver } from '../src/maintainers/resolver.js';
import type { Logger } from 'pino';

/**
 * Mock GitHubClient interface
 */
export interface MockGitHubClient {
  searchIssues: Mock;
  getIssuesWithLabel: Mock;
  getComments: Mock;
  getEvents: Mock;
  addComment: Mock;
  addLabels: Mock;
  removeLabel: Mock;
  closeIssue: Mock;
  isTeamMember: Mock;
  getIssue: Mock;
}

/**
 * Create a mock GitHubClient
 */
export function createMockGitHubClient(): MockGitHubClient {
  return {
    searchIssues: vi.fn().mockResolvedValue([]),
    getIssuesWithLabel: vi.fn().mockResolvedValue([]),
    getComments: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
    addComment: vi.fn().mockResolvedValue({ url: 'https://github.com/comment/1' }),
    addLabels: vi.fn().mockResolvedValue(undefined),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    closeIssue: vi.fn().mockResolvedValue(undefined),
    isTeamMember: vi.fn().mockResolvedValue(true),
    getIssue: vi.fn().mockResolvedValue(null),
  };
}

/**
 * Mock Logger interface
 */
export interface MockLogger {
  info: Mock;
  warn: Mock;
  error: Mock;
  debug: Mock;
  fatal: Mock;
  trace: Mock;
  child: Mock;
}

/**
 * Create a mock Logger
 */
export function createMockLogger(): MockLogger {
  const logger: MockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  };
  // child() returns itself for chaining
  logger.child.mockReturnValue(logger);
  return logger;
}

/**
 * Mock MaintainerResolver interface
 */
export interface MockMaintainerResolver {
  getSponsor: Mock;
  isCoreMaintainer: Mock;
  clearCache: Mock;
}

/**
 * Create a mock MaintainerResolver
 */
export function createMockMaintainerResolver(): MockMaintainerResolver {
  return {
    getSponsor: vi.fn().mockResolvedValue('sponsor1'),
    isCoreMaintainer: vi.fn().mockResolvedValue(true),
    clearCache: vi.fn(),
  };
}

/**
 * Create a mock Config
 */
export function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    githubToken: 'test-token',
    targetOwner: 'test-owner',
    targetRepo: 'test-repo',
    maintainersTeam: 'core-maintainers',
    proposalPingDays: 90,
    proposalDormantDays: 180,
    draftPingDays: 90,
    acceptedPingDays: 30,
    maintainerInactivityDays: 14,
    pingCooldownDays: 14,
    dryRun: false,
    discordWebhookUrl: null,
    ...overrides,
  };
}

/**
 * Create a mock SEPItem
 */
export function createMockSEPItem(overrides: Partial<SEPItem> = {}): SEPItem {
  return {
    id: 1,
    number: 123,
    title: 'Test SEP',
    type: 'issue',
    state: 'proposal',
    labels: ['SEP', 'proposal'],
    author: 'test-author',
    assignees: ['maintainer1'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    url: 'https://github.com/test/123',
    isClosed: false,
    ...overrides,
  };
}

/**
 * Cast a mock to its expected type for use with typed classes
 */
export function asGitHubClient(mock: MockGitHubClient): GitHubClient {
  return mock as unknown as GitHubClient;
}

export function asMaintainerResolver(mock: MockMaintainerResolver): MaintainerResolver {
  return mock as unknown as MaintainerResolver;
}

export function asLogger(mock: MockLogger): Logger {
  return mock as unknown as Logger;
}
