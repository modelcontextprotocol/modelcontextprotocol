/**
 * Core TypeScript interfaces for SEP lifecycle automation
 */

/** SEP states as represented by labels */
export type SEPState = 'proposal' | 'draft' | 'in-review' | 'accepted' | 'final' | 'dormant';

/** SEP state including 'none' for items without a state */
export type SEPStateOrNone = SEPState | 'none';

/** Type of GitHub item (PR or Issue) */
export type SEPItemType = 'pr' | 'issue';

/** Represents a SEP item (PR or issue) */
export interface SEPItem {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly type: SEPItemType;
  readonly state: SEPState | null;
  readonly labels: readonly string[];
  readonly author: string;
  readonly assignees: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly url: string;
  readonly isClosed: boolean;
}

/** Result of analyzing a SEP for staleness */
export interface StaleAnalysis {
  readonly item: SEPItem;
  readonly daysSinceActivity: number;
  readonly shouldPing: boolean;
  readonly shouldMarkDormant: boolean;
  readonly shouldClose: boolean;
  readonly pingTarget: 'author' | 'sponsor' | 'maintainer' | null;
  readonly reason: string | null;
}

/** Action to be taken by the automation */
export enum ActionType {
  Transition = 'transition',
  PingAuthor = 'ping-author',
  PingSponsor = 'ping-sponsor',
  PingMaintainer = 'ping-maintainer',
  NeedsSponsor = 'needs-sponsor',
  MarkDormant = 'mark-dormant',
  Close = 'close',
}

/** Represents an action to take */
export interface SEPAction {
  type: ActionType;
  item: SEPItem;
  targetUser?: string | undefined;
  fromState?: SEPState | undefined;
  toState?: SEPState | undefined;
  reason: string;
  dryRun: boolean;
}

/** Result of executing an action */
export interface ActionResult {
  action: SEPAction;
  success: boolean;
  error?: string;
  commentUrl?: string;
}

/** Bot comment marker for duplicate prevention */
export const BOT_COMMENT_MARKER = '<!-- sep-automation-bot -->';
