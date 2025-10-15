# Contributing to Model Context Protocol

Thank you for your interest in contributing to the Model Context Protocol specification, schemas, or docs!
This document outlines how to contribute to this project.

Also see the [overall MCP communication guidelines in our docs](https://modelcontextprotocol.io/community/communication), which explains how and where discussions about changes happen.

## General prerequisites

The following software is required to work on the spec:

- Node.js 20 or above
- TypeScript
- TypeScript JSON Schema (for generating JSON schema)
- [Mintlify](https://mintlify.com/) (optional, for docs)
- nvm (optional, for managing Node versions)

### Getting Started

1. [Fork the repository](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo)

2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR-USERNAME/modelcontextprotocol.git
   cd modelcontextprotocol
   ```

3. Install dependencies:

   ```bash
   nvm install  # install correct Node version
   npm install  # install dependencies
   ```

4. Create a new branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

## Schema changes

Schema changes go in `schema/draft/schema.ts`. To validate your changes, run:

```bash
npm run check:schema:ts
```

`schema/draft/schema.json` and `docs/specification/draft/schema.mdx` are generated from `schema/draft/schema.ts`; do not edit them directly. To generate them, run:

```bash
npm run generate:schema
```

## Documentation changes

Documentation is written in MDX format and in the [`docs`](./docs) directory.

You can preview documentation changes locally by running:

```bash
npm run serve:docs
```

And lint them with:

```bash
npm run check:docs
npm run format
```

## Blog changes

The blog is built using [Hugo](https://gohugo.io/installation/) and located in the [`blog`](./blog) directory.

To preview blog changes locally:

```bash
npm run serve:blog
```

## Documentation Guidelines

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

## Specification Proposal Guidelines

### Principles of MCP

1. **Simple + Minimal**: It is much easier to add things to a specification than it is to
   remove them. To maintain simplicity, we keep a high bar for adding new concepts and
   primitives as each addition requires maintenance and compatibility consideration.
2. **Concrete**: Specification changes need to be based on specific implementation
   challenges and not on speculative ideas.

### Stages of a specification proposal

1. **Define**: Explore the problem space, validate that other MCP users face a similar
   issue, and then clearly define the problem.
2. **Prototype**: Build an example solution to the problem and demonstrate its practical
   application.
3. **Write**: Based on the prototype, write a specification proposal.

## Submitting Changes

1. Push your changes to your fork
2. Submit a pull request to the main repository
3. Follow the pull request template
4. Wait for review

## License

By contributing, you agree that your contributions will be licensed under the MIT
License.

## Security

Please review our [Security Policy](SECURITY.md) for reporting security issues.
