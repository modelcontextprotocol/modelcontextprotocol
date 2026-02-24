# SEP-XXXX: Multi Round-Trip Requests (MRTR)

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-02-03
- **Author(s)**: Mark D. Roth (@markdroth), Caitie McCaffrey (@CaitieM20),
  Gabriel Zimmerman (@gjz22)
- **Sponsor**: Caitie McCaffrey (@CaitieM20)
- **PR**: https://github.com/modelcontextprotocol/specification/pull/{NUMBER}

## Abstract
1. We want the protocol to be stateless. This change is a step towards that goal.
2. SEP-2260 clarified that server requests must be associated with a client request.
3. This change provides a more robust mechanism for that association, without relying on protocol sessions or persistent connections to map server-initiated requests back to the original client request.
4. This change provides a mechanism for MCP Servers that cannot support persistent connections via an SSE stream (e.g., due to infrastructure limitations) to still use server-initiated requests like sampling and elicitation.

The key intuition here is that server initiated requests are a special kind of response to a client request — one that doesn't provide a final result, but instead provides instructions for how the client should retry with additional information. Another mental model is to view these as a recoverable error. By modeling them this way, we can eliminate the need for any server-side state or session affinity to link the original request with subsequent interactions.

To support this new paradigm this SEP introudces the following:

1. **`IncompleteResult`**: A new result type returned via
   `JSONRPCIncompleteResultResponse` that signals additional input is needed,
   carrying `inputRequests` and/or opaque `requestState`.
2. **`RequestParams` augmentation**: `inputResponses` and `requestState`
   fields added directly to `RequestParams`, allowing any client-initiated
   request to carry retry context.
3. **Removal of standalone `CreateMessageRequest` / `ElicitRequest`**: These
   server-to-client request types are replaced by `SamplingCreateRequest` and
   `ElicitationCreateRequest` embedded within `InputRequests`.

4. **New data structures**: `InputRequests` / `InputResponses` maps for
   bundling server-initiated requests and client responses, using typed
   `ElicitationCreateRequest | SamplingCreateRequest` and
   `ElicitResult | CreateMessageResult` values respectively.
5. **Two workflows**: An *ephemeral* workflow (stateless retry loop) and a
   *persistent* workflow (leveraging Tasks with `tasks/input_response`).
6. **Removal of `URLElicitationRequiredError`**: Replaced by the
   `IncompleteResult` mechanism.

7. **`GetTaskPayloadResultResponse` union**: Can now return either a completed
   result or a `JSONRPCIncompleteResultResponse` for tasks needing input.


We start with the observation that there are two types of messaging patterns that MCP supports today:
1. **Ephemeral**: No state is accumulated on the server side. These requests are typically short running and inexpensive to execute.
   - If server needs more info to process the request, it can start from
     scratch when it gets that additional info.
   - Examples: weather app, accessing email
2. **Persistent**: State is accumulated on the server side. These requests are typically long-running and/or expensive to execute. `Tasks` was introduced to handle this pattern.
   - Server may generate a large amount of state before requesting more
     info from the client, and it may need to pick up that state to
     continue processing after it receives the info from the client.
   - Server may need to continue processing in the background while
     waiting for more info from the client, in which case server-side
     state is needed to track that ongoing processing.
   - Examples: accessing an agent, spinning up a VM and needing user
     interaction to manipulate the VM

Today many MCP requests are ephemeral, particularly Tools. We need to make it cheap and easy for MCP Servers to implement this pattern without requiring the additional complexity of session state, or server side state.

This SEP introduces Multi Round-Trip Requests (MRTR), a mechanism for
handling server-initiated requests (e.g., elicitation, sampling) within
client-initiated requests (e.g., tool calls) without requiring shared
storage or stateful load balancing. The key changes are:

## Motivation

Server-initiated requests during client-initiated operations (e.g., an
elicitation during a tool call) currently require either a persistent
storage layer shared across server instances or stateful load balancing.
Both approaches are expensive, operationally complex, and fragile — yet
the vast majority of MCP tools are ephemeral and stateless.

Additionally, the current approach depends on SSE streams for delivering
server-initiated requests, which causes problems in environments that
cannot support long-lived connections.

MRTR eliminates these dependencies by ensuring each HTTP request is
self-contained: servers can process any individual request using only the
information present in that request, with no inter-request state required
on the server side.

## Specification

### Data Structures
This SEP introduces a new `JSONRPCResponse` type `JSONRPCIncompleteResultResponse`. When the server determines that more information is needed to process a client request, the server returns this `JSONRPCResponse`.

This new response type includes two new fields: `inputRequests` and `requestState`.
- `inputRequests` is a map of client actions (elicitation, sampling) the server needs to complete the request, keyed by client-chosen identifiers. 
- `requestState` is an opaque string that the server can use to encode any information it needs the client to return on the next request. 

Example `JSONRPCIncompleteResultResponse` with an elicitation input request and request state:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "inputRequests": {
      "github_login": {
        "method": "elicitation/create",
        "params": {
          "message": "Please provide your GitHub username",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "name": { "type": "string" }
            },
            "required": ["name"]
          }
        }
      }
    },
    "requestState": "eyJsb2dpbiI6bnVsbH0..."
  }
}
```



The client provides the requested information on subsequent requests via `inputResponses` & `requestState` fields. 

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "inputResponses": {
    "github_login": {
      "action": "accept",
      "content": {
        "name": "octocat"
      }
    }
  },
  "requestState": "eyJsb2dpbiI6bnVsbH0..."
  // additional request info (e.g., method, params) would go here
}

```

In the schema these are added directly to
`RequestParams`, making them available on any client-initiated request:

```typescript
export interface RequestParams {
  _meta?: RequestMetaObject;
  inputResponses?: InputResponses;
  requestState?: string;
}
```


#### Use Cases for `requestState`
TODO: add some rationale for requestState because we got rid of JSONRPC id linking. 

- **Rolling upgrades**: When a new server version needs different input
  than the old version, `requestState` preserves already-gathered answers
  across rounds without server-side storage.
- **Load shedding**: A server can offload in-progress computation by
  encoding accumulated state in `requestState` (with no `inputRequests`),
  allowing any other instance to resume processing.


### Ephemeral Workflow

This section describes the MRTR workflow for ephemeral interactions that do not require server-side state. The workflow proceeds in rounds:

1. Client sends request (e.g., `tools/call`).
2. Server returns `JSONRPCIncompleteResultResponse` with `inputRequests`
   and/or `requestState`. This terminates the original request.
3. Client fulfills the input requests, then sends a **new, independent**
   request (with a new JSON-RPC `id`) including `inputResponses` and
   echoing back `requestState` in the params.
4. Server returns a complete result, or another `IncompleteResult` for
   additional rounds.

**Server Behavior:**
- Servers MAY respond to any client-initiated request with a
  `JSONRPCIncompleteResultResponse`, sent as a standalone response or as
  the final message on an SSE stream.
- The response MAY include `inputRequests` and/or `requestState`.
- Servers SHOULD encrypt `requestState` (e.g., AES-GCM, signed JWT) to ensure confidentiality, integrity, and user-binding.
- If `requestState` is present on a request, servers MUST validate it on receipt (the client is an untrusted intermediary).

**Client Behavior:**
- If `inputRequests` is present, clients MUST fulfill them before retrying. If absent, clients MAY retry immediately.
- If `requestState` is present, clients MUST echo it back exactly.
  Clients MUST NOT inspect, parse, or modify `requestState`.

For complete examples see
- [Ephemeral Workflow: Basic Flow](#ephemeral-workflow-basic-flow) 
- [Ephemeral Workflow: Multi-Round with requestState](#ephemeral-workflow-multi-round-with-requeststate-azure-devops)

## Persistent Workflow

This section describes the MRTR workflows for interactions that require server-side state, using the Tasks API. The key difference from the ephemeral workflow is that instead of returning `JSONRPCIncompleteResultResponse` directly, the server sets the Task status to `input_required` and includes `inputRequests` in the `tasks/result` response. The client then fulfills the input requests via a new `tasks/input_response` method, allowing the server to resume processing and update the Task status accordingly.

The `JSONRPCIncompleteResultResponse` returned by `tasks/result` in has the same structure as in the ephemeral workflow. However, since `tasks` already have server side state, are likely long running, and more expensive to compute a mechanism to provide the input responses without retrying the initial request is provided via the new method `tasks/input_response`. 

The workflow proceeds as follows, with steps 1-3 ahdering to how `tasks` is implemented today, and steps 4-6 illustrating the new MRTR mechanism for eliciting & providing additional input: 

1. Server sets Task status to `input_required` and MAY pause processing.
2. Client polls `tasks/get`, sees `input_required` status.
3. Client calls `tasks/result` to discover what input is needed.
4. Server returns `JSONRPCIncompleteResultResponse` with `inputRequests`.
5. Client calls `tasks/input_response` with `InputResponses` and task metadata.
6. Server sets Task status to `working`, and continues with request processing.

The client delivers input responses via the `tasks/input_response` method:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tasks/input_response",
  "params": {
    "inputResponses": {
      "echo_input": {
        "action": "accept",
        "content": {
          "input": "Hello World!"
        }
      }
    },
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
      }
    }
  }
}
```

For a completeexample see [Persistent Workflow: Echo Tool with Elicitation](#persistent-workflow-echo-tool-with-elicitation) for a complete example.

**Server Behavior:**
- If Servers set task status to `input_required` they MUST respond to subsequent `tasks/result` calls with `JSONRPCIncompleteResultResponse`. 
- If Servers do not receive the requested information before the ttl expires, they SHOULD set the Task status to `failed` with an appropriate error message.

**Client Behavior:**
- When `tasks/get` shows `input_required`, clients MUST call
  `tasks/result` to get input requests.
- Clients MUST fulfill `input_requests` and then call `tasks/input_response` with the responses and task metadata to allow the server to resume processing without retrying the original request.
- If a client does not wish to fulfill the input requests or cannot it SHOULD call `tasks/cancel` to cancel the Task and free server resources.

### Workflow Transitions

A request may start with the ephemeral workflow and switch to the persistent
workflow by creating a task once it has the information needed to begin
long-running processing. The reverse is not possible — once a task is
created, all subsequent interaction must use the Tasks API.

### Error Handling

The server MUST validate that `inputResponses` is well-formed and
parseable. Protocol errors (malformed JSON, invalid schema) return a
`JSONRPCErrorResponse`.

If the data is well-formed but unexpected or incomplete, the server MUST
treat values as optional: ignore unexpected keys, and if required
information is missing, respond with a new `IncompleteResult` requesting
the needed information again. This approach leverages the existing retry
mechanics of the ephemeral workflow and the Task state machine to ensure
clients can always recover.

## Rationale

- **Map vs. single object for input requests**: A map structurally
  guarantees unique keys, avoiding the need for explicit conflict checks
  in SDKs and applications.
- **Bidirectional streams rejected**: Would have required HTTP/2 or
  HTTP/3, would not have solved long-lived connection problems, and would
  not have addressed fault tolerance.
- **Separate `tasks/get` and `tasks/result`**: Keeps task status polling
  at consistent latency, independent of the actual task state. The extra
  round-trip can be optimized in the future if needed.
- **Direct values in `InputResponses` (no `{ "result": ... }` wrapper)**:
  `InputRequests` maps keys directly to `InputRequest` objects without a
  wrapper, so `InputResponses` mirrors that symmetry. The wrapper would
  add nesting with no additional information.

## Backward Compatibility

Existing tools that use the inline async pattern with SSE streams:

```python
def my_tool():
  do_mutation1()
  await elicit_more_info()
  do_mutation2()
```

Should be rewritten to use the MRTR pattern:

```python
def my_tool(request):
  github_login = request.inputResponses().get('github_login', None)
  if github_login is None:
    return IncompleteResponse({'github_login': elicitation_request})
  result = GetResult(github_login)
  return Result(result)
```

SDKs should provide a backward compatibility layer to support existing
tool implementations during the transition.

## Security Implications

Because `requestState` passes through the client (an untrusted
intermediary), servers MUST:

- Validate all state received from the client.
- Encrypt `requestState` (e.g., AES-GCM, signed JWT) if it contains
  sensitive data, to ensure confidentiality and integrity.
- Cryptographically bind `requestState` to the authenticated user if it
  contains user-specific data, to prevent replay/hijacking attacks.
- Treat plaintext state as untrusted input and validate it the same way
  as any client-supplied data.

## Reference Implementation

- Schema types are defined in [`schema/draft/schema.ts`](../schema/draft/schema.ts)
  under the "Multi Round-Trip" category.
- Example JSON files for each type are in
  [`schema/draft/examples/`](../schema/draft/examples/) (e.g.,
  `InputRequests/`, `InputResponses/`, `IncompleteResult/`,
  `TaskInputResponseRequest/`, `GetTaskPayloadResultResponse/`).

---

## Additional Examples

### Ephemeral Workflow: Basic Flow

#### Step 1 — Client sends initial tool call

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "location": "New York"
    }
  }
}
```

#### Step 2 — Server returns IncompleteResult with elicitation request

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "inputRequests": {
      "github_login": {
        "method": "elicitation/create",
        "params": {
          "message": "Please provide your GitHub username",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "name": { "type": "string" }
            },
            "required": ["name"]
          }
        }
      }
    },
    "requestState": "foo"
  }
}
```

#### Step 3 — Client retries with inputResponses and requestState

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "location": "New York"
    },
    "inputResponses": {
      "github_login": {
        "action": "accept",
        "content": {
          "name": "octocat"
        }
      }
    },
    "requestState": "foo"
  }
}
```

#### Step 4 — Server returns final result

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Current weather in New York:\nTemperature: 72°F\nConditions: Partly cloudy"
      }
    ],
    "isError": false
  }
}
```

### Ephemeral Workflow: Multi-Round with requestState (Azure DevOps)

This example demonstrates iterative elicitation driven by Azure DevOps
custom rules. An `update_work_item` tool resolves Bug #4522. Rule 1
requires a "Resolution" field; Rule 2 (triggered when Resolution =
"Duplicate") requires a "Duplicate Of" link.

#### Round 1 — Client invokes tool

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "update_work_item",
    "arguments": {
      "workItemId": 4522,
      "fields": { "System.State": "Resolved" }
    }
  }
}
```

#### Round 1 — Server elicits Resolution

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "inputRequests": {
      "resolution": {
        "method": "elicitation/create",
        "params": {
          "message": "Resolving Bug #4522 requires a resolution. How was this bug resolved?",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "resolution": {
                "type": "string",
                "enum": ["Fixed", "Won't Fix", "Duplicate", "By Design"],
                "description": "Resolution type for this bug"
              }
            },
            "required": ["resolution"]
          }
        }
      }
    }
  }
}
```

#### Round 1 — Client retries with resolution

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "update_work_item",
    "arguments": {
      "workItemId": 4522,
      "fields": { "System.State": "Resolved" }
    },
    "inputResponses": {
      "resolution": {
        "action": "accept",
        "content": { "resolution": "Duplicate" }
      }
    }
  }
}
```

#### Round 2 — Server elicits Duplicate Of, encodes resolution in requestState

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "inputRequests": {
      "duplicate_of": {
        "method": "elicitation/create",
        "params": {
          "message": "Since this is a duplicate, which work item is the original?",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "duplicateOfId": {
                "type": "number",
                "description": "Work item ID of the original bug"
              }
            },
            "required": ["duplicateOfId"]
          }
        }
      }
    },
    "requestState": "eyJyZXNvbHV0aW9uIjoiRHVwbGljYXRlIn0..."
  }
}
```

#### Round 2 — Client retries with duplicate ID and requestState

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "update_work_item",
    "arguments": {
      "workItemId": 4522,
      "fields": { "System.State": "Resolved" }
    },
    "inputResponses": {
      "duplicate_of": {
        "action": "accept",
        "content": { "duplicateOfId": 4301 }
      }
    },
    "requestState": "eyJyZXNvbHV0aW9uIjoiRHVwbGljYXRlIn0..."
  }
}
```

#### Final — Server completes update

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Bug #4522 resolved as Duplicate of Bug #4301. State set to Resolved and duplicate link created."
      }
    ],
    "isError": false
  }
}
```

### Persistent Workflow: Echo Tool with Elicitation

Full task lifecycle for an Echo tool that requests input via elicitation.

#### Step 1 — Client invokes tool with task metadata

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "echo",
    "task": {
      "ttl": 60000
    }
  }
}
```

#### Step 2 — Server creates task

```json
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "task": {
      "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5",
      "status": "working",
      "statusMessage": "Task has been created for echo tool invocation.",
      "createdAt": "2026-01-27T03:32:48.3148180Z",
      "lastUpdatedAt": "2026-01-27T03:32:48.3148180Z",
      "ttl": 60000,
      "pollInterval": 100
    }
  }
}
```

#### Step 3 — Client polls task status

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tasks/get",
  "params": {
    "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
  }
}
```

#### Step 4 — Server responds with `input_required`

```json
{
  "id": 2,
  "jsonrpc": "2.0",
  "result": {
    "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5",
    "status": "input_required",
    "statusMessage": "Input Required to Proceed call tasks/result",
    "createdAt": "2026-01-27T03:38:07.7534643Z",
    "lastUpdatedAt": "2026-01-27T03:38:07.7534643Z",
    "ttl": 60000,
    "pollInterval": 100
  }
}
```

#### Step 5 — Client calls `tasks/result`

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tasks/result",
  "params": {
    "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
  }
}
```

#### Step 6 — Server returns inputRequests

```json
{
  "id": 3,
  "jsonrpc": "2.0",
  "result": {
    "inputRequests": {
      "echo_input": {
        "method": "elicitation/create",
        "params": {
          "mode": "form",
          "message": "Please provide the input string to echo back",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "input": { "type": "string" }
            },
            "required": ["input"]
          }
        }
      }
    },
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
      }
    }
  }
}
```

#### Step 7 — Client sends `tasks/input_response`

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tasks/input_response",
  "params": {
    "inputResponses": {
      "echo_input": {
        "action": "accept",
        "content": {
          "input": "Hello World!"
        }
      }
    },
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
      }
    }
  }
}
```

#### Step 8 — Server acknowledges

```json
{
  "id": 4,
  "jsonrpc": "2.0",
  "result": {
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
      }
    }
  }
}
```

#### Step 9 — Client polls, task is completed

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tasks/get",
  "params": {
    "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
  }
}
```

```json
{
  "id": 5,
  "jsonrpc": "2.0",
  "result": {
    "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5",
    "status": "completed",
    "statusMessage": "Task has been completed successfully, call tasks/result",
    "createdAt": "2026-01-27T03:38:07.7534643Z",
    "lastUpdatedAt": "2026-01-27T03:38:08.1234567Z",
    "ttl": 60000,
    "pollInterval": 100
  }
}
```

#### Step 10 — Client retrieves final result

```json
{
  "id": 6,
  "jsonrpc": "2.0",
  "method": "tasks/result",
  "params": {
    "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
  }
}
```

```json
{
  "id": 6,
  "jsonrpc": "2.0",
  "result": {
    "isError": false,
    "content": [
      {
        "type": "text",
        "text": "Echo: Hello World!"
      }
    ],
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
      }
    }
  }
}
```

### Error Handling: Missing or Unexpected inputResponses

#### Ephemeral — Client sends unexpected data

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "location": "New York"
    },
    "inputResponses": {
      "not_requested_info": {
        "action": "accept",
        "content": {
          "not_requested_param_name": "Information the server did not request"
        }
      }
    }
  }
}
```

Server ignores unexpected data and re-issues the original input request:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "inputRequests": {
      "github_login": {
        "method": "elicitation/create",
        "params": {
          "message": "Please provide your GitHub username",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "name": { "type": "string" }
            },
            "required": ["name"]
          }
        }
      }
    }
  }
}
```

#### Persistent — Client sends unexpected data

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tasks/input_response",
  "params": {
    "inputResponses": {
      "echo_input": {
        "action": "accept",
        "content": {
          "not_requested_parameter": "Information the server did not request."
        }
      }
    },
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
      }
    }
  }
}
```

Server acknowledges but leaves Task status as `input_required`. The next
`tasks/result` call returns a new `inputRequest`:

```json
{
  "id": 4,
  "jsonrpc": "2.0",
  "result": {
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "echo_dc792e24-01b5-4c0a-abcb-0559848ca3c5"
      }
    }
  }
}
```

### InputRequests with Multiple Request Types

A server can request both elicitation and sampling in a single response:

```json5
"inputRequests": {
  // Elicitation request.
  "github_login": {
    "method": "elicitation/create",
    "params": {
      "message": "Please provide your GitHub username",
      "requestedSchema": {
        "type": "object",
        "properties": {
          "name": { "type": "string" }
        },
        "required": ["name"]
      }
    }
  },
  // Sampling request.
  "capital_of_france": {
    "method": "sampling/createMessage",
    "params": {
      "messages": [
        {
          "role": "user",
          "content": {
            "type": "text",
            "text": "What is the capital of France?"
          }
        }
      ],
      "modelPreferences": {
        "hints": [{ "name": "claude-3-sonnet" }],
        "intelligencePriority": 0.8,
        "speedPriority": 0.5
      },
      "systemPrompt": "You are a helpful assistant.",
      "maxTokens": 100
    }
  }
}
```

The paired responses:

```json5
"inputResponses": {
  // Elicitation response (ElicitResult).
  "github_login": {
    "action": "accept",
    "content": {
      "name": "octocat"
    }
  },
  // Sampling response (CreateMessageResult).
  "capital_of_france": {
    "role": "assistant",
    "content": {
      "type": "text",
      "text": "The capital of France is Paris."
    },
    "model": "claude-3-sonnet-20240307",
    "stopReason": "endTurn"
  }
}
```

---

### Acknowledgments

Thanks to Luca Chang (@LucaButBoring) for his valuable input on how to
integrate input requests into Tasks.
