# Publish generated documentation from main

Every push to `main` runs `docs-publish.yml`. It checks out that exact commit,
generates and validates the documentation, then commits `docs/` to `docs-main`.
Each publication records the source SHA and appends to the branch without a force
push. Failed generation or checks leave the branch unchanged.

Mintlify builds the site from `docs-main` after its Git connection is configured
to use that branch. The workflow's success confirms publication to Git; check
Mintlify for the website deployment result.

## Set up staging

1. Reserve `docs-main` for automation before merging this workflow. Allow the
   publisher to create and update it; prevent manual writes, deletion, and force
   pushes. Verify the permitted identity: `GITHUB_TOKEN` does not automatically
   bypass rulesets. Use an allowed App token if the rules require one.
2. Merge the preview workflow first, then this workflow. Its first push to `main`
   generates `docs-main`. Confirm the publication succeeds.
3. Record staging's current Mintlify Git settings, then change its branch to
   `docs-main`, keeping the documentation directory set to `docs/`. Keep the
   production connection unchanged while verifying staging.
4. Verify schema references, SEP pages, navigation, redirects, images, and skills.
   Confirm another merge updates staging and generated PR previews still work.
   Check where edit/source links point before switching production.

Tracked generated files and the existing SEP workflow remain until production
has moved to generated content.

## Recovery

For a transient failure, rerun the latest `main` publication. Reruns use the
original commit, so rerunning an older job can replace newer published content.
For a content problem, revert the source change on `main` to generate a new
publication. During staging rollout, restore the recorded Mintlify connection
if the new setup fails. Check Mintlify's deployment logs if publication succeeds
but the site does not update.
