/**
 * Comment templates for bot actions
 */

import { BOT_COMMENT_MARKER, INACTIVITY_WARNING_MARKER } from '../types.js';
import type { SEPItem, SEPStateOrNone } from '../types.js';

const SEP_GUIDELINES_URL = 'https://modelcontextprotocol.io/community/sep-guidelines';

export function createTransitionComment(
  item: SEPItem,
  fromState: SEPStateOrNone,
  toState: SEPStateOrNone,
  sponsor: string
): string {
  return `${BOT_COMMENT_MARKER}

## State Transition: ${fromState} → ${toState}

This SEP has been transitioned from **${fromState}** to **${toState}**.

${toState === 'draft' ? `@${sponsor} has been assigned as the sponsor for this SEP.` : ''}

---
*This is an automated message from the SEP lifecycle bot.*`;
}

/** Check-in for a quiet draft, addressed to the author and current assignees. */
export function createDraftPingComment(item: SEPItem, daysSinceActivity: number): string {
  const mentions = [...new Set([item.author, ...item.assignees])].map(u => `@${u}`).join(', ');

  return `${BOT_COMMENT_MARKER}

## Draft Check-in

Hi ${mentions}!

This SEP draft has been inactive for **${daysSinceActivity} days**.

SEPs are moved forward by the sponsoring working group, its leads and the author. We wanted to check in:
- Is there ongoing work on this draft?
- Is there anything blocking progress?
- Should this SEP be moved to a different state?

If this SEP is no longer being pursued, please let us know and we can close it. Otherwise, any update on the current status would be appreciated!

---
*This is an automated message from the SEP lifecycle bot.*`;
}

export function createMaintainerPingComment(
  item: SEPItem,
  maintainer: string,
  daysSinceActivity: number
): string {
  return `${BOT_COMMENT_MARKER}

## Maintainer Activity Check

Hi @${maintainer}!

You're assigned to this SEP but there hasn't been any activity from you in **${daysSinceActivity} days**.

Please provide an update on:
- Current status of your review/work
- Any blockers or concerns
- Expected timeline for next steps

If you're no longer able to follow this SEP, please let us know so it can be reassigned.

---
*This is an automated message from the SEP lifecycle bot.*`;
}

export function createDormantComment(item: SEPItem, daysSinceActivity: number): string {
  return `${BOT_COMMENT_MARKER}

## Marking as Dormant

This SEP proposal has been inactive for **${daysSinceActivity} days** and is being marked as **dormant**.

This SEP is being closed, but it can be reopened if work resumes. To reactivate:
1. Comment on this issue/PR with an update
2. A maintainer can remove the \`dormant\` label and reopen

Thank you for your contribution!

---
*This is an automated message from the SEP lifecycle bot.*`;
}

/** One-time notice, posted `noticeDays` before an inactive SEP pull request is closed. */
export function createInactivityWarningComment(
  daysSinceProgress: number,
  closeDays: number,
  noticeDays: number
): string {
  return `${BOT_COMMENT_MARKER}
${INACTIVITY_WARNING_MARKER}

## Inactivity Notice

This SEP pull request has had no progress for **${daysSinceProgress} days**. SEP pull requests are closed after about ${closeDays} days without progress, and this one will be closed in about ${noticeDays} days unless there is progress.

A new commit, review or comment counts as progress.

---
*This is an automated message from the SEP lifecycle bot.*`;
}

export function createInactivityCloseComment(daysSinceProgress: number, closeDays: number): string {
  return `${BOT_COMMENT_MARKER}

## Closed for Inactivity

This SEP pull request is being closed because it has had no progress for about ${closeDays} days. The last commit, review or comment was **${daysSinceProgress} days** ago.

See the [SEP guidelines](${SEP_GUIDELINES_URL}) for the SEP process.

---
*This is an automated message from the SEP lifecycle bot.*`;
}

export function createAcceptedReminderComment(item: SEPItem, daysSinceActivity: number): string {
  return `${BOT_COMMENT_MARKER}

## Reference Implementation Reminder

Hi @${item.author}!

This SEP was accepted **${daysSinceActivity} days ago**.

A reminder that accepted SEPs should have a reference implementation to move to **final** status.

- Is there a reference implementation in progress?
- Do you need help or guidance with the implementation?

Let us know the current status!

---
*This is an automated message from the SEP lifecycle bot.*`;
}
