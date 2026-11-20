---
title: "Quickstart: Publish an MCP Server to the MCP Registry"
sidebarTitle: "Quickstart: Publish a Server"
---

<Note>
  The MCP Registry is currently in preview. Breaking changes or data resets may occur before general availability. If you encounter any issues, please report them on [GitHub](https://github.com/modelcontextprotocol/registry/issues).
</Note>

This tutorial will show you how to publish an MCP server written in TypeScript to the MCP Registry using the official `mcp-publisher` CLI tool.

<Note>
  If you are publishing a non-npm package (PyPI, NuGet, OCI, MCPB), the overall flow is identical, but the ownership-verification step in [Step 1](#step-1-add-verification-information-to-the-package) is different per package type. See [Package Types](./package-types) for the verification mechanism that applies to your package, then return here and follow the remaining steps.
</Note>

## Remote-only servers

If your MCP server is available only at a public remote endpoint, you can publish its metadata without a package. Skip the Node.js and npm prerequisites and Steps 1–2, then continue with [Step 3](#step-3-install-mcp-publisher). Your `server.json` must include a `remotes` entry and can omit `packages`:

```json server.json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.my-username/weather",
  "title": "Weather",
  "description": "A remote MCP server for weather information.",
  "repository": {
    "url": "https://github.com/my-username/mcp-weather-server",
    "source": "github"
  },
  "version": "1.0.0",
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://weather.example.com/mcp"
    }
  ]
}
```

The remote URL must be publicly accessible. See [Publishing Remote Servers](./remote-servers) for transport, URL variable, and header options.

With any authentication method, the Registry verifies that you control the namespace in `name`; it does not verify that you control the remote URL. See [Ownership Verification](./remote-servers#ownership-verification) for details.

## Prerequisites

- **Node.js** — This tutorial assumes the MCP server is written in TypeScript.
- **npm account (package-based servers only)** — The MCP Registry only hosts metadata, not artifacts. Before publishing a package-based MCP server to the MCP Registry, we will publish the package to npm, so you will need an [npm](https://www.npmjs.com) account.
- **GitHub account** — The MCP Registry supports [multiple authentication methods](./authentication). For simplicity, this tutorial will use GitHub-based authentication, so you will need a [GitHub](https://github.com/) account.

If you do not have an MCP server written in TypeScript, you can copy the `weather-server-typescript` server from the [`modelcontextprotocol/quickstart-resources` repository](https://github.com/modelcontextprotocol/quickstart-resources) to follow along with this tutorial:

```bash
git clone --depth 1 https://github.com/modelcontextprotocol/quickstart-resources.git
cp -r quickstart-resources/weather-server-typescript .
rm -rf quickstart-resources
cd weather-server-typescript
```

And edit `package.json` to reflect your information:

```diff package.json
 {
-  "name": "mcp-quickstart-ts",
-  "version": "1.0.0",
+  "name": "@my-username/mcp-weather-server",
+  "version": "1.0.1",
   "main": "index.js",
```

```diff package.json
   "license": "ISC",
-  "description": "",
+  "repository": {
+    "type": "git",
+    "url": "https://github.com/my-username/mcp-weather-server.git"
+  },
+  "description": "An MCP server for weather information.",
   "devDependencies": {
```

## Step 1: Add verification information to the package

The MCP Registry verifies that a server's underlying package matches its metadata. For npm packages, this requires adding an `mcpName` property to `package.json`:

```diff package.json
 {
   "name": "@my-username/mcp-weather-server",
   "version": "1.0.1",
+  "mcpName": "io.github.my-username/weather",
   "main": "index.js",
```

The value of `mcpName` will be your server's name in the MCP Registry.

Because we will be using GitHub-based authentication, `mcpName` **must** start with `io.github.my-username/`.

## Step 2: Publish the package

The MCP Registry only hosts metadata, not artifacts, so we must publish the package to npm before publishing the server to the MCP Registry.

Ensure the distribution files are built:

```bash
# Install dependencies
npm install

# Build the distribution files
npm run build
```

Then follow npm's [publishing guide](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages). In particular, you will probably need to run the following commands:

```bash
# If necessary, authenticate to npm
npm adduser

# Publish the package
npm publish --access public
```

You can verify your package is published by visiting its npm URL, such as https://www.npmjs.com/package/@my-username/mcp-weather-server.

## Step 3: Install `mcp-publisher`

Install the `mcp-publisher` CLI tool using a pre-built binary or [Homebrew](https://brew.sh):

<CodeGroup>

```bash macOS/Linux
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
```

```powershell Windows
$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }; Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"; tar xf mcp-publisher.tar.gz mcp-publisher.exe; rm mcp-publisher.tar.gz
# Move mcp-publisher.exe to a directory in your PATH
```

```bash Homebrew
brew install mcp-publisher
```

</CodeGroup>

Verify that `mcp-publisher` is correctly installed by running:

```bash
mcp-publisher --help
```

You should see output like:

```text Output
MCP Registry Publisher Tool

Usage:
  mcp-publisher <command> [arguments]

Commands:
  init          Create a server.json file template
  login         Authenticate with the registry
  logout        Clear saved authentication
  publish       Publish server.json to the registry
  status        Update the status of a server version
  validate      Validate server.json without publishing

Use 'mcp-publisher <command> --help' for more information about a command.
```

## Step 4: Create `server.json`

The `mcp-publisher init` command can generate a `server.json` template file with some information derived from your project.

The Registry limits the `description` field to 100 characters. Keep the description focused on what the server does; longer descriptions fail validation.

In your server project directory, run `mcp-publisher init`:

```bash
mcp-publisher init
```

Open the generated `server.json` file, and you should see contents like:

```json server.json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.my-username/weather",
  "description": "An MCP server for weather information.",
  "repository": {
    "url": "https://github.com/my-username/mcp-weather-server",
    "source": "github"
  },
  "version": "1.0.1",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@my-username/mcp-weather-server",
      "version": "1.0.1",
      "transport": {
        "type": "stdio"
      },
      "environmentVariables": [
        {
          "description": "Your API key for the service",
          "isRequired": true,
          "format": "string",
          "isSecret": true,
          "name": "YOUR_API_KEY"
        }
      ]
    }
  ]
}
```

Edit the contents as necessary:

```diff server.json
 {
   "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
   "name": "io.github.my-username/weather",
   "description": "An MCP server for weather information.",
   "repository": {
     "url": "https://github.com/my-username/mcp-weather-server",
     "source": "github"
   },
   "version": "1.0.1",
   "packages": [
     {
       "registryType": "npm",
       "identifier": "@my-username/mcp-weather-server",
       "version": "1.0.1",
       "transport": {
         "type": "stdio"
-      },
-      "environmentVariables": [
-        {
-          "description": "Your API key for the service",
-          "isRequired": true,
-          "format": "string",
-          "isSecret": true,
-          "name": "YOUR_API_KEY"
-        }
-      ]
+      }
     }
   ]
 }
```

The `name` property in `server.json` **must** match the `mcpName` property in `package.json`.

<Note>
  For a [remote-only server](#remote-only-servers), `mcp-publisher init` still generates a `packages` entry. Replace the `packages` array with a `remotes` array, as shown in the remote-only example above.
</Note>

## Step 5: Authenticate with the MCP Registry

For this tutorial, we will authenticate with the MCP Registry using GitHub-based authentication.

Run the `mcp-publisher login` command to initiate authentication:

```bash
mcp-publisher login github
```

You should see output like:

```text Output
Logging in with github...

To authenticate, please:
1. Go to: https://github.com/login/device
2. Enter code: ABCD-1234
3. Authorize this application
Waiting for authorization...
```

Visit the link, follow the prompts, and enter the authorization code that was printed in the terminal (e.g., `ABCD-1234` in the above output). Once complete, go back to the terminal, and you should see output like:

```text Output
Successfully authenticated!
✓ Successfully logged in
```

## Step 6: Publish to the MCP Registry

Finally, publish your server to the MCP Registry using the `mcp-publisher publish` command:

```bash
mcp-publisher publish
```

You should see output like:

```text Output
Publishing to https://registry.modelcontextprotocol.io...
✓ Successfully published
✓ Server io.github.my-username/weather version 1.0.1
```

You can verify that your server is published by searching for it using the MCP Registry API:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.my-username/weather"
```

You should see your server's metadata in the search results JSON:

```text Output
{"servers":[{ ... "name":"io.github.my-username/weather" ... }]}
```

## Troubleshooting

{/* prettier-ignore-start */}

| Error Message | Action |
| --- | --- |
|"Registry validation failed for package"|Ensure your package includes the required ownership-verification marker for its package type. For npm this is `mcpName` in `package.json`; for PyPI and NuGet it is an `mcp-name: <server-name>` line (or HTML comment) in the package README; for other types see [Package Types](./package-types).|
|"Invalid or expired Registry JWT token"|Re-authenticate by running `mcp-publisher login github`.|
|"You do not have permission to publish this server"|Your authentication method doesn't match your server's namespace format. With GitHub auth, your server name must start with `io.github.your-username/`.|

{/* prettier-ignore-end */}

## Next Steps

- Learn about [support for other package types](./package-types).
- Learn about [support for remote servers](./remote-servers).
- Learn how to [use other authentication methods](./authentication), such as [DNS authentication](./authentication#dns-authentication) which enables custom domains for server name prefixes.
- Learn how to [automate publishing with GitHub Actions](./github-actions).
