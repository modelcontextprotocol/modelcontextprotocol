import { describe, it, expect } from 'vitest';
import { isStateLabel, extractState, VALID_TRANSITIONS } from '../../src/sep/types.js';

describe('isStateLabel', () => {
  it('should return true for valid state labels', () => {
    expect(isStateLabel('proposal')).toBe(true);
    expect(isStateLabel('draft')).toBe(true);
    expect(isStateLabel('in-review')).toBe(true);
    expect(isStateLabel('accepted')).toBe(true);
    expect(isStateLabel('final')).toBe(true);
    expect(isStateLabel('dormant')).toBe(true);
  });

  it('should return false for invalid labels', () => {
    expect(isStateLabel('bug')).toBe(false);
    expect(isStateLabel('enhancement')).toBe(false);
    expect(isStateLabel('SEP')).toBe(false);
    expect(isStateLabel('')).toBe(false);
  });
});

describe('extractState', () => {
  it('should extract state from labels', () => {
    expect(extractState(['SEP', 'proposal'])).toBe('proposal');
    expect(extractState(['bug', 'draft', 'urgent'])).toBe('draft');
    expect(extractState(['accepted'])).toBe('accepted');
  });

  it('should return null if no state label found', () => {
    expect(extractState(['SEP', 'bug'])).toBeNull();
    expect(extractState([])).toBeNull();
  });

  it('should return first state label if multiple present', () => {
    expect(extractState(['proposal', 'draft'])).toBe('proposal');
  });
});

describe('VALID_TRANSITIONS', () => {
  it('should have proposal transitioning to draft or dormant', () => {
    expect(VALID_TRANSITIONS.proposal).toContain('draft');
    expect(VALID_TRANSITIONS.proposal).toContain('dormant');
  });

  it('should have draft transitioning to in-review or dormant', () => {
    expect(VALID_TRANSITIONS.draft).toContain('in-review');
    expect(VALID_TRANSITIONS.draft).toContain('dormant');
  });

  it('should have final as terminal state', () => {
    expect(VALID_TRANSITIONS.final).toEqual([]);
  });

  it('should allow dormant to be reactivated', () => {
    expect(VALID_TRANSITIONS.dormant).toContain('proposal');
    expect(VALID_TRANSITIONS.dormant).toContain('draft');
  });
});
