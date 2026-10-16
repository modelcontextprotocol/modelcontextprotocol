/**
 * Hook dispatch registry
 */

import type { Logger } from 'pino';
import type { SEPHook, SEPHookEvent } from './types.js';
import type { ActionResult } from '../types.js';

export class HookRegistry {
  private hooks: SEPHook[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a hook
   */
  register(hook: SEPHook): void {
    if (hook.enabled) {
      this.hooks.push(hook);
      this.logger.debug({ hook: hook.name }, 'Registered hook');
    }
  }

  /**
   * Dispatch an event to all registered hooks
   */
  async dispatch(event: SEPHookEvent, result: ActionResult): Promise<void> {
    const promises = this.hooks.map(async hook => {
      try {
        await hook.onEvent(event, result);
      } catch (error) {
        this.logger.error(
          {
            hook: hook.name,
            event: event.type,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Hook failed to process event'
        );
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get list of registered hook names
   */
  getRegisteredHooks(): string[] {
    return this.hooks.map(h => h.name);
  }
}
