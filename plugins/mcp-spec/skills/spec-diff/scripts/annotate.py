#!/usr/bin/env python3
"""Build annotation scaffolding from meta-spec and parsed diff.

Produces a skeleton annotations.json with:
- All requirements pre-populated as not_addressed
- Files array with patch_text and empty annotation lists
- Bidirectional link infrastructure ready to fill
- Generated files (schema.json, generated schema.mdx) excluded

The agent fills in: status, summary, explanation, and hunk references per requirement.
A matching config file can optionally be provided to do this automatically.

Usage:
    # Generate skeleton for agent to fill:
    python3 annotate.py <meta_spec.json> <parsed_diff.json> <output.json>

    # Apply matching config to fill annotations:
    python3 annotate.py <meta_spec.json> <parsed_diff.json> <output.json> --matches <matches.json>

Matching config format (matches.json):
{
  "CAP-001": {
    "status": "satisfied",
    "summary": "One sentence verdict.",
    "explanation": "Detailed explanation...",
    "hunks": [
      { "file": "schema/draft/schema.ts", "hunk_header": "@@ -450,6 +450,25 @@" }
    ]
  }
}

Any requirement not in the matches file stays as not_addressed with an empty explanation
for the agent to fill in.
"""

import json
import sys
from pathlib import Path

# Files to skip (auto-generated from source-of-truth files)
GENERATED_FILES = {
    'schema/draft/schema.json',
    'docs/specification/draft/schema.mdx',
}


def build_skeleton(meta_spec: dict, parsed_diff: dict, pr_metadata: dict | None = None) -> dict:
    """Build a skeleton annotations.json with all structure pre-populated."""

    requirements = meta_spec.get('requirements', [])

    # Pre-populate all annotations as not_addressed
    annotations = {}
    for req in requirements:
        annotations[req['id']] = {
            'status': 'not_addressed',
            'summary': '',
            'explanation': '',
            'hunks': [],
        }

    # Build files array from parsed diff, excluding generated files
    files = []
    for file_entry in parsed_diff.get('files', []):
        file_path = file_entry['file']
        if file_path in GENERATED_FILES:
            continue

        hunks = []
        for hunk in file_entry.get('hunks', []):
            hunks.append({
                'hunk_header': hunk.get('hunk_header', ''),
                'patch_text': hunk.get('patch_text', ''),
                'annotations': [],
            })

        if hunks:
            files.append({
                'file': file_path,
                'hunks': hunks,
            })

    result = {
        'sep_number': meta_spec.get('sep_number', 0),
        'pr_number': (pr_metadata or {}).get('pr_number'),
        'pr_url': (pr_metadata or {}).get('pr_url'),
        'reviewed_commit': (pr_metadata or {}).get('reviewed_commit'),
        'summary': {
            'satisfied': 0,
            'violated': 0,
            'unclear': 0,
            'not_addressed': len(requirements),
        },
        'annotations': annotations,
        'files': files,
    }

    return result


def apply_matches(skeleton: dict, matches: dict) -> dict:
    """Apply a matching config to fill in annotations and build bidirectional links."""

    annotations = skeleton['annotations']
    files = skeleton['files']

    # Build hunk lookup: (file, hunk_header) -> hunk object in files array
    hunk_lookup = {}
    for file_entry in files:
        for hunk in file_entry['hunks']:
            key = (file_entry['file'], hunk['hunk_header'])
            hunk_lookup[key] = hunk

    # Apply each match
    for req_id, match in matches.items():
        if req_id not in annotations:
            continue

        ann = annotations[req_id]
        ann['status'] = match.get('status', 'satisfied')
        ann['summary'] = match.get('summary', '')
        ann['explanation'] = match.get('explanation', '')
        ann['hunks'] = match.get('hunks', [])

        # Build forward links: add req_id to each referenced hunk's annotations list
        for hunk_ref in ann['hunks']:
            key = (hunk_ref['file'], hunk_ref['hunk_header'])
            if key in hunk_lookup:
                hunk_obj = hunk_lookup[key]
                if req_id not in hunk_obj['annotations']:
                    hunk_obj['annotations'].append(req_id)

    # Recompute summary counts
    counts = {'satisfied': 0, 'violated': 0, 'unclear': 0, 'not_addressed': 0}
    for ann in annotations.values():
        status = ann['status']
        if status in counts:
            counts[status] += 1
    skeleton['summary'] = counts

    return skeleton


def main():
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <meta_spec.json> <parsed_diff.json> <output.json> [--matches <matches.json>]",
              file=sys.stderr)
        sys.exit(1)

    meta_spec_path = Path(sys.argv[1])
    parsed_diff_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    with open(meta_spec_path) as f:
        meta_spec = json.load(f)
    with open(parsed_diff_path) as f:
        parsed_diff = json.load(f)

    # Build skeleton
    skeleton = build_skeleton(meta_spec, parsed_diff)

    # Apply matches if provided
    if '--matches' in sys.argv:
        matches_idx = sys.argv.index('--matches')
        if matches_idx + 1 < len(sys.argv):
            matches_path = Path(sys.argv[matches_idx + 1])
            with open(matches_path) as f:
                matches = json.load(f)
            skeleton = apply_matches(skeleton, matches)
            print(f"Applied {len(matches)} matches")

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(skeleton, f, indent=2)

    s = skeleton['summary']
    total = sum(s.values())
    print(f"Wrote {output_path}")
    print(f"  Requirements: {total}")
    print(f"  Satisfied: {s['satisfied']}")
    print(f"  Violated: {s['violated']}")
    print(f"  Unclear: {s['unclear']}")
    print(f"  Not addressed: {s['not_addressed']}")
    print(f"  Files: {len(skeleton['files'])} (generated files excluded)")

    unfilled = sum(1 for a in skeleton['annotations'].values() if not a['summary'])
    if unfilled:
        print(f"\n  {unfilled} annotations need summary/explanation (agent fills these in)")


if __name__ == '__main__':
    main()
