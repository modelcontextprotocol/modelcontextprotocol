# Contributing to Model Context Protocol

Thank you for your interest in contributing to the Model Context Protocol specification, schemas, or docs!
This document outlines how to contribute to this project.

Also see the [overall MCP communication guidelines in our docs](https://modelcontextprotocol.io/community/communication), which explain how and where discussions about changes happen.

## General prerequisites

The following software is required to work on the spec:

- Node.js at the version pinned in `.nvmrc`
- TypeScript
- TypeScript JSON Schema (for generating JSON schema)
- [Mintlify](https://mintlify.com/) (installed with the npm dependencies)
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
   npm ci       # install locked dependencies
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

### Schema examples

JSON examples live in `schema/draft/examples/<TypeName>/<example-name>.json`. Each file is validated against the schema type named by its directory, and is pulled into the schema reference through an `@includeCode` tag in `schema.ts`. Adding an example for a type that has none is a useful small contribution; run `npm run check:schema` to validate it.

### Resolving merge conflicts in generated files

If your branch conflicts with `main` in generated files (`schema/*/schema.json`, `docs/specification/*/schema.mdx`, `docs/seps/*.mdx`), do not resolve them by hand. Merge `main`, resolve any conflicts in the source files (e.g. `schema/draft/schema.ts`), then regenerate and commit:

```bash
git merge main
npm run generate
git add .
git commit
```

These files are marked with `-merge` in `.gitattributes`, so git keeps your branch's copy and flags them as conflicted instead of inserting conflict markers.

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

> [!NOTE]
> You can run all schema/documentation
> changes at once with `npm run prep`.

## Blog changes

The blog is built using [Hugo](https://gohugo.io/installation/) and located in the [`blog`](./blog) directory.

To preview blog changes locally:

```bash
npm run serve:blog
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

## Specification Proposal Guidelines

Specification changes follow the [SEP process](https://modelcontextprotocol.io/community/sep-guidelines).
Proposals must be submitted to and discussed in the relevant
[working group](https://modelcontextprotocol.io/community/working-interest-groups).
A SEP pull request may only be opened once that working group has explicitly approved it, and the
pull request description must link that discussion, as required by the
[SEP guidelines](https://modelcontextprotocol.io/community/sep-guidelines#workflow).
Before drafting a proposal, review the [MCP design principles](https://modelcontextprotocol.io/community/design-principles)
— proposals that align with these principles move faster through review.

## Reporting Issues

If you are not a member of the `modelcontextprotocol` GitHub organization, contribute by
opening an issue or by joining a working group. Blank issues are disabled, so use one of the
[issue templates](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/new/choose).
SDK bugs belong in the respective SDK repository.

## Submitting Changes

Only members of the `modelcontextprotocol` GitHub organization may open pull requests. If you
are not a member, see
[Change the specification or docs](https://modelcontextprotocol.io/community/contributing#change-the-specification-or-docs)
for how to get a pull request opened from your branch.

1. Discuss your change with the relevant
   [working group](https://modelcontextprotocol.io/community/working-interest-groups) and get its approval
2. Make sure you are a member of the `modelcontextprotocol` organization; request membership in the
   [access repository](https://github.com/modelcontextprotocol/access)
3. Push your changes to your fork
4. Open a pull request against the main repository and follow the pull request template
5. For SEPs, schedule a review with the Core Maintainers via [voting.modelcontextprotocol.io](https://voting.modelcontextprotocol.io)

### Pull request titles

Use a Conventional Commit title: `type(scope): description`. The scope is optional.
Allowed types are `sep`, `feat`, `fix`, `docs`, `ci`, `build`, `chore`,
`refactor`, `test`, `perf`, `style`, and `revert`.

| Change                    | Example title                                         |
| ------------------------- | ----------------------------------------------------- |
| New SEP, before numbering | `sep: propose task cancellation`                      |
| Numbered SEP              | `sep(SEP-3398): clarify task cancellation`            |
| Fix related to a SEP      | `fix(SEP-3398): correct the cancellation result type` |
| Documentation             | `docs: clarify authorization`                         |
| CI                        | `ci: validate PR titles`                              |

Once a new SEP has a PR number, use `sep(SEP-XXXX): description`, replacing
`XXXX` with that number. Keep the original SEP number for follow-ups and link to
the proposal in the PR description. SEP scopes use positive numbers without leading
zeros. Other changes can use an area scope such as `schema` or omit it.

Mark breaking changes with `!`, for example `feat(spec)!: remove the legacy transport`,
and explain them in a `BREAKING CHANGE:` paragraph in the PR description.

The `PR title` check reruns on title edits and is advisory during rollout.
Individual branch commits do not need this format or rewriting. When squash merging,
use the checked title and preserve disclosures and co-author trailers in the body.

## AI Contributions

If you are using any kind of AI assistance to contribute to Model Context Protocol, it must be
disclosed in the pull request or issue. See [AI_POLICY.md](AI_POLICY.md) for the full policy,
including disclosure expectations and what we look for in AI-assisted contributions.

## License

By contributing, you agree that your code or specification contributions will be
licensed under the Apache License 2.0. Documentation contributions (excluding
specifications) are licensed under CC-BY 4.0. See the [LICENSE](LICENSE) file for
details.

## Security

Please review our [Security Policy](SECURITY.md) for reporting security issues.
