#!/usr/bin/env python3
"""Render annotated diff HTML from meta-spec and annotations JSON files.

Annotations use the v2 schema: top-level `annotations` dict + `files` array
with ID references, enabling multi-hunk annotation cards.

Usage:
    python3 render.py <meta_spec_path> <annotations_path> <output_path>

Requires jinja2: pip install jinja2
"""

import json
import sys
import html
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

try:
    from jinja2 import Environment, FileSystemLoader
except ImportError:
    print("Error: jinja2 is required. Install it with: pip install jinja2", file=sys.stderr)
    sys.exit(1)


def parse_patch_lines(patch_text: str) -> list[dict]:
    """Parse unified diff patch text into structured line objects."""
    lines = []
    old_no = 0
    new_no = 0

    for raw_line in patch_text.split("\n"):
        if raw_line.startswith("@@"):
            try:
                parts = raw_line.split(" ")
                old_start = parts[1]
                new_start = parts[2]
                old_no = abs(int(old_start.split(",")[0]))
                new_no = int(new_start.split(",")[0])
            except (IndexError, ValueError):
                old_no = 0
                new_no = 0
            continue

        content = html.escape(raw_line[1:] if len(raw_line) > 0 else "")

        if raw_line.startswith("+"):
            lines.append({"cls": "line-add", "old_no": "", "new_no": str(new_no), "content": content})
            new_no += 1
        elif raw_line.startswith("-"):
            lines.append({"cls": "line-remove", "old_no": str(old_no), "new_no": "", "content": content})
            old_no += 1
        elif raw_line.strip() == "":
            continue
        else:
            lines.append({"cls": "line-context", "old_no": str(old_no), "new_no": str(new_no), "content": content})
            old_no += 1
            new_no += 1

    return lines


import re

# RFC 2119 keywords (only when fully capitalized)
RFC_KEYWORDS = re.compile(r'\b(MUST NOT|MUST|SHALL NOT|SHALL|SHOULD NOT|SHOULD|MAY|REQUIRED|RECOMMENDED|OPTIONAL)\b')

# Quoted text: 'single quotes' or "double quotes" (but not apostrophes in words like don't)
# Captures: group(1) = opening quote, group(2) = content, group(3) = closing quote
QUOTE_RE = re.compile(r"""(?<!\w)(['"\u2018\u2019\u201c\u201d])([^'"\u2018\u2019\u201c\u201d]{3,}?)(['"\u2018\u2019\u201c\u201d])(?!\w)""")


def _content_escape(text: str) -> str:
    """Escape only angle brackets and ampersands — leave quotes intact for regex matching."""
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _enrich(text: str) -> str:
    """Apply content escaping, then quote styling, then RFC keyword bolding.

    Order matters: quotes first so the regex doesn't match the " inside <span class="...">.
    """
    text = _content_escape(text)
    text = QUOTE_RE.sub(r'<q>\1\2\3</q>', text)
    text = RFC_KEYWORDS.sub(r'<span class="rfc-keyword">\1</span>', text)
    return text


def format_annotation_text(summary_raw: str, explanation_raw: str) -> dict:
    """Format the summary and explanation fields for an annotation card.

    Returns dict with keys: summary_html, explanation_html, has_detail.
    """
    return {
        "summary_html": _enrich(summary_raw) if summary_raw else _enrich(explanation_raw) if explanation_raw else "",
        "explanation_html": _enrich(explanation_raw) if explanation_raw and summary_raw else "",
        "has_detail": bool(explanation_raw and summary_raw),
    }


def make_hunk_id(file_index: int, hunk_index: int) -> str:
    return f"hunk-{file_index}-{hunk_index}"


def build_hunk_id_map(files: list) -> dict:
    """Build a map from (file, hunk_header) -> hunk DOM id."""
    result = {}
    for fi, f in enumerate(files):
        for hi, h in enumerate(f["hunks"]):
            result[(f["file"], h["hunk_header"])] = make_hunk_id(fi, hi)
    return result


def build_annotation_cards(ann_dict: dict, hunk_id_map: dict, req_lookup: dict, side: str) -> list[dict]:
    """Build annotation cards for left (satisfied) or right (violated/unclear/not_addressed) column.

    req_lookup maps requirement ID -> requirement dict from meta-spec (for summary text).
    """
    left_statuses = {"satisfied"}
    right_statuses = {"violated", "unclear", "not_addressed"}
    target_statuses = left_statuses if side == "left" else right_statuses

    cards = []
    for req_id, ann in ann_dict.items():
        if ann["status"] not in target_statuses:
            continue

        hunk_ids = []
        for h in ann.get("hunks", []):
            key = (h["file"], h["hunk_header"])
            if key in hunk_id_map:
                hunk_ids.append(hunk_id_map[key])

        req = req_lookup.get(req_id, {})
        fmt = format_annotation_text(
            ann.get("summary", ""),
            ann.get("explanation", ""),
        )
        cards.append({
            "requirement_id": req_id,
            "status": ann["status"],
            "req_summary": html.escape(req.get("summary", "")),
            "summary_html": fmt["summary_html"],
            "explanation_html": fmt["explanation_html"],
            "has_detail": fmt["has_detail"],
            "hunk_ids": hunk_ids,
            "hunk_ids_json": json.dumps(hunk_ids),
            "hunk_labels": [f"{h['file']}:{h['hunk_header'][:40]}" for h in ann.get("hunks", [])],
        })

    return cards


def main():
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} <meta_spec.json> <annotations.json> <output.html>", file=sys.stderr)
        sys.exit(1)

    meta_spec_path = Path(sys.argv[1])
    annotations_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    with open(meta_spec_path) as f:
        meta_spec = json.load(f)
    with open(annotations_path) as f:
        data = json.load(f)

    ann_dict = data["annotations"]
    files = data["files"]
    summary = data.get("summary", {})
    coverage_map = {req_id: ann["status"] for req_id, ann in ann_dict.items()}

    # Parse diff lines for template
    file_annotations = []
    for fi, f_entry in enumerate(files):
        hunks = []
        for hi, hunk in enumerate(f_entry.get("hunks", [])):
            hunks.append({
                "hunk_header": html.escape(hunk.get("hunk_header", "")),
                "hunk_index": hi,
                "lines": parse_patch_lines(hunk.get("patch_text", "")),
                "annotation_ids": hunk.get("annotations", []),
            })
        file_annotations.append({
            "file": html.escape(f_entry["file"]),
            "file_index": fi,
            "hunks": hunks,
        })

    # Build requirement lookup for summary text
    req_lookup = {req["id"]: req for req in meta_spec.get("requirements", [])}

    # Build hunk ID map and annotation cards
    hunk_id_map = build_hunk_id_map(files)
    left_annotations = build_annotation_cards(ann_dict, hunk_id_map, req_lookup, "left")
    right_annotations = build_annotation_cards(ann_dict, hunk_id_map, req_lookup, "right")

    # Group requirements by semantic group
    requirements_by_group = OrderedDict()
    for req in meta_spec.get("requirements", []):
        group = req.get("group", req.get("category", "other"))
        if group not in requirements_by_group:
            requirements_by_group[group] = []
        requirements_by_group[group].append(req)

    total_requirements = sum(summary.values()) if summary else len(ann_dict)

    # Render
    template_dir = Path(__file__).parent.parent
    env = Environment(loader=FileSystemLoader(str(template_dir)), autoescape=False)
    template = env.get_template("template.html.j2")

    pr_number = data.get("pr_number", "")
    pr_url = data.get("pr_url", "")
    reviewed_commit = data.get("reviewed_commit", "")

    rendered = template.render(
        sep_number=meta_spec.get("sep_number", ""),
        sep_title=html.escape(meta_spec.get("sep_title", "")),
        generated_at=datetime.now(timezone.utc).isoformat(),
        pr_number=pr_number,
        pr_url=html.escape(pr_url),
        reviewed_commit=reviewed_commit,
        summary=summary,
        total_requirements=total_requirements,
        requirements=meta_spec.get("requirements", []),
        coverage_map=coverage_map,
        file_annotations=file_annotations,
        left_annotations=left_annotations,
        right_annotations=right_annotations,
        not_addressed_reqs=[],
        requirements_by_category=requirements_by_group,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(rendered)

    print(f"Rendered {output_path} ({len(rendered):,} bytes)")
    print(f"  Satisfied: {summary.get('satisfied', 0)}")
    print(f"  Violated: {summary.get('violated', 0)}")
    print(f"  Unclear: {summary.get('unclear', 0)}")
    print(f"  Not addressed: {summary.get('not_addressed', 0)}")


if __name__ == "__main__":
    main()
