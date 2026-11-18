---
title: How to Authenticate When Publishing to the Official MCP Registry
sidebarTitle: Authentication
---

<Note>
  The MCP Registry is currently in preview. Breaking changes or data resets may occur before general availability. If you encounter any issues, please report them on [GitHub](https://github.com/modelcontextprotocol/registry/issues).
</Note>

You must authenticate before publishing to the official MCP Registry. The MCP Registry supports different authentication methods. Which authentication method you choose determines the namespace of your server's name.

If you choose GitHub-based authentication, your server's name in `server.json` **MUST** be of the form `io.github.username/*` (or `io.github.orgname/*`). For example, `io.github.alice/weather-server`.

If you choose domain-based authentication, your server's name in `server.json` **MUST** be of the form `com.example.*/*`, where `com.example` is the reverse-DNS form of your domain name. For example, `io.modelcontextprotocol/everything`.

| Authentication | Name Format                                     | Example Name                         |
| -------------- | ----------------------------------------------- | ------------------------------------ |
| GitHub-based   | `io.github.username/*` or `io.github.orgname/*` | `io.github.alice/weather-server`     |
| domain-based   | `com.example.*/*`                               | `io.modelcontextprotocol/everything` |

## GitHub Authentication

GitHub authentication uses an OAuth flow initiated by the `mcp-publisher` CLI tool.

To perform GitHub authentication, navigate to your server project directory and run:

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

### Personal vs. organization namespaces

GitHub authentication always grants your personal namespace, `io.github.<your-username>/*`.

To publish under an **organization** namespace (`io.github.<orgname>/*`), you must be an **Owner** of that organization. Ordinary org membership is no longer sufficient: the registry checks your membership role and only grants the org namespace to admins. This prevents anyone who merely belongs to an org from publishing — or overwriting — servers under the org's name.

<Warning>
  **`mcp-publisher login github` cannot currently publish to an organization namespace.**

  The interactive device flow authenticates against a GitHub App, and GitHub App user tokens cannot read organization memberships — GitHub returns an empty list, so the registry sees no organizations you own and grants only your personal namespace. This affects everyone, regardless of your role in the organization or whether your membership is public. Tracking issue: [#1468](https://github.com/modelcontextprotocol/registry/issues/1468).

  To publish an organization server today, use one of the two paths that can prove your organization role:

  - **[GitHub Actions](./github-actions)** — publishes via OIDC, which is unaffected.
  - **A Personal Access Token** — `mcp-publisher login github --token <YOUR_TOKEN>`, meeting the requirements below.
</Warning>

If you authenticate with a Personal Access Token (in CI, or to work around the limitation above), the token must let the registry read your organization role. A token that can't will still publish to your personal namespace, but org publishing will be silently unavailable. The exact requirement depends on the token type:

- **Classic PAT**: grant the `read:org` scope.
- **Fine-grained PAT**: grant the **Organization permissions → Members → Read-only** permission (the fine-grained equivalent of `read:org`). Without it, GitHub returns no organization membership for the token and you'll get your personal namespace only. Note that a fine-grained PAT is bound to a single resource owner, so it can only see the organization it was created for.

Either way the token needs **no** repository scopes — the registry never reads or writes your code.

## DNS Authentication

DNS authentication is a domain-based authentication method that relies on a DNS TXT record.

<Warning>
  The TXT record must be placed on the **apex** of your domain (e.g. `example.com`), **not** under a selector like `_mcp-auth.example.com` or `_mcp-registry.example.com`. MCP DNS auth follows SPF-style placement (apex), not DKIM-style (selector). If you put the record under a selector, the registry will not see it and authentication will fail with a generic signature error.

  If you rotate keys, also remember to remove the previous TXT record from the apex — a stale record left behind will be tried first and cause verification to fail.
</Warning>

To perform DNS authentication using the `mcp-publisher` CLI tool, run the following commands in your server project directory to generate a TXT record based on a public/private key pair:

<Note>
  The Ed25519 codepath requires **OpenSSL 3.0 or later**. macOS ships with LibreSSL by default (the system `openssl` binary), which does not implement Ed25519 in `genpkey` and fails with `Algorithm Ed25519 not found`. On macOS, install OpenSSL 3 (`brew install openssl@3`) and invoke it explicitly — for example, replace `openssl` with `/opt/homebrew/opt/openssl@3/bin/openssl` (Apple Silicon) or `/usr/local/opt/openssl@3/bin/openssl` (Intel) in the commands below. The ECDSA P-384 codepath works on LibreSSL.
</Note>

<CodeGroup>

```bash Ed25519
MY_DOMAIN="example.com"

# Generate public/private key pair using Ed25519
openssl genpkey -algorithm Ed25519 -out key.pem

# Generate TXT record
PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "${MY_DOMAIN}. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""
```

```bash ECDSA P-384
MY_DOMAIN="example.com"

# Generate public/private key pair using ECDSA P-384
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:secp384r1 -out key.pem

# Generate TXT record
PUBLIC_KEY="$(openssl ec -in key.pem -text -noout -conv_form compressed | grep -A4 "pub:" | tail -n +2 | tr -d ' :\n' | xxd -r -p | base64)"
echo "${MY_DOMAIN}. IN TXT \"v=MCPv1; k=ecdsap384; p=${PUBLIC_KEY}\""
```

```bash Google KMS
MY_DOMAIN="example.com"
MY_PROJECT="myproject"
MY_KEYRING="mykeyring"
MY_KEY_NAME="mykey"

# Log in using gcloud CLI (https://cloud.google.com/sdk/docs/install)
gcloud auth login

# Set default project
gcloud config set project "${MY_PROJECT}"

# Create a keyring in your project
gcloud kms keyrings create "${MY_KEYRING}" --location global

# Create an Ed25519 signing key
gcloud kms keys create "${MY_KEY_NAME}" --default-algorithm=ec-sign-ed25519 --purpose=asymmetric-signing --keyring="${MY_KEYRING}" --location=global

# Enable Application Default Credentials (ADC) so the publisher tool can sign
gcloud auth application-default login

# Attempt login to show the public key
mcp-publisher login dns google-kms --domain="${MY_DOMAIN}" --resource="projects/${MY_PROJECT}/locations/global/keyRings/${MY_KEYRING}/cryptoKeys/${MY_KEY_NAME}/cryptoKeyVersions/1"

# Copy the "Expected proof record":
# ${MY_DOMAIN}. IN TXT "v=MCPv1; k=ed25519; p=${PUBLIC_KEY}"
```

```bash Azure Key Vault
MY_DOMAIN="example.com"
MY_SUBSCRIPTION="subscription name or ID"
MY_RESOURCE_GROUP="MyResourceGroup"
MY_KEY_VAULT="MyKeyVault"
MY_KEY_NAME="MyKey"

# Log in using Azure CLI (https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
az login

# Set default subscription
az account set --subscription "${MY_SUBSCRIPTION}"

# Create a resource group
az group create --location westus --resource-group "${MY_RESOURCE_GROUP}"

# Create a key vault
az keyvault create --name "${MY_KEY_VAULT}" --location westus --resource-group "${MY_RESOURCE_GROUP}"

# Create an ECDSA P-384 signing key
az keyvault key create --name "${MY_KEY_NAME}" --vault-name "${MY_KEY_VAULT}" --curve P-384

# Attempt login to show the public key
mcp-publisher login dns azure-key-vault --domain="${MY_DOMAIN}" --vault "${MY_KEY_VAULT}" --key "${MY_KEY_NAME}"

# Copy the "Expected proof record":
# ${MY_DOMAIN}. IN TXT "v=MCPv1; k=ecdsap384; p=${PUBLIC_KEY}"
```

</CodeGroup>

Then add the TXT record using your DNS provider's control panel. It may take several minutes for the TXT record to propagate. After the TXT record has propagated, log in using the `mcp-publisher login` command:

<CodeGroup>

```bash Ed25519
MY_DOMAIN="example.com"

PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
mcp-publisher login dns --domain "${MY_DOMAIN}" --private-key "${PRIVATE_KEY}"
```

```bash ECDSA P-384
MY_DOMAIN="example.com"

PRIVATE_KEY="$(openssl ec -in key.pem -noout -text | grep -A4 "priv:" | tail -n +2 | tr -d ' :\n')"
mcp-publisher login dns --algorithm ecdsap384 --domain "${MY_DOMAIN}" --private-key "${PRIVATE_KEY}"
```

```bash Google KMS
MY_DOMAIN="example.com"
MY_PROJECT="myproject"
MY_KEYRING="mykeyring"
MY_KEY_NAME="mykey"

mcp-publisher login dns google-kms --domain="${MY_DOMAIN}" --resource="projects/${MY_PROJECT}/locations/global/keyRings/${MY_KEYRING}/cryptoKeys/${MY_KEY_NAME}/cryptoKeyVersions/1"
```

```bash Azure Key Vault
MY_DOMAIN="example.com"
MY_KEY_VAULT="MyKeyVault"
MY_KEY_NAME="MyKey"

mcp-publisher login dns azure-key-vault --domain="${MY_DOMAIN}" --vault "${MY_KEY_VAULT}" --key "${MY_KEY_NAME}"
```

</CodeGroup>

## HTTP Authentication

HTTP authentication is a domain-based authentication method that relies on a `/.well-known/mcp-registry-auth` file hosted on your domain. For example, `https://example.com/.well-known/mcp-registry-auth`.

To perform HTTP authentication using the `mcp-publisher` CLI tool, run the following commands in your server project directory to generate an `mcp-registry-auth` file based on a public/private key pair:

<Note>
  As with DNS authentication, the Ed25519 codepath requires **OpenSSL 3.0 or later**. macOS's system LibreSSL does not support Ed25519 in `genpkey`. See the note in the [DNS Authentication](#dns-authentication) section for the macOS workaround.
</Note>

<CodeGroup>

```bash Ed25519
# Generate public/private key pair using Ed25519
openssl genpkey -algorithm Ed25519 -out key.pem

# Generate mcp-registry-auth file
PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "v=MCPv1; k=ed25519; p=${PUBLIC_KEY}" > mcp-registry-auth
```

```bash ECDSA P-384
# Generate public/private key pair using ECDSA P-384
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:secp384r1 -out key.pem

# Generate mcp-registry-auth file
PUBLIC_KEY="$(openssl ec -in key.pem -text -noout -conv_form compressed | grep -A4 "pub:" | tail -n +2 | tr -d ' :\n' | xxd -r -p | base64)"
echo "v=MCPv1; k=ecdsap384; p=${PUBLIC_KEY}" > mcp-registry-auth
```

```bash Google KMS
MY_DOMAIN="example.com"
MY_PROJECT="myproject"
MY_KEYRING="mykeyring"
MY_KEY_NAME="mykey"

# Log in using gcloud CLI (https://cloud.google.com/sdk/docs/install)
gcloud auth login

# Set default project
gcloud config set project "${MY_PROJECT}"

# Create a keyring in your project
gcloud kms keyrings create "${MY_KEYRING}" --location global

# Create an Ed25519 signing key
gcloud kms keys create "${MY_KEY_NAME}" --default-algorithm=ec-sign-ed25519 --purpose=asymmetric-signing --keyring="${MY_KEYRING}" --location=global

# Enable Application Default Credentials (ADC) so the publisher tool can sign
gcloud auth application-default login

# Attempt login to show the public key
mcp-publisher login http google-kms --domain="${MY_DOMAIN}" --resource="projects/${MY_PROJECT}/locations/global/keyRings/${MY_KEYRING}/cryptoKeys/${MY_KEY_NAME}/cryptoKeyVersions/1"

# Copy the "Expected proof record" to `./mcp-registry-auth`:
# v=MCPv1; k=ed25519; p=${PUBLIC_KEY}
```

```bash Azure Key Vault
MY_DOMAIN="example.com"
MY_SUBSCRIPTION="subscription name or ID"
MY_RESOURCE_GROUP="MyResourceGroup"
MY_KEY_VAULT="MyKeyVault"
MY_KEY_NAME="MyKey"

# Log in using Azure CLI (https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
az login

# Set default subscription
az account set --subscription "${MY_SUBSCRIPTION}"

# Create a resource group
az group create --location westus --resource-group "${MY_RESOURCE_GROUP}"

# Create a key vault
az keyvault create --name "${MY_KEY_VAULT}" --location westus --resource-group "${MY_RESOURCE_GROUP}"

# Create an ECDSA P-384 signing key
az keyvault key create --name "${MY_KEY_NAME}" --vault-name "${MY_KEY_VAULT}" --curve P-384

# Attempt login to show the public key
mcp-publisher login http azure-key-vault --domain="${MY_DOMAIN}" --vault "${MY_KEY_VAULT}" --key "${MY_KEY_NAME}"

# Copy the "Expected proof record" to `./mcp-registry-auth`:
# v=MCPv1; k=ecdsap384; p=${PUBLIC_KEY}
```

</CodeGroup>

Then host the `mcp-registry-auth` file at `/.well-known/mcp-registry-auth` on your domain. After the file is hosted, log in using the `mcp-publisher login` command:

<CodeGroup>

```bash Ed25519
MY_DOMAIN="example.com"
PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
mcp-publisher login http --domain "${MY_DOMAIN}" --private-key "${PRIVATE_KEY}"
```

```bash ECDSA P-384
MY_DOMAIN="example.com"
PRIVATE_KEY="$(openssl ec -in key.pem -noout -text | grep -A4 "priv:" | tail -n +2 | tr -d ' :\n')"
mcp-publisher login http --algorithm ecdsap384 --domain "${MY_DOMAIN}" --private-key "${PRIVATE_KEY}"
```

```bash Google KMS
MY_DOMAIN="example.com"
MY_PROJECT="myproject"
MY_KEYRING="mykeyring"
MY_KEY_NAME="mykey"

mcp-publisher login http google-kms --domain="${MY_DOMAIN}" --resource="projects/${MY_PROJECT}/locations/global/keyRings/${MY_KEYRING}/cryptoKeys/${MY_KEY_NAME}/cryptoKeyVersions/1"
```

```bash Azure Key Vault
MY_DOMAIN="example.com"
MY_KEY_VAULT="MyKeyVault"
MY_KEY_NAME="MyKey"

mcp-publisher login http azure-key-vault --domain="${MY_DOMAIN}" --vault "${MY_KEY_VAULT}" --key "${MY_KEY_NAME}"
```

</CodeGroup>

### Troubleshooting failed HTTP verification

The Registry fetches your verification file from its own infrastructure when you run `mcp-publisher login http`, so a `curl` that succeeds on your machine does not prove that login will work. The Registry itself must be able to reach the endpoint.

<Warning>
  If the Registry cannot use the endpoint, login fails with `token exchange failed with status 401` even though the file is served correctly to every other client.
</Warning>

The fetch is a plain HTTPS request with these properties:

| Property | Requirement |
| --- | --- |
| Request | `GET https://<domain>/.well-known/mcp-registry-auth`, sent with `Accept: text/plain` and `User-Agent: mcp-registry/1.0` |
| Status | `200 OK`. Redirects are not followed, so a `3xx` fails verification |
| Body | the proof record, at most 4096 bytes. Surrounding whitespace is ignored |
| Timeout | 10 seconds for the whole request |
| Origin | the hosted Registry runs on Google Cloud, so the request arrives from Google Cloud addresses rather than a fixed address you can allowlist per request |

Because the request originates from cloud infrastructure rather than a browser on a residential network, the usual causes of failure are edge rules that block it:

- a WAF, bot-management, or "under attack" rule that challenges or blocks non-browser clients
- a geo-block or IP allowlist that excludes Google Cloud address ranges
- an `AAAA` (IPv6) record pointing at an address that is not reachable. Verification fails if none of the domain's public addresses can be reached, even when IPv4 works in a browser
- a `301`/`302` redirect to another host or path, which the Registry does not follow
- `/.well-known/mcp-registry-auth` answering `200 OK` with an HTML error page instead of the proof record

To see what the Registry sees, request the file the same way it does, ideally from a network other than your own:

```bash
curl -sS -o - -w '\n%{http_code}\n' \
  -H 'Accept: text/plain' \
  -A 'mcp-registry/1.0' \
  https://example.com/.well-known/mcp-registry-auth
```

The response body must be the proof record printed by the login command (`v=MCPv1; k=...; p=...`). When the Registry cannot use the endpoint, the login error carries the Registry's own fetch failure, such as `dial tcp <ip>:443: i/o timeout`, `HTTP 403: failed to fetch key from ...`, or `HTTP 301: failed to fetch key from ...`. Allow plain HTTPS clients through for `/.well-known/mcp-registry-auth`, serve the path without redirects, then retry.

Addresses that resolve to loopback, private, link-local, or carrier-grade NAT ranges are refused by design, so the endpoint must be reachable at a public address.

## Troubleshooting DNS and HTTP authentication

If `mcp-publisher login dns` or `login http` fails, check the published proof record before changing keys or retrying. A fetch failure and a signature mismatch have different causes; read the detailed error returned by the Registry.

### Compare the "Expected proof record" against what is actually published

Each login invocation prints an `Expected proof record:` line, for example:

```text Output
Expected proof record:
v=MCPv1; k=ed25519; p=CmELkdW27Q+pySZRD1ezkXAG/SbeDhGWAjtuKKMKixg=
```

Check that the algorithm (`k=`) and public key (`p=`) in the published MCPv1 record match the current login command's output. Rerun the login command after rotating a key so you compare against the freshly derived public key. For HTTP verification, surrounding whitespace and trailing newlines are trimmed; their presence alone does not cause a signature mismatch. Avoid editing or wrapping the public-key data itself.

When a signature does not match, the Registry's error includes fingerprints of the published keys it tried. Compare these with the key you intended to publish to help identify a stale record or a mismatch between the private key and published public key.

### DNS: verify the TXT record before logging in

Confirm an MCPv1 TXT record is published at the exact domain passed to `--domain`, rather than at a selector such as `_mcp-auth.<domain>`:

```bash
dig TXT example.com +short
# Expect a record like:
# "v=MCPv1; k=ed25519; p=CmELkdW27Q+pySZRD1ezkXAG/SbeDhGWAjtuKKMKixg="
```

If no MCPv1 record appears, check the DNS provider's record name and value, then allow for DNS propagation and cached responses after correcting it. If `dig TXT _mcp-auth.example.com +short` returns the proof record but `dig TXT example.com +short` does not, it is published at the wrong name (see the apex warning above).

When the Registry finds a well-formed MCPv1 record at a known wrong selector (`_mcp-auth.<domain>` or `_mcp-registry.<domain>`) but none at the requested domain, it returns a specific error identifying the misplaced record.

The Registry tries all valid published MCP keys; a different key in another TXT record does not take precedence over the correct one. Ensure at least one record contains the public key for the private key used by the login command. Remove retired MCP authentication records when they are no longer needed, while preserving keys still in use and TXT records for other services.

### HTTP: verify the well-known endpoint before logging in

Follow [Troubleshooting failed HTTP verification](#troubleshooting-failed-http-verification) for the exact request, timeout, response-size limit, redirect policy, and network requirements. A successful request from your own machine does not establish that the Registry can reach the endpoint.

### Confirm the algorithm matches the key

The `--algorithm` flag (default `ed25519`) must match the algorithm declared in the published proof record's `k=` field. Signing an Ed25519 timestamp against an `ecdsap384` proof record (or vice versa) fails verification. If you regenerated the keypair with a different algorithm than what is published, update the TXT record or the `mcp-registry-auth` file before retrying.
