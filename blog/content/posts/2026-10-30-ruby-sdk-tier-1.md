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

The official [Ruby SDK for Model Context Protocol](https://github.com/modelcontextprotocol/ruby-sdk) is now a Tier 1 SDK, as defined in our [SDK tiering system](https://modelcontextprotocol.io/community/sdk-tiers). Ruby is not alone here, and joins the company of our TypeScript, Python, C#, Go, and Rust SDKs.

When an SDK becomes Tier 1-compliant, it means that it reached the top of the three tiers, reserved for SDKs with the highest level of feature support, responsiveness to bugs and security issues, and alignment with MCP ecosystem priorities. If you build MCP servers or clients in Ruby, you can now sleep well knowing that you will get full spec feature support, a 100% conformance pass rate, support for new spec versions by their release date, issue triage within two business days, and critical bug fixes within seven days. This is _especially_ important for developers that are responsible for production-grade services and applications, where being on the bleeding edge of MCP development is critical for the business.

{{< button text="Get the Ruby SDK" url="https://github.com/modelcontextprotocol/ruby-sdk" >}}
{{< button text="Read the documentation" url="https://ruby.sdk.modelcontextprotocol.io" >}}

## Full support for the 2026-07-28 MCP spec

Starting with [version 1.2.0](https://github.com/modelcontextprotocol/ruby-sdk/releases/tag/v1.2.0) of the [`mcp` gem](https://rubygems.org/gems/mcp), the Ruby SDK for MCP fully supports the [2026-07-28 MCP spec](/posts/2026-07-28/), which means that Ruby developers now get access to some highly-anticipated features and capabilities:

- The stateless lifecycle ([SEP-2575](https://modelcontextprotocol.io/seps/2575-stateless-mcp)) is served alongside the classic session handshake, including `server/discover` and the `subscriptions/listen` notification stream
- Multi round-trip requests ([SEP-2322](https://modelcontextprotocol.io/seps/2322-MRTR)) work on both the server and the client, and a built-in shim lets handlers written in the new `input_required` style serve pre-2026 clients unchanged
- Cache hints ([SEP-2549](https://modelcontextprotocol.io/seps/2549-TTL-for-list-results)) are emitted on the modern path, the client sends the standard and custom HTTP request headers ([SEP-2243](https://modelcontextprotocol.io/seps/2243-http-standardization)), and the server checks the standard ones
- Roots, Sampling, and Logging are marked deprecated per [SEP-2577](https://modelcontextprotocol.io/seps/2577-deprecate-roots-sampling-and-logging), and clients connecting with the 2026-07-28 protocol version warn when they declare the Roots or Sampling capabilities

The server serves both lifecycle eras side by side, so current clients keep working while `2026-07-28` clients use the stateless path. See [Protocol Versions](https://ruby.sdk.modelcontextprotocol.io/protocol-versions/) for how the SDK handles each variant of the MCP spec.

Several 1.x releases, starting with 1.2.0, reject input that earlier releases accepted. The SDK's [versioning policy](https://github.com/modelcontextprotocol/ruby-sdk/blob/main/VERSIONING.md) allows such changes to fix spec conformance, security issues, and clear defects - we recommend reading the [changelog](https://github.com/modelcontextprotocol/ruby-sdk/blob/main/CHANGELOG.md) before upgrading an existing 1.x application to make sure that you're ready for any breaking changes.

## The journey to Tier 1

The [Tier 2 assessment](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3127) in July showed that the SDK was already pretty close to the benchmarks we established, meeting eight of the ten Tier 1 requirements. Two things were left, however: the **documentation didn't cover every feature** yet, and there was **no agreed timeline for supporting new versions of the spec**. Since then, we made a few changes to put us on a more robust track to conformance:

- Every implemented feature is documented in detail, with accompanying examples, from non-text content types through elicitation options to the full OAuth client flow. With [version 1.3.0](https://github.com/modelcontextprotocol/ruby-sdk/releases/tag/v1.3.0), this documentation moved from a simple in-repo `README.md` file to a revamped [documentation site](https://ruby.sdk.modelcontextprotocol.io). We're very excited to see developers lean on this resource as the go-to page for all things Ruby MCP SDK.
- The SDK passes 100% of the scored server and client conformance scenarios for both the `2025-11-25` and `2026-07-28` requirement sets, measured with the standard [MCP conformance suite](https://github.com/modelcontextprotocol/conformance)'s frozen scoring for each spec version.
- The repository maintained a 100% issue triage rate within the Tier 1 window, with no P0 issues filed. If you report an issue, we're going to look at it as soon as possible.

If you are curious about the full evidence tables for standards conformance, including repro steps for the conformance results, you can refer to our [Tier 1 assessment](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3247).

And as the specification evolves, the Ruby SDK team has committed to supporting the next MCP spec, targeted for [late March 2027](https://modelcontextprotocol.io/seps/3398-release-cycle-updates), by its release date. The SDK [roadmap](https://github.com/modelcontextprotocol/ruby-sdk/blob/main/ROADMAP.md) covers all other planned features and extensions, including the newly-introduced [tasks extension](https://modelcontextprotocol.io/seps/2663-tasks-extension).

If you haven't noticed yet, the road here was short but quite steep: the SDK was initially assessed at [Tier 3](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2340) in March 2026, reached [Tier 2](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3127) with the 1.0 release in July, and applied for Tier 1 in August. It was confirmed at Tier 1 in September - in under seven months, server conformance went from 25 of 30 scenarios to every scored scenario, client conformance went from untested to 100%, and documented features went from 22 of 48 to 46. This was only possible thanks to our SDK maintainers and a community of Ruby developers who helped us with input and feedback along the way!

Oh, and if you're counting the features we haven't documented - the two that remain are the legacy SSE transport, which the SDK intentionally does not implement, as it was deprecated.

![Ruby SDK results at the Tier 3 (March 2026, v0.8.0), Tier 2 (July 2026, v1.0.0), and Tier 1 (August 2026, v1.2.0) assessments, drawn as a rough stone, a cut stone, and a polished ruby. Server conformance: 25 of 30, 30 of 30, 67 of 67. Client conformance: not tested, 24 of 24, 50 of 50. Features documented: 22, 34, and 46 of 48.](/posts/images/ruby-sdk-tier-1/tier-progress.svg)

## Get started

To get started, add the gem to your application:

```bash
bundle add mcp
```

Alternatively, you can install it on its own with `gem install mcp`.

To upgrade an existing application, set the constraint in your Gemfile and run `bundle update mcp`:

```ruby
gem 'mcp', '~> 1.8'
```

If you are already running a 1.x server, upgrading lets it serve `2026-07-28` clients alongside existing ones. See the [Ruby SDK documentation](https://ruby.sdk.modelcontextprotocol.io) for guides on building servers and clients, including Rails integration, and the [1.0 announcement](/posts/ruby-sdk-1-0/) for a walkthrough of the basics.

## Give us your feedback

If you run into _any_ problems or unexpected behavior while using the SDK, please report them in our [issue tracker](https://github.com/modelcontextprotocol/ruby-sdk/issues).

## Acknowledgements

The Ruby SDK is maintained by [Topher Bullock](https://github.com/topherbullock), [Koichi Ito](https://github.com/koic), [Ateş Göral](https://github.com/atesgoral), and [Jonathan Hefner](https://github.com/jonathanhefner) together with the broader Ruby community. Thank you to everyone for the feedback and contributions on the road from Tier 3 to Tier 1! We could not have done this without you.

Special thanks to [Felix Weinberger](https://github.com/felixweinberger) and [Paul Carleton](https://github.com/pcarleton) for their review and independent verification of the Tier 1 assessment, and to [Den Delimarsky](https://github.com/localden) for the final review.
