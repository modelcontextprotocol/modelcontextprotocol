# SEP-2278: Supported Modalities for Sampling

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-02-19
- **Author(s)**: Alex Hancock (@alexhancock)
- **Sponsor**: (seeking sponsor)
- **PR**: TBD

## Abstract

This SEP proposes adding an optional `supportedModalities` field to `ClientCapabilities.sampling`, allowing MCP clients to advertise which content types — text, image, or audio — their LLM provider can produce in `sampling/createMessage` responses.

Currently, the MCP specification provides no mechanism for servers to discover a client's supported output modalities before issuing a sampling request. A server may request image generation from a client whose LLM provider only supports text, resulting in a failed request with no opportunity for graceful degradation. Servers cannot adapt their behavior — for example, falling back to a text description when image generation is unavailable.

The proposed `supportedModalities` field is declared once during capability negotiation in the `initialize` handshake. It accepts an array of modality strings (`"text"`, `"image"`, `"audio"`) corresponding to the existing content types in `CreateMessageResult`. When omitted, servers assume text-only support, preserving full backward compatibility with existing clients and servers. The change is purely additive and introduces no breaking changes to the wire protocol.

This capability is particularly valuable for MCP Apps (SEP-1865), where interactive user interfaces need to know upfront whether the Host's LLM provider supports multimodal output so they can adapt their UI accordingly.

## Motivation

The MCP `sampling/createMessage` response (`CreateMessageResult`) can contain `TextContent`, `ImageContent`, or `AudioContent`. However, there is currently no way for a server to know which of these content types the client's LLM provider actually supports before making a request.

This leads to two problems:

1. **Wasted requests**: A server may request a sampling completion expecting an image response, only to have the client's provider fail because it doesn't support image generation.
2. **No graceful adaptation**: Servers cannot adapt their behavior based on available modalities — for example, falling back to a text description instead of requesting an image.

## Specification

### Schema Change

Add an optional `supportedModalities` field to the `sampling` capability in `ClientCapabilities`:

```typescript
interface ClientCapabilities {
  // ... existing fields ...

  sampling?: {
    // ... existing fields (e.g., tools from SEP-1577) ...

    /**
     * Content modalities the client's LLM provider supports in
     * sampling/createMessage responses.
     *
     * If omitted, servers SHOULD assume only "text" is supported.
     */
    supportedModalities?: Array<"text" | "image" | "audio">;
  };
}
```

### JSON Schema Change

In the MCP JSON Schema, the `ClientCapabilities.sampling` object gains a new optional property:

```json
{
  "sampling": {
    "type": "object",
    "properties": {
      "supportedModalities": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["text", "image", "audio"]
        },
        "description": "Content modalities the client's LLM provider supports in sampling/createMessage responses. If omitted, servers SHOULD assume only \"text\" is supported."
      }
    }
  }
}
```

### Behavior

- **Clients** that support sampling SHOULD include `supportedModalities` to indicate which content types their LLM provider can produce.
- **Servers** SHOULD check `supportedModalities` before sending `sampling/createMessage` requests and avoid requesting content types the client does not support.
- If `supportedModalities` is **omitted**, servers SHOULD assume only `"text"` is supported. This preserves backward compatibility — existing clients that don't declare modalities will still work with servers that only need text responses.
- The values correspond to the existing content types in `CreateMessageResult.content`: `TextContent` (`"text"`), `ImageContent` (`"image"`), and `AudioContent` (`"audio"`).

### Example

Client advertises text and image support during `initialize`:

```json
{
  "method": "initialize",
  "params": {
    "capabilities": {
      "sampling": {
        "supportedModalities": ["text", "image"]
      }
    }
  }
}
```

Server checks before requesting a completion:

```typescript
const modalities = clientCapabilities.sampling?.supportedModalities ?? ["text"];

if (modalities.includes("image")) {
  // Request image generation
  const result = await client.createMessage({
    messages: [
      { role: "user", content: { type: "text", text: "Draw a diagram" } },
    ],
    maxTokens: 1024,
  });
} else {
  // Fall back to text description
  const result = await client.createMessage({
    messages: [
      {
        role: "user",
        content: { type: "text", text: "Describe the diagram in text" },
      },
    ],
    maxTokens: 1024,
  });
}
```

## Rationale

### Why a capability field rather than per-request negotiation?

Modality support is a property of the client's LLM provider, not of individual requests. It doesn't change between requests within a session. Declaring it once during capability negotiation is simpler and avoids round-trips.

### Why default to `["text"]` when omitted?

Every LLM provider supports text output. Defaulting to text-only when the field is absent ensures backward compatibility — existing clients work without changes, and existing servers that only use text sampling are unaffected.

## Backward Compatibility

This is a purely additive change:

- **Existing clients** that don't include `supportedModalities` are unaffected. Servers fall back to assuming text-only support.
- **Existing servers** that don't check `supportedModalities` are unaffected. They continue to work as before.
- No existing behavior changes. No breaking changes to the wire protocol.

## Security Implications

This change adds an informational metadata field to capability negotiation and does not introduce new attack surfaces or change the trust model. The `supportedModalities` field is declared by the client and read by the server; a malicious server cannot exploit it since it only describes the client's own capabilities. No authentication, authorization, or data validation changes are required.

## Reference Implementation

- **Rust SDK (branch)**: https://github.com/modelcontextprotocol/rust-sdk/tree/alexhancock/sampling-supported-modalities
- **Goose desktop client (PR)**: https://github.com/block/goose/pull/7039
- **MCP Apps SDK**: https://github.com/modelcontextprotocol/ext-apps (commit `430a8cd`)

The MCP Apps SDK (`@modelcontextprotocol/ext-apps`) uses `supportedModalities` in its `McpUiHostCapabilities.sampling` type, where the Host (an MCP client) forwards its modality support to apps to allow them to adapt their UI based on available output modalities.
