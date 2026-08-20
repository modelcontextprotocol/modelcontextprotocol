# SEP-2640: Skills Extension

- **Status**: Draft
- **Type**: Extensions Track
- **Created**: 2026-04-23
- **Author(s)**: Peter Alexander (@pja-ant), Ola Hungerford (@olaservo), Sambhav Kothari (@sambhav), Aditya Kumar (@aditya-scio), on behalf of the Skills Over MCP Working Group
- **Sponsor**: @pja-ant
- **Extension Identifier**: `io.modelcontextprotocol/skills`
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640

<Note>
This SEP was developed by the [Skills Over MCP Working Group](https://modelcontextprotocol.io/community/skills-over-mcp/charter).
Design history, experimental findings, and reference implementations are maintained in the
[experimental-ext-skills repository](https://github.com/modelcontextprotocol/experimental-ext-skills).
</Note>

## Abstract

This SEP defines a convention for serving [Agent Skills](https://agentskills.io/) over MCP using the existing Resources primitive. A _skill_ is a directory of files (minimally a `SKILL.md`) that provides structured workflow instructions to an agent. This extension specifies that each file in a skill directory is exposed as an MCP resource, conventionally under the `skill://` URI scheme. Skills are addressed by URI and may be read directly; a `skills/list` method enumerates the skills a server serves — servers whose skill catalogs are large, generated, or otherwise unenumerable MAY return an empty or partial listing — and a `skills/get` method returns any single skill's entry by URI. The skill format itself — directory structure, YAML frontmatter, naming rules, and the [progressive disclosure](https://agentskills.io/specification#progressive-disclosure) model that governs how hosts stage content into context — is delegated entirely to the [Agent Skills specification](https://agentskills.io/specification); this SEP defines only the transport binding.

The extension defines three protocol methods. Every server declaring the extension implements `skills/list`, which enumerates the skills a server serves, and `skills/get`, which returns the entry for a single skill by URI — including skills absent from the listing. The optional `resources/directory/read` lists the direct children of a directory resource, giving agents scoped navigation of a skill's supporting files. Everything else rides on existing protocol surface, so hosts that already treat MCP resources as a virtual filesystem can consume MCP-served skills identically to local filesystem skills. The specification is accompanied by implementation guidelines for host-provided resource-reading tools and SDK-level convenience wrappers.

## Motivation

Native skills support in host applications demonstrates strong demand for rich, progressively disclosed workflow instructions. MCP does not currently offer a conventional way to ship this content alongside the tools it describes, which leads to:

- **Fragmented distribution.** A server and the skill that teaches an agent to use it are versioned, discovered, and installed separately. Users installing a server from a registry have no signal that a companion skill exists. ([problem statement](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/problem-statement.md))
- **Instruction size limits.** Server instructions are delivered as the `instructions` field of the `server/discover` result and are practically bounded in size. Complex workflows — such as the 875-line [mcpGraph skill](https://github.com/TeamSparkAI/mcpGraph/blob/main/skills/mcpgraphtoolkit/SKILL.md) — do not fit this model. ([experimental findings](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/experimental-findings.md#mcpgraph-skills-in-mcp-server-repo))
- **Inconsistent ad-hoc solutions.** Absent a convention, several independent implementations have each invented their own `skill://` URI structure, with diverging semantics for authority, path, and sub-resource addressing.

## Specification

### Dependencies

This extension has no dependencies beyond the base MCP Resources primitive. In protocol versions 2026-07-28 and later, `skills/list` results additionally carry the base protocol's list-caching attributes ([SEP-2549]).

### Skill Format

A skill served over MCP MUST conform to the [Agent Skills specification](https://agentskills.io/specification). In particular:

- A skill is a directory. Its _skill name_ is the value of the `name` field in its `SKILL.md` frontmatter.
- Every skill MUST contain a `SKILL.md` file at its root.
- `SKILL.md` MUST begin with YAML frontmatter containing at minimum the `name` and `description` fields as defined by the Agent Skills specification.
- A skill MAY contain additional files and subdirectories (references, scripts, examples, assets).

This extension does not redefine, constrain, or extend the skill format. Future revisions of the Agent Skills specification apply automatically.

### Resource Mapping

Each file within a skill directory is exposed as an MCP resource. Servers SHOULD use the `skill://` URI scheme, under which the resource URI has the form:

```
skill://<skill-path>/<file-path>
```

where:

- `<skill-path>` is a `/`-separated path of one or more segments locating the skill directory within the server's skill namespace. It MAY be a single segment (`git-workflow`) or nested to arbitrary depth (`acme/billing/refunds`).
- `<file-path>` is the file's path relative to the skill directory root, using `/` as the separator.

The resource for the skill's required `SKILL.md` is therefore always addressable as `skill://<skill-path>/SKILL.md`, and the skill's root directory is `skill://<skill-path>` (the `/SKILL.md` suffix removed, no trailing slash), matching [Directory Listing](#directory-listing).

The final segment of `<skill-path>` MUST equal the skill's `name` as declared in its `SKILL.md` frontmatter. This mirrors the Agent Skills specification's requirement that `name` [match the parent directory name](https://agentskills.io/specification#name-field). Preceding segments, if any, are a server-chosen organizational prefix — servers MAY organize skills hierarchically by domain, team, version, or any other axis. In `skill://acme/billing/refunds/SKILL.md`, the prefix is `acme/billing` and the skill's `name` is `refunds`; in `skill://git-workflow/SKILL.md` there is no prefix and the `name` is `git-workflow`. This means the skill name is always recoverable from the URI alone, without reading frontmatter.

Further constraints:

- A `SKILL.md` MAY appear in a descendant directory of a skill — skills can nest. See [Nested skills](#nested-skills).
- The final `<skill-path>` segment, being the skill `name`, MUST satisfy the Agent Skills specification's naming rules. The first `<skill-path>` segment occupies the authority component and SHOULD be a valid `reg-name` per [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986); any other prefix segments SHOULD be valid URI path segments; no further constraints are imposed on them.

Per RFC 3986, the first segment of `<skill-path>` occupies the authority component. This carries no special semantics under this convention and clients MUST NOT attempt DNS or network resolution of it.

A server MAY serve skills under another scheme native to its domain (e.g., `github://owner/repo/skills/refunds/SKILL.md`). No scheme is privileged: the structural constraints above — `<skill-path>` ending in the skill name, `SKILL.md` explicit in the URI — apply regardless of scheme, and [`skills/list`](#enumeration-via-skillslist) enumerates a server's skills whatever scheme they use.

Skill identity does not depend on the scheme. A host learns that a resource is a skill in one of two ways: from a [`skills/list`](#enumeration-via-skillslist) entry, the authoritative record of the skills a server publishes; or from an explicit reference — the server's `instructions` field, another skill, or the user — which [`skills/get`](#retrieval-via-skillsget) confirms, the server answering for a skill it serves and erroring otherwise. This holds for every scheme, `skill://` included. A host MUST NOT conclude that a resource is a skill merely because its URI carries a particular scheme.

#### Examples

| Skill path             | File                  | Resource URI                                     |
| ---------------------- | --------------------- | ------------------------------------------------ |
| `git-workflow`         | `SKILL.md`            | `skill://git-workflow/SKILL.md`                  |
| `pdf-processing`       | `references/FORMS.md` | `skill://pdf-processing/references/FORMS.md`     |
| `pdf-processing`       | `scripts/extract.py`  | `skill://pdf-processing/scripts/extract.py`      |
| `acme/billing/refunds` | `SKILL.md`            | `skill://acme/billing/refunds/SKILL.md`          |
| `acme/billing/refunds` | `examples/email.md`   | `skill://acme/billing/refunds/examples/email.md` |

#### Resource Metadata

For each `skill://<skill-path>/SKILL.md` resource:

- `mimeType` SHOULD be `text/markdown`.
- `name` SHOULD be set from the `name` field of the `SKILL.md` YAML frontmatter. By the path constraint above, this will equal the final segment of `<skill-path>`.
- `description` SHOULD be set from the `description` field of the `SKILL.md` YAML frontmatter.

Servers MAY expose additional frontmatter fields via the resource's `_meta` object. When `_meta` keys are used for skill resources, implementations SHOULD use the `io.modelcontextprotocol.skills/` reverse-domain prefix. Other files in the skill use the `mimeType` appropriate to their content.

#### Nested skills

A skill directory MAY contain further skills in descendant directories. A nested skill is subject to the same rules as any other skill — its directory name is its `name`, and the enclosing skill's path becomes part of its organizational prefix — with the following semantics:

- **Nested content is supporting content.** From the enclosing skill's perspective, a nested skill's directory and files are ordinary supporting files, and reading them is ordinary reading. A nested `SKILL.md` read this way is ordinary markdown: hosts MUST NOT act on its frontmatter.
- **Activation requires fresh consent.** Approval is per skill: approving a skill approves that skill alone and says nothing about skills nested within it. Activating a nested skill — loading it as a skill in its own right, whether through the host's skill-loading machinery or by giving effect to its frontmatter — requires fresh, explicit user consent; approval of the enclosing skill does not substitute for it. Once activated, a nested skill is an ordinary skill: its frontmatter takes effect under the same rules as any other MCP-served skill, including the approval gate on `allowed-tools`.
- **Publication is flat.** A nested skill is published like any other: through its own [`skills/list`](#enumeration-via-skillslist) entry, or by explicit reference. The listing remains flat — an entry for a nested skill is an ordinary entry whose `uri` happens to share a path prefix with the enclosing skill's, and nothing in the listing marks nesting.

### Discovery

A server is not required to make its skills enumerable. A skill's URI is directly readable via `resources/read` whether or not it appears in any listing, and hosts MUST support loading a skill given only its URI (see [Hosts: End-to-End Integration](#hosts-end-to-end-integration)). This is the baseline: if a model has the URI — from server instructions, from another skill, from the user — it can read the skill.

On top of that baseline, three mechanisms are defined. Two are discovery: enumeration via `skills/list`, which every server declaring this extension implements, and an optional pointer from server instructions. The third is retrieval: however a host arrives at a skill's URI, `skills/get` returns that skill's entry — its metadata and digests — including for skills no listing mentions.

#### Enumeration via `skills/list`

A server declaring the `io.modelcontextprotocol/skills` extension MUST implement the `skills/list` method, which returns the skills it serves. The result MAY be empty.

The request carries an optional pagination cursor:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "skills/list",
  "params": {}
}
```

The result carries the skill entries:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "skills": [
      {
        "uri": "skill://git-workflow/SKILL.md",
        "frontmatter": {
          "name": "git-workflow",
          "description": "Follow this team's Git conventions for branching and commits"
        },
        "resources": [
          {
            "uri": "skill://git-workflow/SKILL.md",
            "digest": "sha256:a1b2c3d4..."
          }
        ]
      },
      {
        "uri": "skill://acme/billing/refunds/SKILL.md",
        "frontmatter": {
          "name": "refunds",
          "description": "Process customer refund requests per company policy",
          "license": "Apache-2.0"
        },
        "resources": [
          {
            "uri": "skill://acme/billing/refunds/SKILL.md",
            "digest": "sha256:b2c3d4e5..."
          },
          {
            "uri": "skill://acme/billing/refunds/examples/email.md",
            "digest": "sha256:c3d4e5f6..."
          }
        ]
      },
      {
        "uri": "skill://pdf-processing/SKILL.md",
        "frontmatter": {
          "name": "pdf-processing",
          "description": "Extract, fill, and assemble PDF documents",
          "metadata": { "version": "2.1.0" }
        },
        "resources": [
          {
            "uri": "skill://pdf-processing/SKILL.md",
            "digest": "sha256:d5e6f7a8..."
          },
          {
            "uri": "skill://pdf-processing/references/FORMS.md",
            "digest": "sha256:e6f7a8b9..."
          },
          {
            "uri": "skill://pdf-processing/scripts/extract.py",
            "digest": "sha256:f7a8b9c0..."
          },
          {
            "uri": "skill://pdf-processing/templates/invoice.md",
            "digest": "sha256:a8b9c0d1..."
          },
          {
            "uri": "skill://pdf-processing/templates/purchase-order.md",
            "digest": "sha256:b9c0d1e2..."
          },
          {
            "uri": "skill://pdf-processing/templates/regional/eu-invoice.md",
            "digest": "sha256:c0d1e2f3..."
          }
        ]
      }
    ]
  }
}
```

Result fields:

| Field                         | Required | Description                                                                                                  |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `skills`                      | Yes      | Array of skill entries.                                                                                      |
| `skills[].frontmatter`        | Yes      | Verbatim copy of the skill's `SKILL.md` YAML frontmatter, rendered as JSON. See [Frontmatter](#frontmatter). |
| `skills[].uri`                | Yes      | Resource URI of the skill's `SKILL.md`. See [Skill URIs](#skill-uris).                                       |
| `skills[].resources`          | Yes¹     | Complete enumeration of the skill's files with their digests. See [Resources](#resources).                   |
| `skills[].resources[].uri`    | Yes      | Resource URI of the file.                                                                                    |
| `skills[].resources[].digest` | Yes      | SHA-256 digest of the file. See [Integrity](#integrity-and-verification).                                    |

¹ MAY be omitted only for dynamically generated skills whose content cannot be pre-digested. Hosts MAY decline to load skills without `resources`.

Pagination mirrors the base protocol's list methods: the request accepts an optional `cursor`, and when the result includes `nextCursor` the client passes it back to retrieve the next page. An entry is atomic — a skill's `resources` set is never split across pages.

In protocol versions 2026-07-28 and later, the result also carries the base protocol's list-caching attributes — `ttlMs` and `cacheScope`, as defined for `tools/list` and `resources/list` ([SEP-2549]) — with the same semantics: a freshness hint for the listing and a cache-scope marker, not an integrity property. [Integrity and verification](#integrity-and-verification) governs content regardless of how fresh a cached listing is.

A server whose skill catalog is large, generated on demand, or otherwise unenumerable MAY return an empty or partial listing. Hosts MUST NOT treat an empty or partial listing as proof that a server has no skills. The method serves entries for a server's skills whatever URI scheme they use — enumeration is uniform across schemes.

##### Names

A skill's `name` is a label, not an identifier — a skill is identified by its `uri` within a server, and by the pair of server identity and `uri` across servers ([Skill URIs](#skill-uris)). Within a server's listing, names SHOULD be unique, but they are not guaranteed to be: two skills at different paths may share a final segment (`acme/billing/refunds` and `acme/support/refunds` are both named `refunds`), and a nested skill may share its name with a top-level one. Hosts MUST NOT assume name uniqueness. When two entries in one listing collide on `name`, hosts MUST disambiguate them — for example by their distinguishing path segments — rather than silently discarding or preferring one. When skills from different origins collide on `name`, hosts MUST resolve the name within a per-origin namespace, identifying servers by a host-assigned label; an MCP-served skill MUST NOT silently shadow, or be silently substituted for, a same-named skill from any other origin — another server's, or the host's own filesystem skills. See [Security Implications](#security-implications).

##### Frontmatter

`frontmatter` is the skill's `SKILL.md` YAML frontmatter rendered verbatim as a JSON object — every field the author wrote, not a curated subset. Because the Agent Skills specification requires `name` and `description`, those fields are always present; everything else (`license`, `metadata`, fields added by future revisions of the Agent Skills specification) passes through unchanged. A host can therefore build its skill registry — names, descriptions, and whatever other metadata it understands — from the listing alone, without fetching each `SKILL.md`.

The `frontmatter` object MUST be identical in content to the frontmatter of the `SKILL.md` it describes. The final `<skill-path>` segment of the entry's `uri` MUST equal `frontmatter.name`, per [Resource Mapping](#resource-mapping).

Within the frontmatter `metadata` object, keys prefixed with `io.modelcontextprotocol/` are reserved for metadata defined by MCP extensions. This extension currently defines no such keys. Implementations SHOULD ignore keys under this prefix that they do not recognize.

##### Skill URIs

`uri` is the full resource URI of the skill's `SKILL.md`, readable via `resources/read`. Supporting files are individually addressable as sibling resources under the same skill path, per [Resource Mapping](#resource-mapping). A skill is always retrieved as individually addressable resources; this extension defines no packed or bundled retrieval form. See [Appendix: Deferred Features](#appendix-deferred-features).

A skill URI is scoped to the server that serves it. Nothing prevents two connected servers from both serving `skill://refunds/SKILL.md`, and those are two unrelated skills. The identity of an MCP-served skill is therefore the pair of the host's identity for the originating server and the skill's `uri`. Hosts MUST preserve both halves wherever a skill is recorded or addressed — the registry, persisted approvals, the cache, and any tool or path through which the model reaches the skill — and MUST NOT key any of these on the `uri` alone. In particular, any path at which a host materializes skill content, whether a cache directory or a virtual mount, MUST encode the server identity as well as the `uri`, so that same-URI skills from different servers land at distinct paths and the originating server is recoverable from the path; this is also what lets the host honor the durable-origin requirement in [Security Implications](#security-implications).

##### Resources

`resources` enumerates the skill's files — `SKILL.md` and every supporting file — as `{uri, digest}` pairs. It is the unit of content that a host verifies and that a user's approval binds to:

- When present, `resources` MUST be complete: it lists every file of the skill, each exactly once, including an entry matching the skill's top-level `uri` — that entry carries the digest of `SKILL.md` itself.
- Each `uri` MUST be the skill's `SKILL.md` or a file within the skill's directory.
- Completeness extends to nested skills: from the enclosing skill's perspective their files are supporting files ([Nested skills](#nested-skills)), so the enclosing skill's `resources` lists them too, and the same file may appear in both the enclosing and the nested skill's entries. A change to a nested skill is therefore a change to the enclosing skill's set.
- `resources` MAY be omitted only when a skill's content is generated dynamically, such that stable digests cannot be published. A skill without `resources` offers no content integrity and cannot be content-bound ([Security Implications](#security-implications)). Hosts MAY decline to load such skills, and server authors SHOULD expect that some hosts will.

##### Integrity and verification

Digests are SHA-256 hashes of an artifact's raw bytes, formatted as `sha256:{hex}` where `{hex}` is 64 lowercase hexadecimal characters. Each entry in a skill's `resources` carries the digest of the file at its `uri`.

When a host retrieves a file listed in a skill's `resources`, it MUST verify the content against that entry's digest. A mismatch means the content is not what the listing promised — corrupted, tampered with, or simply stale because the skill was updated after the listing was fetched. Whatever the cause, hosts MUST NOT use the unverified content; to recover from staleness, call [`skills/get`](#retrieval-via-skillsget) for that skill — or `skills/list` to refresh the catalog — and proceed from the current `resources` set, which, being different, revokes any content-bound approval ([Security Implications](#security-implications)). A host is _acting on_ a skill from the moment it loads the skill's `SKILL.md` into the model's context until, at the earliest, that `SKILL.md` leaves context; hosts MAY hold the window open longer, never shorter. For the whole of that window the host holds the entry from which it loaded the skill. Because `resources` is complete, an unlisted file is a change to the skill: while acting on a skill, a host MUST resolve reads of the skill's files only to URIs listed in that entry's `resources`, and MUST treat a read of an unlisted file within the skill as a verification failure equivalent to a digest mismatch. Hosts MUST NOT retrieve a skill's files ahead of need — not on connection, not on listing, and not at approval. A `SKILL.md` is fetched when the skill is loaded, and a supporting file when it is read. A server may publish many skills with many files each, and every host that connects retrieving all of them would impose load proportional to the catalog rather than to use. Hosts SHOULD instead cache what they do retrieve, and digests make that cache cheap to validate: a cached file whose digest matches the current entry can be served without fetching it again, and one whose digest does not match must be fetched again. A cached copy is only as trustworthy as the host's certainty that its bytes have not changed since they were verified; the requirements on a disk cache are in [Security Implications](#security-implications). Lazy retrieval is compatible with content-bound approval, which binds to the entry's `resources` set rather than to retrieved bytes; a file fetched long after approval is verified against that set when it is read.

Digests are unsigned and supplied by the same server that supplies the content. A match proves the two are consistent, not that either is trustworthy. Any intermediary on the path, such as a gateway, can rewrite both the listing and the content together. Hosts MUST NOT treat a digest match as a security boundary.

After fetching a `SKILL.md` for which the host holds an entry, from either `skills/list` or `skills/get` — digest-verified when the entry carries `resources`, and unverifiable when it does not — hosts MUST parse its YAML frontmatter and compare it field-by-field against the entry's `frontmatter`. Any discrepancy MUST be treated as a verification failure equivalent to a digest mismatch, and the skill MUST NOT be loaded. This enforces the [Frontmatter](#frontmatter) identity requirement on the host side, so that what a user approves from the listing is what the model actually receives.

#### Retrieval via `skills/get`

A server declaring the `io.modelcontextprotocol/skills` extension MUST also implement the `skills/get` method, which returns the entry for a single skill named by its URI:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "skills/get",
  "params": {
    "uri": "skill://pdf-processing/SKILL.md"
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "skill": {
      "uri": "skill://pdf-processing/SKILL.md",
      "frontmatter": {
        "name": "pdf-processing",
        "description": "Extract, fill, and assemble PDF documents",
        "metadata": { "version": "2.1.0" }
      },
      "resources": [
        {
          "uri": "skill://pdf-processing/SKILL.md",
          "digest": "sha256:d5e6f7a8..."
        },
        {
          "uri": "skill://pdf-processing/references/FORMS.md",
          "digest": "sha256:e6f7a8b9..."
        },
        {
          "uri": "skill://pdf-processing/scripts/extract.py",
          "digest": "sha256:f7a8b9c0..."
        },
        {
          "uri": "skill://pdf-processing/templates/invoice.md",
          "digest": "sha256:a8b9c0d1..."
        },
        {
          "uri": "skill://pdf-processing/templates/purchase-order.md",
          "digest": "sha256:b9c0d1e2..."
        },
        {
          "uri": "skill://pdf-processing/templates/regional/eu-invoice.md",
          "digest": "sha256:c0d1e2f3..."
        }
      ]
    }
  }
}
```

`params.uri` MUST be the URI of a skill's `SKILL.md`. The `skill` object is a skill entry, identical in shape and meaning to an entry of `skills/list` — the same `uri`, `frontmatter`, and `resources` fields, under the same rules.

Semantics:

- If the URI does not identify a skill the server serves, the server MUST return error `-32602` (Invalid params) — the same code `resources/read` uses for unknown resources.
- A server MUST answer for every skill it serves, whether or not that skill appears in its `skills/list` result. A skill absent from a partial listing is still retrievable by URI.
- The result is a point-in-time snapshot, exactly as a listing entry is. Re-calling the method is how a host refreshes one skill's digests without re-enumerating the catalog.
- A skill whose content is generated dynamically omits `resources`, per [Resources](#resources), whether it is reached through `skills/list` or `skills/get`.
- The result carries no pagination cursor: a single entry is not a list. The entry is a snapshot of the skill as the server holds it at that moment; whether the result should also carry the base protocol's caching attributes (`ttlMs` and `cacheScope`, per [SEP-2549]), as `resources/read` results do, is left open.

The method complements the baseline: a URI alone is enough to read a skill, and `skills/get` turns that same URI into the skill's metadata and digests, so a skill that never appeared in a listing can still be verified and content-bound ([Security Implications](#security-implications)).

#### Pointer from Server Instructions

A server MAY direct the agent to specific skill URIs from its `instructions` field. This requires no discovery machinery on the host; the URI is simply present in the model's context and readable via `resources/read`.

#### Capability Declaration

Per [SEP-2133] extension negotiation, servers declare support for this extension in their `initialize` response:

```json
{
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/skills": {
        "directoryRead": true
      }
    }
  }
}
```

One extension-specific setting is defined:

| Setting         | Type    | Default | Meaning                                                                 |
| --------------- | ------- | ------- | ----------------------------------------------------------------------- |
| `directoryRead` | boolean | `false` | The server implements [`resources/directory/read`](#directory-listing). |

An empty object indicates support for the extension with no optional features. Declaring the extension itself commits the server to [`skills/list`](#enumeration-via-skillslist) and [`skills/get`](#retrieval-via-skillsget); clients MUST NOT call `resources/directory/read` against a server that has not declared `directoryRead: true`.

### Reading

Skill files are read via the standard `resources/read` method. No skill-specific read semantics are defined.

In particular, reading a `SKILL.md` via `resources/read` does not by itself activate the skill. `resources/read` is transport: it returns bytes, whoever asked for them — a generic resource-reading tool, a resource browser, a user inspecting the server. A skill is activated only by the host's own skill-loading path — the one that verifies the content against the skill's entry ([Integrity and verification](#integrity-and-verification)), applies any required user approval ([Security Implications](#security-implications)), and opens the window in which the host is acting on the skill. Hosts MUST NOT treat a `resources/read` of a `SKILL.md` that arrives by any other route as a load: it grants no approval, opens no window, and confers no standing on the skill's supporting files. Content obtained that way is ordinary resource content, and a host that returns it to the model SHOULD do so as it would any other resource read, not as a loaded skill. A host that wishes such a read to load the skill routes it through the skill-loading path instead.

Internal references within a skill (e.g., `SKILL.md` linking to `references/GUIDE.md`) are relative paths, as in the filesystem form of the Agent Skills specification. A client resolves a relative reference against the skill's root — `references/GUIDE.md` in `skill://acme/billing/refunds/SKILL.md` resolves to `skill://acme/billing/refunds/references/GUIDE.md` — exactly as a filesystem path would resolve. The skill's root is the directory containing `SKILL.md`, not the scheme root. When skills nest, each `SKILL.md`'s references resolve against its own directory: a relative reference in a nested skill's `SKILL.md` resolves against the nested skill's root, regardless of how the file was reached.

### Directory Listing

A skill's instructions frequently reference a directory rather than a file: "pick the appropriate template from `templates/`", "run the matching script in `scripts/`". To act on this, the agent must learn what the directory contains. `resources/list` cannot answer that scoped question: it enumerates the server's entire resource space, not a subtree, and the servers this SEP most wants to accommodate — large, generated, or unenumerable catalogs (see [Why May the Listing Be Empty or Partial?](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/rationale.md#why-may-the-listing-be-empty-or-partial)) — may not implement meaningful global listing at all.

This extension therefore defines one new method, `resources/directory/read`, gated behind the `directoryRead` setting of the [capability declaration](#capability-declaration).

#### Directory resources

A _directory resource_ is a resource whose `mimeType` is `inode/directory`. In a skill namespace served as individual files, every directory level is a directory resource: the skill root (`skill://pdf-processing`) and each subdirectory (`skill://pdf-processing/templates`). Directory URIs are written without a trailing slash. Directory resources need not appear in `resources/list`; they are addressable whether listed or not.

#### `resources/directory/read`

The request carries the directory's URI and an optional pagination cursor. The result carries the resource metadata of the directory's direct children — the same `Resource` objects that `resources/list` returns, with the same `nextCursor` pagination contract.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "resources/directory/read",
  "params": {
    "uri": "skill://pdf-processing/templates"
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "resources": [
      {
        "uri": "skill://pdf-processing/templates/invoice.md",
        "name": "invoice.md",
        "mimeType": "text/markdown"
      },
      {
        "uri": "skill://pdf-processing/templates/purchase-order.md",
        "name": "purchase-order.md",
        "mimeType": "text/markdown"
      },
      {
        "uri": "skill://pdf-processing/templates/regional",
        "name": "regional",
        "mimeType": "inode/directory"
      }
    ]
  }
}
```

Semantics:

- The method applies only to directory resources. If the URI does not exist, or exists but is not a directory resource, the server MUST return error `-32602` (Invalid params) — the same code `resources/read` uses for unknown resources.
- The result contains every direct child of the directory: files with their ordinary resource metadata, subdirectories listed as directory resources (`mimeType: "inode/directory"`). The listing is not recursive; clients descend by calling the method again on a child directory.
- An empty directory yields an empty `resources` array.
- Pagination mirrors `resources/list`: when the result includes `nextCursor`, the client passes it back as `cursor` to retrieve the next page.

A server that declares `directoryRead` MUST support the method for every directory within the skill namespaces it serves as individual files. The method itself is not skill-specific: a server MAY support it on any directory resource it serves, under any scheme.

## Implementation Guidelines

The following are recommendations for interoperable implementations. They are not part of the normative specification.

### Hosts: End-to-End Integration

This section sketches one way a host might wire MCP-served skills into an existing skills implementation. It is illustrative, not prescriptive — hosts are free to structure tools, naming, and routing however suits their architecture. The goal is that an MCP-served skill flows through the same loading and reading mechanics as a filesystem skill — while remaining origin-tagged, per [Security Implications](#security-implications).

**Registry.** At startup and on connection change, the host assembles a single internal skill registry from every origin it supports: filesystem skill directories, and `skills/list` results from each connected MCP server that declares the `io.modelcontextprotocol/skills` extension. Each registry entry records the skill's `name` and `description` (from the entry's `frontmatter`) and its origin — for a filesystem skill, the local directory; for an MCP skill, the server identity and the `SKILL.md` resource URI. Assembling the registry reads only the listing: the host MUST NOT fetch `SKILL.md` or any supporting file at this stage ([Integrity and verification](#integrity-and-verification)) — the entry's `frontmatter` carries everything the registry needs. Because names collide within and across origins ([Names](#names)), the registry keys entries by origin and name together, qualifying colliding names for display and invocation rather than dropping either entry.

**Context.** The host surfaces the `name` and `description` of each enabled registry entry in the model's context — the same list the model already sees for filesystem skills, now with MCP-served entries mixed in. The host's UI presents the same merged list for user inspection and per-skill enable/disable, with provenance shown so users can see which server a skill came from.

**Loading.** The host exposes a single skill-loading tool to the model, keyed by skill name:

```json
{
  "name": "read_skill",
  "description": "Load a skill's SKILL.md into context.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "The skill name" }
    },
    "required": ["name"]
  }
}
```

`read_skill` is the host's skill-loading path in this sketch — the only route by which a skill is activated ([Reading](#reading)); a `read_resource` call against the same `SKILL.md` URI returns its content but does not load the skill. When the model calls `read_skill`, the host looks up the name in its registry and routes on origin: a filesystem skill is read from disk; an MCP skill is fetched via `resources/read` against the originating server — at that moment, not before, unless a verified copy is already in the host's cache. The mechanics are the same either way. When a name is collision-qualified ([Names](#names)), the qualified form is what appears in the model's context and what the model passes as `name`. Hosts that already expose a name-keyed skill-loading tool for filesystem skills extend it rather than introducing a parallel one.

**Supporting files.** Once a `SKILL.md` is in context, the model may encounter relative references to supporting files (`references/GUIDE.md`, `scripts/extract.py`). For filesystem skills the model reads these with the host's ordinary file-read tool; for MCP skills there is no local file. The host therefore also exposes a general-purpose resource-reading tool:

```json
{
  "name": "read_resource",
  "description": "Read an MCP resource from a connected server.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "server": {
        "type": "string",
        "description": "Name of the connected MCP server"
      },
      "uri": { "type": "string", "description": "The resource URI" }
    },
    "required": ["server", "uri"]
  }
}
```

The host arranges for the model to know, when it loads an MCP-served `SKILL.md`, which server it came from and what its base URI is — for example by stating both in the `read_skill` tool result — so the model can resolve `references/GUIDE.md` to `skill://<skill-path>/references/GUIDE.md` and issue `read_resource` against the right server. A host may instead fold this into its file-read tool by mounting each server's `skill://` namespace into a virtual path — one mount root per server, so that the path encodes the server identity ([Skill URIs](#skill-uris)) — and translating reads under that path into `resources/read` calls, in which case no separate `read_resource` tool is needed and the model treats every supporting file as a local path. A virtual mount resolves reads on access; it MUST NOT be populated by fetching the skill's files in advance. Either way the resolution rule is the same: relative references resolve against the skill's root directory, exactly as on a filesystem. When the skill's entry carries `resources`, the host verifies each such read against it, per [Integrity and verification](#integrity-and-verification).

**Directory navigation.** Skill instructions may point the model at a directory rather than a file ("choose the right template from `templates/`"). When the originating server declares `directoryRead`, the host SHOULD surface this capability to the model: a `read_resource` call whose target is a directory resource can be routed to `resources/directory/read` and return the child listing, and the virtual-mount approach maps it onto the host's existing directory-listing tool — an `ls` of a mounted path becomes a `resources/directory/read` call.

**Unenumerated skills.** Because a listing may be empty or partial, a host should also accept skill URIs it has never seen listed — handed to the model by the user, by server instructions, or by another skill. Calling `skills/get` on such a URI yields the same entry a listing would have carried, so an unlisted skill enters the registry, gets verified, and is approved on the same terms as a listed one; a server that does not serve the URI as a skill answers with an error. A host may additionally let `read_skill` accept a full URI for this case.

The `read_resource` signature above includes `server` because two connected servers may both serve `skill://refunds/SKILL.md`. That is one disambiguation strategy; a host may instead rewrite URIs with a per-server prefix, scope by session, or anything else appropriate to its architecture. The tool is general-purpose — it reads any MCP resource — and is useful beyond skills.

### SDKs: Convenience Wrappers

SDK maintainers SHOULD provide affordances that wrap the underlying resource operations in skill-specific terms. For example:

**Server-side** — declare a skill from a directory, at a given path:

```python
@server.skill("git-workflow")                 # → skill://git-workflow/SKILL.md
def git_workflow():
    return Path("./skills/git-workflow")

@server.skill("acme/billing/refunds")         # → skill://acme/billing/refunds/SKILL.md
def refunds():
    return Path("./skills/refunds")
```

The SDK handles: reading `SKILL.md` frontmatter to populate resource metadata, serving file content on `resources/read`, and answering `skills/get` — and, where the server's skill set is bounded, `skills/list` — computing entry digests from the registered files.

**Client-side** — enumerate and fetch skills:

```python
skills = await client.list_skills()               # calls skills/list, paginating; may be empty
entry = await client.get_skill(
    "skill://acme/billing/refunds/SKILL.md")      # calls skills/get, listed or not
content = await client.read_skill_uri(
    "skill://acme/billing/refunds/SKILL.md")      # wraps resources/read, works regardless of enumeration
entries = await client.read_directory(
    "skill://pdf-processing/templates")           # wraps resources/directory/read
```

These wrappers are thin — each is a single underlying protocol call with a fixed URI pattern — but they give server authors an ergonomic way to declare skills and give client authors a discoverable entry point.

## Rationale

The design rationale for this SEP — why skills map to Resources rather than a new primitive, the URI structure, listing semantics, `skills/get`, the choice of a method over an index resource, format delegation to agentskills.io, directory reads, verbatim frontmatter, and per-file digests — is maintained as a standalone document in the Working Group repository: [rationale.md](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/rationale.md).

One point of that design bears restating here because it shapes how the two methods relate. A `skills/list` entry is intentionally a complete manifest of the skill — its verbatim `frontmatter` and its full `resources` set with digests — rather than a summary to be filled in by a follow-up call. A host that pages through the listing therefore has, in that one pass, everything it needs to build its registry, present the skill for approval, bind the approval to content, and verify every file it later reads; there is no second round-trip per skill, which matters most for exactly the hosts that connect to many servers or servers with many skills. `skills/get` exists for the cases the listing does not serve: refreshing a single skill's entry — typically after a digest mismatch — without re-enumerating the catalog, and obtaining an entry for a skill that a partial listing omitted. It is never a step a host must take to complete a listed entry.

## Backward Compatibility

This extension introduces three protocol methods. `skills/list` and `skills/get` are implemented by every server declaring the extension, so a client only issues those calls after seeing the declaration, and a client that predates the extension never issues them. `resources/directory/read` is additionally gated behind the `directoryRead` capability setting — a server that does not declare it never receives the call. The extension introduces no other methods, message types, or schema changes. A server that does not implement this extension simply exposes no `skill://` resources; existing clients are unaffected. A client that does not implement this extension sees `skill://` resources as ordinary resources, which they are.

Existing implementations using other `skill://` URI structures will need to adjust to conform — see the Working Group's [related-work survey](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/related-work.md) for a catalog. Notably, FastMCP's widely-used [SkillsProvider](https://gofastmcp.com/servers/providers/skills) diverges on URI structure, discovery (per-skill `_manifest` vs. central index), and metadata mapping; coordinating that migration is a near-term Working Group priority. These are mechanical changes, not semantic ones.

## Security Implications

Skill content is instructional text delivered to a model, which makes it a prompt-injection surface (background in [open-questions.md §10](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/open-questions.md#10-how-should-skills-handle-security-and-trust-boundaries)). This extension imposes the following requirements:

- **Skill content is untrusted input.** Hosts MUST treat MCP-served skill content as untrusted model input, subject to the same prompt-injection defenses applied to any server-provided text. A server being connected does not make its skill content authoritative.
- **Origin MUST be visible to the model.** Hosts MUST tag MCP-served skill content with its originating server identity at the point it enters model context and MUST NOT present an MCP-served skill to the model as indistinguishable from a local filesystem skill. The model, not the host, decides whether to follow a skill's instructions. Withholding origin from it makes the untrusted-input requirement above unenforceable at the layer that acts on it.
- **Skills introduce host-side surfaces that tools do not.** Unlike a remote tool call, an MCP-served skill can place server-authored bytes on the host filesystem and direct the model to execute them with host-side tools. Hosts MUST treat MCP-served skills as a higher-risk surface than remote tool invocation.
- **No implicit local execution.** Hosts MUST NOT allow MCP-served skill content to cause host-side code execution without explicit per-skill user approval. This covers (a) declarative fields the host parses (hooks, frontmatter scripts) and (b) instructions in the skill body that direct the model to invoke any host code-execution tool, whether to run a script bundled in the skill or to run an arbitrary command the skill specifies. Hosts MUST ignore or approval-gate (a), and MUST apply the same approval gate to code-execution tool calls issued while the model is acting on an MCP-served skill.
- **Origin-scoped resource reads.** A model-callable resource-read surface (such as the `read_resource` pattern in [Hosts: End-to-End Integration](#hosts-end-to-end-integration)) is a cross-server confused-deputy vector when driven by untrusted skill content. Hosts MUST bind such reads to the skill's originating server: a skill served by server A MUST NOT cause a `resources/read` against server B. Hosts MUST identify servers by a host-assigned label, not the server's self-reported `serverInfo.name`. Any cross-origin read MUST be gated behind explicit per-call user approval naming both servers.
- **Name collisions are an impersonation surface.** Skill names are not unique across origins, and a malicious server can publish a skill under the name of a popular one — another server's, or the user's own local skill — counting on the host resolving its way. Hosts MUST resolve skill names within a per-origin namespace, identifying servers by a host-assigned label, not the self-reported `serverInfo.name`; MUST NOT let an MCP-served skill silently shadow, replace, or intercept invocations of a same-named skill from any other origin, including the host's filesystem skills; and SHOULD surface collisions to the user. A name binds to whatever bytes its origin currently serves — it carries no authorship or endorsement. Intermediaries MAY attach provenance or verification annotations via `_meta` under their own reverse-domain prefix — not the `io.modelcontextprotocol.skills/` prefix reserved for this extension ([Resource Metadata](#resource-metadata)); this extension assigns such annotations no semantics.
- **No implicit permission grants.** Hosts MUST NOT honor frontmatter fields that widen the model's tool or filesystem permissions when the skill arrives over MCP. In particular, the Agent Skills `allowed-tools` field, which a filesystem-sourced skill uses to declare the tools available while it runs, MUST be ignored for MCP-origin skills unless the user has explicitly approved that grant for that skill. A remote server populating `allowed-tools` is requesting elevated access on the host, not declaring a property of its own environment. Approval of a skill never extends to the frontmatter of any other `SKILL.md` within its file space: a nested skill's `allowed-tools` has no effect unless that nested skill is itself activated under its own approval ([Nested skills](#nested-skills)).
- **Skills are data, not directives.** Hosts MUST NOT treat skill resources as higher-authority than other context. Explicit user policy governs whether a skill is loaded at all.
- **Nested skill consent.** Approval is per skill: approving a skill does not approve skills nested within it. Activating a nested `SKILL.md` requires fresh, explicit user consent, per [Nested skills](#nested-skills). Silently promoting a file of an approved skill to an active skill would let a server ride new instructions and permission requests in on a prior approval.
- **Provenance and inspection.** Hosts SHOULD indicate which server a skill originates from when presenting it, SHOULD let users inspect a skill's content before it is loaded into model context, and MAY gate loading behind per-skill or per-server user approval.
- **Digests are not a security boundary.** Listing digests are unsigned and come from the same server as the content. They confirm consistency between the listing and what was fetched, as described in [Integrity and verification](#integrity-and-verification), but they cannot establish trust in the content, defend against the server itself, or detect an intermediary that rewrites both together.
- **Content-bound approval.** When a host persists any per-skill user approval, it MUST be bound to the entry's `resources` set — every `uri` and `digest` — observed at the moment of approval. If a subsequent entry for that skill — from `skills/list` or `skills/get` — advertises a different set, whether a file was rotated, added, or removed, the host MUST treat the prior approval as revoked and re-prompt before loading or executing. A host need not poll for changes. While it is acting on the skill ([Integrity and verification](#integrity-and-verification)), content that has moved fails verification when read; and if it does fetch a fresh entry, the rule above revokes the approval. Neither path lets moved content through under the old approval. A skill published without `resources` cannot be content-bound: hosts MAY decline to load it, and MUST NOT treat a persisted approval as covering whatever content the server currently serves. Digest verification ([Integrity and verification](#integrity-and-verification)) defends the approval after it is granted - it cannot establish that the content was trustworthy when the user approved it, because the server authors both the listing and the body.
- **Caching, cache integrity, cache isolation, and durable origin.** Hosts SHOULD cache verified skill content locally, populated on demand as files are read rather than in bulk ([Integrity and verification](#integrity-and-verification)). A cache is a second copy of content that was verified once; the verification does not carry over to bytes that may have changed since. Hosts that cache skill content on disk MUST therefore do one of the following for every file served from the cache: keep the cache where nothing but the host can write to it — not the model, not scripts or tools the model runs, not other users of the machine — and never modify a cached file in place; or recompute the file's SHA-256 digest from the cached bytes on each access and compare it against the entry's digest, treating a mismatch exactly as a mismatch on a fresh read. Comparing a stored digest label, or a modification time, is not verification. Hosts that cache MCP-served skill content on disk MUST also do so in a location excluded from every filesystem-skill discovery path, and MUST treat content loaded from that location as having arrived over MCP for all purposes of the no-implicit-local-execution rule above, including after host restart and after the originating server is disconnected. Cached bytes do not graduate to filesystem-skill trust by residing locally. Hosts SHOULD remove a server's cached skill content when the user removes that server.

## Reference Implementation

Per [SEP-2133], an Extensions Track SEP requires at least one reference implementation in an official SDK prior to review.

**SDK implementation:**

- TypeScript SDK convenience wrappers (`@server.skill()`, `client.listSkills()`, `client.readSkillUri()`): [experimental-ext-skills#71](https://github.com/modelcontextprotocol/experimental-ext-skills/pull/71)

**Prototype host implementations** (reading `skill://` resources, surfacing skills alongside filesystem skills):

- gemini-cli: [olaservo/gemini-cli#1](https://github.com/olaservo/gemini-cli/pull/1)
- fast-agent: [olaservo/fast-agent#1](https://github.com/olaservo/fast-agent/pull/1)
- goose: [olaservo/goose#1](https://github.com/olaservo/goose/pull/1)
- codex: [olaservo/codex#1](https://github.com/olaservo/codex/pull/1)
- Claude Code: prototyped internally at Anthropic; not yet public

**Prototype server implementation:**

- GitHub MCP Server: [github/github-mcp-server#2360](https://github.com/github/github-mcp-server/pull/2360)

## Appendix: Deferred Features

Features recorded here appeared in earlier revisions of this SEP and were removed before review concluded. They are not part of this extension. Each is kept on record with the objections that removed it, so that any future proposal to reintroduce one starts from those objections rather than rediscovering them.

### Archive Distribution

An earlier revision let a skill entry advertise pre-packed archives of the entire skill directory — gzip-compressed tar and ZIP — as an alternative retrieval form alongside the skill's `uri`. A host could fetch a multi-file skill in a single `resources/read` rather than one per file, and an archive could carry UNIX file metadata (executable bits, symlinks) that individually served resources cannot represent.

The Core Maintainers removed archives during review, for two reasons:

- **Unpacking is an attack surface disproportionate to the benefit.** Safely extracting an archive supplied by a remote server means defending against decompression bombs, path traversal, links resolving outside the skill directory, case- and Unicode-normalization collisions that silently overwrite `SKILL.md`, setuid and setgid bits, and non-regular file entries such as device nodes. Every host would have to implement that checklist correctly, and a host that got any item wrong would be exploitable by any server it connects to. Serving a skill as individually addressable resources has no comparable surface.
- **Two ways to serve one skill is a compatibility hazard.** Archives were a second encoding of content the protocol could already express. Hosts would have to support both forms to be certain of reading any skill, and a skill offered only as an archive would be unreadable to a host that implemented individual-file reads alone. A single retrieval form keeps the compatibility floor flat: any conforming host can read any conforming skill.

The cost of removal is the one archives were introduced to address — a skill with many supporting files takes one round trip per file, and executable bits and symlinks have no representation. Because hosts retrieve files only as they are needed ([Integrity and verification](#integrity-and-verification)), that cost scales with the files a session actually uses rather than with the size of the skill. Should archives be reconsidered, the questions to settle first are how to bound host-side unpacking risk, perhaps by restricting the format to a profile admitting no symlinks, no non-regular entries, and a declared uncompressed size; and how to keep an archive strictly an optimization, never the sole way to retrieve a skill, so that the compatibility floor stays flat. An archive form would now also be required to unpack to exactly the file set enumerated in the entry's `resources` ([Resources](#resources)).

## References

- [Agent Skills specification](https://agentskills.io/specification)
- [SEP-2133]: Extensions
- [SEP-2549]: TTL for list results
- [SEP-2076]: Agent Skills as first-class primitive (alternative approach)
- [Skills Over MCP Working Group charter](https://modelcontextprotocol.io/community/skills-over-mcp/charter)
- [Decision Log](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/decisions.md) — Working Group decisions and rationale
- [Experimental Findings](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/experimental-findings.md) — results from implementations (WIP)
- [Related Work](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/related-work.md) — survey of existing skill-serving implementations
- [Skill `_meta` Keys](https://github.com/modelcontextprotocol/experimental-ext-skills/blob/main/docs/skill-meta-keys.md) — `_meta` key conventions for skill resources
- [RFC 3986: URIs](https://datatracker.ietf.org/doc/html/rfc3986)

[SEP-2076]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076
[SEP-2133]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2133
[SEP-2549]: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2549
