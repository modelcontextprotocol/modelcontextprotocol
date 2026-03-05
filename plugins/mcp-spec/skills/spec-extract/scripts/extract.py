#!/usr/bin/env python3
"""Extract structured requirements from a SEP markdown file.

Mechanically scans for bolded RFC 2119 keywords (**MUST**, **SHOULD**, **MAY**,
**MUST NOT**) and produces a requirements JSON with per-section counts.

Usage:
    python3 extract.py <sep_file> <output_path>

The output JSON is written to <output_path>/meta-spec.json. The agent should
review and enrich the output (add group prefixes, affected_paths, descriptions)
but the keyword scan itself is deterministic.
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


# Matches RFC 2119 keywords in markdown prose — bolded (**MUST**) or plain uppercase (MUST)
KEYWORD_RE = re.compile(r'(?:\*\*)?(MUST NOT|MUST|SHOULD NOT|SHOULD|MAY)(?:\*\*)?(?=[\s,.\);:])')

# Matches markdown headings
HEADING_RE = re.compile(r'^(#{1,6})\s+(.+)$', re.MULTILINE)

# Matches code blocks (to exclude keywords inside them)
CODE_BLOCK_RE = re.compile(r'```[\s\S]*?```', re.MULTILINE)

# Sections to skip (no requirements extracted from these)
SKIP_SECTIONS = {'Abstract', 'Motivation', 'Future Work', 'Rationale', 'References',
                 'Affected Customer Use Cases', 'Integration with Existing Architectures',
                 'Benefits for Existing Architectures'}


def strip_code_blocks(text: str) -> str:
    """Remove fenced code blocks so keywords inside them are ignored."""
    return CODE_BLOCK_RE.sub('', text)


def parse_sections(sep_text: str) -> list[dict]:
    """Parse SEP into sections with heading hierarchy."""
    sections = []
    headings = list(HEADING_RE.finditer(sep_text))

    for i, match in enumerate(headings):
        level = len(match.group(1))
        title = match.group(2).strip()
        start = match.end()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(sep_text)
        body = sep_text[start:end]

        sections.append({
            'level': level,
            'title': title,
            'body': body,
            'start': match.start(),
        })

    return sections


def build_heading_path(sections: list[dict], index: int) -> str:
    """Build the full heading path like 'Specification > Capabilities > Server'."""
    target = sections[index]
    path_parts = [target['title']]
    target_level = target['level']

    for i in range(index - 1, -1, -1):
        if sections[i]['level'] < target_level:
            path_parts.insert(0, sections[i]['title'])
            target_level = sections[i]['level']

    return ' > '.join(path_parts)


def is_in_skip_section(sections: list[dict], index: int) -> bool:
    """Check if a section or any of its ancestors is in SKIP_SECTIONS."""
    path = build_heading_path(sections, index)
    for skip in SKIP_SECTIONS:
        if skip in path:
            return True
    return False


def classify_section(heading_path: str) -> str:
    """Determine if a section is Specification, Backward Compatibility, or Security."""
    lower = heading_path.lower()
    if 'backward compatibility' in lower:
        return 'backward_compat'
    elif 'security' in lower:
        return 'security'
    else:
        return 'specification'


def keyword_to_category_priority(keyword: str, section_type: str) -> tuple[str, str]:
    """Map a keyword + section type to (category, priority)."""
    kw = keyword.upper()

    if section_type == 'backward_compat':
        return ('must-not-change', 'required')

    if kw in ('MUST', 'MUST NOT'):
        return ('must-change', 'required')
    elif kw in ('SHOULD', 'SHOULD NOT'):
        return ('must-change', 'recommended')
    elif kw == 'MAY':
        return ('may-change', 'optional')

    return ('must-change', 'required')


def extract_sentence_around(text: str, match_start: int, match_end: int) -> str:
    """Extract the sentence containing the keyword match."""
    # Find sentence boundaries (period, newline, or list item start)
    # Look backward for sentence start
    start = match_start
    for i in range(match_start - 1, max(match_start - 500, -1), -1):
        if i < 0:
            start = 0
            break
        ch = text[i]
        if ch == '\n':
            # Check if next non-space is a list marker or heading
            rest = text[i+1:match_start].lstrip()
            if rest and (rest[0] in '#-*' or (rest[0].isdigit() and '.' in rest[:4])):
                start = i + 1
                break
            if text[i-1:i] == '\n':  # Double newline = paragraph break
                start = i + 1
                break
        elif ch == '.' and i < match_start - 2:
            start = i + 2
            break

    # Look forward for sentence end
    end = match_end
    for i in range(match_end, min(match_end + 500, len(text))):
        if text[i] == '\n' and i + 1 < len(text) and text[i+1] == '\n':
            end = i
            break
        if text[i] == '.' and (i + 1 >= len(text) or text[i+1] in ' \n'):
            end = i + 1
            break
    else:
        end = min(match_end + 500, len(text))

    return text[start:end].strip()


def suggest_group(heading_path: str) -> str:
    """Suggest a semantic group name from the heading path."""
    # Take the most specific heading
    parts = heading_path.split(' > ')
    # Skip very generic top-level headings
    for part in reversed(parts):
        clean = re.sub(r'^\d+\.?\d*\.?\s*', '', part).strip()
        if clean.lower() not in ('specification',) and not clean.lower().startswith('sep-'):
            return clean
    return parts[-1]


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <sep_file.md> <output_dir>", file=sys.stderr)
        sys.exit(1)

    sep_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])

    sep_text = sep_path.read_text()

    # Parse title
    title_match = re.search(r'^# SEP-(\d+):\s*(.+)$', sep_text, re.MULTILINE)
    sep_number = int(title_match.group(1)) if title_match else 0
    sep_title = title_match.group(2).strip() if title_match else "Unknown"

    # Parse sections
    sections = parse_sections(sep_text)

    # Strip code blocks for keyword scanning
    clean_text = strip_code_blocks(sep_text)

    # Scan for keywords per section
    requirements = []
    extraction_log = []

    for si, section in enumerate(sections):
        if is_in_skip_section(sections, si):
            continue

        heading_path = build_heading_path(sections, si)
        section_type = classify_section(heading_path)

        # Get the clean (no code blocks) version of this section's body
        # We need to find this section's body in the clean text
        clean_body = strip_code_blocks(section['body'])

        keywords_found = {'MUST': 0, 'MUST NOT': 0, 'SHOULD': 0, 'SHOULD NOT': 0, 'MAY': 0}

        for match in KEYWORD_RE.finditer(section['body']):
            # Verify this match position isn't inside a code block
            match_in_original = section['body'][max(0, match.start()-10):match.end()+10]
            if '```' in section['body'][:match.start()].split('```')[-1] if '```' in section['body'][:match.start()] else False:
                continue

            keyword = match.group(1)
            keywords_found[keyword] += 1

            category, priority = keyword_to_category_priority(keyword, section_type)
            quote = extract_sentence_around(section['body'], match.start(), match.end())
            group = suggest_group(heading_path)

            requirements.append({
                'id': None,  # Assigned after grouping
                'category': category,
                'group': group,
                'summary': '',  # Agent fills this in
                'description': '',  # Agent fills this in
                'source': {
                    'section': heading_path,
                    'quote': quote.strip(),
                },
                'affected_paths': [],  # Agent fills this in
                'affected_spec_sections': [],  # Agent fills this in
                'priority': priority,
                '_keyword': keyword,
            })

        total = sum(keywords_found.values())
        if total > 0:
            extraction_log.append({
                'section': heading_path,
                'must': keywords_found['MUST'] + keywords_found['MUST NOT'],
                'should': keywords_found['SHOULD'] + keywords_found['SHOULD NOT'],
                'may': keywords_found['MAY'],
            })

    # Assign group-based IDs
    group_counters: dict[str, int] = {}
    group_prefixes: dict[str, str] = {}

    for req in requirements:
        group = req['group']
        if group not in group_prefixes:
            # Generate a prefix from the group name
            words = re.sub(r'[^a-zA-Z\s]', '', group).split()
            if len(words) >= 2:
                prefix = (words[0][:2] + words[1][0]).upper()
            else:
                prefix = words[0][:3].upper() if words else 'REQ'
            # Ensure uniqueness
            base_prefix = prefix
            suffix = 1
            while prefix in group_prefixes.values():
                prefix = base_prefix + str(suffix)
                suffix += 1
            group_prefixes[group] = prefix
            group_counters[group] = 0

        group_counters[group] += 1
        req['id'] = f"{group_prefixes[group]}-{group_counters[group]:03d}"

    # Clean up internal fields
    for req in requirements:
        del req['_keyword']

    # Write output
    output = {
        'sep_number': sep_number,
        'sep_title': sep_title,
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'extraction_log': extraction_log,
        'group_prefixes': group_prefixes,
        'requirements': requirements,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / 'meta-spec.json'
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    total_reqs = len(requirements)
    log_total = sum(e['must'] + e['should'] + e['may'] for e in extraction_log)
    print(f"Extracted {total_reqs} requirements from {sep_path.name}")
    print(f"  Keyword scan total: {log_total}")
    print(f"  Groups: {len(group_prefixes)}")
    for group, prefix in group_prefixes.items():
        count = group_counters[group]
        print(f"    {prefix} ({group}): {count}")
    if total_reqs != log_total:
        print(f"  WARNING: requirement count ({total_reqs}) != keyword count ({log_total})")
    print(f"  Output: {output_path}")
    print(f"\nNote: summary, description, and affected_paths fields are empty.")
    print(f"The agent should enrich these fields after reviewing the output.")


if __name__ == "__main__":
    main()
