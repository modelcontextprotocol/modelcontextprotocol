# SEP-1904: Task filter

**Status**: Draft
**Type**: Standards Track
**Created**: 2025-11-20
**Author(s)**: He-Pin <hepin.p@alibaba-inc.com> (@He-Pin)

**Sponsor**: TBD
**PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1904

## Abstract

This SEP proposes a task filtering mechanism to enhance the query of tasks in large-scale distributed systems.
By implementing a filtering layer, the system can quickly identify and prioritize tasks based on predefined criteria,
reducing latency and improving overall performance.

## Motivation

The current `tasks/list` API retrieves all tasks without any filtering capabilities, which can lead to inefficiencies in
large-scale distributed systems.
As in Streamable HTTP transport, a User or Agent system **MAY** reuse the same session for multiple task submissions.
When querying tasks, the system may return a large number of tasks that not interested(eg. already completed), leading
to increased latency and resource consumption.

To address this issue, we propose introducing a task filtering mechanism that allows users to specify criteria for
filtering tasks during the query process.
This will enable the system to return only relevant tasks, improving efficiency and user experience.

## Specification

### Capabilities

Servers and Clients that support task filtering **MUST** advertise this capability during the initial handshake or
capabilities negotiation phase. This can be done by including a `filter` flag in the capabilities exchange message.

#### Server capabilities

| Capability          | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `tasks.list.filter` | Server supports filter in the `tasks/list` operation |

```json
{
  "capabilities": {
    "tasks": {
      "list": {
        "filter": {
          "methods": ["tools/call"],
          "taskIds": true,
          "status": true,
          "createdAt": {
            "before": true,
            "after": true
          },
          "lastUpdatedAt": {
            "before": true,
            "after": true
          },
          "order": {
            "by": ["createdAt", "lastUpdatedAt"],
            "direction": ["asc", "desc"]
          }
        }
      }
    }
  }
}
```

#### Client capabilities

| Capability          | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `tasks.list.filter` | Client supports filter in the `tasks/list` operation |

```json
{
  "capabilities": {
    "tasks": {
      "list": {
        "filter": {
          "methods": ["sampling/createMessage", "elicitation/create"],
          "taskIds": true,
          "status": true,
          "createdAt": {
            "after": true,
            "before": true
          },
          "lastUpdatedAt": {
            "after": true,
            "before": true
          },
          "order": {
            "by": ["createdAt", "lastUpdatedAt"],
            "direction": ["asc", "desc"]
          }
        }
      }
    }
  }
}
```

### Capability Negotiation

During the initialization phase, both parties exchange their `tasks` capabilities to establish which operations support
task-based execution.
Requestors SHOULD only query tasks with filtering if the receivers have advertised support for the `tasks.list.filter`
capability.

If a specified filter criterion is not supported by the receiver, the receiver **MAY** just ignore that criterion and
process the request using the supported criteria.
The requester **MUST** be prepared to handle responses that do not fully adhere to the requested filtering criteria, eg
returning a broader set of tasks than expected.
eg, if a client requests filtering by `status` but the server does not support it, the server may return all tasks
without filtering by status,
and the client should be able to handle this scenario gracefully, eg. by performing client-side filtering if necessary.

### Filter Parameters

When making a `tasks/list` request, clients **MAY** include filter parameters to specify the criteria for filtering
tasks.
The following filter parameters are supported:

- `methods` (array of strings, optional): Filter tasks by the types of the underlying request (e.g. `tools/call`,
  `sampling/createMessage`).
- `taskIds` (array of strings, optional): Filter tasks by a list of specific task IDs.
- `status` (array of strings, optional): Filter tasks by a list of specified current status (e.g., `working`,
  `completed`, `failed`, `cancelled`, `input_required`).
- `createdAfter` (string, optional): An ISO 8601 timestamp to filter tasks created after the specified time.
- `createdBefore` (string, optional): An ISO 8601 timestamp to filter tasks created before the specified time.
- `lastUpdatedAfter` (string, optional): An ISO 8601 timestamp to filter tasks updated after the specified time.
- `lastUpdatedBefore` (string, optional): An ISO 8601 timestamp to filter tasks updated before the specified time.
- `orderBy` (string, optional): Specifies the field by which to order the returned tasks. Possible values are
  `createdAt` and `lastUpdatedAt`. Default is `lastUpdatedAt`.
- `order` (string, optional): Specifies the order of the returned tasks. Possible values are `asc` for ascending and
  `desc` for descending. Default is `desc`.

When the filter is omitted, all tasks belongs to that session are returned.

## Backward Compatibility

**New Client + Old Server**: New clients that support task filtering can still interact with old servers that do not
support
the feature. In this case, the filtering parameters will be ignored by the old server, and the client will receive
the full list of tasks as per the existing behavior.

**Old Client + New Server**: Old clients that do not support task filtering can still interact with new servers that
support the feature. In this case, the server will return the full list of tasks without applying any filters,
maintaining
compatibility with the old client.
