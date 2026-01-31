# SEP-2076: Agent Skills as a First-Class MCP Primitive

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-01-13
- **Author(s)**: Yu Yi <yiyu@google.com> (@erain)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2076

## Abstract

This SEP proposes adding Agent Skills as a first-class, discoverable primitive in MCP. A skill is a named bundle of instructions plus references to tools, prompts, and resources that together teach an agent how to perform a domain-specific workflow. The proposal introduces new protocol methods, `skills/list` and `skills/get`, a `skills` server capability, and a `notifications/skills/list_changed` notification. The design emphasizes progressive disclosure: clients can load only skill summaries at startup and fetch full instructions and supporting files on demand. This bridges today's fragmented skill ecosystems by allowing existing MCP servers to publish standardized skill manifests without changing their tool APIs. The intent is to make skills portable across clients and vendors, while preserving MCP's minimal core and safety boundaries.

## Motivation

Agent skills are quickly becoming the de facto way to specialize general-purpose coding agents. Tools like Codex, Gemini CLI, and others ship skill systems, but each uses its own proprietary format and distribution mechanism. MCP, meanwhile, provides tools, prompts, and resources but has no standard way to package those primitives into reusable expertise. This creates several problems:

- **Fragmented skill distribution**: vendors ship incompatible skill formats, forcing users and teams to maintain parallel skill libraries.
- **Low reuse across MCP servers**: the same tool set must be re-documented per client, because there is no protocol-level way to advertise how to use it.
- **Poor discovery and UX**: users cannot easily browse, search, or install skill bundles across servers.
- **Weak portability**: skills authored for one agent or runtime cannot be consumed by another without manual translation.

The skill concept already has successful precedent, including the Agent Skills standard (https://agentskills.io/) and published guidance on progressive disclosure for skill bundles (https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills). MCP should natively support a skill manifest so existing MCP servers can distribute skills to end users in a unified way.

## Specification

### 1. Overview

A **Skill** is a discoverable, named bundle of:

- Instructions (typically markdown)
- Optional supporting files (readable via `resources/read`)
- Dependencies on tools, prompts, or resources provided by the same server

Skills are descriptive only. They do not create new execution semantics beyond existing MCP tools and prompts.

### 2. Capabilities

Servers that expose skills add a `skills` field in `ServerCapabilities`:

```ts
export interface ServerCapabilities {
  // ...
  skills?: {
    /**
     * Whether this server supports notifications for changes to the skills list.
     */
    listChanged?: boolean;
  };
}
```

If `skills` is absent, clients MUST assume the server does not support skill discovery.

### 3. Methods

#### `skills/list`

Client requests a list of skills with pagination.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "skills/list",
  "params": {}
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "skills": [
      {
        "name": "pdf-form-filling",
        "title": "PDF Form Filling",
        "description": "Fill PDF forms using the server's PDF tools.",
        "version": "1.0.0",
        "tags": ["documents", "pdf"],
        "arguments": [
          {
            "name": "document_type",
            "description": "Type of PDF form (e.g., tax, HR, legal).",
            "required": false
          }
        ],
        "dependencies": {
          "tools": ["read_pdf", "write_pdf"],
          "resources": [
            { "type": "ref/resource", "uri": "file:///skills/pdf/forms.md" }
          ]
        }
      }
    ]
  }
}
```

#### `skills/get`

Client requests the full skill definition.

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "skills/get",
  "params": {
    "name": "pdf-form-filling",
    "arguments": { "document_type": "tax" }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "description": "Fill PDF forms using the server's PDF tools.",
    "instructions": "Use read_pdf to inspect form fields before writing. If a form is scanned, call ocr_pdf first...",
    "dependencies": {
      "tools": ["read_pdf", "write_pdf", "ocr_pdf"],
      "resources": [
        { "type": "ref/resource", "uri": "file:///skills/pdf/forms.md" }
      ]
    },
    "files": [
      {
        "name": "forms-reference",
        "title": "Common PDF Form Patterns",
        "uri": "file:///skills/pdf/forms.md",
        "description": "Examples of fillable and scanned form handling.",
        "mimeType": "text/markdown",
        "required": false
      }
    ]
  }
}
```

### 4. Notifications

Servers MAY notify clients of changes to the skill list:

```ts
export interface SkillListChangedNotification extends JSONRPCNotification {
  method: "notifications/skills/list_changed";
  params?: NotificationParams;
}
```

### 5. Data Types

```ts
export interface Skill extends BaseMetadata, Icons {
  description?: string;
  version?: string;
  tags?: string[];
  arguments?: SkillArgument[];
  dependencies?: SkillDependencies;
  _meta?: MetaObject;
}

export interface SkillArgument extends BaseMetadata {
  description?: string;
  required?: boolean;
}

export interface SkillDependencies {
  tools?: string[];
  prompts?: PromptReference[];
  resources?: ResourceTemplateReference[];
}

export interface SkillFile extends BaseMetadata {
  uri: string;
  description?: string;
  mimeType?: string;
  required?: boolean;
  _meta?: MetaObject;
}

export interface GetSkillResult extends Result {
  description?: string;
  instructions: string;
  dependencies?: SkillDependencies;
  files?: SkillFile[];
}
```

### 6. Behavioral Requirements

- Servers advertising `skills` MUST implement `skills/list` and `skills/get`.
- Clients SHOULD treat `skills/list` as the primary discovery mechanism and use pagination for large catalogs.
- `skills/get` MUST return the skill's core instructions as UTF-8 text. Markdown is RECOMMENDED.
- `skills/get` MUST return `-32602` (Invalid params) for unknown skill names or missing required arguments.
- Skill `dependencies.tools` MUST reference tools available via `tools/list` from the same server.
- Skill `dependencies.prompts` MUST reference prompts available via `prompts/list` from the same server.
- Skill `dependencies.resources` MUST reference resources or templates readable via `resources/read`.
- Skill `files` entries MUST be readable via `resources/read`. They MAY be absent from `resources/list`.
- Clients MUST NOT execute code found in skill files automatically. Execution follows existing tool consent and safety policies.

### 7. Mapping to Agent Skills (SKILL.md)

Servers that already expose skills using the Agent Skills standard can map them as follows:

- SKILL.md frontmatter `name` -> `Skill.name`
- SKILL.md frontmatter `description` -> `Skill.description`
- SKILL.md frontmatter optional fields (e.g., `version`, `tags`) -> matching `Skill` fields
- SKILL.md body -> `GetSkillResult.instructions`
- Linked files referenced from SKILL.md -> `GetSkillResult.files`

This allows MCP servers to publish existing skill bundles without altering their internal storage format.

## Rationale

**Why a new primitive instead of reusing prompts?** Prompts are single-shot message templates. Skills are multi-part bundles that define how to use a set of tools over multiple steps and with optional supporting documents. A dedicated skill manifest improves discovery, UI presentation, and interoperability.

**Why list/get?** Progressive disclosure keeps startup lightweight while still enabling full skill detail when needed. This mirrors the established prompts and tools patterns in MCP.

**Why reference resources instead of embedding them?** Large skill bundles can include code, policies, or playbooks. Referencing resources keeps `skills/get` small and reuses MCP's existing resource access controls.

## Backward Compatibility

This proposal is purely additive. Servers that do not implement `skills/*` remain compliant. Clients that do not understand skills will ignore the new capability.

## Security Implications

Skills are untrusted input. Malicious instructions can attempt prompt injection or suggest unsafe tool usage. Clients MUST apply existing trust, consent, and tool authorization policies before executing any action derived from a skill. Resource URIs in skills may reference remote content; clients SHOULD apply allowlists or user approval before fetching or executing code. Skills MUST NOT be treated as an execution mechanism on their own.

## Reference Implementation

None yet. A reference implementation could include:

- A server that maps an on-disk SKILL.md directory to `skills/list` and `skills/get`
- A client UI that lists skills, previews instructions, and loads skill files on demand
- Interop tests that verify skill dependencies resolve to tools/prompts/resources

## Performance Implications

- `skills/list` uses pagination to avoid large payloads.
- `skills/get` returns text instructions and metadata; large attachments are fetched via `resources/read`.

## Testing Plan

- Schema validation for new `skills/*` messages and types
- Golden-file tests for list/get payloads
- Error handling tests for unknown skills and missing arguments
- Compatibility tests mapping an Agent Skills directory to MCP skills

## Alternatives Considered

- **Use prompts only**: lacks dependencies, supporting files, and discovery semantics.
- **Use server instructions only**: provides one global description and cannot represent multiple skills.
- **External-only skill standards**: do not integrate with MCP discovery or tool/resource dependencies.

## Open Questions

- Should MCP adopt a formal on-disk packaging format (e.g., SKILL.md) as part of the spec?
- Should skills support cryptographic signing or provenance metadata for trusted distribution?
- Do we need cross-server skill composition (skills that depend on tools from multiple servers)?
- Should there be an optional `skills/activate` method to signal that a skill is in use?

## Acknowledgments

Thanks to the Agent Skills authors and the MCP community for articulating the need for portable, composable agent expertise. See also https://www.youtube.com/watch?v=CEvIs9y1uog for additional background.
