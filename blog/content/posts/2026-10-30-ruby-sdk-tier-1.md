---
title: The Official Ruby SDK for MCP Reaches Tier 1
date: "2026-10-30T09:00:00+00:00"
publishDate: "2026-10-30T09:00:00+00:00"
slug: ruby-sdk-tier-1
description: The official Ruby SDK for the Model Context Protocol is now a Tier 1 SDK under the MCP SDK tiering system, with full support for the 2026-07-28 MCP specification and a 100% conformance pass rate across both scored spec versions.
author:
  - Koichi Ito (Ruby SDK Maintainer)
tags:
  - mcp
  - sdk
  - announcement
  - ruby
---

The official [Ruby SDK](https://github.com/modelcontextprotocol/ruby-sdk) for the Model Context Protocol is now a Tier 1 SDK, as recorded in the [Tier 1 assessment](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3247) under the [SDK tiering system](https://modelcontextprotocol.io/community/sdk-tiers). Ruby joins TypeScript, Python, C#, Go, and Rust as the sixth Tier 1 SDK. Among other things, Tier 1 requires full feature support, a 100% conformance pass rate, support for new spec versions by their release date, issue triage within two business days, and critical bug fixes within seven days.

{{< button text="Get the Ruby SDK" url="https://github.com/modelcontextprotocol/ruby-sdk" >}}
{{< button text="Read the documentation" url="https://ruby.sdk.modelcontextprotocol.io" >}}

## Full support for the 2026-07-28 MCP spec

[Version 1.2.0](https://github.com/modelcontextprotocol/ruby-sdk/releases/tag/v1.2.0) of the [`mcp` gem](https://rubygems.org/gems/mcp) completes support for the [2026-07-28 MCP spec](/posts/2026-07-28/):

- The stateless lifecycle ([SEP-2575](https://modelcontextprotocol.io/seps/2575-stateless-mcp)) is served alongside the classic session handshake, including `server/discover` and the `subscriptions/listen` notification stream
- Multi round-trip requests ([SEP-2322](https://modelcontextprotocol.io/seps/2322-MRTR)) work on both the server and the client, and a built-in shim lets handlers written in the new `input_required` style serve pre-2026 clients unchanged
- Cache hints ([SEP-2549](https://modelcontextprotocol.io/seps/2549-TTL-for-list-results)) and the standard and custom HTTP request headers ([SEP-2243](https://modelcontextprotocol.io/seps/2243-http-standardization)) are emitted and validated on the modern path
- Roots, Sampling, and Logging are marked deprecated per [SEP-2577](https://modelcontextprotocol.io/seps/2577-deprecate-roots-sampling-and-logging), and clients connecting with the 2026-07-28 protocol version warn when they declare the Roots or Sampling capabilities

The server serves both lifecycle eras side by side, so current clients keep working while 2026-07-28 clients use the stateless path. See [Protocol Versions](https://ruby.sdk.modelcontextprotocol.io/protocol-versions/) for how the SDK handles each era.

Several 1.x releases, starting with 1.2.0, reject input that earlier releases accepted. The SDK's [versioning policy](https://github.com/modelcontextprotocol/ruby-sdk/blob/main/VERSIONING.md) allows such changes to fix spec conformance, security issues, and clear defects, so read the [changelog](https://github.com/modelcontextprotocol/ruby-sdk/blob/main/CHANGELOG.md) before upgrading an existing 1.x application.

## From Tier 2 to Tier 1

The [Tier 2 assessment](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3127) in July showed that the SDK was already close, meeting eight of the ten Tier 1 requirements. Two things were left: the documentation didn't cover every feature yet, and there was no agreed timeline for supporting new versions of the spec. Here's where the SDK stands now:

- Every implemented feature is documented with prose and examples, from non-text content types through elicitation options to the full OAuth client flow; with [version 1.3.0](https://github.com/modelcontextprotocol/ruby-sdk/releases/tag/v1.3.0), this documentation moved from the README to a revamped [documentation site](https://ruby.sdk.modelcontextprotocol.io), one page per topic
- The SDK passes 100% of the scored server and client conformance scenarios for both the 2025-11-25 and 2026-07-28 requirement sets, measured with the [conformance suite](https://github.com/modelcontextprotocol/conformance)'s frozen scoring for each spec version: 67/67 server scenario runs and 50/50 client scenario runs, each executed at that spec's own protocol version
- The repository maintained a 100% issue triage rate within the Tier 1 window, with no P0 issues filed

The full evidence tables, including reproduction steps for the conformance results, are in the [Tier 1 assessment](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3247).

The stable release supporting 2026-07-28 shipped 18 days after the specification release, while Tier 1 expects support by the release date. To close this spec-tracking gap, the Ruby SDK team has committed to supporting the next MCP spec, targeted for [late March 2027](https://modelcontextprotocol.io/seps/3398-release-cycle-updates), by its release date.

The road here was short but steep: the SDK was assessed at [Tier 3](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2340) in March 2026, reached [Tier 2](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3127) with the 1.0 release in July, applied for Tier 1 in August, and was confirmed at Tier 1 in September.

## Get started

Add the gem to your application:

```bash
bundle add mcp
```

Or install it on its own with `gem install mcp`.

To upgrade an existing application, set the constraint in your Gemfile and run `bundle update mcp`:

```ruby
gem 'mcp', '~> 1.8'
```

If you are already running a 1.x server, upgrading lets it serve 2026-07-28 clients alongside existing ones. See the [Ruby SDK documentation](https://ruby.sdk.modelcontextprotocol.io) for guides on building servers and clients, including Rails integration, and the [1.0 announcement](/posts/ruby-sdk-1-0/) for a walkthrough of the basics.

## Give us your feedback

If you run into problems or unexpected behavior while using the SDK, please report them on the [issue tracker](https://github.com/modelcontextprotocol/ruby-sdk/issues). Reports from real-world usage are especially valuable, and with Tier 1 comes a commitment to triage them quickly.

The Ruby SDK is maintained by [Topher Bullock](https://github.com/topherbullock), [Koichi Ito](https://github.com/koic), [Ateş Göral](https://github.com/atesgoral), and [Jonathan Hefner](https://github.com/jonathanhefner) together with the wider Ruby community. Thank you to everyone for the feedback and contributions on the road from Tier 3 to Tier 1. Special thanks to [Felix Weinberger](https://github.com/felixweinberger) and [Paul Carleton](https://github.com/pcarleton) for their review and independent verification of the Tier 1 assessment, and to [Den Delimarsky](https://github.com/localden) for the final review.
