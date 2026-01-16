/**
 * Hook interfaces for external notifications
 */

import type { SEPItem, SEPState, ActionResult } from '../types.js';

/** Events that can trigger hooks */
export type SEPEventType =
  | 'transition'
  | 'ping'
  | 'dormant'
  | 'close';

/** Base event data */
export interface SEPEvent {
  type: SEPEventType;
  item: SEPItem;
  timestamp: Date;
}

/** Transition event */
export interface TransitionEvent extends SEPEvent {
  type: 'transition';
  fromState: SEPState | null;
  toState: SEPState;
  sponsor: string;
}

/** Ping event */
export interface PingEvent extends SEPEvent {
  type: 'ping';
  pingTarget: 'author' | 'sponsor' | 'maintainer';
  targetUser: string;
  daysSinceActivity: number;
}

/** Dormant event */
export interface DormantEvent extends SEPEvent {
  type: 'dormant';
  daysSinceActivity: number;
  wasClosed: boolean;
}

/** Close event */
export interface CloseEvent extends SEPEvent {
  type: 'close';
  reason: string;
}

/** Summary event - sent at end of run */
export interface SummaryEvent {
  type: 'summary';
  timestamp: Date;
  dryRun: boolean;
  transitions: Array<{ item: SEPItem; fromState: SEPState | null; toState: SEPState; sponsor: string }>;
  pings: Array<{ item: SEPItem; pingTarget: 'author' | 'sponsor' | 'maintainer'; targetUser: string; daysSinceActivity: number }>;
  needsSponsor: Array<{ item: SEPItem; daysSinceActivity: number }>;
  dormant: Array<{ item: SEPItem; daysSinceActivity: number; wasClosed: boolean }>;
  totalProcessed: number;
  failed: number;
}

/** Union type of all events */
export type SEPHookEvent = TransitionEvent | PingEvent | DormantEvent | CloseEvent | SummaryEvent;

/** Hook interface */
export interface SEPHook {
  name: string;
  enabled: boolean;

  /** Called when any event occurs */
  onEvent(event: SEPHookEvent, result: ActionResult): Promise<void>;
}
