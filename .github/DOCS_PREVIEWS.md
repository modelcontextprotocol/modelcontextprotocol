# Generated documentation previews

`docs-preview.yml` builds docs for same-repository PRs and publishes them to
`docs-pr-<number>`. Mintlify renders that branch, and a PR comment links to the
preview. Updates reuse the branch and URL. Fork and Dependabot PRs are skipped;
`Docs validate` still checks them.

## Enable

Merge the validation and preview workflows before enabling publication.

1. Confirm the Mintlify project can create previews and reads content from `docs/`.
   Add repository variable `MINTLIFY_PROJECT_ID` and secret `MINTLIFY_API_KEY`
   (a Mintlify admin API key).
2. Reserve `docs-pr-*` for automation. Configure rules to allow the publisher to
   create, update, and delete these branches while preventing manual changes.
   Commits append normally; force pushes are unnecessary. Verify the permitted
   identity: `GITHUB_TOKEN` does not automatically bypass rulesets. If it cannot
   satisfy the rules, update the publisher to use an allowed App token before enabling.
3. Set repository variable `DOCS_PREVIEWS_ENABLED` to `true`. Open a test PR or
   push a commit to an existing same-repository PR.
4. Check the generated pages and assets, update the PR, then close it and verify
   branch cleanup. Confirm forks skip publication and failed builds do not publish.

The first job generates and validates the docs, then commits them to the preview
branch. It has repository write permission, with Git credentials supplied to the
commit step. The second job calls the
[Mintlify preview API](https://www.mintlify.com/docs/api/preview/trigger) for that
branch and posts the link. Only the deployment job receives the Mintlify key;
it needs no checkout or artifact download. New PR events cancel any in-progress
preview run. Staging and production connections stay unchanged.

## Cleanup and recovery

Closing or merging a PR deletes its generated branch. Mintlify does not document
a preview-deletion API, so remove remaining hosted previews from the Mintlify
dashboard. Do not assume branch deletion removes an API-created preview; see
[preview lifetime](https://www.mintlify.com/docs/deploy/preview-deployments#preview-lifetime).

Rerun the latest workflow to retry. Manual reruns use the original run’s revision.
Disable new previews by setting `DOCS_PREVIEWS_ENABLED` to `false`; this also stops
automatic branch cleanup. Delete remaining preview branches and hosted previews
manually if needed. Build errors preserve the last published preview; deployment
errors appear in the workflow or Mintlify dashboard.
