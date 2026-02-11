/**
 * SEP Lifecycle Rules
 *
 * This file encapsulates all the rules for SEP state transitions,
 * staleness thresholds, and automation behavior.
 */

import type { SEPState } from './types.js';

/**
 * Valid state transitions for SEPs.
 *
 * Each state maps to an array of states it can transition to.
 * The automation will reject any transition not listed here.
 */
export const STATE_TRANSITIONS: Record<SEPState, SEPState[]> = {
  // Proposal: Initial state for new SEPs
  // - Can become 'draft' when a core maintainer sponsors it
  // - Can become 'dormant' if abandoned
  proposal: ['draft', 'dormant'],

  // Draft: Active development with a sponsor
  // - Can move to 'in-review' when ready for review
  // - Can become 'dormant' if abandoned
  draft: ['in-review', 'dormant'],

  // In-Review: Under active review by maintainers
  // - Can be 'accepted' if approved
  // - Can return to 'draft' if needs more work
  // - Can become 'dormant' if abandoned
  'in-review': ['accepted', 'draft', 'dormant'],

  // Accepted: Approved, awaiting reference implementation
  // - Can become 'final' when implementation is complete
  // - Can become 'dormant' if abandoned
  accepted: ['final', 'dormant'],

  // Final: Completed SEP with reference implementation
  // - Terminal state, no further transitions
  final: [],

  // Dormant: Inactive/abandoned SEP
  // - Can be revived to 'proposal' or 'draft'
  dormant: ['proposal', 'draft'],
};

/**
 * Labels that represent SEP states.
 * These are the GitHub labels used to track SEP lifecycle.
 */
export const STATE_LABELS: SEPState[] = [
  'proposal',
  'draft',
  'in-review',
  'accepted',
  'final',
  'dormant',
];

/**
 * Staleness rules define when to ping or mark SEPs as dormant.
 *
 * Each rule specifies:
 * - state: Which SEP state this rule applies to
 * - pingAfterDays: Days of inactivity before pinging
 * - dormantAfterDays: Days of inactivity before marking dormant (optional)
 * - pingTarget: Who to ping (author, sponsor, or maintainer)
 * - closeOnDormant: Whether to close the issue/PR when marking dormant
 */
export interface StalenessRule {
  state: SEPState;
  pingAfterDays: number;
  dormantAfterDays?: number;
  pingTarget: 'author' | 'sponsor';
  closeOnDormant?: boolean;
}

export const STALENESS_RULES: StalenessRule[] = [
  {
    // Proposals without a sponsor get pinged after 90 days
    // and marked dormant (closed) after 180 days
    state: 'proposal',
    pingAfterDays: 90,
    dormantAfterDays: 180,
    pingTarget: 'author',
    closeOnDormant: true,
  },
  {
    // Drafts with inactive sponsors get pinged after 90 days
    state: 'draft',
    pingAfterDays: 90,
    pingTarget: 'sponsor',
  },
  {
    // Accepted SEPs awaiting implementation get pinged after 30 days
    state: 'accepted',
    pingAfterDays: 30,
    pingTarget: 'author',
  },
];

/**
 * Maintainer accountability rules.
 *
 * If an assigned maintainer has no activity on a SEP for this many days,
 * they will be pinged as a reminder.
 */
export const MAINTAINER_INACTIVITY_DAYS = 14;

/**
 * Ping cooldown to prevent spamming.
 *
 * After the bot pings someone, it won't ping the same SEP again
 * for this many days.
 */
export const PING_COOLDOWN_DAYS = 14;

/**
 * Auto-transition rules.
 *
 * These define automatic state changes based on events.
 */
export const AUTO_TRANSITION_RULES = {
  // When a core maintainer assigns themselves to a proposal,
  // automatically transition it to draft
  proposalToDraftOnMaintainerAssign: {
    fromState: 'proposal' as SEPState,
    toState: 'draft' as SEPState,
    trigger: 'maintainer_assigned',
    description: 'Auto-transition proposal to draft when a core maintainer assigns themselves',
  },
};

/**
 * Helper: Check if a label is a valid SEP state
 */
export function isStateLabel(label: string): label is SEPState {
  return STATE_LABELS.includes(label as SEPState);
}

/**
 * Helper: Extract SEP state from a list of labels
 */
export function extractState(labels: string[]): SEPState | null {
  for (const label of labels) {
    if (isStateLabel(label)) {
      return label;
    }
  }
  return null;
}

/**
 * Helper: Check if a state transition is valid
 */
export function isValidTransition(fromState: SEPState | null, toState: SEPState): boolean {
  if (!fromState) {
    return true; // Initial state assignment is always valid
  }
  return STATE_TRANSITIONS[fromState].includes(toState);
}

/**
 * Helper: Get the staleness rule for a given state
 */
export function getStalenessRule(state: SEPState): StalenessRule | undefined {
  return STALENESS_RULES.find(rule => rule.state === state);
}
