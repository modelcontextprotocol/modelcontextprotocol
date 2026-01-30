/**
 * SEP detection - find PRs and issues that are SEPs
 */

import type { GitHubClient } from '../github/client.js';
import type { GitHubIssue } from '../github/types.js';
import type { SEPItem, SEPItemType } from '../types.js';
import { extractState } from './types.js';

/** Constants for SEP detection */
const SEP_LABEL = 'SEP';
const UNKNOWN_AUTHOR = 'unknown';

export class SEPDetector {
  private readonly github: GitHubClient;

  constructor(github: GitHubClient) {
    this.github = github;
  }

  /**
   * Find all SEPs (issues and PRs with SEP label or title containing "SEP")
   */
  async findAllSEPs(): Promise<SEPItem[]> {
    // Search for items with SEP label
    const labeledItems = await this.github.searchIssues('label:SEP is:open');

    // Search for items with SEP in title
    const titledItems = await this.github.searchIssues('SEP in:title is:open');

    // Merge and dedupe
    const allItems = new Map<number, GitHubIssue>();
    for (const item of [...labeledItems, ...titledItems]) {
      allItems.set(item.number, item);
    }

    return Array.from(allItems.values()).map(item => this.toSEPItem(item));
  }

  /**
   * Find SEPs in a specific state
   */
  async findSEPsByState(state: string): Promise<SEPItem[]> {
    const items = await this.github.getIssuesWithLabel(state);

    // Filter to only items that are also SEPs
    const seps = items.filter(item =>
      this.isSEP(item)
    );

    return seps.map(item => this.toSEPItem(item));
  }

  /**
   * Check if an issue/PR is a SEP
   */
  private isSEP(item: GitHubIssue): boolean {
    // Has SEP label
    if (item.labels.some(l => l.name.toUpperCase() === SEP_LABEL)) {
      return true;
    }
    // Title contains SEP
    if (item.title.toUpperCase().includes(SEP_LABEL)) {
      return true;
    }
    return false;
  }

  /**
   * Convert GitHub issue to SEPItem
   */
  private toSEPItem(item: GitHubIssue): SEPItem {
    const labels = item.labels.map(l => l.name);
    const type: SEPItemType = item.pull_request ? 'pr' : 'issue';

    return {
      id: item.id,
      number: item.number,
      title: item.title,
      type,
      state: extractState(labels),
      labels,
      author: item.user?.login ?? UNKNOWN_AUTHOR,
      assignees: item.assignees.map(a => a.login),
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
      url: item.html_url,
      isClosed: item.state === 'closed',
    };
  }

  /**
   * Get a single SEP by number
   */
  async getSEP(number: number): Promise<SEPItem | null> {
    try {
      const item = await this.github.getIssue(number);
      if (!this.isSEP(item)) {
        return null;
      }
      return this.toSEPItem(item);
    } catch {
      return null;
    }
  }
}
