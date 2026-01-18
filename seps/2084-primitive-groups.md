# MCP Primitive Grouping Server Capability

## Preamble

- **Title:** MCP Primitive Grouping Server Capability
- **Author(s):** Tapan Chugh (@chughtapan), Cliff Hall (@cliffhall)
- **Track:** Standards
- **Status:** Draft
- **Created:** 14 January 2026

## Abstract

This SEP proposes Groups, a new server capability and primitive, to organize tools, prompts, resources, tasks, and groups themselves, into named collections.

## Motivation

### What are Groups?

Groups are named collections of MCP primitives: tools, prompts, resources, tasks, and other groups, organized by use cases, functionality, etc.

- A productivity server could organize groups such as Email or Calendar, and present related tools, e.g. Email: ["Draft Email", "Spell Check", "Send Email"], Calendar: ["Add Participants", "Find Open Time", "Create Appointment"]
- A server with many tools could separate them by functionality such as "Pull Requests", "Issues", "Actions".
- A server with various reference programming resources could separate them by language, like "Python", "TypeScript, and "Kotlin".

**Note:** Primitives can belong to multiple groups; for instance, if tools are grouped by use case, a `spell_check` tool might appear in both `compose_email` and `compose_document` groups.

### Why use Groups?

Organizing a server's primitives by functionality or use case enables richer client workflows, wherein certain operations or settings can be applied to multiple primitives concurrently:

- **Client-side filtering:** Client UIs could display a list of groups and allow users to select/deselect specific groups to interact with or ignore. Primitives from deselected groups would not be presented to the LLM.
- **Agentic control:** In-addition to human-affordances, clients can offer agents special tools which enable the LLM to dynamically enable / disable specific groups.
- **Simplify server instructions:** When describing how to use various primitives in a server, the instructions could refer to them by group name rather than exhaustive lists.
- **Access control:** Access to primitives could be granted at the group level, creating a consistent abstraction from security design to RPC layer.

## Specification

**Recommendation:** Groups are implemented as new MCP primitive, alongside the existing ones (i.e., tools, resources, prompts, and tasks). The new primitive will have a similar schema, list method, and list changed notification. Additionally, all MCP primitives, including groups, use a new reserved `_meta` key to list the groups to which they belong.

### Capability

Servers that support groups MUST declare the capability during initialization, including whether list change notifications are supported. Group lists can change at runtime, and so support for listChanged notifications for each is included.

```json
{
  "capabilities": {
    "groups": {
      "listChanged": true
    }
  }
}
```

### Schema

```json
"Group": {
 "properties": {
   "name": {
     "description": "Intended for programmatic or logical use, but used as a display name in past specs or fallback (if title isn't present). Must be unique.",
     "type": "string"
   },
   "title": {
     "description": "Intended for UI and end-user contexts — optimized to be human-readable and easily understood.",
     "type": "string"
   },
   "description": {
     "description": "A full, human-readable description of the group.",
     "type": "string"
   },
   "_meta": {
     "additionalProperties": {},
     "description": "See [General fields: `_meta`](/specification/2025-11-25/basic/index#meta) for notes on `_meta` usage.",
     "io.modelcontextprotocol/groups": {
        "description": "A list of group names containing this group.",
        "items": {
           "type": "string"
        },
        "type": "array"
     },
     "type": "object",
   },
   "annotations": {
     "$ref": "#/$defs/Annotation",
     "description": "Optional additional group information.\n\nDisplay name precedence order is: title, annotations.title, then name."
   },
   "icons": {
     "description": "Optional set of sized icons that the client can display in a user interface.\n\nClients that support rendering icons MUST support at least the following MIME types:\n- `image/png` - PNG images (safe, universal compatibility)\n- `image/jpeg` (and `image/jpg`) - JPEG images (safe, universal compatibility)\n\nClients that support rendering icons SHOULD also support:\n- `image/svg+xml` - SVG images (scalable but requires security precautions)\n- `image/webp` - WebP images (modern, efficient format)",
     "items": {
       "$ref": "#/$defs/Icon"
     },
     "type": "array"
   }
 },
 "required": [
   "name"
 ],
 "type": "object"
}
```

### Reserved `_meta` Property for All Primitives

Grouping of all primitives is handled in the same way, including groups themselves.

For groups, tools, resources, prompts, and tasks, an optional reserved `_meta` key is used to present the list of group names to which the primitive instance belongs.

By listing a primitive's groups in a reserved `_meta` property, we ensure backward compatibility.

```json
   "io.modelcontextprotocol/groups": {
     "description": "A list of group names containing this [primitive name].",
     "items": {
       "type": "string"
     },
     "type": "array"
   },
```

### Groups Discovery Method: groups/list

Request:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "groups/list"
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "groups": [
      {
        "name": "user",
        "title": "User Management Tools",
        "description": "Tools used for managing user accounts within the system."
      },
      {
        "name": "mapping",
        "title": "Geospatial Mapping Tools",
        "description": "Tools used for map rendering, geocoding, and spatial analysis."
      }
    ]
  }
}
```

### Changes to Response Formats

As mentioned above, all primitives have a new property that appears in their list result. This includes `tools/list`, `resources/list`, `prompts/list`, `tasks/list`.
Here is an example tool definition from `tools/list` response with new groups property:

```json
{
  "name": "calculator",
  "title": "Arithmetic Calculator",
  "description": "Perform mathematical calculations on arithmetic expressions",
  "inputSchema": {
    "type": "object",
    "properties": {
      "expression": {
        "type": "string",
        "description": "Expression to evaluate (e.g., '2 + 3 * 4')"
      }
    },
    "required": ["expression"]
  },
  "_meta": {
    "io.modelcontextprotocol/groups": ["arithmetic"]
  }
}
```

### Notifications

#### List Changed

When the list of available groups changes, servers that declared the listChanged capability SHOULD send a notification:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/groups/list_changed"
}
```

#### Membership Changed

If a primitive is added (or removed) from a group, the server SHOULD send the `list_changed` notification appropriate for that primitive.

## Rationale

This specification proposal was selected for its ease of understanding since it mirrors the other MCP primitives.

### Alternatives Considered

- **First class `groups` property:** A variation of the proposed specification, but the list of groups to which a primitive instance belongs would be presented by a `groups` property added to the top level of each primitive's schema.
  This idea was discarded because it could lead to backward compatibility issues. For instance, if a server returned a tool, resource, etc, with this property to an older client which validated it against a strict schema that did not contain this property, it would most likely cause an error.
  Since this proposal spans all primitives, such a compatibility failure would be catastrophic.


- **A primitive's groups list as an array of Group instances not names:** A variation of the proposed specification, but the schema would reference the Groups definition instead of declaring a string (group name). This means that full Group instances would appear in the primitive's group list, significantly increasing the token count when passed to an LLM without modification. Also, beacuse groups can be hierarchical, every child of a given group would carry a duplicate of the parent instance. There was discussion of mitigating the duplication on the line using libraries that perform a marshalling on send/receive, replacing the parent with a pointer to a single copy of the parent instance. This appeared to be unnecessary burden for SDK developers for no clear benefit, when a client can easily look up a group by name in the `groups/list` result.


- **Groups as MCP Resources instead of new primitive:** A completely separate proposal where the group metadata is declared in MCP resources with a specific schema and mimeType, referenced by their URIs, e.g., `mcp://groups/{groupId}`. Servers MAY publish the group index at a URI which MUST be defined in the capabilities object during the server initialization. This proposal could reduce spec changes and implementation effort significantly, but it was not considered as intuitive.

## Security Implications

None identified

## Reference Implementation

- Fully implemented Typescript SDK changes with unit tests.
- Includes documented client and server examples.
- Check out the [Draft PR](https://github.com/modelcontextprotocol/typescript-sdk/pull/1399) for details.

The reference implementation's example client and server demonstrate how groups, tools, prompts, and resources can be grouped on the server, and the client can filter them by group. It manually demonstrates how an agent using the server could easily reduce the tokens placed into an LLM's context by only including the primitives in one or more groups rather than providing the full list.

Note: Tasks are not included in the example as they are ephemeral, but the SDK changes do support grouping of tasks.

## Acknowledgements

@cliffhall and @chughtapan thank @patwhite for their earlier work on [SEP-1300](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1300) where a version of this grouping approach was first proposed.
