import { beforeEach, describe, expect, it, vi } from "vitest";
import { PingHandler } from "../../src/actions/ping.js";
import type { TransitionHandler } from "../../src/actions/transition.js";
import type { GitHubComment } from "../../src/github/types.js";
import { SEPProcessor } from "../../src/processor.js";
import { SEPAnalyzer } from "../../src/sep/analyzer.js";
import { extractState } from "../../src/sep/types.js";
import { ActionType, BOT_COMMENT_MARKER } from "../../src/types.js";
import {
  asGitHubClient,
  asLogger,
  asMaintainerResolver,
  createMockConfig,
  createMockGitHubClient,
  createMockLogger,
  createMockMaintainerResolver,
  createMockSEPItem,
  type MockGitHubClient,
  type MockLogger,
  type MockMaintainerResolver,
} from "../mocks.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("SEPProcessor", () => {
  let github: MockGitHubClient;
  let maintainers: MockMaintainerResolver;
  let logger: MockLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    github = createMockGitHubClient();
    maintainers = createMockMaintainerResolver();
    logger = createMockLogger();
  });

  function createProcessor(comments: GitHubComment[]): SEPProcessor {
    const config = createMockConfig();
    const githubClient = asGitHubClient(github);
    const maintainerResolver = asMaintainerResolver(maintainers);
    const typedLogger = asLogger(logger);

    github.getComments.mockImplementation(async () => comments);
    github.addComment.mockImplementation(async (_number, body: string) => {
      comments.push({
        id: comments.length + 1,
        body,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: { login: "sep-automation-bot" },
      });
      return { url: "https://github.com/comment/1" };
    });

    return new SEPProcessor(
      config,
      new SEPAnalyzer(config, githubClient),
      maintainerResolver,
      {
        executeTransition: vi.fn(),
      } as unknown as TransitionHandler,
      new PingHandler(config, githubClient, maintainerResolver, typedLogger),
      typedLogger,
    );
  }

  it("includes a successful stale ping in the returned summary", async () => {
    const comments: GitHubComment[] = [];
    const processor = createProcessor(comments);
    const sep = createMockSEPItem({
      assignees: [],
      createdAt: new Date(Date.now() - 95 * MS_PER_DAY),
    });

    const result = await processor.process(sep);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.action.type).toBe(ActionType.PingAuthor);
    expect(result.summaryData.pings).toEqual([
      {
        item: sep,
        pingTarget: "author",
        targetUser: sep.author,
        daysSinceActivity: 95,
      },
    ]);
    expect(comments[0]?.body).toContain(BOT_COMMENT_MARKER);
    expect(github.getComments).toHaveBeenCalledTimes(1);
  });

  it("ignores a SEP that still carries the retired proposal label", async () => {
    const processor = createProcessor([]);
    const labels = ["SEP", "proposal"];
    const sep = createMockSEPItem({
      labels,
      state: extractState(labels),
      createdAt: new Date(Date.now() - 185 * MS_PER_DAY),
    });

    const result = await processor.process(sep);

    expect(result.results).toEqual([]);
    expect(github.addComment).not.toHaveBeenCalled();
    expect(github.addLabels).not.toHaveBeenCalled();
    expect(github.removeLabel).not.toHaveBeenCalled();
    expect(github.closeIssue).not.toHaveBeenCalled();
  });
});
