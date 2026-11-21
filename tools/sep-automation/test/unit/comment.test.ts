import { describe, it, expect } from 'vitest';
import {
  createTransitionComment,
  createDraftPingComment,
  createDormantComment,
} from '../../src/actions/comment.js';
import { BOT_COMMENT_MARKER } from '../../src/types.js';
import { createMockSEPItem } from '../mocks.js';

describe('Comment templates', () => {
  describe('createTransitionComment', () => {
    it('should include bot marker', () => {
      const mockSEPItem = createMockSEPItem();
      const comment = createTransitionComment(mockSEPItem, 'dormant', 'draft', 'sponsor1');
      expect(comment).toContain(BOT_COMMENT_MARKER);
    });

    it('should mention sponsor for draft transition', () => {
      const mockSEPItem = createMockSEPItem();
      const comment = createTransitionComment(mockSEPItem, 'dormant', 'draft', 'sponsor1');
      expect(comment).toContain('@sponsor1');
      expect(comment).toContain('dormant → draft');
    });

    it('should handle none as fromState', () => {
      const mockSEPItem = createMockSEPItem();
      const comment = createTransitionComment(mockSEPItem, 'none', 'draft', 'sponsor1');
      expect(comment).toContain('none → draft');
    });
  });

  describe('createDraftPingComment', () => {
    it('should address the author and assignees once each', () => {
      const mockSEPItem = createMockSEPItem({ assignees: ['lead1', 'test-author', 'lead2'] });
      const comment = createDraftPingComment(mockSEPItem, 90);
      expect(comment).toContain(BOT_COMMENT_MARKER);
      expect(comment).toContain('Hi @test-author, @lead1, @lead2!');
      expect(comment).toContain('90 days');
    });

    it('should name the working group and not hunt for a sponsor', () => {
      const comment = createDraftPingComment(createMockSEPItem({ assignees: [] }), 90);
      expect(comment).toContain('Hi @test-author!');
      expect(comment).toContain('sponsoring working group, its leads and the author');
      expect(comment).not.toMatch(/finding a sponsor|Sponsor Needed|Discussions/i);
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
