const assert = require("node:assert/strict");
const { test } = require("node:test");
const releaseMetadata = require("./release-metadata.cjs");

const version = "2027-01-26";
const sha = "a".repeat(40);
const full_name = "modelcontextprotocol/modelcontextprotocol";
const context = {
  repo: { owner: "modelcontextprotocol", repo: "modelcontextprotocol" },
  sha,
};
const release = () => ({
  title: `Add ${version} MCP specification`,
  merged_at: "2027-01-26T12:00:00Z",
  merge_commit_sha: sha,
  base: { ref: "main", repo: { full_name } },
  head: { ref: `release/${version}`, repo: { full_name } },
});

function fixture(prs = [release()]) {
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
      repos: { listPullRequestsAssociatedWithCommit: Symbol("list PRs") },
      git: {
        getRef: async () => {
          throw Object.assign(new Error("Not found"), { status: 404 });
        },
        getTag: async () => {
          throw new Error("Unexpected annotated tag lookup");
        },
      },
    },
    paginate: async (method, params) => {
      assert.equal(
        method,
        github.rest.repos.listPullRequestsAssociatedWithCommit,
      );
      assert.deepEqual(params, {
        ...context.repo,
        commit_sha: sha,
        per_page: 100,
      });
      return prs;
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
    const f = fixture([{ ...release(), title }]);
    await f.run();
    assert.deepEqual(f.outputs, { version });
  }
});

test("unrelated, unmerged, fork, deleted-fork, other-base, and historical PRs do not publish", async () => {
  const prs = [
    { ...release(), head: { ...release().head, ref: "fix/docs" } },
    { ...release(), merged_at: null },
    {
      ...release(),
      head: { ...release().head, repo: { full_name: "someone/fork" } },
    },
    { ...release(), head: { ...release().head, repo: null } },
    { ...release(), base: { ...release().base, ref: "draft" } },
    { ...release(), merge_commit_sha: "b".repeat(40) },
  ];
  for (const candidates of [[], prs]) {
    const f = fixture(candidates);
    f.files.clear();
    f.github.rest.git.getRef = async () => {
      throw new Error("Unexpected tag lookup");
    };
    await f.run();
    assert.deepEqual(f.outputs, {});
  }
});

test("ambiguous release PRs and malformed release dates fail closed", async () => {
  await assert.rejects(
    fixture([release(), release()]).run(),
    /Multiple release PRs/,
  );
  for (const ref of [
    "release/not-a-date",
    "release/2027-02-30",
    "release/2027-13-01",
    "release/2027-01-26/extra",
  ]) {
    await assert.rejects(
      fixture([{ ...release(), head: { ...release().head, ref } }]).run(),
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

test("API failures are not treated as missing releases or tags", async () => {
  for (const endpoint of ["pulls", "tags"]) {
    const f = fixture();
    const fail = async () => {
      throw Object.assign(new Error("API unavailable"), { status: 503 });
    };
    if (endpoint === "pulls") f.github.paginate = fail;
    else f.github.rest.git.getRef = fail;
    await assert.rejects(f.run(), /API unavailable/);
    assert.deepEqual(f.outputs, {});
  }
});
