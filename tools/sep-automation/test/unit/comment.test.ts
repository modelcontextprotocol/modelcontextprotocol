import { describe, it, expect } from 'vitest';
import {
  createTransitionComment,
  createAuthorPingComment,
  createSponsorPingComment,
  createDormantComment,
} from '../../src/actions/comment.js';
import { BOT_COMMENT_MARKER } from '../../src/types.js';
import { createMockSEPItem } from '../mocks.js';

describe('Comment templates', () => {
  describe('createTransitionComment', () => {
    it('should include bot marker', () => {
      const mockSEPItem = createMockSEPItem();
      const comment = createTransitionComment(mockSEPItem, 'proposal', 'draft', 'sponsor1');
      expect(comment).toContain(BOT_COMMENT_MARKER);
    });

    it('should mention sponsor for draft transition', () => {
      const mockSEPItem = createMockSEPItem();
      const comment = createTransitionComment(mockSEPItem, 'proposal', 'draft', 'sponsor1');
      expect(comment).toContain('@sponsor1');
      expect(comment).toContain('proposal');
      expect(comment).toContain('draft');
    });

    it('should handle none as fromState', () => {
      const mockSEPItem = createMockSEPItem();
      const comment = createTransitionComment(mockSEPItem, 'none', 'proposal', 'sponsor1');
      expect(comment).toContain('none → proposal');
    });
  });

  describe('createAuthorPingComment', () => {
    it('should include bot marker and mention author', () => {
      const mockSEPItem = createMockSEPItem();
      const comment = createAuthorPingComment(mockSEPItem, 90);
      expect(comment).toContain(BOT_COMMENT_MARKER);
      expect(comment).toContain('@test-author');
      expect(comment).toContain('90 days');
    });
  });

  describe('createSponsorPingComment', () => {
    it('should mention sponsor and include days', () => {
      const mockSEPItem = createMockSEPItem();
      const comment = createSponsorPingComment(mockSEPItem, 'sponsor1', 90);
      expect(comment).toContain(BOT_COMMENT_MARKER);
      expect(comment).toContain('@sponsor1');
      expect(comment).toContain('90 days');
    });
  });

  describe('createDormantComment', () => {
    it('should include dormant messaging', () => {
      const mockSEPItem = createMockSEPItem();
      const comment = createDormantComment(mockSEPItem, 180);
      expect(comment).toContain(BOT_COMMENT_MARKER);
      expect(comment).toContain('dormant');
      expect(comment).toContain('180 days');
      expect(comment).toContain('can be reopened');
    });
  });
});
