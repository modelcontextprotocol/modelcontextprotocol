# Contributing to Model Context Protocol

Thank you for your interest in contributing to the Model Context Protocol specification, schemas, or docs!
This document outlines how to contribute to this project.

Also see the [overall MCP communication guidelines in our docs](https://modelcontextprotocol.io/community/communication), which explain how and where discussions about changes happen.

## General prerequisites

The following software is required to work on the spec:

- Node.js 24 or above
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
Discuss the idea with the relevant working or interest group in Discord and link that discussion in
the pull request description, as required by the
[SEP guidelines](https://modelcontextprotocol.io/community/sep-guidelines#step-by-step-process).
Before drafting a proposal, review the [MCP design principles](https://modelcontextprotocol.io/community/design-principles)
— proposals that align with these principles move faster through review.

The shortest summary: explore the problem space and validate that others share the problem,
build a prototype that demonstrates a solution, then write the SEP based on what the
prototype taught you.

## Submitting Changes

1. Push your changes to your fork
2. Submit a pull request to the main repository
3. Follow the pull request template
4. Wait for review

### Pull request titles

Use a Conventional Commit title: `type(scope): description`. The scope is optional;
describe what changes. Allowed types are `sep`, `feat`, `fix`, `docs`, `ci`, `build`,
`chore`, `refactor`, `test`, `perf`, `style`, and `revert`.

| Change                             | Example title                                         |
| ---------------------------------- | ----------------------------------------------------- |
| New SEP, before a PR number exists | `sep: propose task cancellation`                      |
| New or revised SEP, once numbered  | `sep(SEP-3398): clarify task cancellation`            |
| SEP status update                  | `sep(SEP-3398): mark proposal as accepted`            |
| Protocol implementation            | `feat(SEP-3398): add task cancellation`               |
| Schema correction for that SEP     | `fix(SEP-3398): correct the cancellation result type` |
| Documentation correction           | `docs: correct the authorization example`             |
| Generator fix                      | `fix(build): remove obsolete generated SEP pages`     |
| CI change                          | `ci: validate conventional PR titles`                 |
| Dependency update                  | `build(deps-dev): update TypeDoc`                     |
| Blog post                          | `docs(blog): announce the next specification release` |
| Governance change                  | `docs(governance): clarify working group sponsorship` |
| Revert                             | `revert(SEP-3398): revert task cancellation support`  |

Use `SEP-<number>` as the scope for changes tied to a SEP. Keep the original SEP
number in follow-up PRs, and link to the SEP in the PR description. For unrelated
changes, use an area such as `schema` or `ci`, or omit the scope. A new proposal can
start with `sep: ...`; rename the title to `sep(SEP-N): ...` once its PR number is known.
When a `sep` title includes a scope, the check requires `SEP-` followed by a positive
number without leading zeros. For example, `sep(3398): ...` and `sep(schema): ...`
fail; `sep(SEP-3398): ...` passes. Other types can still use area scopes.

Mark breaking changes with `!`, for example `feat(spec)!: remove the legacy transport`,
and explain them in a `BREAKING CHANGE:` paragraph in the PR description. Rename
GitHub's automatically generated revert titles to use `revert`. Protocol versions
remain date-based; these prefixes do not trigger releases.

The `PR title` check validates titles and reruns on edits and new commits, including
for bots and forks. It is advisory during rollout; requiring it and changing merge
settings are separate maintainer steps. Reviewers still check that the title
describes the change and the SEP number is correct. Individual branch commits do
not need to follow the title format or be rewritten.

When squash merging, retain the checked PR title as the commit subject and preserve
the PR description's required disclosures and any `Co-authored-by` trailers in the
commit body. GitHub's suggested squash message can differ, especially for a
single-commit PR, so check it before merging. Generated files are still required
under the existing contribution workflow.

Release automation keeps its existing `Add YYYY-MM-DD MCP specification` title
until title-independent release detection is deployed. After that, release PRs can
use `chore(release): publish YYYY-MM-DD specification`. Do not rename an open
release PR before that prerequisite is in place.

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
