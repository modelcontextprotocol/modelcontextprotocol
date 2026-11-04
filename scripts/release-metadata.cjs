const { readFileSync } = require("node:fs");

// The workflow checks out the PR's merge_commit_sha before validating release files.
module.exports = async function releaseMetadata(
  { github, context, core },
  readFile = readFileSync,
) {
  const { repo, payload } = context;
  const pr = payload.pull_request;
  const repository = `${repo.owner}/${repo.repo}`.toLowerCase();
  if (
    context.eventName !== "pull_request" ||
    payload.action !== "closed" ||
    pr?.merged !== true ||
    pr.base.ref !== "main" ||
    pr.base.repo.full_name.toLowerCase() !== repository ||
    pr.head.repo?.full_name.toLowerCase() !== repository ||
    !pr.head.ref.startsWith("release/")
  ) {
    core.info("Not a merged release PR into main; skipping publication.");
    return;
  }
  const sha = pr.merge_commit_sha;
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) {
    throw new Error("Release PR has no valid merge commit SHA.");
  }

  const version = pr.head.ref.slice("release/".length);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(version) ||
    !Number.isFinite(Date.parse(version)) ||
    new Date(version).toISOString().slice(0, 10) !== version
  ) {
    throw new Error(`Invalid release branch: ${pr.head.ref}`);
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
