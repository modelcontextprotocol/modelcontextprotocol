# SEP: Add Context Headers (Tool, Prompt, Resources) to MCP Requests for Fine-Grained Rate Limiting

## Summary
Currently, MCP requests do not include any relevant headers that identify the tool, prompt, or resource being invoked. Gateways that enforce rate limiting traditionally rely on headers for quick policy evaluation because parsing the request body for every call is computationally expensive. In MCP, if rate limiting needs to be applied at the **tool-call level**, it is not feasible without inspecting the body. 

**Proposal:** Introduce new headers in MCP requests to include contextual identifiers such as `tool_name`, `prompt_name`, and `resource_name`. These headers enable gateways to apply fine-grained rate-limiting policies per tool, prompt, or resource efficiently.

---

## Motivation
- **Problem:**  
  - Gateways historically use headers for policy enforcement because headers are lightweight and easy to parse.
  - MCP requests currently lack any header that identifies the tool being called.
  - Applying rate limits per tool, prompt, or resource requires parsing the body, which adds latency and cost.
- **Impact:**  
  - Without these headers, rate limiting can only be applied globally or per endpoint, not per tool, prompt, or resource.
  - This limits flexibility and could lead to unfair throttling or resource exhaustion for high-frequency tools.

---

## Details
- Add new HTTP headers:  
  ```
  MCP-Tool-Name: <tool_name>
  MCP-Prompt-Id: <prompt_name>
  MCP-Resource-Id: <resource_name>
  ```
- These headers will:
  - Be included in every MCP request that invokes a tool, prompt, or resource.
  - Represent the exact identifiers for tool, prompt, and resources as defined in the MCP registry or context metadata.
- Gateways can then:
  - Apply rate-limiting policies per tool, prompt, or resource without parsing the body, regardless of whether the call is for a tool, prompt, or resource.
  - Maintain backward compatibility (requests without this header default to global policy).

---

## Specification
- **Header Names:**
  - `MCP-Tool-Name`: String (case-sensitive), matching the tool identifier in MCP metadata.
  - `MCP-Prompt-Name`: String, representing the prompt identifier.
  - `MCP-Resource-Name`: String, representing the resource identifier.
- **Required:** Yes, for all tool, prompt, and resource invocation requests.
- **Backward Compatibility:**  
  - If header is missing, gateways fall back to global rate limit.
- **Security Considerations:**  
  - Ensure header value is validated against registered tools to prevent spoofing.

---

## Alternatives Considered
- Parsing the body for tool name:
  - Rejected due to performance overhead.
- Embedding tool name in query params:
  - Rejected because MCP uses structured JSON bodies, not query-based calls.

---

## Implementation Steps
1. Update MCP client libraries to include `MCP-Tool-Name`, `MCP-Prompt-Name`, and `MCP-Resource-Name` headers in tool, prompt, and resource invocation requests.
2. Document the new header in MCP protocol specifications.

---

## Benefits
- Enables fine-grained rate limiting per tool, prompt, or resource.
- Reduces computational overhead for gateways.
- Improves scalability and fairness in multi-tool environments.

---

## Drawbacks
- Requires MCP client updates.
- Slight increase in request size (one header).


