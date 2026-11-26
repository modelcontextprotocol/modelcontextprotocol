---
title: "A More Predictable Release Cycle for MCP"
date: "2026-11-11T09:00:00+00:00"
publishDate: "2026-11-11T09:00:00+00:00"
slug: mcp-release-cycle
description: "We're changing how we plan MCP releases. Luca Chang will join Den Delimarsky and David Soria Parra as a release manager for the next specification cycle."
author:
  - Den Delimarsky (Lead Maintainer)
  - David Soria Parra (Lead Maintainer)
tags:
  - mcp
  - specification
  - community
ShowToc: true
---

We've spent a lot of time over the past two years talking about ways to improve MCP, add new features and capabilities, and get on a more predictable release cadence. Clearly, there has been [no shortage of ideas](https://modelcontextprotocol.io/development/roadmap) both from the maintainer and broader developer community. Getting those ideas reviewed, implemented, tested, and into a release is a whole other part of the job, and we want to make that specific part easier to follow for our community.

For folks working on proposals, that means knowing when reviews will happen and how much time there is to make adjustments. SDK maintainers also need to know when the spec will stop changing - both client and server developers use our developer toolchain as a starting point to try new MCP capabilities out and share feedback. To make this process easier, we're setting up a more consistent timeline for upcoming spec changes so that you don't have to piece a schedule together from meeting notes and GitHub threads.

The Core Maintainers worked through these questions together at MCPCon Europe, and [Kurtis Van Gent](https://github.com/kurtisvg) recently wrote up the process in [SEP-3398: Release Cycle Updates](https://modelcontextprotocol.io/seps/3398-release-cycle-updates) - this is our de facto release guidance moving forward.

As a result of this work, we're moving MCP specification releases to a **regular six-month schedule.**

## Two releases a year

We'll generally publish specification releases on the **last Tuesday of March and September**. Alongside each release date, we'll share the proposal deadlines and SDK beta dates, so you can work backward from them when planning your own implementation and testing.

For the next release, we're targeting **March 30, 2027** - expect MCP version `2027-03-30` to land then.

To keep that schedule predictable, a proposal that isn't ready will move to a later release rather than delay the whole spec. Its authors can keep working on it without having to rush, and everyone else can continue preparing for the release they planned around.

{{< note >}}
This changes how we prepare a release, not MCP messages or version negotiation, so there's nothing you need to change in an existing client or server because of this announcement. Specification versions will continue to use dates.
{{< /note >}}

## Introducing the Release Manager role

Preparing a specification release involves proposal authors, Working Groups, and the maintainers of several SDKs, each with their own work to finish. We need people who can keep track of that work across the project, spot when one team is waiting on another, and help resolve problems before a deadline. That's the job we're formalizing with the Release Manager role.

We'll be working with proposal authors and SDK maintainers throughout the cycle, and **[Luca Chang](https://github.com/LucaButBoring)** will join David and myself as a Release Manager for the next specification cycle.

For those who haven't met Luca yet, he co-authored the [original Tasks proposal](https://modelcontextprotocol.io/seps/1686-tasks), which introduced experimental support for long-running work in the November 2025 specification. He then worked with Caitie McCaffrey on the next iteration of that capability - the [Tasks extension](https://modelcontextprotocol.io/seps/2663-tasks-extension).

Luca also co-leads the [Tasks and Events Working Group](https://modelcontextprotocol.io/community/working-groups/tasks-events) and facilitates the [Agents Interest Group](https://modelcontextprotocol.io/community/interest-groups/agents). That work has earned him the community's trust, and we're looking forward to preparing the next release together.

Luca, welcome aboard!

The three of us will help get proposals into the review queue, help plan and manage the SDK implementation work, and follow up on anything that needs attention before the spec hits the shelves. Our group of Core Maintainers will continue to help decide which proposals are accepted into the next release.

## What happens between releases

Proposal authors need time to develop their ideas and respond to reviews, while SDK maintainers need time to implement and test the accepted changes. That's why planning will start eight calendar months before a regular release. We'll still publish every six months, so planning for the next release will overlap with the final two months of work on the current one.

[![Timeline for specification targets 2027-03-30 and 2027-09-28, showing the two-month overlap between March stabilization and September planning, Tier 1 SDK betas, soft and hard freezes, and the six-month release cadence.](/posts/images/mcp-release-cycle/timeline.png)](/posts/images/mcp-release-cycle/timeline.png)

The upcoming March release is _just a little different_, since some of the planning already concluded earlier in August of this year. For the regular cycles that follow, the schedule will generally be broken down like this:

- **Eight months before release:** planning begins. We gather feedback from maintainers and Working Groups about what to work on and what depends on what.
- **Six months before release:** Core Maintainer reviews begin and run until soft freeze.
- **Two and a half months before release:** soft freeze. Every proposal going into the spec release must be marked Final and merged. Until hard freeze, we will accept existing proposal fixes, polish, and clarifications within their scope. New features or substantial redesigns are not accepted.
- **One and a half months before release:** [Tier 1](https://modelcontextprotocol.io/community/sdk-tiers) SDK betas arrive with support for the frozen specification.
- **One month before release:** hard freeze. Only critical security fixes or fixes for release-blocking correctness or interoperability defects can go into the spec, with approval through a full Core Maintainer vote.
- **Release day:** the specification and release notes go out, with implementation guidance. Tier 1 SDKs need stable support available beforehand. If an SDK is late, we'll document that gap without moving the specification release date.

We believe that a soft freeze will give SDK maintainers a settled set of changes to implement, and the betas will give client and server developers a way to test those implementations together. Hard freeze then leaves the final month for release checks, with only the emergency changes described above allowed into the spec.

Lastly, when SDK betas are available, we'd love for the broader MCP community to try them with the clients and servers they already run. This is a great opportunity to catch any last-minute issues and gives the maintainers time to work through any reported bugs or inconsistencies while corrections can still go into the release.

## Get involved

If you have an idea for improving MCP, we encourage you to bring it to a [Working Group](https://modelcontextprotocol.io/community/working-interest-groups) and help shape it with other contributors. You don't need a finished proposal to join the conversation, and you most certainly don't need to wait for the next release cycle.

When a proposal is ready for formal review, a Working Group or the Core Maintainer group can sponsor it for the [SEP review queue](https://voting.modelcontextprotocol.io/p/seps). You can also contribute by testing SDK prototypes or sharing feedback on proposals already in progress.

Our goal with these changes is to make contributing to MCP and building with it easier to plan around, whether it's part of your job or something you do independently.

If you've been thinking about [contributing to the protocol](https://modelcontextprotocol.io/community/contributing), [come chat with us](https://modelcontextprotocol.io/community/communication) - we'd love your help!
