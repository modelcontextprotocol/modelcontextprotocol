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

### Iteration Loop

For each iteration (up to `max_iterations`):

**1. Review phase**: Launch the `spec-reviewer` agent with the SEP number. Save its agent ID. It produces or updates `meta-spec.json`, `annotations.json`, and `annotated-diff.html` in `.reviews/SEP-{sep_number}/`.

**2. Quality gate**: Launch the `spec-qa` agent to audit the artifacts. If QA fails, branch on issue type:

- **Meta-spec issues** (`meta_spec_issues`): Fix the meta-spec directly (rewrite summaries, fill paths, etc.), then launch a new `spec-reviewer` in `validator` mode to re-annotate against the fixed meta-spec.
- **Annotation issues** (`annotation_issues`): Resume the `spec-reviewer` agent with the issues to fix.
- Re-run QA after fixes. Allow up to 2 fix rounds before proceeding.

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
