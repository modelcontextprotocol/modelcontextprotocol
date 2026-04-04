---
name: spec-annotate
description: Orchestrates the full SEP annotation pipeline — extracts requirements, annotates the diff, and renders an HTML artifact
user_invocable: true
arguments:
  - name: sep_number
    description: The SEP number to annotate (e.g., 1686)
    required: true
  - name: mode
    description: "review" (default) creates fresh annotations; "validator" reuses existing meta-spec if available
    required: false
  - name: commit_range
    description: "Git commit range for local diff (e.g., abc123..def456). If omitted, fetches the PR diff from GitHub."
    required: false
---

# Annotating a SEP

This skill dispatches the `spec-reviewer` agent, then runs `spec-qa` as a quality gate. If QA fails, it branches based on the issue type: meta-spec issues go through `spec-update`, annotation issues go back to the reviewer.

## Workflow

### Step 1: Review

Launch the `spec-reviewer` agent:

```
Annotate SEP-{sep_number}. Mode: {mode}. {commit_range if provided, else "PR mode."}
```

Save the reviewer's agent ID.

### Step 2: Quality Gate

Launch the `spec-qa` agent:

```
Audit the annotation artifacts for SEP-{sep_number}.
```

If `verdict` is `pass`, skip to Step 5.

### Step 3: Fix meta-spec issues (if any)

If `meta_spec_issues` contains errors:

1. Read the current `.reviews/SEP-{sep_number}/meta-spec.json`
2. For each issue, apply the fix described in `fix_hint` directly to the meta-spec JSON — rewrite summaries to EARS format, fill in missing affected_paths, fix source quotes, etc.
3. Write the updated meta-spec back
4. Since the meta-spec changed, the annotations are now stale — launch a **new** `spec-reviewer` agent in `validator` mode to re-annotate against the fixed meta-spec:

```
Re-annotate SEP-{sep_number}. Mode: validator. {commit_range if provided, else "PR mode."}
The meta-spec was updated to fix QA issues. Re-annotate the diff against it and re-render.

Use the pre-built scripts — do NOT write HTML manually or create custom Python scripts:
- python3 plugins/mcp-spec-annotator/skills/spec-diff/scripts/parse_diff.py (parse diff)
- python3 plugins/mcp-spec-annotator/skills/spec-diff/scripts/annotate.py (build skeleton)
- python3 plugins/mcp-spec-annotator/skills/spec-render/scripts/render.py (render HTML)

Write ONLY meta-spec.json, annotations.json, and annotated-diff.html. No summary.md, README, or other files.
```

Save this new reviewer's agent ID (replacing the old one).

### Step 4: Fix annotation issues (if any)

If `annotation_issues` contains errors (either from the original QA or from a re-run after Step 3):

Resume the `spec-reviewer` agent (using its agent ID) with the issues:

```
The QA agent found these annotation issues. Fix them in annotations.json and re-render:

{paste annotation_issues JSON here}
```

After the reviewer finishes, re-run `spec-qa` to verify. **Convergence rule:** Track the QA score across attempts. If the score does not improve after one fix round, stop the QA loop and proceed — do not retry the same fixes. Maximum 2 fix rounds total. Report remaining warnings to the user but do not block on them.

### Step 5: Report

Once QA passes (or max iterations reached), relay to the user:

- The satisfaction counts
- The artifact path
- The QA score (e.g., "QA: 15/16, 1 warning")
- Any remaining warnings
