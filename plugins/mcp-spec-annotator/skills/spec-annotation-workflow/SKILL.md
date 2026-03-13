---
name: spec-annotation-workflow
description: Step-by-step workflow for the spec-reviewer agent to annotate a SEP — covers diff resolution, requirement extraction, annotation, and HTML rendering
user_invocable: false
---

# SEP Annotation Workflow

End-to-end pipeline: read a SEP, get its diff, extract requirements, annotate the diff against those requirements, and render an HTML artifact.

## Arguments (received from the dispatcher)

| Argument       | Required | Default  | Description                                                         |
| -------------- | -------- | -------- | ------------------------------------------------------------------- |
| `sep_number`   | Yes      | —        | SEP number (integer)                                                |
| `mode`         | No       | `review` | `review` = fresh extraction; `validator` = reuse existing meta-spec |
| `commit_range` | No       | —        | Local git range (e.g. `abc..def`). Omit for PR mode.                |

## Output Location

All artifacts are written to `.reviews/SEP-{sep_number}/`:

- `meta-spec.json` — extracted requirements
- `annotations.json` — per-hunk annotations
- `annotated-diff.html` — self-contained HTML report

## Workflow

### Step 1: Read the SEP and find the PR number

Glob for `seps/{sep_number}-*.md` and read the matching file. If no file matches, stop and report the error. Scan for PR references (e.g., `https://github.com/.../pull/NNNN` or `PR #NNNN`).

### Steps 2 & 3: Resolve diff AND extract requirements (PARALLEL)

These two steps are independent after step 1 — run them in parallel using parallel tool calls:

**Step 2: Resolve the diff**

**Commit range mode** (if `commit_range` is provided):
Run `git diff {commit_range}` locally. No GitHub access needed.

**PR mode** (default):
Try these sources in order until one succeeds:

1. **GitHub MCP** (preferred): Use the `github` MCP server's `pull_request_read` tool with owner=`modelcontextprotocol`, repo=`modelcontextprotocol`. Fetch the PR metadata and diff.
2. **`gh` CLI** (fallback): Run `gh pr view {pr_number} --repo modelcontextprotocol/modelcontextprotocol --json title,body,state` for metadata, and `gh pr diff {pr_number} --repo modelcontextprotocol/modelcontextprotocol` for the diff.
3. **WebFetch** (last resort): Fetch `https://api.github.com/repos/modelcontextprotocol/modelcontextprotocol/pulls/{pr_number}/files?per_page=100` for structured per-file patches. If redirected, follow the redirect URL.

Each source should produce per-file patches with filenames and unified diff text.

**Capture metadata for traceability:** Record the PR number, PR URL (`https://github.com/modelcontextprotocol/modelcontextprotocol/pull/{pr_number}`), and the head commit SHA of the PR (from the API response or `gh pr view --json headRefOid`). For commit range mode, record the range endpoint. Include these in `annotations.json` as `pr_number`, `pr_url`, and `reviewed_commit`.

**Step 3: Extract or reuse meta-spec**

Check if `.reviews/SEP-{sep_number}/meta-spec.json` already exists.

- **If `mode` is `validator` AND the file exists**: Reuse it. Skip extraction.
- **Otherwise**: Run the extraction script, then enrich the output:

```bash
python3 plugins/mcp-spec-annotator/skills/spec-extract/scripts/extract.py \
  seps/{sep_number}-*.md \
  .reviews/SEP-{sep_number}
```

Then follow the `spec-extract` skill Phase 2 instructions to fill in `summary`, `description`, `affected_paths`, and add implied documentation requirements.

Since the script runs instantly, extraction can begin immediately while the diff is being fetched.

### Step 4: Annotate the diff (requires steps 2 & 3 complete)

If you saved the diff to a file, parse and scaffold it with the scripts:

```bash
# Parse and split hunks
python3 plugins/mcp-spec-annotator/skills/spec-diff/scripts/parse_diff.py \
  .reviews/SEP-{sep_number}/pr-diff.txt \
  .reviews/SEP-{sep_number}/parsed-diff.json

# Build annotation skeleton (all requirements as not_addressed, patch_text included, generated files excluded)
python3 plugins/mcp-spec-annotator/skills/spec-diff/scripts/annotate.py \
  .reviews/SEP-{sep_number}/meta-spec.json \
  .reviews/SEP-{sep_number}/parsed-diff.json \
  .reviews/SEP-{sep_number}/annotations.json
```

Then read the skeleton `annotations.json` and fill in each requirement's `status`, `summary`, `explanation`, and `hunks` references. Follow the `spec-diff` skill instructions for matching rules and explanation quality. You can either edit annotations.json directly, or write a `matches.json` and re-run the annotate script with `--matches` to have it handle bidirectional linking automatically.

### Step 5: Render HTML

Follow the `spec-render` skill instructions — run the render script:

```bash
python3 plugins/mcp-spec-annotator/skills/spec-render/scripts/render.py \
  .reviews/SEP-{sep_number}/meta-spec.json \
  .reviews/SEP-{sep_number}/annotations.json \
  .reviews/SEP-{sep_number}/annotated-diff.html
```

If jinja2 is not installed, run `pip install jinja2` first.

### Step 6: Print summary

Output a summary:

```
SEP-{sep_number}: {sep_title}
  Satisfied:     {count}
  Violated:      {count}
  Unclear:       {count}
  Not addressed: {count}

Artifact: .reviews/SEP-{sep_number}/annotated-diff.html
```

## Diff Source Detection Logic

When in PR mode, attempt ALL three sources in order before giving up:

1. **GitHub MCP** (preferred): Attempt the `github` MCP server's `pull_request_read` tool. Common failures: auth errors (403), tool not available. If it fails, log the error and proceed to step 2.
2. **`gh` CLI** (fallback): Run `gh --version` to check availability, then `gh pr diff`. Common failures: not installed, permission denied, auth not configured. If it fails, log the error and proceed to step 3.
3. **WebFetch** (last resort): Fetch from the GitHub API. This works without authentication for public repos. Only report failure after this step also fails.

Log which source succeeded (or that all three failed) so the user knows where the diff came from.

## Error Handling

- If the SEP file cannot be found, stop immediately and report the error.
- If no diff source works, stop and report which sources were tried and why each failed.
- If extraction or annotation produces malformed JSON, report the error rather than writing a broken file.
