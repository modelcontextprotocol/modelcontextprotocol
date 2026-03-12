---
name: spec-update
description: Updates an existing meta-spec by adding, removing, modifying, or recategorizing requirements
user_invocable: true
arguments:
  - name: sep_number
    description: The SEP number whose meta-spec to update
    required: true
  - name: action
    description: "add, remove, modify, or recategorize"
    required: true
  - name: details
    description: Description of the change to make
    required: true
---

# Updating a Meta-Spec

Evolve an existing meta-spec without starting from scratch. Preserves existing requirements while applying targeted changes.

## Arguments

| Argument     | Required | Description                                       |
| ------------ | -------- | ------------------------------------------------- |
| `sep_number` | Yes      | SEP number (integer)                              |
| `action`     | Yes      | One of: `add`, `remove`, `modify`, `recategorize` |
| `details`    | Yes      | Natural language description of the change        |

## Workflow

### Step 1: Load existing meta-spec

Read `.reviews/SEP-{sep_number}/meta-spec.json`. If it does not exist, stop and tell the user to run `/spec-annotate {sep_number}` first.

### Step 2: Apply the change

Based on `action`:

**`add`**: Create a new requirement entry. Assign the next sequential ID (e.g., if the last is R015, the new one is R016). Parse `details` to determine category, summary, description, affected paths, and priority. Ask the user to confirm the new requirement before writing.

**`remove`**: Find the requirement matching `details` (by ID or by description match). Show the requirement to the user and ask for confirmation before removing. Do not renumber remaining requirements — IDs are stable.

**`modify`**: Find the matching requirement. Show the current version and the proposed modification side by side. Ask for confirmation before writing.

**`recategorize`**: Find the matching requirement. Change its `category` field (e.g., from `must-change` to `may-change`). Show the change and ask for confirmation.

### Step 3: Write updated meta-spec

Update the `generated_at` timestamp and write the modified JSON back to `.reviews/SEP-{sep_number}/meta-spec.json`.

### Step 4: Offer re-annotation

Ask the user: "The meta-spec has been updated. Re-annotate the diff against the new requirements?"

If yes, follow the `spec-diff` and `spec-render` skill instructions to regenerate `annotations.json` and `annotated-diff.html`.

## Constraints

- Requirement IDs are never reused. If R005 is removed, the next added requirement is still R016 (or whatever comes after the current highest).
- Always show the user what will change and get confirmation before writing.
- Preserve all fields of unmodified requirements exactly as they are.
