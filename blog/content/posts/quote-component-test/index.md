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
page through them.

{{< quotes >}}
{{< quote name="Maren Odele" title="CTO" company="Lumenline" logo="logo-lumenline.svg" >}}
MCP let us wire our internal knowledge base into every agent we run. What used
to be a quarter of integration work shipped in a week.
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
tests caught our edge cases before customers did.
{{< /quote >}}
{{< quote name="Theo Marchbank" title="CPO" company="Copperfen Data" logo="logo-copperfen.svg" >}}
Our customers connect Copperfen to their agents themselves now. MCP turned an
enterprise sales blocker into a checkbox.
{{< /quote >}}
{{< quote name="Ines Kalvane" title="Director of AI" company="Tidegate Systems" logo="logo-tidegate.svg" >}}
Tool annotations gave our reviewers the context they needed to approve agent
access in days instead of months.
{{< /quote >}}
{{< /quotes >}}

## Three quotes, static

Three cards fit one view on desktop, so no carousel controls render.

{{< quotes >}}
{{< quote name="Maren Odele" title="CTO" company="Lumenline" logo="logo-lumenline.svg" >}}
MCP let us wire our internal knowledge base into every agent we run.
{{< /quote >}}
{{< quote name="Priya Vanterpool" title="Head of Platform" company="Quartzfield Systems" logo="logo-quartzfield.svg" >}}
We replaced four bespoke plugin systems with one MCP server.
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
