---
title: "Quote Component Test"
date: "2026-07-27T12:00:00+00:00"
publishDate: "2026-07-27T12:00:00+00:00"
draft: true
slug: quote-component-test
description: "Test page for the quotes shortcode. All companies and people on this page are fictional."
author:
  - The MCP project
tags:
  - test
ShowToc: false
---

This page exercises the new `quotes` and `quote` shortcodes. Every company,
person, and quote below is fictional. Delete this post before or at merge.

## Six quotes, carousel

Six cards at three per view on desktop. The arrows and dots below the row
page through them. Quote lengths differ on purpose: long quotes spill
downward and every attribution starts on the same line.

{{< quotes >}}
{{< quote name="Maren Odele" title="CTO" company="Lumenline" logo="logo-lumenline.svg" >}}
MCP let us wire our internal knowledge base into every agent we run. What used
to be a quarter of integration work shipped in a week. Since then we have
connected our ticketing system, our data warehouse, and two internal CLIs
through the same server. Every new tool we expose is available to every agent
on day one, and the protocol absorbed client version skew far better than our
old plugin system ever did.
{{< /quote >}}
{{< quote name="Priya Vanterpool" title="Head of Platform" company="Quartzfield Systems" logo="logo-quartzfield.svg" >}}
We replaced four bespoke plugin systems with one MCP server. Our team now
maintains a single surface instead of chasing SDK drift.
{{< /quote >}}
{{< quote name="Jonas Ferrick" title="VP of Engineering" company="Harborlight Analytics" logo="logo-harborlight.svg" >}}
Enterprise-managed authorization removed the consent-prompt wall for our
analysts. They log in once and every approved server is just there.
{{< /quote >}}
{{< quote name="Sana Whitlow" title="Principal Engineer" company="Vexelworks" logo="logo-vexelworks.svg" >}}
The spec is readable, the SDKs are boring in the best way, and conformance
tests caught our edge cases before customers did. We moved our whole tool
surface to MCP in one sprint. The part that surprised me was how little glue
code survived the migration. We deleted more adapter code than we wrote, and
the server we shipped has needed exactly one patch since launch.
{{< /quote >}}
{{< quote name="Theo Marchbank" title="CPO" company="Copperfen Data" logo="logo-copperfen.svg" >}}
Our customers connect Copperfen to their agents themselves now. MCP turned an
enterprise sales blocker into a checkbox.
{{< /quote >}}
{{< quote name="Ines Kalvane" title="Director of AI" company="Tidegate Systems" logo="logo-tidegate.svg" >}}
Tool annotations gave our reviewers the context they needed to approve agent
access in days instead of months. Our security team reads the annotations
directly during review, and that alone cut two meetings out of every rollout.
{{< /quote >}}
{{< /quotes >}}

## Three quotes, static

Three cards fit one view on desktop, so no carousel controls render. The
middle quote runs longer to show the shared attribution line in a static row.

{{< quotes >}}
{{< quote name="Maren Odele" title="CTO" company="Lumenline" logo="logo-lumenline.svg" >}}
MCP let us wire our internal knowledge base into every agent we run.
{{< /quote >}}
{{< quote name="Priya Vanterpool" title="Head of Platform" company="Quartzfield Systems" logo="logo-quartzfield.svg" >}}
We replaced four bespoke plugin systems with one MCP server. Our team now
maintains a single surface instead of chasing SDK drift, and onboarding a new
integration went from a two week project to an afternoon.
{{< /quote >}}
{{< quote name="Jonas Ferrick" title="VP of Engineering" company="Harborlight Analytics" logo="logo-harborlight.svg" >}}
Enterprise-managed authorization removed the consent-prompt wall for our
analysts.
{{< /quote >}}
{{< /quotes >}}

## Single quote

{{< quotes >}}
{{< quote name="Sana Whitlow" title="Principal Engineer" company="Vexelworks" logo="logo-vexelworks.svg" >}}
The spec is readable, the SDKs are boring in the best way, and conformance
tests caught our edge cases before customers did. We moved our whole tool
surface to MCP in one sprint and have not looked back.
{{< /quote >}}
{{< /quotes >}}

## No logo fallback

Without a `logo` param the company name renders as a text wordmark.

{{< quotes >}}
{{< quote name="Theo Marchbank" title="CPO" company="Copperfen Data" >}}
Our customers connect Copperfen to their agents themselves now.
{{< /quote >}}
{{< /quotes >}}

## No title

Without a `title` param the attribution is the name alone, no empty second
line.

{{< quotes >}}
{{< quote name="Ines Kalvane" company="Tidegate Systems" logo="logo-tidegate.svg" >}}
Tool annotations gave our reviewers the context they needed to approve agent
access in days instead of months.
{{< /quote >}}
{{< /quotes >}}
