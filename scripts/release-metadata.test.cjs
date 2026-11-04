const assert = require("node:assert/strict");
const { test } = require("node:test");
const releaseMetadata = require("./release-metadata.cjs");

const version = "2027-01-26";
const sha = "a".repeat(40);
const full_name = "modelcontextprotocol/modelcontextprotocol";
const release = () => ({
  title: `Add ${version} MCP specification`,
  merged: true,
  merge_commit_sha: sha,
  base: { ref: "main", repo: { full_name } },
  head: { ref: `release/${version}`, repo: { full_name } },
});

function fixture(pr = release()) {
  const context = {
    repo: { owner: "modelcontextprotocol", repo: "modelcontextprotocol" },
    // The release must use the PR's merge commit, even if the context SHA differs.
    sha: "b".repeat(40),
    eventName: "pull_request",
    payload: { action: "closed", pull_request: pr },
  };
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
  const github = {
    rest: {
      git: {
        getRef: async () => {
          throw Object.assign(new Error("Not found"), { status: 404 });
        },
        getTag: async () => {
          throw new Error("Unexpected annotated tag lookup");
        },
      },
    },
  };
  const core = {
    info() {},
    setOutput: (key, value) => {
      outputs[key] = value;
    },
  };
  return {
    github,
    context,
    outputs,
    files,
    run: () =>
      releaseMetadata({ github, context, core }, (path) => {
        assert.ok(files.has(path), `Missing release file: ${path}`);
        return files.get(path);
      }),
  };
}

test("old and conventional titles publish the same version at the merged SHA", async () => {
  for (const title of [
    `Add ${version} MCP specification`,
    `chore(release): publish ${version} specification`,
  ]) {
    const f = fixture({ ...release(), title });
    await f.run();
    assert.deepEqual(f.outputs, { version });
  }
});

test("unrelated, unmerged, fork, deleted-fork, and other-base PRs do not publish", async () => {
  const prs = [
    undefined,
    { ...release(), head: { ...release().head, ref: "fix/docs" } },
    { ...release(), merged: false },
    {
      ...release(),
      head: { ...release().head, repo: { full_name: "someone/fork" } },
    },
    { ...release(), head: { ...release().head, repo: null } },
    { ...release(), base: { ...release().base, ref: "draft" } },
  ];
  for (const pr of prs) {
    const f = fixture();
    f.context.payload.pull_request = pr;
    f.files.clear();
    f.github.rest.git.getRef = async () => {
      throw new Error("Unexpected tag lookup");
    };
    await f.run();
    assert.deepEqual(f.outputs, {});
  }
});

test("only the closed pull_request event can publish", async () => {
  for (const change of [
    { eventName: "push" },
    { payload: { action: "opened", pull_request: release() } },
    { payload: { action: "synchronize", pull_request: release() } },
  ]) {
    const f = fixture();
    Object.assign(f.context, change);
    f.files.clear();
    await f.run();
    assert.deepEqual(f.outputs, {});
  }
});

test("missing merge commits and malformed release dates fail closed", async () => {
  for (const merge_commit_sha of [null, "", "main"]) {
    await assert.rejects(
      fixture({ ...release(), merge_commit_sha }).run(),
      /no valid merge commit SHA/,
    );
  }
  for (const ref of [
    "release/not-a-date",
    "release/2027-02-30",
    "release/2027-13-01",
    "release/2027-01-26/extra",
  ]) {
    await assert.rejects(
      fixture({ ...release(), head: { ...release().head, ref } }).run(),
      /Invalid release branch/,
    );
  }
});

test("missing release files, incorrect schema versions, and invalid JSON stop publication", async () => {
  for (const path of fixture().files.keys()) {
    const f = fixture();
    f.files.delete(path);
    await assert.rejects(f.run(), /Missing release file/);
    assert.deepEqual(f.outputs, {});
  }
  const f = fixture();
  f.files.set(
    `schema/${version}/schema.ts`,
    'export const LATEST_PROTOCOL_VERSION = "draft";',
  );
  await assert.rejects(f.run(), /wrong protocol version/);
  const invalid = fixture();
  invalid.files.set(`schema/${version}/schema.json`, "invalid");
  await assert.rejects(invalid.run(), SyntaxError);
});

test("matching lightweight and annotated tags are idempotent; conflicting tags fail", async () => {
  for (const annotated of [false, true]) {
    for (const target of [sha, "b".repeat(40)]) {
      const f = fixture();
      f.github.rest.git.getRef = async ({ ref }) => {
        assert.equal(ref, `tags/${version}`);
        return {
          data: {
            object: {
              type: annotated ? "tag" : "commit",
              sha: annotated ? "tag-object" : target,
            },
          },
        };
      };
      f.github.rest.git.getTag = async ({ tag_sha }) => {
        assert.equal(tag_sha, "tag-object");
        return { data: { object: { type: "commit", sha: target } } };
      };
      if (target === sha) await f.run();
      else await assert.rejects(f.run(), /does not point to/);
      assert.deepEqual(f.outputs, {});
    }
  }
});

test("API failures are not treated as missing tags", async () => {
  const f = fixture();
  f.github.rest.git.getRef = async () => {
    throw Object.assign(new Error("API unavailable"), { status: 503 });
  };
  await assert.rejects(f.run(), /API unavailable/);
  assert.deepEqual(f.outputs, {});
});
