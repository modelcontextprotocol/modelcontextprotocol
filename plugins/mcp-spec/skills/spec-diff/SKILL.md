---
name: spec-diff
description: Annotates a unified diff against extracted meta-spec requirements, producing per-hunk annotations with satisfaction status
user_invocable: false
---

# Annotating a Diff Against Requirements

Given a meta-spec (from `spec-extract`) and a unified diff, produce `annotations.json` mapping every diff hunk to the requirements it addresses.

## Input

- `meta_spec_path`: Path to `meta-spec.json`
- `diff_text`: The unified diff content (string)
- `file_patches`: Array of per-file patches (file path + hunks), if available from GitHub API
- `output_path`: Where to write `annotations.json`

## Output Schema

Write a JSON file to `{output_path}/annotations.json`. Annotations are **top-level objects** keyed by requirement ID. Hunks reference annotations by ID only.

```json
{
  "sep_number": 1686,
  "pr_number": 1732,
  "pr_url": "https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1732",
  "reviewed_commit": "abc123def456",
  "summary": {
    "satisfied": 12,
    "violated": 2,
    "unclear": 3,
    "not_addressed": 1
  },
  "annotations": {
    "CAP-001": {
      "status": "satisfied",
      "summary": "One sentence: what the verdict is and why.",
      "explanation": "Detailed explanation synthesizing evidence across all referenced hunks...",
      "hunks": [
        {
          "file": "schema/draft/schema.ts",
          "hunk_header": "@@ -450,6 +450,25 @@"
        },
        {
          "file": "docs/specification/draft/basic/utilities/tasks.mdx",
          "hunk_header": "@@ section: \"Capabilities\" (lines 40-95) @@"
        }
      ]
    },
    "LIF-001": {
      "status": "not_addressed",
      "summary": "Feature removed — implementation uses working as initial status instead of submitted.",
      "explanation": "The SEP specifies a submitted initial status, but PR #1732 removed this in favor of tasks beginning directly in working status...",
      "hunks": []
    }
  },
  "files": [
    {
      "file": "schema/draft/schema.ts",
      "hunks": [
        {
          "hunk_header": "@@ -450,6 +450,25 @@",
          "patch_text": "the actual diff text for this hunk",
          "annotations": ["CAP-001", "MSG-002"]
        }
      ]
    }
  ]
}
```

## Splitting Large Hunks

New files appear as a single giant hunk (e.g., `@@ -0,0 +1,831 @@`). A single hunk covering hundreds of lines is useless for review — split it into logical sections:

1. **Markdown/MDX files**: Split on `##` headings. Each heading starts a new virtual hunk. Use a synthetic hunk header like `@@ section: "Capabilities" (lines 40-95) @@`.
2. **TypeScript/JSON files**: Split on top-level declarations (interfaces, types, enums). Use a synthetic header like `@@ declaration: "TaskStatus" (lines 200-215) @@`.
3. **Small hunks** (under ~40 lines): Keep as-is, no splitting needed.

The `patch_text` for each virtual hunk contains only the lines belonging to that section. This allows annotations to point to the specific section rather than the entire file.

## Annotation Rules

### Status Definitions

| Status          | Meaning                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `satisfied`     | The diff hunk clearly implements what the requirement asks for                         |
| `violated`      | The diff hunk contradicts or incorrectly implements the requirement                    |
| `unclear`       | The diff hunk is related but it's ambiguous whether it fully satisfies the requirement |
| `not_addressed` | No hunk in the entire diff addresses this requirement                                  |

Every status requires an explanation, including `not_addressed`. For not-addressed requirements, explain **why** the requirement isn't covered: was the feature removed from the implementation? Is it a behavioral guideline that wouldn't appear in protocol spec? Is it deferred to a future PR? A reviewer reading the explanation should understand the gap without needing to cross-reference the SEP.

### Writing Summaries and Explanations

Each annotation has two text fields. Write the `explanation` first (the detailed analysis), then distill it into the `summary`.

**`explanation`** — the detailed analysis. Since each annotation can reference multiple hunks, the explanation synthesizes how evidence across all hunks combines to satisfy (or violate) the requirement.

Each explanation must:

- **Name specific content from each referenced hunk** — what code was added, what text was written
- **Connect the evidence to the requirement** — explain how the hunks together address what the requirement asks for
- **Call out partial coverage** — if some hunks address part of the requirement but not all of it, say so

Write complete sentences. Never truncate with `...` or cut short.

**`summary`** — one sentence capturing the verdict and the key reason. A reviewer scanning the annotation list reads only summaries; they expand the explanation when they want depth.

Good summary: `"Tasks capability fully declared via TypeScript interfaces, lifecycle examples, and negotiation docs across 4 files."`
Bad summary: `"Satisfied by schema changes."`

Good not-addressed summary: `"Feature removed — implementation uses ttl-based cleanup instead of explicit tasks/delete."`
Bad not-addressed summary: `"Not found in diff."`

### Per-Hunk Analysis

For each hunk (or virtual hunk) in the diff:

1. Read the hunk's added and removed lines
2. Identify which requirements this hunk **directly addresses** — a hunk relates to a requirement only if the hunk's content implements, documents, or contradicts the specific behavior described in that requirement. Merely mentioning a keyword (e.g., "tasks") does not make a hunk relevant to every task-related requirement.
3. Only create an annotation if you can write a specific explanation connecting the hunk content to the requirement. If you cannot explain the connection in concrete terms, the hunk is not relevant to that requirement — do not annotate it.
4. A single hunk can have multiple annotations, but most hunks address only 1-3 requirements. If a hunk has more than 5 annotations, reconsider whether each one is genuinely relevant.
5. Never use `unclear` as a default for "I'm not sure" — `unclear` means the hunk partially addresses a requirement but you cannot determine if it fully satisfies it. If the hunk simply doesn't relate to a requirement, skip it entirely.

### Files Not in Affected Paths

If a diff includes changes to files NOT listed in any requirement's `affected_paths`, still analyze those hunks. If a hunk in an unexpected file appears to address a requirement, annotate it with status `unclear` and explain that the file was not expected to be modified for this requirement.

### Building the Annotations Object

The top-level `annotations` object has one entry per requirement from the meta-spec. For each requirement:

- Determine its overall status (`satisfied`, `violated`, `unclear`, or `not_addressed`)
- Write a single explanation covering all evidence across hunks
- List every hunk that contributes as `{ "file": ..., "hunk_header": ... }` in the `hunks` array
- Requirements with no relevant hunks get `"status": "not_addressed"` and an empty `hunks` array

Also add each annotation's requirement ID to the `annotations` list in every hunk it references (inside the `files` array). This creates the bidirectional link: annotation → hunks and hunk → annotations.

### Summary Counts

The `summary` object contains counts of each status across all entries in `annotations`. These counts must add up to the total number of requirements in the meta-spec.

## Workflow

### Phase 1: Parse and split the diff (script)

If you have the raw diff as a file, run the parsing script to get structured, section-split hunks:

```bash
python3 plugins/mcp-spec/skills/spec-diff/scripts/parse_diff.py <diff_file> <parsed_diff.json>
```

This produces a JSON file with files split into logical hunks (MDX files split on `##` headings, TS files split on declarations). If you received per-file patches from the GitHub API instead of a raw diff file, you can skip this script and split hunks manually following the rules in "Splitting Large Hunks" above.

### Phase 2: Build annotation skeleton (script)

Generate a skeleton annotations.json with all structure pre-populated:

```bash
python3 plugins/mcp-spec/skills/spec-diff/scripts/annotate.py \
  <meta_spec.json> <parsed_diff.json> <output_annotations.json>
```

This produces a valid annotations.json with:

- All requirements pre-populated as `not_addressed` with empty summary/explanation
- Files array with `patch_text` copied from the parsed diff
- Generated files excluded
- Bidirectional link infrastructure ready

### Phase 3: Fill annotations (agent)

Read the skeleton annotations.json and for each requirement:

1. Read the hunks in the `files` array to find which ones address this requirement
2. Update the annotation's `status`, `summary`, and `explanation`
3. Add hunk references to the annotation's `hunks` array
4. Add the requirement ID to each referenced hunk's `annotations` list in the `files` array

Alternatively, write a `matches.json` file and re-run the script to apply it:

```bash
python3 plugins/mcp-spec/skills/spec-diff/scripts/annotate.py \
  <meta_spec.json> <parsed_diff.json> <output.json> --matches <matches.json>
```

The matches file maps requirement IDs to their status, summary, explanation, and hunk references. The script handles all bidirectional linking and summary counting automatically.

### Deduplication

A requirement should be annotated on the **primary hunk** that best demonstrates satisfaction — the one with the most specific and relevant content. Do not repeat the same annotation across many hunks.

If multiple hunks contribute to satisfying a single requirement, annotate the most relevant hunk and mention the supporting hunks in the explanation (e.g., "Defined in schema.ts with supporting documentation in tasks.mdx"). Do not create separate annotation entries for each supporting hunk.

### Generated Files

Skip files that are auto-generated from source-of-truth files. In this repository, `schema/draft/schema.json` is generated from `schema/draft/schema.ts` — annotate the `.ts` file, not the `.json` file. Similarly, `docs/specification/draft/schema.mdx` is generated from schema files.

## Edge Cases

- **Empty diff**: All requirements become `not_addressed`. Write annotations.json with zero file_annotations and all requirements as not_addressed.
- **Diff touches only documentation**: Schema requirements may still be `not_addressed`. Do not mark them as satisfied just because docs were updated.
- **Large diffs**: Process every hunk. Do not skip hunks or summarize. Each hunk needs individual analysis.
