#!/usr/bin/env python3
"""Parse a unified diff into structured file/hunk objects with section splitting.

Splits large new-file hunks into logical sections:
- MDX/markdown files: split on ## headings
- TypeScript files: split on top-level declarations (interface, type, enum, export)

Usage:
    python3 parse_diff.py <diff_file> <output_path>

Writes structured JSON to <output_path> with per-file, per-hunk data ready
for the agent to annotate against requirements.
"""

import json
import re
import sys
from pathlib import Path


HEADING_RE = re.compile(r'^\+?##\s+(.+)$')
TS_DECL_RE = re.compile(r'^\+?(export\s+)?(interface|type|enum|const|class|function)\s+(\w+)')

# Threshold for splitting — hunks smaller than this are kept as-is
SPLIT_THRESHOLD = 40


def parse_unified_diff(diff_text: str) -> list[dict]:
    """Parse unified diff text into structured file patches."""
    file_patches = []
    current_file = None
    current_hunk = None

    for line in diff_text.split('\n'):
        # New file header
        if line.startswith('diff --git'):
            if current_file is not None:
                if current_hunk is not None:
                    current_file['hunks'].append(current_hunk)
                file_patches.append(current_file)

            match = re.search(r'diff --git a/(.*?) b/(.*?)$', line)
            filename = match.group(2) if match else 'unknown'
            current_file = {'file': filename, 'hunks': []}
            current_hunk = None

        # File metadata (skip)
        elif line.startswith('---') or line.startswith('+++') or line.startswith('index '):
            continue

        # New file mode (skip)
        elif line.startswith('new file') or line.startswith('deleted file'):
            continue

        # Hunk header
        elif line.startswith('@@'):
            if current_hunk is not None and current_file is not None:
                current_file['hunks'].append(current_hunk)
            current_hunk = {
                'hunk_header': line,
                'patch_text': line + '\n',
            }

        # Hunk content
        elif current_hunk is not None:
            current_hunk['patch_text'] += line + '\n'

    # Finalize last file/hunk
    if current_file is not None:
        if current_hunk is not None:
            current_file['hunks'].append(current_hunk)
        file_patches.append(current_file)

    return file_patches


def split_mdx_hunk(hunk: dict) -> list[dict]:
    """Split a large MDX/markdown hunk on ## headings."""
    lines = hunk['patch_text'].split('\n')
    sections = []
    current_lines = []
    current_heading = None
    start_line = 0

    for i, line in enumerate(lines):
        if i == 0 and line.startswith('@@'):
            continue  # Skip the original hunk header

        content = line[1:] if line.startswith('+') else line
        heading_match = HEADING_RE.match(line)

        if heading_match:
            if current_lines and current_heading:
                sections.append({
                    'hunk_header': f'@@ section: "{current_heading}" (lines {start_line}-{i-1}) @@',
                    'patch_text': '\n'.join(current_lines) + '\n',
                })
            current_heading = heading_match.group(1).strip()
            current_lines = [line]
            start_line = i
        else:
            current_lines.append(line)

    if current_lines and current_heading:
        sections.append({
            'hunk_header': f'@@ section: "{current_heading}" (lines {start_line}-{len(lines)-1}) @@',
            'patch_text': '\n'.join(current_lines) + '\n',
        })

    return sections if sections else [hunk]


def split_ts_hunk(hunk: dict) -> list[dict]:
    """Split a large TypeScript hunk on top-level declarations."""
    lines = hunk['patch_text'].split('\n')
    sections = []
    current_lines = []
    current_decl = None
    start_line = 0

    for i, line in enumerate(lines):
        if i == 0 and line.startswith('@@'):
            continue

        decl_match = TS_DECL_RE.match(line)

        if decl_match:
            if current_lines and current_decl:
                sections.append({
                    'hunk_header': f'@@ declaration: "{current_decl}" (lines {start_line}-{i-1}) @@',
                    'patch_text': '\n'.join(current_lines) + '\n',
                })
            current_decl = decl_match.group(3)
            current_lines = [line]
            start_line = i
        else:
            current_lines.append(line)

    if current_lines and current_decl:
        sections.append({
            'hunk_header': f'@@ declaration: "{current_decl}" (lines {start_line}-{len(lines)-1}) @@',
            'patch_text': '\n'.join(current_lines) + '\n',
        })

    return sections if sections else [hunk]


def split_hunk_if_large(hunk: dict, filename: str) -> list[dict]:
    """Split a hunk into logical sections if it's large enough."""
    line_count = hunk['patch_text'].count('\n')
    if line_count < SPLIT_THRESHOLD:
        return [hunk]

    if filename.endswith(('.mdx', '.md')):
        return split_mdx_hunk(hunk)
    elif filename.endswith('.ts'):
        return split_ts_hunk(hunk)

    return [hunk]


def process_diff(file_patches: list[dict]) -> list[dict]:
    """Process all file patches, splitting large hunks."""
    result = []

    for fp in file_patches:
        processed_hunks = []
        for hunk in fp['hunks']:
            split = split_hunk_if_large(hunk, fp['file'])
            processed_hunks.extend(split)

        result.append({
            'file': fp['file'],
            'hunk_count': len(processed_hunks),
            'hunks': processed_hunks,
        })

    return result


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <diff_file> <output.json>", file=sys.stderr)
        sys.exit(1)

    diff_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    diff_text = diff_path.read_text()

    # Parse and split
    raw_patches = parse_unified_diff(diff_text)
    processed = process_diff(raw_patches)

    # Summary
    total_files = len(processed)
    total_hunks = sum(f['hunk_count'] for f in processed)
    total_raw_hunks = sum(len(f['hunks']) for f in raw_patches)

    output = {
        'summary': {
            'files': total_files,
            'raw_hunks': total_raw_hunks,
            'split_hunks': total_hunks,
        },
        'files': processed,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"Parsed {diff_path.name}: {total_files} files, {total_raw_hunks} raw hunks -> {total_hunks} after splitting")
    for fp in processed:
        print(f"  {fp['file']}: {fp['hunk_count']} hunks")


if __name__ == "__main__":
    main()
