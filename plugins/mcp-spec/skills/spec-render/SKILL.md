---
name: spec-render
description: Renders meta-spec and annotation data into a self-contained HTML artifact using the template, suitable for publishing to GitHub Gist
user_invocable: false
---

# Rendering Annotated Diff HTML

Produces a self-contained HTML file from meta-spec and annotation data using a Python render script with a Jinja2 template.

## Input

- `meta_spec_path`: Path to `meta-spec.json`
- `annotations_path`: Path to `annotations.json`
- `output_path`: Where to write the final HTML file (e.g., `annotated-diff.html`)

## Workflow

Run the render script from this skill's directory:

```bash
python3 plugins/mcp-spec/skills/spec-render/scripts/render.py \
  <meta_spec_path> \
  <annotations_path> \
  <output_path>
```

If jinja2 is not installed, install it first:

```bash
pip install jinja2
```

The script reads the Jinja2 template (`template.html.j2` in the same directory), populates it with data from both JSON files, and writes self-contained HTML.

## What the Script Handles

- Parsing unified diff patch text into line-by-line HTML with old/new line numbers
- Building the summary bar from annotation counts
- Splitting annotations into left column (satisfied) and right column (violated/unclear/not-addressed)
- Grouping requirements by category for the collapsible index
- HTML-escaping all user-provided text

## Output Features

The generated HTML includes:

- **Header**: SEP title, generation timestamp, and colored summary bar
- **Requirements reference**: Collapsible section at the top listing all meta-spec requirements with their coverage status
- **Three-column layout**: Left annotations (satisfied) | center diff | right annotations (issues)
- **Requirement index**: Grouped by category at the bottom
- **Interactive navigation**: Click annotations to scroll to hunks, click hunks to highlight annotations
- Dark theme with GitHub-style colors, fully self-contained (no external dependencies)
