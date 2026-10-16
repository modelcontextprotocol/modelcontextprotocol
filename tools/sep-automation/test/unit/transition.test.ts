import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransitionHandler } from '../../src/actions/transition.js';
import {
  createMockGitHubClient,
  createMockLogger,
  createMockConfig,
  createMockSEPItem,
  asGitHubClient,
  asLogger,
  type MockGitHubClient,
  type MockLogger,
} from '../mocks.js';
import type { Config } from '../../src/config.js';

describe('TransitionHandler', () => {
  let handler: TransitionHandler;
  let mockGitHubClient: MockGitHubClient;
  let mockLogger: MockLogger;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitHubClient = createMockGitHubClient();
    mockLogger = createMockLogger();
    mockConfig = createMockConfig();
    handler = new TransitionHandler(
      mockConfig,
      asGitHubClient(mockGitHubClient),
      asLogger(mockLogger)
    );
  });

  describe('validateTransition', () => {
    it('should allow valid transitions', () => {
      expect(handler.validateTransition('proposal', 'draft')).toEqual({
        valid: true,
        reason: 'Valid transition',
      });
      expect(handler.validateTransition('draft', 'in-review')).toEqual({
        valid: true,
        reason: 'Valid transition',
      });
    });

    it('should reject invalid transitions', () => {
      const result = handler.validateTransition('proposal', 'final');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid transition');
    });

    it('should allow initial state assignment', () => {
      expect(handler.validateTransition(null, 'proposal')).toEqual({
        valid: true,
        reason: 'Initial state assignment',
      });
    });
  });

  describe('executeTransition', () => {
    it('should execute transition in dry run mode', async () => {
      const mockSEPItem = createMockSEPItem();
      const result = await handler.executeTransition(
        mockSEPItem,
        'draft',
        'sponsor1',
        true // dry run
      );

      expect(result.success).toBe(true);
      expect(mockGitHubClient.removeLabel).not.toHaveBeenCalled();
      expect(mockGitHubClient.addLabels).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should execute real transition', async () => {
      const mockSEPItem = createMockSEPItem();
      const result = await handler.executeTransition(
        mockSEPItem,
        'draft',
        'sponsor1',
        false
      );

      expect(result.success).toBe(true);
      expect(mockGitHubClient.removeLabel).toHaveBeenCalledWith(123, 'proposal');
      expect(mockGitHubClient.addLabels).toHaveBeenCalledWith(123, ['draft']);
      expect(mockGitHubClient.addComment).toHaveBeenCalled();
    });

    it('should reject invalid transition', async () => {
      const mockSEPItem = createMockSEPItem();
      const result = await handler.executeTransition(
        mockSEPItem,
        'final',
        'sponsor1',
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });
  });
});
