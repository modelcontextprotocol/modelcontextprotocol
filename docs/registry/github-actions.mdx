---
title: How to Automate Publishing with GitHub Actions
sidebarTitle: GitHub Actions
---

<Note>
  The MCP Registry is currently in preview. Breaking changes or data resets may occur before general availability. If you encounter any issues, please report them on [GitHub](https://github.com/modelcontextprotocol/registry/issues).
</Note>

## Step 1: Create a Workflow File

In your server project directory, create a `.github/workflows/publish-mcp.yml` file. Here is an example for npm-based local server, but the MCP Registry publishing steps are the same for all package types:

The examples pin `mcp-publisher` to a specific release and verify its Sigstore
bundle before extracting it. When upgrading, update `MCP_PUBLISHER_VERSION` to
the intended release tag deliberately; do not switch back to the mutable
`releases/latest` URL.

<CodeGroup>

```yaml OIDC authentication (recommended)
name: Publish to MCP Registry

on:
  push:
    tags: ["v*"] # Triggers on version tags like v1.0.0

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # Required for OIDC authentication
      contents: read
    env:
      MCP_PUBLISHER_VERSION: v1.8.1

    steps:
      - name: Checkout code
        uses: actions/checkout@v5

      ### Publish underlying npm package:

      - name: Set up Node.js
        uses: actions/setup-node@v5
        with:
          node-version: "lts/*"

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test --if-present

      - name: Build package
        run: npm run build --if-present

      - name: Publish package to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      ### Publish MCP server:

      - name: Install cosign
        uses: sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6 # v4.1.2

      - name: Download and verify mcp-publisher
        run: |
          set -euo pipefail
          os="$(uname -s | tr '[:upper:]' '[:lower:]')"
          arch="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"
          archive="mcp-publisher_${os}_${arch}.tar.gz"
          base_url="https://github.com/modelcontextprotocol/registry/releases/download/${MCP_PUBLISHER_VERSION}"

          curl --fail --location --silent --show-error --output "$archive" "$base_url/$archive"
          curl --fail --location --silent --show-error --output "$archive.sigstore.json" "$base_url/$archive.sigstore.json"
          cosign verify-blob \
            --bundle "$archive.sigstore.json" \
            --certificate-identity "https://github.com/modelcontextprotocol/registry/.github/workflows/release.yml@refs/tags/${MCP_PUBLISHER_VERSION}" \
            --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
            "$archive"
          tar xzf "$archive" mcp-publisher
          rm -f "$archive" "$archive.sigstore.json"

      - name: Authenticate to MCP Registry
        run: ./mcp-publisher login github-oidc

      # Optional:
      # - name: Set version in server.json
      #   run: |
      #     VERSION=${GITHUB_REF#refs/tags/v}
      #     jq --arg v "$VERSION" '.version = $v' server.json > server.tmp && mv server.tmp server.json

      - name: Publish server to MCP Registry
        run: ./mcp-publisher publish
```

```yaml PAT authentication
name: Publish to MCP Registry

on:
  push:
    tags: ["v*"] # Triggers on version tags like v1.0.0

jobs:
  publish:
    runs-on: ubuntu-latest
    # Source MCP_GITHUB_TOKEN from a protected Environment, not a plain repo
    # secret, and restrict that environment to your default branch / release
    # tags. See "Securing your registry token in CI" below for why this matters.
    environment: mcp-registry-publish
    permissions:
      contents: read
    env:
      MCP_PUBLISHER_VERSION: v1.8.1

    steps:
      - name: Checkout code
        uses: actions/checkout@v5

      ### Publish underlying npm package:

      - name: Set up Node.js
        uses: actions/setup-node@v5
        with:
          node-version: "lts/*"

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test --if-present

      - name: Build package
        run: npm run build --if-present

      - name: Publish package to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      ### Publish MCP server:

      - name: Install cosign
        uses: sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6 # v4.1.2

      - name: Download and verify mcp-publisher
        run: |
          set -euo pipefail
          os="$(uname -s | tr '[:upper:]' '[:lower:]')"
          arch="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"
          archive="mcp-publisher_${os}_${arch}.tar.gz"
          base_url="https://github.com/modelcontextprotocol/registry/releases/download/${MCP_PUBLISHER_VERSION}"

          curl --fail --location --silent --show-error --output "$archive" "$base_url/$archive"
          curl --fail --location --silent --show-error --output "$archive.sigstore.json" "$base_url/$archive.sigstore.json"
          cosign verify-blob \
            --bundle "$archive.sigstore.json" \
            --certificate-identity "https://github.com/modelcontextprotocol/registry/.github/workflows/release.yml@refs/tags/${MCP_PUBLISHER_VERSION}" \
            --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
            "$archive"
          tar xzf "$archive" mcp-publisher
          rm -f "$archive" "$archive.sigstore.json"

      - name: Authenticate to MCP Registry
        run: ./mcp-publisher login github --token ${{ secrets.MCP_GITHUB_TOKEN }}

      # Optional:
      # - name: Set version in server.json
      #   run: |
      #     VERSION=${GITHUB_REF#refs/tags/v}
      #     jq --arg v "$VERSION" '.version = $v' server.json > server.tmp && mv server.tmp server.json

      - name: Publish server to MCP Registry
        run: ./mcp-publisher publish
```

```yaml DNS authentication
name: Publish to MCP Registry

on:
  push:
    tags: ["v*"] # Triggers on version tags like v1.0.0

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    env:
      MCP_PUBLISHER_VERSION: v1.8.1

    steps:
      - name: Checkout code
        uses: actions/checkout@v5

      ### Publish underlying npm package:

      - name: Set up Node.js
        uses: actions/setup-node@v5
        with:
          node-version: "lts/*"

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test --if-present

      - name: Build package
        run: npm run build --if-present

      - name: Publish package to npm
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      ### Publish MCP server:

      - name: Install cosign
        uses: sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6 # v4.1.2

      - name: Download and verify mcp-publisher
        run: |
          set -euo pipefail
          os="$(uname -s | tr '[:upper:]' '[:lower:]')"
          arch="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"
          archive="mcp-publisher_${os}_${arch}.tar.gz"
          base_url="https://github.com/modelcontextprotocol/registry/releases/download/${MCP_PUBLISHER_VERSION}"

          curl --fail --location --silent --show-error --output "$archive" "$base_url/$archive"
          curl --fail --location --silent --show-error --output "$archive.sigstore.json" "$base_url/$archive.sigstore.json"
          cosign verify-blob \
            --bundle "$archive.sigstore.json" \
            --certificate-identity "https://github.com/modelcontextprotocol/registry/.github/workflows/release.yml@refs/tags/${MCP_PUBLISHER_VERSION}" \
            --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
            "$archive"
          tar xzf "$archive" mcp-publisher
          rm -f "$archive" "$archive.sigstore.json"

      # !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
      # TODO: Replace `example.com` with your domain name
      # !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
      - name: Authenticate to MCP Registry
        run: ./mcp-publisher login dns --domain example.com --private-key ${{ secrets.MCP_PRIVATE_KEY }}

      # Optional:
      # - name: Set version in server.json
      #   run: |
      #     VERSION=${GITHUB_REF#refs/tags/v}
      #     jq --arg v "$VERSION" '.version = $v' server.json > server.tmp && mv server.tmp server.json

      - name: Publish server to MCP Registry
        run: ./mcp-publisher publish
```

</CodeGroup>

## Step 2: Add Secrets

You may need to add a secret depending on which authentication method you choose:

- **GitHub OIDC Authentication**: No dedicated secret necessary.
- **GitHub PAT Authentication**: Add a `MCP_GITHUB_TOKEN` secret with a GitHub Personal Access Token. The registry only needs to read your organization role to confirm you are an **Owner** before granting its namespace, so grant the minimum for that and **no** repository scopes (the registry never reads or writes your code):
  - **Classic PAT**: the `read:org` scope (`read:user` is *not* needed; a bare token still authenticates and publishes to your personal namespace).
  - **Fine-grained PAT**: the **Organization permissions → Members → Read-only** permission (the equivalent of `read:org`). Without it you'll get your personal namespace only. A fine-grained PAT is scoped to one resource owner, so create it for the organization you're publishing to.

  For an **organization** token, store it as an **Environment secret** on the `mcp-registry-publish` environment rather than a plain repository secret — see "Securing your registry token in CI" below for why this matters and how to configure the environment.
- **DNS Authentication**: Add a `MCP_PRIVATE_KEY` secret with your Ed25519 private key.

You may also need to add secrets for your package registry. For example, the workflow above needs an `NPM_TOKEN` secret with your npm token.

For information about how to add secrets to a repository, see [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

### Securing your registry token in CI

Whichever token you use to authenticate, treat it as a high-value credential. When you authenticate to an **organization** namespace, the resulting registry token can publish — and overwrite — **any** server under `io.github.<org>/*`, not just the one in this repository. The relevant question for your threat model is therefore: *who can cause code to run in a job where this secret is exposed?* By default that is **every repository writer** (via branch or tag pushes), not only org Owners — so a plain repo secret quietly widens publish access to everyone with write access.

GitHub gives you the tools to close that gap. We recommend, in increasing order of strength:

1. **Store the token as an [Environment secret](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), not a repository or organization secret.** A job can only read an environment secret when it declares `environment:` (as the PAT example above does). Note that the `environment:` key alone protects nothing: if the environment does not exist yet, GitHub **auto-creates it with no protection rules** on first run, and a job that declares `environment:` still also receives ordinary repository and organization secrets. The protection comes from storing the token *as a secret on that environment* and configuring the environment (steps 2–3 below) — not from the `environment:` key by itself.
2. **Restrict that environment to your default branch and/or release tags** with a [deployment branch rule](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments#deployment-branches-and-tags), and protect that branch with [required pull request reviews](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). Now only reviewed, maintainer-approved code can ever reach the token.
3. **(Strongest) Add a [required reviewer](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments#required-reviewers) to the environment** so each publish pauses for an explicit human approval.

Two pitfalls to avoid regardless of the above:

- **Never publish from a `pull_request_target` workflow that checks out PR-head code.** That trigger runs with your secrets in the base-repo context, so an untrusted fork PR could exfiltrate the token. Environment branch rules do **not** protect you here (the ref is still your base branch) — only required reviewers do.
- **Avoid self-hosted runners for the publish job on public repositories**, where fork PRs may be able to schedule jobs onto them.

By default, pull requests **from forks** receive no secrets and cannot push branches, so external contributors cannot reach the token without one of the misconfigurations above.

## Step 3: Tag and Release

Create and push a version tag to trigger the workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow will run tests, build the package, publish the package to npm, and publish the server to the MCP Registry.

## Troubleshooting

{/* prettier-ignore-start */}

| Error Message | Action |
| --- | --- |
| "Authentication failed" | Ensure `id-token: write` permission is set for OIDC, or check secrets. |
| "invalid audience" | Your `mcp-publisher` binary is too old for this registry deployment. Update `MCP_PUBLISHER_VERSION` to a compatible release and rerun the workflow. |
| "Package validation failed" | Verify your package successfully published to the package registry (e.g., npm, PyPI), and that your package has the [necessary verification information](./package-types). |

{/* prettier-ignore-end */}
