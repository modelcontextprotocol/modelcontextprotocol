# MCP Primitive Grouping Server Capability

## Preamble

- **Title:** MCP Primitive Grouping Server Capability
- **Author(s):** Tapan Chugh (@chughtapan), Cliff Hall (@cliffhall) 
- **Track:** Standards
- **Status:** Draft
- **Created:** 14 January 2026

## Abstract

This SEP proposes Groups, a new server capability, to organize tools, prompts, resources, tasks, and other groups, into named collections.

## Motivation

### What are Groups?

Groups are named collections of MCP primitives: tools, prompts, resources, tasks, and other groups, organized by use cases, functionality, etc.

- A productivity server could organize groups such as Email or Calendar, and present related tools, e.g. Email: ["Draft Email", "Spell Check", "Send Email"], Calendar: ["Add Participants", "Find Open Time", "Create Appointment"]
- A server with many tools could separate them by functionality such as "Pull Requests",  "Issues",  "Actions".
- A server with various reference programming resources could separate them by language, like  "Python",  "TypeScript, and "Kotlin". 

**Note:** Primitives can belong to multiple groups; for instance, if tools are grouped by use case, a `spell_check` tool might appear in both `compose_email` and `compose_document` groups. 


### Why use Groups?
Organizing a server's primitives by functionality or use case enables richer client workflows, wherein certain operations or settings to be applied to multiple primitives concurrently:

- **Client-side filtering:** Client UIs could display a list of groups and allow users to select/deselect groups to interact with or ignore. Primitives from deselected groups would not be presented to the LLM.
- **Agentic control:** In-addition to human-affordances, clients can offer agents special tools which enable the LLM to dynamically enable / disable specific groups.
- **Simplify server instructions:** When describing how to use various primitives in a server, the instructions could refer to them by group name rather than exhaustive lists.
- **Access control:** Access to primitives could be granted at the group level, creating a consistent abstraction from security design to RPC layer.

## Specification

**Recommendation:** Groups are implemented as new MCP primitive, alongside existing ones (i.e., tools, resources, prompts, tasks). The new primitive will have a similar schema, list method, and list changed notification. Additionally, all MCP primitives, including groups, have a groups property added to their schema.

### Capability
Servers that support groups MUST declare the capability during initialization, including whether list change notifications are supported. Group lists can change at runtime, and so support for listChanged notifications for each is included.

```json
{
  "capabilities": {
    "groups": {
      "listChanged": true
    },
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
   "groups": {
     "description": "A list of group names containing this group.",
     "items": {
       "type": "string"
     },
     "type": "array"
   },
   "_meta": {
     "additionalProperties": {},
     "description": "See [General fields: `_meta`](/specification/2025-11-25/basic/index#meta) for notes on `_meta` usage.",
     "type": "object"
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

### Additional Schema Property for Other Primitives

Grouping of all primitives is handled in the same way, including groups themselves. For tools, resources, prompts, and tasks, a new property would be added to the primitive definition. 

```json
   "groups": {
     "description": "A list of group names containing this [primitive name].",
     "items": {
       "type": "string"
     },
     "type": "array"
   },
```

**Note:** The groups property is an array of strings representing group names, not group references. Since groups can be hierarchical, there would be unnecessary duplication of group definitions on the wire if passing references. Instead, a client can look up a group by name in the result of a `groups/list` result.

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
  "groups": ["arithmetic"]  // New property
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
This specification proposal was selected for its ease of understanding since it mirrors the other MCP primitives. Alternative proposals which can reduce spec changes and implementation effort significantly are presented below.

### Alternatives Considered

- **`_meta` instead of a new groups property:** A reserved `_meta` key (e.g., “io.modelcontextprotocol/groups”) is used to declare the groups for a primitive. 

- **Groups as MCP Resources instead of new primitive:** The group metadata is declared in MCP resources with a specific schema and mimeType, referenced by their URIs, e.g., `mcp://groups/{groupId}`. Servers MAY publish the group index at a URI which MUST be defined in the capabilities object during the server initialization. 

## Acknowledgements

@cliffhall and @chughtapan thank Pat White for their earlier work on [SEP-1300](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1300)
