const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

// Exercise the inline script itself, without maintaining a second implementation.
const workflow = readFileSync(
  join(__dirname, "../.github/workflows/publish-release.yml"),
  "utf8",
);
const script = workflow.match(
  /          script: \|\n((?:            [^\n]*\n|\n)+)/,
)?.[1];
assert.ok(script, "Release validation script is missing from the workflow");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const validate = new AsyncFunction(
  "github",
  "context",
  "core",
  "require",
  script,
);
const version = "2027-01-26";
const sha = "a".repeat(40);

function fixture(tag) {
  const outputs = {};
  const files = new Map([
    [
      `schema/${version}/schema.ts`,
      `export const LATEST_PROTOCOL_VERSION = "${version}";`,
    ],
    [`schema/${version}/schema.json`, "{}"],
    [`docs/specification/${version}/index.mdx`, "# Specification"],
    [`docs/specification/${version}/changelog.mdx`, "# Changelog"],
    [`docs/docs/${version}/learn/versioning.mdx`, "# Versioning"],
  ]);
  const pr = { head: { ref: `release/${version}` }, merge_commit_sha: sha };
  const git = {
    getRef: async ({ ref }) => {
      assert.equal(ref, `tags/${version}`);
      if (!tag) throw Object.assign(new Error("Not found"), { status: 404 });
      return { data: { object: tag } };
    },
    getTag: async () => ({ data: { object: { type: "commit", sha } } }),
  };
  const run = () =>
    validate(
      { rest: { git } },
      {
        repo: { owner: "modelcontextprotocol", repo: "modelcontextprotocol" },
        payload: { pull_request: pr },
        sha: "b".repeat(40),
      },
      {
        info() {},
        setOutput: (key, value) => {
          outputs[key] = value;
        },
      },
      (name) => {
        assert.equal(name, "node:fs");
        return {
          readFileSync: (path) => {
            assert.ok(files.has(path), `Missing release file: ${path}`);
            return files.get(path);
          },
        };
      },
    );
  return { outputs, files, pr, git, run };
}

test("the version comes from the branch regardless of PR title", async () => {
  for (const title of [
    "Add 2027-01-26 MCP specification",
    "chore(release): publish 2027-01-26 specification",
  ]) {
    const f = fixture();
    f.pr.title = title;
    await f.run();
    assert.deepEqual(f.outputs, { version });
  }
});

test("invalid dates and incomplete release files stop publication", async () => {
  for (const date of [
    "not-a-date",
    "2027-02-30",
    "2027-13-01",
    "2027-01-26/extra",
  ]) {
    const f = fixture();
    f.pr.head.ref = `release/${date}`;
    await assert.rejects(f.run(), /Invalid release branch/);
  }
  for (const path of fixture().files.keys()) {
    const f = fixture();
    f.files.delete(path);
    await assert.rejects(f.run(), /Missing release file/);
  }
  const f = fixture();
  f.files.set(
    `schema/${version}/schema.ts`,
    'export const LATEST_PROTOCOL_VERSION = "draft";',
  );
  await assert.rejects(f.run(), /Schema version does not match/);
  const invalid = fixture();
  invalid.files.set(`schema/${version}/schema.json`, "invalid");
  await assert.rejects(invalid.run(), SyntaxError);
});

test("matching lightweight and annotated tags skip; conflicting tags and API errors fail", async () => {
  for (const tag of [
    { type: "commit", sha },
    { type: "tag", sha: "tag-object" },
  ]) {
    const f = fixture(tag);
    await f.run();
    assert.deepEqual(f.outputs, {});
  }
  const conflict = fixture({ type: "commit", sha: "b".repeat(40) });
  await assert.rejects(conflict.run(), /does not point to/);
  const annotated = fixture({ type: "tag", sha: "tag-object" });
  annotated.git.getTag = async () => ({
    data: { object: { type: "commit", sha: "b".repeat(40) } },
  });
  await assert.rejects(annotated.run(), /does not point to/);
  const unavailable = fixture();
  unavailable.git.getRef = async () => {
    throw Object.assign(new Error("API unavailable"), { status: 503 });
  };
  await assert.rejects(unavailable.run(), /API unavailable/);
});
