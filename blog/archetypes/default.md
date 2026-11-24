---
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
date: "{{ .Date }}"
draft: true

# One-sentence SEO summary. The blog emits this as BlogPosting.description
# and <meta name="description">. Without it, both fall back to the first ~70
# words of the post body.
description: ""

# The blog emits each entry as a schema.org Person in BlogPosting.author.
author:
  - ""

tags: []

# Optional picture for JSON-LD and OpenGraph. Without one the post gets a card
# drawn from its title, date and authors (layouts/partials/og/image.html).
# Place under static/posts/<slug>/ and reference relative to static/.
# cover:
#   image: posts/{{ .File.ContentBaseName }}/cover.png
---
