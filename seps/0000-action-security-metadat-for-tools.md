# SEP-XXXX: Action Security Metadata for MCP Tools
**Authors:** Robert Reichel (@rreichel3)
**Status:** Draft

---

## Abstract

This SEP proposes an **Action Security Metadata** schema for MCP tools that allows tool authors to declaratively specify the security, privacy, and impact properties of their actions. These metadata fields describe what kinds of data a tool may accept, where that data may be stored or transmitted, and what real-world consequences invoking the tool may have.

Today, MCP provides limited means to distinguish between read-only tools and tools that send messages, modify data, or publish information externally. As a result, platforms rely on heuristics or model-based inference to determine when a tool invocation is sensitive or requires user consent. This approach does not scale as the MCP ecosystem grows.

By introducing standardized Action Security Metadata, MCP runtimes and clients can enforce deterministic security policies, enable meaningful user consent, prevent data exfiltration, and reduce the risk of prompt-injection-driven attacks. This SEP complements existing proposals that annotate trust and sensitivity on data in transit by adding a declarative contract describing what tools are allowed to do with that data.

---

## Motivation

MCP is increasingly used to power agentic systems that can read, write, send, delete, and publish across user, system, and external boundaries. However, the protocol currently treats all tool calls as equivalent. A tool that reads drafts and a tool that sends emails are indistinguishable at the protocol level, even though their security and privacy implications are radically different.

This forces MCP implementations to infer risk from tool names, descriptions, or model behavior. Such heuristics are brittle and non-deterministic, especially at scale. As the MCP ecosystem grows to thousands of third-party tools, it becomes infeasible to reliably infer intent and impact without explicit developer input.

The lack of declared action semantics creates several concrete risks:

- Prompt injection can trigger destructive or irreversible actions using untrusted input.
- Data exfiltration can occur when sensitive data is passed to tools that transmit data externally.
- User consent cannot be meaningfully enforced without knowing the impact of an action.

To address these issues, MCP needs a standardized way for tool authors to declare what their tools do, what data they handle, and where that data may go.

---

## Specification

This SEP defines a set of metadata fields that MCP tools may declare for both inputs and outputs. These fields form the tool’s **Action Security Contract** and are intended to be consumed by MCP runtimes, clients, and policy engines.

### Tool Input Metadata

Each tool MAY declare the following metadata for its inputs:


```ts
InputMetadata {
  Destination: Ephemeral | System | User | Internal | Public
  Sensitivity: (None | User | PII | Financial | Credentials | Regulated)
  Outcomes: Benign | Consequential | Irreversible
}
```

> [!NOTE]
> These are further defined in the appendix below


### Return Metadata

Each tool MAY declare the following metadata for its outputs:

```ts
ReturnMetadata {
  Source: UntrustedPublic | TrustedPublic | Internal | User | System
  Sensitivity: (None | User | PII | Financial | Credentials | Regulated)
}
```

> [!NOTE]
> These are further defined in the appendix below

---

## Rationale

Existing MCP proposals focus on labeling data with sensitivity, trust, and provenance. While necessary, these labels do not capture what a tool will do with that data.

Action Security Metadata provides a declarative contract that makes enforcement deterministic and auditable. Alternative approaches such as name-based heuristics or model classifiers were considered but rejected due to brittleness and lack of formal guarantees.

This design aligns with ongoing work on runtime trust and sensitivity annotations and is intended to be enforced in conjunction with those systems.

---

## Backward Compatibility

This SEP is backward compatible. Tools that do not declare Action Security Metadata continue to function as they do today, but without the ability to benefit from deterministic enforcement or advanced privacy controls.

---

## Reference Implementation
Below are a few reference implementations that help to illustrate how this might be surfaced:

### Read Email Drafts Action
```jsonc
{
  "name": "read_drafts",
  "description": "Read the user's email drafts.",
  "inputSchema": {
    "type": "object",
    "additionalProperties": false
  },
  "annotations": {
    "inputMetadata": {
      // No input data is provided by the caller
      "Destination": "Ephemeral",

      // Since there is no input, there is no input data
      "Sensitivity": "None",

      // Reading drafts does not change any user or system state
      "Outcomes": "Benign"
    },
    "returnMetadata": {
      // Drafts are user-owned data
      "Source": "User",

      // Drafts contain PII
      "Sensitivity": "PII"
    }
  }
}
```


### List Email Inbox Action
```jsonc

{
  "name": "list_inbox",
  "description": "List recent emails in the user's inbox.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "limit": { "type": "number" }
    },
    "required": [],
    "additionalProperties": false
  },
  "annotations": {
    "inputMetadata": {
      // Inputs are not stored by the MCP server
      "Destination": "Ephemeral",

      // Inbox messages contain PII
      "Sensitivity": "None",

      // Listing messages does not modify anything
      "Outcomes": "Benign"
    },
    "returnMetadata": {
      // Emails may include content from external senders
      "Source": "UntrustedPublic",

      // Emails contain PII (addresses, names, message bodies)
      "Sensitivity": ["PII", "User"]
    }
  }
}
```

### Send Email Action
```jsonc
{
  "name": "send_email",
  "description": "Send an email on behalf of the user.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "to": { "type": "string", "format": "email" },
      "subject": { "type": "string" },
      "body": { "type": "string" }
    },
    "required": ["to", "subject", "body"],
    "additionalProperties": false
  },
  "annotations": {
    "inputMetadata": {
      // Email content and recipients are transmitted to external systems
      "Destination": "Public",

      // Emails include personal data (addresses, content)
      "Sensitivity": ["PII", "User"]

      // Sending an email cannot be undone once delivered
      "Outcomes": "Irreversible"
    },
    "returnMetadata": {
      // The result (e.g., message ID, success) is generated by the system
      "Source": "System",

      // The response does not contain sensitive data
      "Sensitivity": "None"
    }
  }
}
```


###

---

## Security Implications

Action Security Metadata enables MCP runtimes to prevent entire classes of vulnerabilities, including prompt-injection-driven destructive actions and silent data exfiltration. Incorrect or maliciously declared metadata remains a risk and should be mitigated through tool review and auditing.

---

## Appendix: Normative Metadata Definitions

The following definitions are part of the Action Security Metadata contract.

### Destination

Specifies where input data may be stored or transmitted.

- **Ephemeral** — Data received will not be stored in any way.
- **System** — Data is stored by the platform and not accessible to users or developers.
- **User** — Data is stored and visible only to the end user.
- **Internal** — Data is stored and visible to a restricted internal audience.
- **Public** — Data may be transmitted to or stored in publicly accessible systems.

---

### Sensitivity

Classifies the sensitivity of data accepted or returned. Can be a set of these.

- **None** — No sensitive information.
- **User** — User-specific but not sensitive.
- **PII** — Personally identifiable information.
- **Financial** — Financial or transactional data.
- **Credentials** — Secrets, API keys, passwords, or authentication material.
- **Regulated** — Data governed by legal or regulatory requirements.

---

### Outcomes

Describes the real-world impact of invoking the tool.

- **Benign** — No meaningful state change or only reversible drafts.
- **Consequential** — Modifies user or system state in a meaningful way.
- **Irreversible** — Cannot be undone (e.g., sending messages, deleting data, publishing content).

---

### Source

Indicates the origin of returned data.

- **UntrustedPublic** — Public but unverified sources.
- **TrustedPublic** — Public but curated or verified sources.
- **Internal** — Internal systems or datasets.
- **User** — User-provided or user-owned data.
- **System** — Generated or derived by the platform itself.
