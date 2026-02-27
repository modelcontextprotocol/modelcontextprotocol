# SEP-0000: Task Result Streaming and Immediate Result Acceptance

**Status**: Draft
**Type**: Standards Track
**Created**: 2025-11-20
**Author(s)**: He-Pin <hepin.p@alibaba-inc.com> (@He-Pin)

**Sponsor**: TBD
**PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1905

## Abstract

This SEP proposes a task result transmission mechanism that allows clients to accept task results immediately as they
are produced by the server, rather than waiting for the entire task to complete.
This approach aims to reduce latency and improve responsiveness in scenarios where tasks generate results incrementally.

## Motivation

In real-world applications, tasks often produce results in a streaming fashion. For example, data processing tasks may
generate intermediate results that can be consumed as they become available. By enabling immediate result acceptance,
clients can start processing these results sooner, leading to faster overall workflows.

Otherwise, the clients have to wait at least one `pollInterval` to get the results after the task is finished, which may introduce unnecessary delays.

## Specification

### Capability

Server and clients that support this SEP **MUST** indicate their capability during the initial handshake or capability
negotiation phase.

#### Server Capabilities

| Capability              | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `tasks.responses.modes` | Server supports different response modes when responding to task-augmented requests |

```json
{
  "capabilities": {
    "tasks": {
      "responses": {
        "modes": ["task", "immediate", "streaming"]
      }
    }
  }
}
```

- `task`: The server supports traditional task result retrieval, where results are provided after task completion.
- `immediate`: The server supports immediate result responding, **MAY** send the immediately available result to clients when results are ready at request time.
- `streaming`: The server supports streaming of task results, enabling clients to receive results incrementally as they are produced.

### Client Capability

| Capability              | Description                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `tasks.responses.modes` | Client supports different response modes when receiving task-augmented request responses |

```json
{
  "capabilities": {
    "tasks": {
      "responses": {
        "modes": ["task", "immediate", "streaming"]
      }
    }
  }
}
```

- `task`: The client supports traditional task result retrieval, where results are provided after task completion.
- `immediate`: The client supports immediate result acceptance, **MAY** accept immediately available results from servers.
- `streaming`: The client supports streaming of task results, enabling real-time incremental result reception.

### Capability Negotiation

During the capability negotiation phase, both the server and client **MUST** exchange their supported capabilities. When starting a task-augmented request, the client **MUST** specify the supported response modes with `responseModes` in the `task` field of the request parameters.

- The server **MUST** select a response mode from the client's specified `responseModes` list that the server also supports. The server **MUST NOT** use a response mode that is not in the client's specified list, even if the server supports it.
- If there are multiple supported modes, the server **MUST** prioritize them in the following order: `immediate`, `streaming`, `task`.
- If none of the response modes is specified by the requestor, the receiver **MUST** default to `task` mode.
- If the server does not support any of the client's specified response modes, it **MUST** fall back to `task` mode (even if `task` is not in the client's `responseModes` list, as `task` is the default fallback mode) and **SHOULD** include a warning in the response indicating the fallback. The warning **MAY** be included in the `_meta` field of the response (e.g., `_meta["io.modelcontextprotocol/fallback-mode"] = "task"`) or in a `statusMessage` field if a task is created.
- The requestor **MUST** be prepared to handle the response according to the negotiated response mode.

### Task Result Transmission

When a client makes a task-augmented request, the server **MUST** respond according to the negotiated response mode.

**Server Response Decision Process:**

When processing a task-augmented request, the server **MUST** follow this decision process:

1. **Determine the negotiated response mode**:
   - If the client specified `responseModes` in the request, select a mode from that list that the server also supports (prioritizing `immediate` > `streaming` > `task`)
   - If no `responseModes` is specified, default to `task` mode
   - If the server doesn't support any client-specified mode, fall back to `task` mode

2. **Check result availability and respond accordingly**:
   - If the negotiated mode is `immediate` AND complete results are available immediately: **MAY** respond with immediate full result (Case 1)
   - If the negotiated mode is `immediate` but results are not immediately available: The server **MUST** determine whether results will be produced incrementally:
     - If the server can determine (based on the request type, tool characteristics, or implementation knowledge) that results will be produced incrementally, and `streaming` mode is supported by both client and server: **MUST** fall back to `streaming` mode (Case 3)
     - Otherwise: **MUST** fall back to `task` mode (Case 2)
   - If the negotiated mode is `task` OR (negotiated mode is `immediate` but fallback to `task`): **MUST** return `CreateTaskResult` (Case 2)
   - If the negotiated mode is `streaming` AND results are produced incrementally: **MUST** create a task and **MAY** send streaming results (Case 3)

**Request Example:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "New York"
    },
    "task": {
      "ttl": 60000,
      "responseModes": ["immediate", "task", "streaming"]
    }
  }
}
```

#### Case 1: Responding with Immediate Full Result

When the negotiated response mode is `immediate` AND the server has complete results available immediately after processing the request,
it **MAY** respond with the full results directly in the response. In this case:

- The server **MAY** still create a task for tracking purposes, but **MUST** set the task status to `completed` immediately if a task is created.
- The server **MAY** omit the task object in the response if results are provided directly.
- If a task is created, the client **MAY** still call `tasks/result` to retrieve the result, which **MUST** return the same result (using the `content` field format).
- The response **MUST** include the `io.modelcontextprotocol/related-task` metadata in `_meta` if and only if a task was created. If no task is created, the `_meta` field **MAY** be omitted or **MAY** be included without the `related-task` key.
- If results are immediately available but the client did not request `immediate` mode, the server **MUST** follow the negotiated mode (e.g., return a `CreateTaskResult` for `task` mode, or start streaming for `streaming` mode).
- The response **MUST** use the standard `content` field (not `partial-content`) to return the complete results, matching the format of standard tool results.

**Response** (Results already available):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Current weather in New York:\nTemperature: 72°F\nConditions: Partly cloudy"
      },
      {
        "type": "text",
        "text": "Suggested activities:\n- Visit Central Park\n- Explore the Metropolitan Museum of Art"
      },
      {
        "type": "video",
        "text": "Here is a short video overview of New York City attractions.",
        "url": "https://example.com/nyc_overview.mp4"
      }
    ],
    "isError": false,
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840"
      }
    }
  }
}
```

#### Case 2: Responding with Task

When the server does not have results available immediately or the negotiated mode is `task`, it **MUST** return a `CreateTaskResult` as specified in the existing tasks specification. The client **MUST** then use `tasks/get` to poll for status and `tasks/result` to retrieve the final result.

**Response** (Results not yet available):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "task": {
      "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
      "status": "working",
      "statusMessage": "The operation is now in progress.",
      "createdAt": "2025-11-25T10:30:00Z",
      "lastUpdatedAt": "2025-11-25T10:40:00Z",
      "ttl": 60000,
      "pollInterval": 5000
    }
  }
}
```

#### Case 3: Responding with Streaming Results

When the negotiated response mode is `streaming` AND results are produced incrementally, it **MUST** create a task. The server **MAY** then send streaming results through one or more of the following mechanisms:

- **Initial response**: If partial results are immediately available, the server **MAY** include them in the initial response
- **SSE stream**: If using Streamable HTTP transport and an SSE stream is available, the server **MAY** send subsequent segments via SSE as JSON-RPC responses. Note: While SSE streams may also carry JSON-RPC notifications for other purposes (e.g., status updates), streaming task results with `partial-content` **MUST** be sent as JSON-RPC responses (not notifications), as notifications do not have a `result` field.
- **tasks/result calls**: The client **MAY** poll via `tasks/result` to retrieve additional segments
- **Combination**: The server **MAY** use multiple mechanisms simultaneously

**Note**: The choice of mechanism depends on the transport type and server implementation. The client **MUST** be prepared to handle results from any of these mechanisms. All mechanisms for the same task **MUST** maintain consistent `seqNr` ordering.

**SSE Stream Message Format:**

When using SSE stream for streaming results, the server **MUST** send JSON-RPC responses (not notifications) in the SSE stream. Each SSE event's `data` field **MUST** contain a complete JSON-RPC response message. For streaming task results, these responses **MUST** follow the same format as other streaming responses, containing `partial-content` arrays with `seqNr` values in the `result` field.

**Note**: While SSE streams may carry JSON-RPC notifications for other purposes (e.g., task status updates via `notifications/tasks/status`), streaming task results with `partial-content` **MUST** be sent as JSON-RPC responses because:

- JSON-RPC notifications do not have a `result` field
- `partial-content` must be included in the `result` field of a JSON-RPC response
- The `id` field in the response allows correlation with the original request

**Example SSE event for streaming result:**

```
event: message
id: event-123
data: {"jsonrpc":"2.0","id":1,"result":{"partial-content":[{"seqNr":3,"type":"text","text":"Additional segment"}],"isComplete":false,"_meta":{"io.modelcontextprotocol/related-task":{"taskId":"786512e2-9e0d-44bd-8f29-789f320fe840"}}}}
```

The client **MUST** parse each SSE event's `data` field as a JSON-RPC response message and extract `partial-content` segments from the `result` field accordingly. The `jsonrpc` `id` in SSE responses for streaming results **MUST** match the original request `id`.

**Note**: If the client receives JSON-RPC notifications in the SSE stream (e.g., `notifications/tasks/status`), these should be handled separately and do not contain `partial-content`. Only JSON-RPC responses with `result.partial-content` contain streaming segments.

**Client Handling of Multiple Mechanisms:**

When the server uses multiple mechanisms simultaneously (e.g., initial response + SSE stream, or SSE stream + tasks/result), the client **MUST**:

1. **Track received segments**: Maintain a set of received `seqNr` values for each task to detect duplicates
2. **Deduplicate segments**: Ignore any segment with a `seqNr` that has already been received, regardless of which mechanism delivered it
3. **Merge segments**: Combine segments from all mechanisms in `seqNr` order, removing duplicates
4. **Handle gaps**: If gaps in `seqNr` are detected, the client **MAY** use `tasks/result` with `lastSeqNr` to request missing segments

**Important**: The same `seqNr` value **MUST NOT** appear in multiple mechanisms for the same task. If a server sends the same segment through multiple mechanisms, it **MUST** use different `seqNr` values or ensure only one mechanism delivers each segment.

**Initial Response Options:**

The server **MAY** choose one of the following approaches for the initial response:

1. **Return both task and partial-content**: Include both the `task` object (as in `CreateTaskResult`) and `partial-content` in the same response if partial results are immediately available.

   **Example:**

   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "task": {
         "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
         "status": "working",
         "ttl": 60000,
         "pollInterval": 5000
       },
       "partial-content": [
         {
           "seqNr": 1,
           "type": "text",
           "text": "Initial result segment"
         }
       ],
       "isError": false,
       "isComplete": false
     }
   }
   ```

2. **Return only task**: Return a standard `CreateTaskResult` with the `task` object, then send streaming results in subsequent responses (same as Case 2 format).

3. **Return only partial-content**: Return only `partial-content` in the initial response (as shown in the example below), indicating that a task has been created via the `related-task` metadata.

The task status **MUST** remain `working` until `isComplete: true` is sent, after which it **MUST** transition to `completed`.

**Initial Response Example** (Partial results available immediately, task created):

The server may return only `partial-content` in the initial response, with the task ID in `related-task` metadata:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "partial-content": [
      {
        "seqNr": 1,
        "type": "text",
        "text": "Current weather in New York:\nTemperature: 72°F\nConditions: Partly cloudy"
      },
      {
        "seqNr": 2,
        "type": "text",
        "text": "Suggested activities:\n- Visit Central Park\n- Explore the Metropolitan Museum of Art"
      }
    ],
    "isError": false,
    "isComplete": false,
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840"
      }
    }
  }
}
```

**Subsequent Streaming Response** (More partial results):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "partial-content": [
      {
        "seqNr": 3,
        "type": "video",
        "text": "Here is a short video overview of New York City attractions.",
        "url": "https://example.com/nyc_overview.mp4"
      }
    ],
    "isError": false,
    "isComplete": true,
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840"
      }
    }
  }
}
```

To support streaming results, the server **MUST** include the following fields in each streaming response:

- `partial-content`: An array of result segments. Each segment **MUST** be a valid `ContentBlock` (as defined in the MCP specification) with an additional required `seqNr` field. The structure of each segment is the same as items in the `content` array used in standard tool results, but with `seqNr` added to indicate ordering.
- `isComplete`: A boolean indicating whether the task has completed and all results have been sent.

**Note**: The `partial-content` segments have the same structure as `content` items (e.g., `{type: "text", text: "..."}` or `{type: "image", data: "...", mimeType: "..."}`), but each segment **MUST** include a `seqNr` field to indicate its position in the sequence. When combining segments into a final result (e.g., via `tasks/result` without `lastSeqNr`), the `seqNr` fields are removed and segments are merged into a standard `content` array.

**Sequence Number Requirements:**

- All partial contents belonging to the same task **MUST** have unique and monotonically increasing `seqNr` values starting from 1.
- All streaming responses for the same task **MUST** share the same `jsonrpc` `id` for correlation when sent as part of the original request-response flow. However, when using `tasks/result` to resume streaming, the response uses the `id` from the `tasks/result` request (not the original request `id`).
- The `seqNr` **MUST** be monotonically increasing within a task, with no duplicates.
- Gaps in sequence numbers **MAY** indicate missing segments that can be requested via `lastSeqNr`. When resuming with `lastSeqNr`, the server returns segments starting from `lastSeqNr + 1` (i.e., the first segment after the one specified by `lastSeqNr`).
- The `seqNr` **MUST** be a positive integer (1, 2, 3, ...).

**Streaming Behavior:**

- As the transmission of results progresses, the server **MUST** send multiple responses with `partial-content` until the task is complete.
- If the connection is broken, the client **MAY** resume receiving results from the last received `seqNr` using `tasks/result` with `lastSeqNr`.
- The server **MAY** support resuming the streaming from that point.
- **TTL Expiration During Streaming**: If a task's TTL expires while streaming is in progress:
  - The server **MAY** stop sending streaming results and **MAY** delete the task and its partial results
  - If the server continues to send results after TTL expiration, it **MUST** include `isComplete: true` in the next response and transition the task to a terminal status (`completed`, `failed`, or `cancelled`)
  - The client **SHOULD** monitor task status via `tasks/get` to detect TTL expiration and handle it gracefully
  - If the client receives a response indicating the task has been deleted or expired, it **MUST** treat the streaming as incomplete and **MAY** attempt to retrieve any available partial results via `tasks/result` (if the task is still accessible)
- If the task fails during streaming, the server **MUST** send a final response with `isError: true` and **MUST** transition the task to `failed` status. The final response **MUST** follow these format rules:
  - If partial results were successfully generated before the failure, the response **SHOULD** use `partial-content` format and include those partial results (with their `seqNr` values)
  - If no partial results were generated or only an error message is available, the response **SHOULD** use standard `content` format with the error message
  - The `isComplete` field **MUST** be set to `true` in all error responses
  - The `isError` field **MUST** be set to `true` in all error responses
- If the task is cancelled during streaming, the server **MUST** stop sending streaming results and **MUST** transition the task to `cancelled` status. If a final response is sent, it **MUST** have `isComplete: true` and **MAY** include any partial results generated before cancellation.

#### Resuming Streaming

If the client wants to resume streaming from a specific sequence number, it **MUST** include the `lastSeqNr` field in the parameters of the `tasks/result` request.

**Request**:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tasks/result",
  "params": {
    "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840",
    "lastSeqNr": 2
  }
}
```

**Error Handling:**

- If `lastSeqNr` is invalid (e.g., negative, zero, or non-numeric), the server **MUST** return a `-32602` (Invalid params) error. Note: Since `seqNr` values start from 1, `lastSeqNr` of 0 or less is invalid. Valid `lastSeqNr` values are positive integers (1, 2, 3, ...).
- If `lastSeqNr` equals the highest sequence number available:
  - If the task has completed, the server **MUST** return an empty `partial-content` array with `isComplete: true`.
  - If the task is still in progress, the server **MUST** return an empty `partial-content` array with `isComplete: false` (indicating no new segments since that sequence number, but more may come).
- If `lastSeqNr` is greater than the highest sequence number available, the server **MUST** return all remaining segments starting from `lastSeqNr + 1` (which may be an empty array if streaming is complete). For example, if the highest `seqNr` is 5 and `lastSeqNr` is 7, the server **MUST** return an empty `partial-content` array with `isComplete: true`.
- If the server does not support resuming from a specific sequence number, it **MAY** return all segments from the beginning (with `seqNr` starting from 1) or return a `-32603` (Internal error) indicating that resumption is not supported.
- If the task has already completed when `tasks/result` is called with `lastSeqNr`, the server **MUST** return all remaining segments (if any) or an empty `partial-content` array with `isComplete: true`.

**Response** (Resuming from seqNr 2):

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "partial-content": [
      {
        "seqNr": 3,
        "type": "video",
        "url": "https://example.com/nyc_overview.mp4",
        "text": "Here is a short video overview of New York City attractions."
      }
    ],
    "isError": false,
    "isComplete": true,
    "_meta": {
      "io.modelcontextprotocol/related-task": {
        "taskId": "786512e2-9e0d-44bd-8f29-789f320fe840"
      }
    }
  }
}
```

Note: The response `id` (4) matches the request `id` (4), not the original streaming response `id` (1), since this is a new `tasks/result` request.

## Relationship to Existing Tasks Specification

This SEP extends the existing tasks specification with additional response modes. The following relationships apply:

1. **Task Creation**:
   - In `immediate` mode, a task **MAY** still be created for tracking, but results are provided immediately.
   - In `streaming` mode, a task **MUST** be created and follows the normal task lifecycle.
   - In `task` mode, behavior is unchanged from the existing specification.

2. **Task Status**:
   - Tasks in `immediate` mode that return results immediately **MUST** have status `completed`.
   - Tasks in `streaming` mode **MUST** remain in `working` status until `isComplete: true`, then transition to `completed`.

3. **tasks/result Operation**:
   - The `tasks/result` operation continues to work as specified in the tasks specification.
   - For streaming tasks, `tasks/result` **MAY** be used to resume streaming by providing `lastSeqNr`. In this case, it returns `partial-content` format.
   - For streaming tasks without `lastSeqNr`, `tasks/result` **MUST** block until the task reaches a terminal status, then return the complete result. The complete result **MUST** be returned in the standard `content` field format (not `partial-content`), with all segments combined in order. The segments from `partial-content` **MUST** be merged into a single `content` array following these steps:
     1. Collect all segments from all `partial-content` arrays received for the task
     2. Sort all segments by their `seqNr` values in ascending order (1, 2, 3, ...)
     3. Remove the `seqNr` field from each segment
     4. Combine the remaining fields of each segment into a single `content` array, maintaining the sorted order
     5. The resulting `content` array **MUST** contain all segments in the correct sequence
        If the task failed or was cancelled, the result **MUST** follow the standard error format (with `isError: true` if applicable).
   - For immediate results, if a task was created, `tasks/result` **MUST** return the same result that was provided in the initial response (using `content` field format).

4. **tasks/get Operation**:
   - The `tasks/get` operation continues to work as specified, allowing clients to poll task status.
   - For streaming tasks, clients **SHOULD** continue polling via `tasks/get` to monitor status while receiving streaming results.

## Backward Compatibility

**New Client + Old Server**:

- If a new client that supports immediate result acceptance or streaming interacts with an old server that does not support these modes, the server **MUST** default to the traditional `task` mode.
- The client **MUST** be prepared to handle this fallback gracefully and **SHOULD** not assume that `immediate` or `streaming` modes will be used.

**Old Client + New Server**:

- If an old client interacts with a new server that supports immediate result acceptance or streaming, the server **MUST** default to the traditional `task` mode when `responseModes` is not specified.
- The server **MUST** ensure that it can handle requests from older clients without issues and **MUST NOT** require new capabilities for basic task functionality.

## Security Considerations

1. **Access Control**:
   - Streaming results **MUST** respect the same access control rules as regular task results.
   - The `taskId` in `related-task` metadata **MUST** be validated against the requestor's authorization context.

2. **Sequence Number Security**:
   - Sequence numbers are not intended to be secret, but servers **SHOULD** validate that `lastSeqNr` requests come from authorized requestors.
   - Servers **MAY** implement rate limiting on `tasks/result` requests with `lastSeqNr` to prevent enumeration attacks.

3. **Data Integrity**:
   - Clients **SHOULD** verify that received segments are complete and in order before processing.
   - Servers **SHOULD** ensure that streaming responses are delivered reliably, especially for critical data.
   - Clients **MUST** validate `seqNr` values to detect missing or duplicate segments.
   - Servers **MUST NOT** send duplicate `seqNr` values for the same task through any mechanism.

## Client Implementation Guide

This section provides guidance for clients implementing support for this SEP.

### Handling Different Response Modes

1. **Immediate Mode (`immediate`)**:
   - Check if the response contains a `content` field (not `partial-content`)
   - If `content` is present, process the complete result immediately
   - If `_meta["io.modelcontextprotocol/related-task"]` is present, a task was created for tracking; the client **MAY** call `tasks/result` to retrieve the same result later

2. **Task Mode (`task`)**:
   - Check if the response contains a `task` object
   - Extract the `taskId` and use `tasks/get` to poll for status
   - When the task reaches a terminal status, call `tasks/result` to retrieve the final result
   - The result will be in `content` format (standard format)

3. **Streaming Mode (`streaming`)**:
   - Check if the response contains `partial-content` or a `task` object (or both)
   - Extract the `taskId` from either the `task` object or `_meta["io.modelcontextprotocol/related-task"]`
   - Initialize a segment tracker for this task to track received `seqNr` values
   - Process segments as they arrive, maintaining order based on `seqNr`
   - Monitor `isComplete` to know when streaming is finished
   - Continue polling via `tasks/get` to monitor task status

### Handling Streaming Results

**Segment Tracking:**

Clients **MUST** maintain a data structure for each streaming task to track:

- `taskId`: The task identifier
- `receivedSeqNrs`: A set of received `seqNr` values (to detect duplicates)
- `highestSeqNr`: The highest `seqNr` received so far
- `segments`: A map or array of segments keyed by `seqNr` (for ordering)
- `isComplete`: Whether streaming is complete

**Processing Flow:**

1. **Initial Response**:
   - If `partial-content` is present, extract segments and add to tracker
   - If `task` object is present, extract `taskId` and start polling status
   - If only `partial-content` is present, extract `taskId` from `_meta["io.modelcontextprotocol/related-task"]`

2. **SSE Stream** (if using Streamable HTTP transport):
   - Listen for SSE events on the stream opened for the original request
   - Parse each event's `data` field as a JSON-RPC message
   - If the message is a JSON-RPC response (has `result` field) and `result.partial-content` exists, extract segments from `result.partial-content` and add to tracker (checking for duplicates)
   - If the message is a JSON-RPC notification (no `id` field), handle it separately (e.g., task status updates) - these do not contain streaming segments
   - If `isComplete: true` is received in a response's `result` field, mark streaming as complete

3. **tasks/result Polling** (if needed):
   - Periodically call `tasks/result` with `lastSeqNr` set to the highest received `seqNr`
   - Process returned segments and add to tracker
   - Continue until `isComplete: true` is received

4. **Segment Merging**:
   - When all segments are received (or when `tasks/result` is called without `lastSeqNr`), merge segments:
     - Sort segments by `seqNr` in ascending order
     - Remove `seqNr` field from each segment
     - Combine into a single `content` array
   - Process the merged result as a standard tool result

**Error Handling:**

- **Missing Segments**: If gaps in `seqNr` are detected, use `tasks/result` with `lastSeqNr` to request missing segments
- **Duplicate Segments**: Ignore segments with `seqNr` values that have already been received
- **Connection Loss**: Use `tasks/result` with `lastSeqNr` to resume from the last received segment
- **TTL Expiration**: If `tasks/get` indicates the task has expired, treat streaming as incomplete and attempt to retrieve available partial results

### Server Implementation Guide

This section provides guidance for servers implementing support for this SEP.

**Response Mode Selection:**

1. During capability negotiation, determine which modes the client supports
2. When processing a task-augmented request:
   - If `responseModes` is specified, select the highest-priority mode that both client and server support
   - If no `responseModes` is specified, default to `task` mode
   - If the selected mode is `immediate` but results are not immediately available, determine fallback:
     - If the tool/operation is known to produce incremental results (e.g., LLM streaming, data processing), fall back to `streaming` if supported
     - Otherwise, fall back to `task` mode

**Streaming Implementation:**

1. **Task Creation**: Always create a task when using `streaming` mode
2. **Segment Generation**: As results are produced:
   - Assign sequential `seqNr` values starting from 1
   - Group segments into batches for transmission (server implementation choice)
   - Ensure `seqNr` values are unique and monotonically increasing

3. **Transmission Mechanisms**:
   - **Initial Response**: Include `partial-content` if segments are immediately available
   - **SSE Stream**: Send JSON-RPC messages with `partial-content` in SSE events
   - **tasks/result**: Return segments when polled with `lastSeqNr`
   - **Important**: Never send the same `seqNr` through multiple mechanisms

4. **Completion Handling**:
   - Set `isComplete: true` in the final streaming response
   - Transition task status to `completed` after sending the final response
   - Ensure all segments have been sent before marking as complete

## Implementation Checklist

Use this checklist to verify your implementation:

### Server Implementation

- [ ] Capability negotiation: Server correctly declares supported modes in `tasks.responses.modes`
- [ ] Mode selection: Server correctly selects mode from client's `responseModes` list
- [ ] Immediate mode: Server correctly handles immediate results and optional task creation
- [ ] Task mode: Server correctly returns `CreateTaskResult` for task mode
- [ ] Streaming mode: Server correctly creates tasks and sends streaming results
- [ ] Segment numbering: Server assigns unique, sequential `seqNr` values starting from 1
- [ ] SSE format: Server sends JSON-RPC messages in SSE events (if using SSE)
- [ ] No duplicates: Server never sends the same `seqNr` through multiple mechanisms
- [ ] Completion: Server sets `isComplete: true` and transitions task to `completed`
- [ ] Error handling: Server correctly handles task failures and cancellations
- [ ] TTL handling: Server correctly handles TTL expiration during streaming
- [ ] Resume support: Server correctly handles `lastSeqNr` in `tasks/result` requests

### Client Implementation

- [ ] Capability negotiation: Client correctly declares supported modes in `tasks.responses.modes`
- [ ] Mode specification: Client correctly specifies `responseModes` in task-augmented requests
- [ ] Immediate mode: Client correctly processes immediate results with `content` field
- [ ] Task mode: Client correctly polls status and retrieves final results
- [ ] Streaming mode: Client correctly handles `partial-content` and tracks segments
- [ ] Segment tracking: Client maintains received `seqNr` set to detect duplicates
- [ ] SSE handling: Client correctly parses JSON-RPC messages from SSE events (if using SSE)
- [ ] Deduplication: Client ignores duplicate segments based on `seqNr`
- [ ] Gap detection: Client detects missing `seqNr` values and requests them via `lastSeqNr`
- [ ] Segment merging: Client correctly merges segments into `content` array
- [ ] Completion detection: Client correctly detects streaming completion via `isComplete`
- [ ] Error handling: Client correctly handles task failures, cancellations, and TTL expiration
- [ ] Resume support: Client correctly uses `lastSeqNr` to resume streaming

## Test Scenarios

Recommended test scenarios for validating implementations:

### Basic Functionality

1. **Immediate Mode - Complete Results**:
   - Client requests `immediate` mode
   - Server has complete results immediately
   - Verify: Client receives `content` field with complete results

2. **Task Mode - Standard Flow**:
   - Client requests `task` mode (or no mode specified)
   - Server creates task and returns `CreateTaskResult`
   - Client polls status until completion
   - Client retrieves final result via `tasks/result`
   - Verify: Final result is in `content` format

3. **Streaming Mode - Initial Response Only**:
   - Client requests `streaming` mode
   - Server returns initial response with `partial-content`
   - Server sets `isComplete: true` in initial response
   - Verify: Client receives all segments and merges correctly

### Streaming Scenarios

4. **Streaming Mode - Multiple Responses**:
   - Client requests `streaming` mode
   - Server sends initial response with `partial-content` (seqNr 1-2)
   - Server sends subsequent response with `partial-content` (seqNr 3-4)
   - Server sends final response with `isComplete: true`
   - Verify: Client receives all segments in order

5. **Streaming Mode - SSE Stream**:
   - Client requests `streaming` mode via Streamable HTTP transport
   - Server opens SSE stream and sends segments via SSE events
   - Verify: Client parses SSE events and extracts `partial-content`

6. **Streaming Mode - Resume with lastSeqNr**:
   - Client receives segments 1-3 via streaming
   - Connection breaks
   - Client calls `tasks/result` with `lastSeqNr: 3`
   - Verify: Server returns segments starting from seqNr 4

7. **Streaming Mode - Gap Detection**:
   - Client receives segments 1, 3, 5 (missing 2 and 4)
   - Client calls `tasks/result` with `lastSeqNr: 1`
   - Verify: Server returns segments 2, 3, 4, 5

### Edge Cases

8. **Immediate Mode Fallback**:
   - Client requests `immediate` mode
   - Server doesn't have immediate results
   - Verify: Server falls back to `task` or `streaming` mode appropriately

9. **TTL Expiration During Streaming**:
   - Client starts receiving streaming results
   - Task TTL expires during streaming
   - Verify: Server handles expiration gracefully, client detects and handles it

10. **Task Cancellation During Streaming**:
    - Client starts receiving streaming results
    - Client cancels task via `tasks/cancel`
    - Verify: Server stops sending segments and transitions to `cancelled`

11. **Task Failure During Streaming**:
    - Client starts receiving streaming results
    - Task fails during execution
    - Verify: Server sends final error response with `isError: true` and `isComplete: true`

12. **Duplicate Segment Detection**:
    - Server accidentally sends same `seqNr` through multiple mechanisms
    - Verify: Client detects and ignores duplicate

### Compatibility

13. **New Client + Old Server**:
    - New client requests `streaming` mode
    - Old server doesn't support it
    - Verify: Server falls back to `task` mode

14. **Old Client + New Server**:
    - Old client doesn't specify `responseModes`
    - New server supports all modes
    - Verify: Server defaults to `task` mode

15. **Mixed Mechanisms**:
    - Server uses initial response + SSE stream simultaneously
    - Verify: Client correctly merges segments from both mechanisms without duplicates
