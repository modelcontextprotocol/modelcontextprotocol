const { readFileSync } = require("node:fs");

// The workflow checks out context.sha, so file validation uses the merged revision.
module.exports = async function releaseMetadata(
  { github, context, core },
  readFile = readFileSync,
) {
  const { repo, sha } = context;
  const repository = `${repo.owner}/${repo.repo}`.toLowerCase();
  const pullRequests = await github.paginate(
    github.rest.repos.listPullRequestsAssociatedWithCommit,
    { ...repo, commit_sha: sha, per_page: 100 },
  );
  const releases = pullRequests.filter(
    (pr) =>
      pr.merged_at &&
      pr.merge_commit_sha === sha &&
      pr.base.ref === "main" &&
      pr.base.repo.full_name.toLowerCase() === repository &&
      pr.head.repo?.full_name.toLowerCase() === repository &&
      pr.head.ref.startsWith("release/"),
  );
  if (releases.length === 0) {
    core.info("No release PR merged at this commit; skipping publication.");
    return;
  }
  if (releases.length !== 1) {
    throw new Error(`Multiple release PRs match ${sha}; refusing to publish.`);
  }

  const version = releases[0].head.ref.slice("release/".length);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(version) ||
    !Number.isFinite(Date.parse(version)) ||
    new Date(version).toISOString().slice(0, 10) !== version
  ) {
    throw new Error(`Invalid release branch: ${releases[0].head.ref}`);
  }
  const schema = readFile(`schema/${version}/schema.ts`, "utf8");
  if (
    !schema.includes(`export const LATEST_PROTOCOL_VERSION = "${version}";`)
  ) {
    throw new Error(
      `schema/${version}/schema.ts has the wrong protocol version.`,
    );
  }
  JSON.parse(readFile(`schema/${version}/schema.json`, "utf8"));
  for (const path of [
    `docs/specification/${version}/index.mdx`,
    `docs/specification/${version}/changelog.mdx`,
    `docs/docs/${version}/learn/versioning.mdx`,
  ]) {
    readFile(path, "utf8");
  }

  let tag;
  try {
    const { data } = await github.rest.git.getRef({
      ...repo,
      ref: `tags/${version}`,
    });
    tag = data.object;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (tag) {
    // Annotated tags refer to tag objects; compare the underlying commit instead.
    while (tag.type === "tag") {
      const { data } = await github.rest.git.getTag({
        ...repo,
        tag_sha: tag.sha,
      });
      tag = data.object;
    }
    if (tag.type !== "commit" || tag.sha !== sha) {
      throw new Error(
        `Tag ${version} does not point to ${sha}; refusing to publish.`,
      );
    }
    core.info(`Tag ${version} already points to ${sha}; skipping publication.`);
    return;
  }
  core.setOutput("version", version);
};
