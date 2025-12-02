+++
date = '2025-11-28T11:00:00Z'
title = 'SEPs Are Moving to Pull Requests'
author = 'David Soria Parra (Lead Maintainer)'
tags = ['announcement', 'governance', 'community', 'sep']
+++

We're updating how Specification Enhancement Proposals (SEPs) are submitted and managed. Starting today, SEPs will be created as pull requests to the [`seps/` directory](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/seps) instead of GitHub issues.

## Why the Change?

When we [introduced SEPs in July](https://blog.modelcontextprotocol.io/posts/2025-07-31-governance-for-mcp/), we chose GitHub Issues as our starting point. Issues are familiar to developers, low-friction, and got us up and running quickly. But as more proposals have come through the process, we've identified some key pain points:

**Scattered discussions.** With issues, the proposal text lives in the issue body while implementation details often end up in a separate PR. This splits the conversation and makes it harder to follow the full history of a proposal. This also introduces two distinct numbers referencing the same SEP, making it harder to consistently track and manage changes.

**No version history.** Issues don't have the same revision tracking that files in a repository do. When a SEP evolves through review, it's difficult to see what changed and when.

The new PR-based approach, inspired by [Python's PEP process](https://peps.python.org/), solves both problems.

## How It Works

The new workflow will be familiar if you've submitted pull requests on GitHub before:

1. **Draft your SEP** as a markdown file named `0000-your-feature.md` using the [SEP template](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/TEMPLATE.md)

2. **Create a pull request** adding your SEP to the `seps/` directory

3. **Update the SEP number** once your PR is created, rename the file using the PR number (e.g., PR #1850 becomes `1850-your-feature.md`) and push a new commit with the rename

4. **Find a sponsor** from our [maintainer list](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/MAINTAINERS.md) to shepherd your proposal

5. **Iterate** on feedback directly in the PR

That's it. The PR number becomes the SEP number, discussion happens in one place, and git tracks every revision.

## What About Status?

One notable change: **sponsors are now responsible for updating SEP status**. In addition to applying labels to the pull request, the sponsor is responsible for ensuring that the `Status` field is updated in the SEP markdown file. This keeps the canonical state of the proposal in the file itself, versioned alongside the content, while PR labels make it easy to filter and find SEPs by status.

Status transitions work the same as before: `Draft` to `In-Review` to `Accepted` to `Final`, with the sponsor managing each transition as the proposal progresses.

## Getting Started

Ready to propose a change to MCP? Here's what you need to know:

**For new SEPs:**

- Read the latest [SEP Guidelines](https://modelcontextprotocol.io/community/sep-guidelines)
- Use the [SEP template](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/README.md#sep-file-structure) to create your proposal
- Browse existing SEPs in the [`seps/` directory](https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/seps) for examples
- Follow the workflow described above

**For existing SEPs:**
If you have a SEP submitted as a GitHub issue, you can continue with your current workflow. We strongly encourage migrating to the new process for better version control and centralized discussion. To migrate:

1. Create a markdown file using the SEP template, starting with `0000-your-feature.md`
2. Copy and adapt your proposal content to fit the template structure
3. Submit a pull request to the `seps/` directory
4. Rename the file using your new PR number (e.g., PR #1900 becomes `1900-your-feature.md`)
5. Close the original issue with a link to the new PR

The new PR gets a fresh SEP number and gives your proposal proper version control and centralized discussion. Any valuable context from the original issue discussion should be summarized in the new SEP or referenced via links.

As always, if you're unsure whether your idea warrants a SEP, start a conversation on [Discord](https://modelcontextprotocol.io/community/communication#discord) or [GitHub Discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions). We're happy to help you figure out the right path forward.

## Thank You

This change is a direct result of feedback from contributors who've been through the SEP process. Your input helps us continuously improve how we build MCP together. Keep it coming.
