import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookRegistry } from '../../src/hooks/registry.js';
import type { SEPHook, PingEvent } from '../../src/hooks/types.js';
import type { ActionResult } from '../../src/types.js';
import { ActionType } from '../../src/types.js';
import { createMockLogger, createMockSEPItem, asLogger } from '../mocks.js';

describe('HookRegistry', () => {
  let registry: HookRegistry;
  let mockLogger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    registry = new HookRegistry(asLogger(mockLogger));
  });

  it('should register enabled hooks', () => {
    const hook: SEPHook = {
      name: 'test-hook',
      enabled: true,
      onEvent: vi.fn(),
    };

    registry.register(hook);
    expect(registry.getRegisteredHooks()).toContain('test-hook');
  });

  it('should not register disabled hooks', () => {
    const hook: SEPHook = {
      name: 'disabled-hook',
      enabled: false,
      onEvent: vi.fn(),
    };

    registry.register(hook);
    expect(registry.getRegisteredHooks()).not.toContain('disabled-hook');
  });

  it('should dispatch events to all hooks', async () => {
    const hook1: SEPHook = {
      name: 'hook1',
      enabled: true,
      onEvent: vi.fn(),
    };
    const hook2: SEPHook = {
      name: 'hook2',
      enabled: true,
      onEvent: vi.fn(),
    };

    registry.register(hook1);
    registry.register(hook2);

    const mockSEPItem = createMockSEPItem();

    const event: PingEvent = {
      type: 'ping',
      item: mockSEPItem,
      timestamp: new Date(),
      pingTarget: 'author',
      targetUser: 'test-author',
      daysSinceActivity: 90,
    };

    const result: ActionResult = {
      action: {
        type: ActionType.PingAuthor,
        item: mockSEPItem,
        reason: 'test',
        dryRun: false,
      },
      success: true,
    };

    await registry.dispatch(event, result);

    expect(hook1.onEvent).toHaveBeenCalledWith(event, result);
    expect(hook2.onEvent).toHaveBeenCalledWith(event, result);
  });

  it('should handle hook errors gracefully', async () => {
    const failingHook: SEPHook = {
      name: 'failing-hook',
      enabled: true,
      onEvent: vi.fn().mockRejectedValue(new Error('Hook failed')),
    };
    const successHook: SEPHook = {
      name: 'success-hook',
      enabled: true,
      onEvent: vi.fn(),
    };

    registry.register(failingHook);
    registry.register(successHook);

    const mockSEPItem = createMockSEPItem();

    const event: PingEvent = {
      type: 'ping',
      item: mockSEPItem,
      timestamp: new Date(),
      pingTarget: 'author',
      targetUser: 'test-author',
      daysSinceActivity: 90,
    };

    const result: ActionResult = {
      action: {
        type: ActionType.PingAuthor,
        item: mockSEPItem,
        reason: 'test',
        dryRun: false,
      },
      success: true,
    };

    // Should not throw
    await registry.dispatch(event, result);

    // Failing hook should be logged
    expect(mockLogger.error).toHaveBeenCalled();

    // Success hook should still be called
    expect(successHook.onEvent).toHaveBeenCalled();
  });
});
