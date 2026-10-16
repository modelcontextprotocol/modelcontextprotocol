import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PingHandler } from '../../src/actions/ping.js';
import {
  createMockGitHubClient,
  createMockLogger,
  createMockConfig,
  createMockSEPItem,
  createMockMaintainerResolver,
  asGitHubClient,
  asLogger,
  asMaintainerResolver,
  type MockGitHubClient,
  type MockLogger,
  type MockMaintainerResolver,
} from '../mocks.js';
import type { Config } from '../../src/config.js';
import type { StaleAnalysis } from '../../src/types.js';

describe('PingHandler', () => {
  let handler: PingHandler;
  let mockGitHubClient: MockGitHubClient;
  let mockMaintainerResolver: MockMaintainerResolver;
  let mockLogger: MockLogger;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitHubClient = createMockGitHubClient();
    mockMaintainerResolver = createMockMaintainerResolver();
    mockLogger = createMockLogger();
    mockConfig = createMockConfig();
    handler = new PingHandler(
      mockConfig,
      asGitHubClient(mockGitHubClient),
      asMaintainerResolver(mockMaintainerResolver),
      asLogger(mockLogger)
    );
  });

  describe('markDormant validation', () => {
    it('should reject dormant transition from final state', async () => {
      const item = createMockSEPItem({ state: 'final' });
      const analysis: StaleAnalysis = {
        item,
        daysSinceActivity: 200,
        shouldPing: false,
        shouldMarkDormant: true,
        shouldClose: true,
        pingTarget: null,
        reason: 'Test',
      };

      const result = await handler.executePing(analysis, false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(result.error).toContain('final → dormant');
      expect(mockGitHubClient.addLabels).not.toHaveBeenCalled();
      expect(mockGitHubClient.removeLabel).not.toHaveBeenCalled();
    });

    it('should allow dormant transition from proposal state', async () => {
      const item = createMockSEPItem({ state: 'proposal' });
      const analysis: StaleAnalysis = {
        item,
        daysSinceActivity: 200,
        shouldPing: false,
        shouldMarkDormant: true,
        shouldClose: true,
        pingTarget: null,
        reason: 'Test',
      };

      const result = await handler.executePing(analysis, false);

      expect(result.success).toBe(true);
      expect(mockGitHubClient.removeLabel).toHaveBeenCalledWith(123, 'proposal');
      expect(mockGitHubClient.addLabels).toHaveBeenCalledWith(123, ['dormant']);
      expect(mockGitHubClient.closeIssue).toHaveBeenCalledWith(123);
    });

    it('should allow dormant transition from draft state', async () => {
      const item = createMockSEPItem({ state: 'draft' });
      const analysis: StaleAnalysis = {
        item,
        daysSinceActivity: 200,
        shouldPing: false,
        shouldMarkDormant: true,
        shouldClose: false,
        pingTarget: null,
        reason: 'Test',
      };

      const result = await handler.executePing(analysis, false);

      expect(result.success).toBe(true);
      expect(mockGitHubClient.removeLabel).toHaveBeenCalledWith(123, 'draft');
      expect(mockGitHubClient.addLabels).toHaveBeenCalledWith(123, ['dormant']);
      expect(mockGitHubClient.closeIssue).not.toHaveBeenCalled();
    });

    it('should remove old label before adding dormant (correct order)', async () => {
      const item = createMockSEPItem({ state: 'proposal' });
      const analysis: StaleAnalysis = {
        item,
        daysSinceActivity: 200,
        shouldPing: false,
        shouldMarkDormant: true,
        shouldClose: false,
        pingTarget: null,
        reason: 'Test',
      };

      const callOrder: string[] = [];
      mockGitHubClient.removeLabel.mockImplementation(() => {
        callOrder.push('removeLabel');
        return Promise.resolve();
      });
      mockGitHubClient.addLabels.mockImplementation(() => {
        callOrder.push('addLabels');
        return Promise.resolve();
      });

      await handler.executePing(analysis, false);

      expect(callOrder).toEqual(['removeLabel', 'addLabels']);
    });

    it('should skip validation in dry-run but still log correctly', async () => {
      const item = createMockSEPItem({ state: 'proposal' });
      const analysis: StaleAnalysis = {
        item,
        daysSinceActivity: 200,
        shouldPing: false,
        shouldMarkDormant: true,
        shouldClose: true,
        pingTarget: null,
        reason: 'Test',
      };

      const result = await handler.executePing(analysis, true);

      expect(result.success).toBe(true);
      expect(mockGitHubClient.addLabels).not.toHaveBeenCalled();
      expect(mockGitHubClient.removeLabel).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ item: 123, shouldClose: true }),
        'DRY RUN: Would mark as dormant'
      );
    });
  });

  describe('ping actions', () => {
    it('should ping author for stale proposal', async () => {
      const item = createMockSEPItem({ state: 'proposal' });
      const analysis: StaleAnalysis = {
        item,
        daysSinceActivity: 95,
        shouldPing: true,
        shouldMarkDormant: false,
        shouldClose: false,
        pingTarget: 'author',
        reason: 'Test',
      };

      const result = await handler.executePing(analysis, false);

      expect(result.success).toBe(true);
      expect(mockGitHubClient.addComment).toHaveBeenCalled();
      const commentBody = mockGitHubClient.addComment.mock.calls[0]?.[1];
      expect(commentBody).toContain('@test-author');
    });

    it('should ping sponsor for stale draft', async () => {
      const item = createMockSEPItem({ state: 'draft' });
      const analysis: StaleAnalysis = {
        item,
        daysSinceActivity: 95,
        shouldPing: true,
        shouldMarkDormant: false,
        shouldClose: false,
        pingTarget: 'sponsor',
        reason: 'Test',
      };

      const result = await handler.executePing(analysis, false);

      expect(result.success).toBe(true);
      expect(mockGitHubClient.addComment).toHaveBeenCalled();
      const commentBody = mockGitHubClient.addComment.mock.calls[0]?.[1];
      expect(commentBody).toContain('@sponsor1');
    });
  });

  describe('pingMaintainerDirectly', () => {
    it('should ping maintainer directly', async () => {
      const item = createMockSEPItem({ state: 'draft' });

      const result = await handler.pingMaintainerDirectly(item, 'maintainer1', 20, false);

      expect(result.success).toBe(true);
      expect(mockGitHubClient.addComment).toHaveBeenCalled();
      const commentBody = mockGitHubClient.addComment.mock.calls[0]?.[1];
      expect(commentBody).toContain('@maintainer1');
      expect(commentBody).toContain('20 days');
    });

    it('should handle dry run for pingMaintainerDirectly', async () => {
      const item = createMockSEPItem({ state: 'draft' });

      const result = await handler.pingMaintainerDirectly(item, 'maintainer1', 20, true);

      expect(result.success).toBe(true);
      expect(mockGitHubClient.addComment).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ item: 123, maintainer: 'maintainer1' }),
        'DRY RUN: Would ping maintainer'
      );
    });
  });
});
