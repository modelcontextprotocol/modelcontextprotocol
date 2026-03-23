---
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
date: "{{ .Date }}"
draft: true

# One-sentence SEO summary. PaperMod emits this as BlogPosting.description
# and <meta name="description">. Without it, both fall back to the first ~70
# words of the post body.
description: ""

# PaperMod emits each entry as a schema.org Person in BlogPosting.author.
author:
  - ""

tags: []

# Optional per-post image for JSON-LD and OpenGraph (falls back to site
# og-image.png). Place under static/posts/<slug>/ and reference relative to
# static/.
# cover:
#   image: posts/{{ .File.ContentBaseName }}/cover.png
---
