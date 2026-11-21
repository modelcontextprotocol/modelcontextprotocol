import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInactivityWarningComment } from "../../src/actions/comment.js";
import { PingHandler } from "../../src/actions/ping.js";
import type { TransitionHandler } from "../../src/actions/transition.js";
import type { Config } from "../../src/config.js";
import type { GitHubTimelineEntry } from "../../src/github/types.js";
import { SEPProcessor } from "../../src/processor.js";
import { SEPAnalyzer } from "../../src/sep/analyzer.js";
import { ActionType, BOT_COMMENT_MARKER, INACTIVITY_WARNING_MARKER, type SEPItem } from "../../src/types.js";
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
} from "../mocks.js";

const NOW = new Date("2026-11-09T09:00:00Z");
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const BOT = "sep-automation-bot[bot]";

// Timeline entries, shaped like the GitHub timeline API returns them
const commit = (days: number): GitHubTimelineEntry => ({
  event: "committed",
  committer: { date: daysAgo(days).toISOString() },
});
const review = (days: number, login = "reviewer", type = "User"): GitHubTimelineEntry => ({
  event: "reviewed",
  submitted_at: daysAgo(days).toISOString(),
  user: { login, type },
});
const comment = (days: number, body = "Any update?", login = "someone", type = "User"): GitHubTimelineEntry => ({
  event: "commented",
  created_at: daysAgo(days).toISOString(),
  user: { login, type },
  body,
});
const warning = (days: number): GitHubTimelineEntry =>
  comment(days, createInactivityWarningComment(150, 180, 30), BOT, "Bot");
const event = (name: string, days: number): GitHubTimelineEntry => ({
  event: name,
  created_at: daysAgo(days).toISOString(),
});

/** A SEP pull request opened `days` ago, without a status label unless overridden */
const pr = (days: number, overrides: Partial<SEPItem> = {}): SEPItem =>
  createMockSEPItem({
    type: "pr",
    state: null,
    labels: ["SEP"],
    assignees: [],
    createdAt: daysAgo(days),
    ...overrides,
  });

describe("inactivity rule for SEP pull requests", () => {
  let github: MockGitHubClient;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    github = createMockGitHubClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function run(sep: SEPItem, timeline: GitHubTimelineEntry[] = [], overrides: Partial<Config> = {}) {
    const config = createMockConfig(overrides);
    const client = asGitHubClient(github);
    const maintainers = asMaintainerResolver(createMockMaintainerResolver());
    const logger = asLogger(createMockLogger());
    github.getTimeline.mockResolvedValue(timeline);
    const processor = new SEPProcessor(
      config,
      new SEPAnalyzer(config, client),
      maintainers,
      {} as unknown as TransitionHandler,
      new PingHandler(config, client, maintainers, logger),
      logger,
    );
    return processor.process(sep);
  }

  const postedComments = (): string[] => github.addComment.mock.calls.map((call) => String(call[1]));

  it("does nothing before 150 days without progress", async () => {
    const result = await run(pr(149));

    expect(result.results).toEqual([]);
    expect(github.addComment).not.toHaveBeenCalled();
  });

  it("posts one warning at 150 days without progress", async () => {
    const sep = pr(150);
    const result = await run(sep);

    expect(result.results.map((r) => r.action.type)).toEqual([ActionType.WarnInactive]);
    expect(result.summaryData.inactive).toEqual([{ item: sep, daysSinceActivity: 150, wasClosed: false }]);
    const [body, ...rest] = postedComments();
    expect(rest).toEqual([]);
    expect(body).toContain(BOT_COMMENT_MARKER);
    expect(body).toContain(INACTIVITY_WARNING_MARKER);
    expect(body).toContain("no progress for **150 days**");
    expect(body).toContain("closed after about 180 days without progress");
    expect(body).toContain("this one will be closed in about 30 days unless there is progress.");
    expect(body).toContain("A new commit, review or comment counts as progress.");
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it("does not count the bot's own pings or other bots as progress", async () => {
    const result = await run(pr(150), [
      comment(20, `${BOT_COMMENT_MARKER}\n\n## Draft Check-in\n\nHi @test-author!`, BOT, "Bot"),
      comment(10, `${BOT_COMMENT_MARKER}\n\n## Maintainer Activity Check`, "token-owner", "User"),
      comment(8, "Automated report", "some-app[bot]"),
      review(5, "review-app[bot]", "Bot"),
    ]);

    expect(result.summaryData.inactive[0]?.daysSinceActivity).toBe(150);
    expect(postedComments()[0]).toContain(INACTIVITY_WARNING_MARKER);
  });

  it("ignores mentioned and subscribed events", async () => {
    const result = await run(pr(150), [event("mentioned", 20), event("subscribed", 20), event("labeled", 3)]);

    expect(result.summaryData.inactive[0]?.daysSinceActivity).toBe(150);
    expect(postedComments()[0]).toContain(INACTIVITY_WARNING_MARKER);
  });

  it.each([
    ["commit", commit(5)],
    ["review", review(5)],
    ["comment from a person", comment(5)],
    ["reopening", event("reopened", 5)],
  ])("restarts the clock on a recent %s", async (_name, progress) => {
    const result = await run(pr(400), [warning(40), progress]);

    expect(result.results).toEqual([]);
    expect(github.addComment).not.toHaveBeenCalled();
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it("does not warn a second time since the last progress", async () => {
    const result = await run(pr(400), [commit(157), warning(7)]);

    expect(result.results).toEqual([]);
    expect(github.addComment).not.toHaveBeenCalled();
  });

  it("warns again when progress is followed by another quiet period", async () => {
    await run(pr(400), [warning(250), commit(160)]);

    expect(postedComments()).toHaveLength(1);
    expect(postedComments()[0]).toContain("no progress for **160 days**");
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it.each([
    ["draft pull request", pr(180, { isDraft: true, labels: ["SEP", "wg-support-needed"] })],
    ["pull request that is ready for review", pr(180, { state: "draft", assignees: ["maintainer1"] })],
  ])("closes a %s at 180 days without progress", async (_name, sep) => {
    const result = await run(sep, [warning(30)]);

    expect(result.results.map((r) => r.action.type)).toEqual([ActionType.Close]);
    expect(result.summaryData.inactive).toEqual([{ item: sep, daysSinceActivity: 180, wasClosed: true }]);
    expect(github.closeIssue).toHaveBeenCalledWith(sep.number);
    const [body, ...rest] = postedComments();
    expect(rest).toEqual([]);
    expect(body).toContain("closed because it has had no progress for about 180 days");
    expect(body).toContain("(https://modelcontextprotocol.io/community/sep-guidelines)");
    expect(body).not.toContain(INACTIVITY_WARNING_MARKER);
    expect(github.addLabels).not.toHaveBeenCalled();
    expect(github.removeLabel).not.toHaveBeenCalled();
  });

  it.each([
    ["179 days without progress", pr(179), [warning(29)], 0],
    ["no warning yet, however long it has been quiet", pr(400), [], 1],
    ["a warning that is less than 30 days old", pr(400), [warning(29)], 0],
  ])("does not close with %s", async (_name, sep, timeline, comments) => {
    await run(sep, timeline);

    expect(github.closeIssue).not.toHaveBeenCalled();
    expect(postedComments()).toHaveLength(comments);
  });

  it("changes nothing in dry run", async () => {
    const result = await run(pr(180), [warning(30)], { dryRun: true });

    expect(result.results.map((r) => [r.action.type, r.success])).toEqual([[ActionType.Close, true]]);
    expect(github.closeIssue).not.toHaveBeenCalled();
    expect(github.addComment).not.toHaveBeenCalled();
  });

  it.each([
    ["at 150 days", 150, []],
    ["at 180 days and beyond", 400, [warning(30)]],
  ])("leaves a pull request matched by its title only alone %s", async (_name, days, timeline) => {
    const result = await run(pr(days, { title: "docs: describe the SEP process", labels: ["documentation"] }), timeline);

    expect(result.results).toEqual([]);
    expect(github.getTimeline).not.toHaveBeenCalled();
    expect(github.addComment).not.toHaveBeenCalled();
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it("covers a pull request that carries wg-support-needed without the SEP label", async () => {
    const sep = pr(150, { title: "SEP: Structured Tool-Failure Classification", isDraft: true, labels: ["wg-support-needed"] });

    await run(sep);
    expect(postedComments()).toHaveLength(1);
    expect(postedComments()[0]).toContain(INACTIVITY_WARNING_MARKER);

    github.addComment.mockClear();
    await run({ ...sep, createdAt: daysAgo(180) }, [warning(30)]);
    expect(github.closeIssue).toHaveBeenCalledWith(sep.number);
    expect(postedComments()).toHaveLength(1);
  });

  it("leaves SEP issues alone", async () => {
    const result = await run(pr(400, { type: "issue" }));

    expect(result.results).toEqual([]);
    expect(github.getTimeline).not.toHaveBeenCalled();
  });

  it("sends the draft check-in to a ready pull request but not to a draft pull request", async () => {
    await run(pr(95, { state: "draft", isDraft: true }));
    expect(github.addComment).not.toHaveBeenCalled();

    await run(pr(95, { state: "draft" }));
    expect(postedComments()).toHaveLength(1);
    expect(postedComments()[0]).toContain("## Draft Check-in");
  });
});
