import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SEPProcessor } from '../../src/processor.js';
import { SEPAnalyzer } from '../../src/sep/analyzer.js';
import { PingHandler } from '../../src/actions/ping.js';
import { TransitionHandler } from '../../src/actions/transition.js';
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

describe('SEPProcessor', () => {
  let processor: SEPProcessor;
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

    // Comments posted during a run must be visible to subsequent reads, so that
    // the analyzer's ping cooldown behaves as it does against the real API.
    const postedComments: Array<{
      body: string;
      created_at: string;
      user: { login: string };
    }> = [];
    mockGitHubClient.addComment.mockImplementation(
      async (_issueNumber: number, body: string) => {
        postedComments.push({
          body,
          created_at: new Date().toISOString(),
          user: { login: 'sep-automation-bot' },
        });
        return { url: 'https://github.com/comment/1' };
      }
    );
    mockGitHubClient.getComments.mockImplementation(async () => postedComments);

    processor = new SEPProcessor(
      mockConfig,
      new SEPAnalyzer(mockConfig, asGitHubClient(mockGitHubClient)),
      asMaintainerResolver(mockMaintainerResolver),
      new TransitionHandler(
        mockConfig,
        asGitHubClient(mockGitHubClient),
        asLogger(mockLogger)
      ),
      new PingHandler(
        mockConfig,
        asGitHubClient(mockGitHubClient),
        asMaintainerResolver(mockMaintainerResolver),
        asLogger(mockLogger)
      ),
      asLogger(mockLogger)
    );
  });

  describe('process', () => {
    // An unassigned proposal, so the proposal -> draft auto-transition does not
    // short-circuit the staleness check.
    const unsponsoredProposal = () =>
      createMockSEPItem({ state: 'proposal', assignees: [] });

    it('should report a dormant proposal that was closed', async () => {
      const sep = unsponsoredProposal();

      const { results, summaryData } = await processor.process(sep);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      expect(mockGitHubClient.closeIssue).toHaveBeenCalledWith(sep.number);

      expect(summaryData.dormant).toHaveLength(1);
      expect(summaryData.dormant[0]?.item.number).toBe(sep.number);
      expect(summaryData.dormant[0]?.wasClosed).toBe(true);
    });

    it('should report an author ping for a stale accepted SEP', async () => {
      const sep = createMockSEPItem({ state: 'accepted', assignees: [] });

      const { results, summaryData } = await processor.process(sep);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);

      expect(summaryData.pings).toHaveLength(1);
      expect(summaryData.pings[0]?.pingTarget).toBe('author');
      expect(summaryData.pings[0]?.targetUser).toBe(sep.author);
      expect(summaryData.dormant).toHaveLength(0);
    });

    it('should report a sponsor ping with the resolved sponsor', async () => {
      const sep = createMockSEPItem({ state: 'draft', assignees: ['maintainer1'] });

      const { summaryData } = await processor.process(sep);

      const sponsorPing = summaryData.pings.find(p => p.pingTarget === 'sponsor');
      expect(sponsorPing?.targetUser).toBe('sponsor1');
    });

    it('should report a draft SEP with no sponsor as needing one', async () => {
      mockMaintainerResolver.getSponsor.mockResolvedValue(null);
      const sep = createMockSEPItem({ state: 'draft', assignees: ['maintainer1'] });

      const { summaryData } = await processor.process(sep);

      expect(summaryData.needsSponsor).toHaveLength(1);
      expect(summaryData.needsSponsor[0]?.item.number).toBe(sep.number);
    });

    it('should not report an action that failed', async () => {
      mockGitHubClient.addComment.mockRejectedValue(new Error('API is down'));
      const sep = unsponsoredProposal();

      const { results, summaryData } = await processor.process(sep);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(false);
      expect(summaryData.dormant).toHaveLength(0);
      expect(summaryData.pings).toHaveLength(0);
    });

    it('should not act on a SEP within its activity threshold', async () => {
      const sep = createMockSEPItem({
        state: 'proposal',
        assignees: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { results, summaryData } = await processor.process(sep);

      expect(results).toHaveLength(0);
      expect(summaryData.dormant).toHaveLength(0);
      expect(summaryData.pings).toHaveLength(0);
      expect(mockGitHubClient.addComment).not.toHaveBeenCalled();
    });

    it('should skip a closed SEP', async () => {
      const sep = createMockSEPItem({
        state: 'proposal',
        assignees: [],
        isClosed: true,
      });

      const { results, summaryData } = await processor.process(sep);

      expect(results).toHaveLength(0);
      expect(summaryData.dormant).toHaveLength(0);
      expect(mockGitHubClient.addComment).not.toHaveBeenCalled();
    });
  });
});
