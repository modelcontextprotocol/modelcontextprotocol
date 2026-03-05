---
name: spec-orchestrate
description: Iteratively runs the spec-reviewer and spec-implementer agents in a feedback loop until all SEP requirements are satisfied or conflicts are escalated
user_invocable: true
arguments:
  - name: sep_number
    description: The SEP number to implement
    required: true
  - name: max_iterations
    description: Maximum review-implement cycles (default 3)
    required: false
---

# Orchestrating SEP Implementation

Drives an iterative feedback loop between reviewing and implementing spec changes for a SEP, converging toward full requirement satisfaction.

## Arguments

| Argument         | Required | Default | Description                                     |
| ---------------- | -------- | ------- | ----------------------------------------------- |
| `sep_number`     | Yes      | —       | SEP number (integer)                            |
| `max_iterations` | No       | 3       | Maximum review→implement cycles before stopping |

## Workflow

### Initial Setup

Before entering the iteration loop, extract requirements and produce the first implementation:

**0a. Extract requirements**: Launch the `spec-reviewer` agent to read the SEP, extract requirements (meta-spec.json), and resolve the PR diff. Save its agent ID.

**0b. Implement first draft**: Launch the `spec-implementer` agent immediately. It reads the meta-spec and makes an initial pass at spec changes for all requirements. This ensures the first review iteration has actual implementation to annotate — not just the SEP document.

### Iteration Loop

For each iteration (up to `max_iterations`):

**1. Review phase**: Launch the `spec-reviewer` agent to annotate the current diff (including any implementation changes from step 0b or previous iterations). Save its agent ID. It produces or updates `annotations.json` and `annotated-diff.html` in `.reviews/SEP-{sep_number}/`.

**2. Quality gate**: Launch the `spec-qa` agent to audit the artifacts. If QA fails, branch on issue type:

- **Meta-spec issues** (`meta_spec_issues`): Fix the meta-spec directly (rewrite summaries, fill paths, etc.), then launch a new `spec-reviewer` in `validator` mode to re-annotate against the fixed meta-spec.
- **Annotation issues** (`annotation_issues`): Resume the `spec-reviewer` agent with the issues to fix.
- **Implementation issues** (`implementation_issues`): The diff lacks real spec changes (e.g., only the SEP file was modified). Skip directly to step 4 (implement phase) — the implementer needs to produce actual schema/doc edits before review is meaningful.
- Re-run QA after fixes. **Convergence rule:** Track the QA score across attempts. If the score does not improve after one fix round, stop the QA loop and proceed with the current artifacts — do not retry. Warnings that cannot be fixed (e.g., EARS wording disagreements) should not block progress. Maximum 2 fix rounds total.

**3. Evaluate**: Read the annotations summary.

- If all requirements are `satisfied` → done. Print success and the artifact path. Exit the loop.
- If there are `violated`, `unclear`, or `not_addressed` requirements → continue to step 4.

**4. Implement phase**: Launch the `spec-implementer` agent. It reads the meta-spec and annotations, then edits spec files to address `not_addressed` and `violated` requirements.

**5. Loop**: Return to step 1 for the next iteration.

### Conflict Escalation

If during the implement phase the agent reports that satisfying one requirement would violate another, OR if the same requirement remains `violated` across two consecutive iterations:

1. Stop the loop
2. Present the conflict to the user via `AskUserQuestion`:
   - Show the conflicting requirements (IDs, summaries, and explanations)
   - Offer options: "Update meta-spec to resolve conflict", "Skip this requirement", "Abort orchestration"
3. If the user chooses to update the meta-spec, follow the `spec-update` skill instructions, then resume the loop from step 1
4. If the user chooses to skip, mark that requirement as excluded and continue
5. If the user chooses to abort, stop and print the current state

### Termination

The loop ends when:

- All requirements are satisfied
- `max_iterations` is reached (print which requirements remain unresolved)
- The user aborts via escalation

### Final Output

Print a summary:

```
SEP-{sep_number} orchestration complete ({iterations} iterations)
  Satisfied:     {count}
  Violated:      {count}
  Unclear:       {count}
  Not addressed: {count}
  Skipped:       {count}

Artifact: .reviews/SEP-{sep_number}/annotated-diff.html
```
