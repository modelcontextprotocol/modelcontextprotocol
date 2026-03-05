---
name: spec-extract
description: Extracts structured requirements from a SEP markdown document, categorizing each MUST/SHOULD/MAY statement with affected paths and priorities
user_invocable: false
---

# Extracting Requirements from a SEP

Given SEP markdown content, produce a structured `meta-spec.json` that distills every actionable requirement into a machine-comparable checklist.

## Input

- `sep_content`: Full markdown text of the SEP
- `sep_number`: The SEP number (integer)
- `output_path`: Where to write `meta-spec.json`

## Output Schema

Write a JSON file to `{output_path}/meta-spec.json`:

```json
{
  "sep_number": 1686,
  "sep_title": "Tasks",
  "generated_at": "2026-03-04T12:00:00Z",
  "extraction_log": [
    {
      "section": "Specification > Capabilities",
      "must": 2,
      "should": 1,
      "may": 0
    },
    {
      "section": "Specification > Behavior Requirements > Task Lifecycle",
      "must": 4,
      "should": 0,
      "may": 1
    }
  ],
  "requirements": [
    {
      "id": "CAP-001",
      "category": "must-change",
      "group": "Capabilities",
      "summary": "Short one-line summary",
      "description": "Detailed description of the requirement",
      "source": {
        "section": "Specification > Capabilities",
        "quote": "Exact quote from the SEP"
      },
      "affected_paths": ["schema/draft/schema.ts"],
      "affected_spec_sections": ["docs/specification/draft/server/tasks.mdx"],
      "priority": "required"
    }
  ]
}
```

## Extraction Rules

### What Counts as a Requirement

A requirement is created for each occurrence of a **bolded RFC 2119 keyword** (`**MUST**`, `**SHOULD**`, `**MAY**`, `**MUST NOT**`) in the SEP's Specification, Backward Compatibility, and Security sections. This is the only trigger — do not invent requirements from prose that lacks these keywords, and do not skip keywords that are present.

Concretely:

- Scan for `**MUST**`, `**SHOULD**`, `**MAY**`, `**MUST NOT**` (bolded, as used in SEPs following RFC 2119)
- Each bolded keyword occurrence = exactly one requirement
- If a sentence has two bolded keywords ("receivers **SHOULD** treat this as advisory... receivers **MUST** return an error"), that produces two requirements
- Numbered list items containing a keyword each produce one requirement — do not collapse a list into a single requirement
- Do not create requirements from the Motivation, Abstract, or Future Work sections
- Do not create requirements from un-bolded uses of must/should/may (lowercase or non-bold uses are not RFC 2119 keywords)

### Implied Documentation Requirements

In addition to keyword-triggered requirements, create one `must-document` requirement per major new concept introduced by the SEP (new message type, new capability, new data type). These are the only non-keyword requirements allowed. Mark their `source.quote` as `"(implied)"`.

### Category Assignment

| SEP Content                                  | Category          | Priority      |
| -------------------------------------------- | ----------------- | ------------- |
| **Specification section** with MUST/MUST NOT | `must-change`     | `required`    |
| **Specification section** with SHOULD        | `must-change`     | `recommended` |
| **Specification section** with MAY           | `may-change`      | `optional`    |
| **Backward Compatibility** constraints       | `must-not-change` | `required`    |
| **Security Implications** with MUST          | `must-change`     | `required`    |
| **Security Implications** with SHOULD        | `must-change`     | `recommended` |
| Implied documentation requirements           | `must-document`   | `required`    |

### Semantic Grouping and ID Prefixes

Every requirement gets a `group` field and a group-based ID prefix. Derive groups from the SEP's own heading structure.

**Assign a 2-4 letter prefix to each group.** Requirements within a group are numbered sequentially starting at 001.

Examples for a Tasks SEP:

| Group                  | Prefix | Description                                       |
| ---------------------- | ------ | ------------------------------------------------- |
| Capabilities           | `CAP`  | Capability declaration and negotiation            |
| Task Lifecycle         | `LIF`  | Status transitions, terminal states               |
| Protocol Messages      | `MSG`  | tasks/get, tasks/result, tasks/list, tasks/cancel |
| Task Cancellation      | `CAN`  | Cancellation-specific behavior                    |
| TTL and Retention      | `TTL`  | keepAlive/ttl, expiration, cleanup                |
| Error Handling         | `ERR`  | JSON-RPC error codes, error reporting             |
| Security               | `SEC`  | Access control, task isolation, ID generation     |
| Backward Compatibility | `BWC`  | Preserved behaviors                               |
| Documentation          | `DOC`  | Documentation requirements                        |

Use short, descriptive names (2-3 words). Aim for 5-12 groups per SEP. The prefix must be unique across groups.

ID format: `{PREFIX}-{NNN}` (e.g., `CAP-001`, `LIF-003`, `SEC-002`).

### Mapping Affected Paths

Use this repo structure knowledge to map requirements to files:

| Requirement Type                      | Affected Path                                     |
| ------------------------------------- | ------------------------------------------------- |
| New/modified types, interfaces, enums | `schema/draft/schema.ts`                          |
| New capability fields                 | `schema/draft/schema.ts`                          |
| Server-side behavior docs             | `docs/specification/draft/server/*.mdx`           |
| Client-side behavior docs             | `docs/specification/draft/client/*.mdx`           |
| Transport-level changes               | `docs/specification/draft/basic/transports.mdx`   |
| Lifecycle changes                     | `docs/specification/draft/basic/lifecycle.mdx`    |
| Architecture/overview                 | `docs/specification/draft/basic/architecture.mdx` |

### Requirement Summaries (EARS Format)

The `summary` field uses the EARS (Easy Approach to Requirements Syntax) patterns to produce unambiguous, testable statements. Choose the pattern that best fits the requirement:

| Pattern          | Template                                                    | When to use                                               |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| **Event-driven** | `When [event], the [actor] shall [action].`                 | Triggered by a specific event (e.g., receiving a request) |
| **State-driven** | `While [state], the [actor] shall [action].`                | Behavior that holds during a condition                    |
| **Unwanted**     | `If [condition], then the [actor] shall [action].`          | Error handling, edge cases                                |
| **Optional**     | `Where [feature] is supported, the [actor] shall [action].` | Conditional on capability                                 |
| **Ubiquitous**   | `The [actor] shall [action].`                               | Always true, no trigger needed                            |

Examples:

- Bad: `"Declare tasks capability during initialization"`
- Good: `"When initializing, the receiver shall declare a tasks capability if it supports task-augmented requests."`

- Bad: `"Task IDs must be strings"`
- Good: `"The receiver shall generate task IDs as string values."`

- Bad: `"Return error for expired tasks"`
- Good: `"If a task has expired and been deleted, then the receiver shall return a -32602 error."`

- Bad: `"Support optional keepAlive"`
- Good: `"Where a request includes a ttl value, the receiver shall attempt to retain task results for at least the requested duration."`

The actor is always a specific party: "the receiver," "the requestor," "the server," "the client" — never "the system" or passive voice.

### Source Quotes

Every requirement MUST include the exact quote from the SEP that establishes it. The `source.section` field uses the SEP's heading hierarchy (e.g., "Specification > Behavior Requirements > Task Lifecycle").

## Workflow

### Phase 1: Mechanical keyword scan (script)

Run the extraction script to produce a baseline meta-spec with all keyword-triggered requirements:

```bash
python3 plugins/mcp-spec/skills/spec-extract/scripts/extract.py <sep_file.md> <output_dir>
```

This scans for bolded RFC 2119 keywords and produces `meta-spec.json` with:

- Correct `id` prefixes per semantic group (auto-generated from headings)
- Correct `category`, `priority`, and `source.quote` for each keyword
- Empty `summary`, `description`, and `affected_paths` fields
- An `extraction_log` with per-section keyword counts as a checksum

### Phase 2: Agent enrichment

After the script runs, read the generated `meta-spec.json` and fill in:

1. `summary` — one-line description of each requirement
2. `description` — detailed explanation
3. `affected_paths` — map to repo files using the path table above
4. `affected_spec_sections` — which spec docs this requirement touches
5. Add implied `must-document` requirements for new concepts (mark with `source.quote: "(implied)"`)
6. Review group names and prefixes — adjust if the auto-generated ones are unclear

### Extraction Log (Verification)

The `extraction_log` array serves as a checksum. After extraction, verify:

- The total number of requirements equals the sum of all keyword counts in the log, plus any implied documentation requirements
- If the count doesn't match, re-scan the SEP to find missing keywords

## Edge Cases

- **Ambiguous SHOULD/MAY**: If a statement uses SHOULD but the context makes it practically required for interoperability, still categorize as `must-change` with priority `recommended`. Do not upgrade to `required` based on your interpretation.
- **Implied requirements**: Mark source quote as `"(implied)"` and note in the description that it is implied by the introduction of a new concept.
- **Multiple affected paths**: A single requirement can affect multiple files. List all of them in `affected_paths`.
- **Keywords in code blocks**: Ignore MUST/SHOULD/MAY that appear inside JSON or code examples — only count keywords in the SEP's prose text.
