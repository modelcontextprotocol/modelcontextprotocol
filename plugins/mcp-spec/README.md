# MCP Spec Plugin for Claude

Skills for researching and contributing to the Model Context Protocol specification.

## Installation

### Claude Code

```bash
/plugin marketplace add modelcontextprotocol/modelcontextprotocol
```

### Claude Cowork

Navigate to Customize >> Browse Plugins >> Personal >> Plus Button >> Add marketplace from GitHub and add `modelcontextprotocol/modelcontextprotocol`

## Available Skills

### `/search-mcp-github <topic>`

Search across MCP GitHub discussions, issues, and pull requests to find relevant information about a topic.

**Sources searched:**

- [Org-level Discussions](https://github.com/orgs/modelcontextprotocol/discussions)
- [Spec-level Discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions)
- [Spec-level Issues](https://github.com/modelcontextprotocol/modelcontextprotocol/issues)
- [Spec-level Pull Requests](https://github.com/modelcontextprotocol/modelcontextprotocol/pulls)

**Example:**

```
/search-mcp-github Tool Annotations
```

**Note:** The skill searches both open AND closed issues/PRs, which is important for understanding past decisions and historical context.

### `/spec-annotate <sep_number> [mode] [commit_range]`

Orchestrates the full SEP annotation pipeline: reads the SEP, fetches the PR diff, extracts requirements, annotates hunks against requirements, and renders a self-contained HTML report.

| Argument       | Required | Default  | Description                                                |
| -------------- | -------- | -------- | ---------------------------------------------------------- |
| `sep_number`   | Yes      | —        | SEP number (e.g., 1686)                                    |
| `mode`         | No       | `review` | `review` = fresh extraction; `validator` = reuse meta-spec |
| `commit_range` | No       | —        | Local git range (e.g., `abc..def`). Omit for PR mode.      |

**Output:** `.reviews/SEP-{number}/annotated-diff.html` (plus `meta-spec.json` and `annotations.json`)

**Example:**

```
/spec-annotate 1686
/spec-annotate 1686 validator
/spec-annotate 1686 review abc123..def456
```

### `/spec-update <sep_number> <action> <details>`

Updates an existing meta-spec by adding, removing, modifying, or recategorizing requirements. Preserves existing requirements and offers to re-annotate after changes.

| Argument     | Required | Description                                  |
| ------------ | -------- | -------------------------------------------- |
| `sep_number` | Yes      | SEP number                                   |
| `action`     | Yes      | `add`, `remove`, `modify`, or `recategorize` |
| `details`    | Yes      | Natural language description of the change   |

**Example:**

```
/spec-update 1686 add "Servers MUST send progress notifications for long-running tasks"
/spec-update 1686 recategorize "R005 from must-change to may-change"
```

### `/spec-orchestrate <sep_number> [max_iterations]`

Iteratively runs spec review and implementation in a feedback loop until all requirements are satisfied or conflicts are escalated to the user.

| Argument         | Required | Default | Description                     |
| ---------------- | -------- | ------- | ------------------------------- |
| `sep_number`     | Yes      | —       | SEP number                      |
| `max_iterations` | No       | 3       | Maximum review-implement cycles |

**Example:**

```
/spec-orchestrate 1686
/spec-orchestrate 1686 5
```

## Agents

### `spec-reviewer`

Runs the full annotation pipeline (extract/reuse meta-spec, annotate diff, render HTML). Launched by `/spec-annotate` and `/spec-orchestrate`.

### `spec-qa`

Quality gate agent that audits annotation artifacts against a 16-point checklist covering requirements quality (EARS format, specific actors, affected paths), annotation quality (no empty explanations, multi-hunk synthesis, no cross-product noise), and completeness. Returns a pass/fail verdict with specific issues. Launched by `/spec-annotate` and `/spec-orchestrate` after the reviewer finishes.

### `spec-implementer`

Reads the meta-spec and annotations, then edits schema and documentation files to satisfy unaddressed or violated requirements. Launched by `/spec-orchestrate`.

## Internal Skills (not user-invocable)

These skills provide instructions followed inline by the orchestrator:

- **`spec-extract`** — Extracts structured requirements from SEP markdown
- **`spec-diff`** — Annotates diff hunks against meta-spec requirements
- **`spec-render`** — Populates the HTML template with annotation data

## Annotation Output

All artifacts are written to `.reviews/SEP-{number}/` (gitignored by default):

| File                  | Description                                    |
| --------------------- | ---------------------------------------------- |
| `meta-spec.json`      | Structured requirements extracted from the SEP |
| `annotations.json`    | Per-hunk annotations with coverage status      |
| `annotated-diff.html` | Self-contained HTML report for sharing         |

The HTML artifact uses a three-column layout (annotations | diff | issues) with GitHub dark theme colors, and can be published to a GitHub Gist for sharing with other reviewers.
