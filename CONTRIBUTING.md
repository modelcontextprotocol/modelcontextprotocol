# Contributing to Model Context Protocol

Thank you for your interest in contributing to the Model Context Protocol (MCP)!
MCP is an open source project that welcomes contributions from the community.
This document outlines how to contribute to the specification, schemas, docs, and SDKs.

Also see the [overall MCP communication guidelines in our docs](https://modelcontextprotocol.io/community/communication), which explains how and where discussions about changes happen.

## Before You Begin

### Prerequisites

Before contributing, ensure you have the following installed and ready:

- **[Git](https://git-scm.com/downloads)** - For cloning repositories and submitting changes
- **[Node.js 20+](https://nodejs.org/)** - Required for building and testing
- **npm** - Comes with Node.js, used for dependency management
- **[GitHub account](https://github.com/signup)** - For submitting pull requests and issues
- **Language-specific tooling** - If contributing to an SDK, you'll need the appropriate
  development environment for that language (e.g., Python, Rust, Go)

Optional tools:

- **nvm** - For managing Node.js versions
- **[Mintlify](https://mintlify.com/)** - For local documentation preview
- **[Hugo](https://gohugo.io/installation/)** - For local blog preview

Verify your setup:

```bash
node --version  # Should be 20.x or higher
npm --version   # Should be 10.x or higher
git --version   # Any recent version
```

### Repository Structure

MCP spans multiple repositories in the
[`modelcontextprotocol`](https://github.com/modelcontextprotocol) organization on GitHub:

| Repository                                                                                                  | Contents                  |
| ----------------------------------------------------------------------------------------------------------- | ------------------------- |
| [`modelcontextprotocol/modelcontextprotocol`](https://github.com/modelcontextprotocol/modelcontextprotocol) | Specification, docs, SEPs |
| [`modelcontextprotocol/typescript-sdk`](https://github.com/modelcontextprotocol/typescript-sdk)             | TypeScript/JavaScript SDK |
| [`modelcontextprotocol/python-sdk`](https://github.com/modelcontextprotocol/python-sdk)                     | Python SDK                |
| [`modelcontextprotocol/go-sdk`](https://github.com/modelcontextprotocol/go-sdk)                             | Go SDK                    |
| [`modelcontextprotocol/java-sdk`](https://github.com/modelcontextprotocol/java-sdk)                         | Java SDK                  |
| [`modelcontextprotocol/kotlin-sdk`](https://github.com/modelcontextprotocol/kotlin-sdk)                     | Kotlin SDK                |
| [`modelcontextprotocol/csharp-sdk`](https://github.com/modelcontextprotocol/csharp-sdk)                     | C# SDK                    |
| [`modelcontextprotocol/swift-sdk`](https://github.com/modelcontextprotocol/swift-sdk)                       | Swift SDK                 |
| [`modelcontextprotocol/rust-sdk`](https://github.com/modelcontextprotocol/rust-sdk)                         | Rust SDK                  |
| [`modelcontextprotocol/ruby-sdk`](https://github.com/modelcontextprotocol/ruby-sdk)                         | Ruby SDK                  |
| [`modelcontextprotocol/php-sdk`](https://github.com/modelcontextprotocol/php-sdk)                           | PHP SDK                   |

Throughout this guide, **specification repository** refers to
`modelcontextprotocol/modelcontextprotocol`, which contains the protocol spec, this documentation
site, and Spec Enhancement Proposals (SEPs).

### Project Roles

MCP follows a [governance model](https://modelcontextprotocol.io/community/governance) with different levels of responsibility:

- **Contributors** - Anyone who files issues, submits PRs, or participates in discussions
- **Maintainers** - Steward specific areas like SDKs, documentation, or Working Groups
- **Core Maintainers** - Guide overall project direction, review SEPs, and oversee the specification

You can find the current list of maintainers in the [`MAINTAINERS.md`](MAINTAINERS.md) file.

## Getting Started

1. [Fork the repository](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo)

2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR-USERNAME/modelcontextprotocol.git
   cd modelcontextprotocol
   ```

3. Install dependencies:

   ```bash
   nvm install  # install correct Node version (optional, if using nvm)
   npm install  # install dependencies
   ```

4. Verify everything works:

   ```bash
   npm run check
   ```

   This runs TypeScript compilation, schema validation, documentation link checks, and formatting checks.

5. Create a new branch:

   ```bash
   git checkout -b fix/your-description
   ```

   Use a descriptive branch name that reflects your change, like `fix/typo-in-tools-doc` or `feat/add-example-for-resources`.

### Finding Something to Work On

1. **Documentation improvements** - Fix typos, unclear explanations, broken links, or incomplete examples
2. **Issues labeled `good first issue`** - Tackle issues tagged in the
   [specification repo](https://github.com/modelcontextprotocol/modelcontextprotocol/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
   as well as our SDK repos
3. **Schema examples** - Add examples to `schema/draft/examples/` to make it easier for developers
   to understand protocol primitives

## Types of Contributions

### Small Changes (Direct PR)

Submit a pull request directly for:

- Bug fixes and typo corrections
- Documentation improvements
- Adding examples to existing features
- Minor schema fixes that don't materially change the specification or SDK behavior
- Test improvements

### Major Changes (SEP Required)

Anything that changes the MCP specification requires following the
[SEP process](https://modelcontextprotocol.io/community/sep-guidelines). This includes:

- New protocol features or API methods
- Breaking changes to existing behavior
- Changes to the message format or schema structure
- New interoperability standards
- Governance or process changes

## Schema Changes

Schema changes go in `schema/draft/schema.ts`. The TypeScript schema is the **source of truth** for the protocol.

1. Edit `schema/draft/schema.ts`

2. Optionally add JSON examples in `schema/draft/examples/[TypeName]/` (e.g., `Tool/my-example.json`). Reference them in the schema using `@example` + `@includeCode` JSDoc tags.

3. Generate JSON schema and docs:

   ```bash
   npm run generate:schema
   ```

   This generates:
   - `schema/draft/schema.json` (JSON schema for validation)
   - `docs/specification/draft/schema.mdx` (Schema Reference documentation)

   Do not edit these generated files directly.

4. Validate your changes:

   ```bash
   npm run check
   ```

## Documentation Changes

Documentation is written in MDX format and in the [`docs`](./docs) directory, powered by [Mintlify](https://mintlify.com/).

- `docs/docs/` - Guides and tutorials for getting started and building with MCP
- `docs/specification/` - Formal protocol specification (versioned by date)

You can preview documentation changes locally by running:

```bash
npm run serve:docs
```

And lint them with:

```bash
npm run check:docs
npm run format
```

### Documentation Guidelines

When contributing to the documentation:

- Keep content clear, concise, and technically accurate
- Follow the existing file structure and naming conventions
- Include code examples where appropriate
- Use proper MDX formatting and components
- Test all links and code samples
  - You may run `npm run check:docs:links` to look for broken internal links.
- Use appropriate headings: "When to use", "Steps", and "Tips" for tutorials
- Place new pages in appropriate sections (concepts, tutorials, etc.)
- Update `docs.json` when adding new pages
- Follow existing file naming conventions (`kebab-case.mdx`)
- Include proper frontmatter in MDX files

## Blog Changes

The blog is built using [Hugo](https://gohugo.io/installation/) and located in the [`blog`](./blog) directory.

To preview blog changes locally:

```bash
npm run serve:blog
```

## Working with SDK Repositories

MCP maintains official SDKs in multiple languages. Each SDK has its own repository, maintainers, and contribution guidelines. Before contributing:

1. **Open an issue first** - Before starting significant work, open an issue to discuss your approach
2. **Join the SDK channel** - Find the relevant channel in [Discord](https://discord.gg/6CSzBmMkjX) (e.g., `#typescript-sdk-dev`, `#python-sdk-dev`)
3. **Read the SDK's CONTRIBUTING.md** - Each repository has its own specific instructions
4. **Write tests** - All contributions should include appropriate test coverage

## Specification Proposal Guidelines

### Principles of MCP

1. **Simple + Minimal**: It is much easier to add things to a specification than it is to
   remove them. To maintain simplicity, we keep a high bar for adding new concepts and
   primitives as each addition requires maintenance and compatibility consideration.
2. **Concrete**: Specification changes need to be based on specific implementation
   challenges and not on speculative ideas.

### Stages of a Specification Proposal

1. **Define**: Explore the problem space, validate that other MCP users face a similar
   issue, and then clearly define the problem.
2. **Prototype**: Build an example solution to the problem and demonstrate its practical
   application.
3. **Write**: Based on the prototype, write a specification proposal following the
   [SEP Guidelines](https://modelcontextprotocol.io/community/sep-guidelines).

### Finding a Sponsor

Every SEP needs a **sponsor** — a Core Maintainer or Maintainer who champions your proposal. To find one:

1. Look at the [maintainer list](MAINTAINERS.md) to find maintainers working in your area
2. Tag 1-2 relevant maintainers in your PR
3. Share your PR in the relevant Discord channel
4. If no response after 2 weeks, ask in `#general` or reach out to a Core Maintainer

SEPs that don't find a sponsor within 6 months are marked as **dormant** but can be revived later.

## What Makes a Good Contribution

| Harder to Review                             | Thoughtful and Impactful                         |
| -------------------------------------------- | ------------------------------------------------ |
| Large PR with unrelated changes              | Focused PR addressing one issue                  |
| Reformatting code without functional changes | Fixing a bug with a clear explanation            |
| Vague commit messages ("fixed stuff")        | Descriptive commits linking to issues            |
| Submitting with failing CI checks            | All CI tests pass before requesting review       |
| Duplicating existing documentation           | Documenting an undocumented feature or edge case |

## Submitting Changes

1. Push your changes to your fork
2. Submit a pull request to the main repository
3. Follow the pull request template
4. Wait for review (maintainers typically respond within 1-5 business days)

## AI Contributions

We welcome the use of AI tools like Claude or ChatGPT to help with your contributions! If you do
use AI assistance, let us know in your pull request or issue — a quick note about how you
used it (drafting docs, generating code, brainstorming, etc.) is all we need.

The key is that you understand and can stand behind your contribution:

- **You get it** - You understand what the changes do and can explain them
- **You know why** - You can articulate why the change is needed
- **You've verified it** - You've tested or validated that it works as intended

## Troubleshooting

### `npm run check` fails

Common causes:

- **Wrong Node.js version** - Ensure you have Node.js 20+
- **Missing dependencies** - Run `npm install` again
- **Schema out of sync** - Run `npm run generate:schema`
- **Formatting issues** - Run `npm run format` to auto-fix

### PR not getting reviewed

1. Ensure all CI checks pass
2. Politely ping the desired reviewer in a comment
3. Ask in the relevant Discord channel
4. For urgent issues, reach out to a Core Maintainer

## Getting Help

- **[Discord](https://discord.gg/6CSzBmMkjX)** - Real-time discussion with contributors and maintainers
- **[GitHub Discussions](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions)** - Feature requests, questions, and proposals
- **[GitHub Issues](https://github.com/modelcontextprotocol/modelcontextprotocol/issues)** - Bug reports and actionable tasks

## Code of Conduct

All contributors must follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT
License.

## Security

Please review our [Security Policy](SECURITY.md) for reporting security issues.
