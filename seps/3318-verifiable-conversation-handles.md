# SEP-3318: Verifiable Conversation Handles

- **Status**: Awaiting Sponsor
- **Type**: Standards Track
- **Created**: 2026-08-26
- **Author(s)**: Ryan Roberts (@ryan-s-roberts)
- **Sponsor**: None (seeking sponsor)
- **Interest Group**: Security IG
- **Working Group**: Transports WG, Agents WG
- **Extension Identifier**: `io.modelcontextprotocol/conversation-handle`
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3318
- **Related**: [SEP-2567](https://modelcontextprotocol.io/seps/2567-sessionless-mcp) (Sessionless MCP), [SEP-2575](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2575) (per-request protocol fields), [SEP-2133](https://modelcontextprotocol.io/seps/2133-extensions) (Extensions), [transports-wg#36](https://github.com/modelcontextprotocol/transports-wg/issues/36) (Conversation / Thread IDs), [SEP-1655](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1655) (Client-Side State Management, dormant), [SEP-1685](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1685) (request-scoped state), [Discussion #2894](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2894), [SEP-2822](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2822) (Client Generated Session ID → closed into #36)

---

## Abstract

This extension defines a **conversation handle**: a client-carried, server-minted **sequenced**
conversation identifier in `_meta`, integrity-protected under a keyed MAC. The handle names a
conversation, carries a monotonic sequence (`seq`) and an expiry, and carries an **opaque
server-defined state commitment** the client returns verbatim and never interprets. Ordering via
`seq` is the headline property: the server can tell whether a presented handle is the most recent
one it issued for that conversation.

The MAC enables lookup-free rejection of fabricated tokens at the edge. It is not a substitute for
the §2.3 principal–conversation association check. The handle carries no principal claim: the server
already authenticates every request, and associating a principal with a conversation is server-side
policy rather than token payload.

The extension does not constrain what a server keys on a handle. A memory server stores a memory
version in the state commitment; a cache stores a validator; an information-flow-control runtime
stores a label-journal head. The protocol supplies identity, integrity, and ordering. Policy
stays with the server.

The extension adds no methods, no tools, and no schema types. Its entire wire surface is one `_meta`
key in each direction.

---

## Motivation

### 1. Everyone is already building this, incompatibly and out of band

Durable conversation identity is not a speculative requirement. Six widely-deployed systems solve
it today, each in its own way, none of which interoperate:

| System                                | Mechanism                                                                                                        | Supplied by |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| **Microsoft Foundry Agent Service**   | `scope` set to `"{{$userId}}"` in the tool definition, plus an `x-memory-user-id` HTTP header on each call       | the caller  |
| **mem0** and comparable memory layers | multi-scope tagging: each write carries `user_id`, `agent_id`, `run_id`/`session_id`, `app_id`/`org_id`          | the caller  |
| **LangGraph**                         | `thread_id`, checkpointed under a composite `{user}:{thread_id}` key                                             | the caller  |
| **OpenAI Responses API**              | `previous_response_id` chains a conversation across stateless calls                                              | the caller  |
| **MCP memory servers**                | generic `store` / `retrieve` tools keyed on a caller-chosen session or user identifier passed as a tool argument | the caller  |
| **Plasm**                             | durable agent runtime combining memory, information-flow enforcement, and conversation-scoped tool policy        | the server  |

The pattern is identical in every case, and so are its consequences:

| Consequence                          | Why                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Not verifiable**                   | The server cannot distinguish an identifier it issued from one the caller invented. A `thread_id` or `user_id` is an assertion.                                          |
| **Not portable**                     | A client integrating three memory servers implements three identity mechanisms and can reason about none of them generically.                                            |
| **Not ordered**                      | Nothing tells the server whether the identifier it just received is the most recent one it handed out, so a replayed identifier is indistinguishable from a current one. |
| **Not restart-safe by construction** | Whether the identifier survives a client restart depends on whether the vendor happened to design for it.                                                                |
| **Model-selectable**                 | Where the identifier is a tool argument, the model chooses it — including choosing a different one, an older one, or another conversation's.                             |

Foundry is the most rigorous of the six. Its `x-memory-user-id` header is trustworthy within a
deployment that controls its callers, because nothing untrusted can set it. That condition does not
hold across an open ecosystem. The mechanism is a private header because the protocol defines no
equivalent.

The same primitive is absent in all six cases.

### 1a. Demand inside the MCP ecosystem

The same need is visible inside MCP itself.
[transports-wg#36](https://github.com/modelcontextprotocol/transports-wg/issues/36)
(Conversation / Thread IDs) collects several strands:

- **watnab** argues that model-relayed handles put correlation IDs in an untrusted channel, and
  presses for prompt-injection defence by keeping identity out of model-authored positions.
- **n0mad-ai** notes that relay loss is unobservable and argues for local-first durable memory; see
  also
  [Discussion #2894](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2894).
- **hcjmartin (Flocker)** describes a valid-but-wrong relayed id producing silent misattribution.
- **Agent-Hellboy** reports a custom `Mcp-Client-Session-Id` header plus gateway as a workaround.
- **LucaButBoring** describes Bedrock AgentCore sticky-VM routing keyed on `Mcp-Session-Id`.

SDK friction points in the same direction:
[java-sdk#738](https://github.com/modelcontextprotocol/java-sdk/issues/738),
[#274](https://github.com/modelcontextprotocol/java-sdk/issues/274),
[#702](https://github.com/modelcontextprotocol/java-sdk/issues/702),
[python-sdk#880](https://github.com/modelcontextprotocol/python-sdk/issues/880),
[go-sdk#148](https://github.com/modelcontextprotocol/go-sdk/issues/148),
[csharp-sdk#1036](https://github.com/modelcontextprotocol/csharp-sdk/issues/1036), and
[modelcontextprotocol#823](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/823).

### 2. The core protocol already requires this, and does not define it

The current draft specification's Statelessness section states, normatively:

> State that needs to span multiple requests (e.g., long-running tasks, application-level handles)
> **MUST** be referenced by an explicit identifier the client passes on each request.

and, in the same section:

> clients may interleave unrelated requests on the same transport, and a server must not treat
> connection or process identity as a proxy for conversation or session continuity.

— [Specification, Basic Protocol §Statelessness](https://modelcontextprotocol.io/specification/draft/basic/index)

The requirement therefore already exists, and it already names the client. What does not exist is any
definition of the identifier: what it looks like, how a server knows it minted it, whether it is the
current one, or how it survives a client restart. SEP-2567 fills that space with a tool-design
pattern and explicitly declines to give it protocol form:

> Explicit state handles are not a new protocol construct — there is no schema or wire format for
> them. They are a tool-design pattern.

For the state SEP-2567 addresses, the model choosing which basket to use is the intended behaviour.
Conversation-scoped state has the opposite requirement. §"Rationale" sets out the relationship
between the normative sentence quoted above and SEP-2567's description of the same pattern.

### 2a. SEP-2567 leaves the protocol treatment of handles explicitly open

SEP-2567's Future Work section records that it stopped short deliberately:

> This SEP deliberately does not introduce a protocol-level concept of a handle: from the wire's
> perspective `basket_id` is an ordinary string. A consequence is that nothing marks `basket_id` as a
> state handle to the client or model — the relationship between `create_basket`'s output and
> `add_item`'s input is inferred from naming and tool descriptions, not declared.
>
> A follow-up proposal could make that relationship explicit, for example via shared JSON Schema
> `$defs` referenced across a server's tool input and output schemas, or via a tool annotation that
> marks a result field as a handle. That would let orchestrators identify which values are live state
> (for compaction, hand-off, or cleanup purposes) without parsing tool descriptions. It is left out
> of scope here to keep this SEP to the minimum needed to remove sessions.

This extension is adjacent to that follow-up rather than an instance of it. The Future Work section
describes _field marking_: a schema-level or annotation-level declaration that a given result field
is a model-threaded state handle (`basket_id`), so orchestrators can locate live state for
compaction, hand-off, and cleanup. This extension defines a _verifiable_ conversation handle carried
in `_meta`, plus **tool marking** (§1.1) so clients can discover which tools consume that `_meta`
identity.

Field marking and conversation-handle tool marking are complementary and independent. Field marking
makes SEP-2567 tool-argument handles discoverable; tool marking (§1.1) makes conversation-scoped
tools discoverable; verification makes issued handles trustworthy. This SEP does not specify field
marking for model-threaded handles.

### 3. What a handle must satisfy

Given sessionless MCP and explicit handles as the sanctioned pattern, a handle intended to carry
durable conversation state must satisfy four properties an ordinary opaque string does not:

1. **Ordered (`seq`).** The server can tell whether a presented handle is the most recent one it
   issued for that conversation, so it can detect that state has moved on. Ordering is the property
   an ordinary opaque string cannot supply, and it is unobtainable from an ACL check alone.
2. **Server-minted.** Only the server creates handles, so an unrecognised handle is detectably not
   the server's.
3. **Integrity-protected.** The server can verify it issued this exact handle, unmodified, without
   consulting a store.
4. **Expiring.** Absolute `exp` bounds the **unexpired-bearer** window: a handle recovered from an
   old transcript is not useful as a current bearer forever. For principals associated under §2.3,
   exchange (§4.4) may continue the conversation until retention (§4.6) ends.

Properties 2–4 restate, in checkable form, guidance SEP-2567 already gives. Its Security Implications
section directs that for authenticated servers implementers "validate `(handle, auth_context)` on
every call," warns that "handles will end up in chat logs, copy-paste buffers, and subagent prompts,"
and requires that unauthenticated servers generate handles with "at least 128 bits of
cryptographically secure entropy" and a bounded lifetime. It also documents what happens when the
association check is omitted, citing
[modelcontextprotocol/python-sdk#2100](https://github.com/modelcontextprotocol/python-sdk/issues/2100):
the Python SDK's stateful session manager "routes by `Mcp-Session-Id` alone without verifying that the
authenticated identity on the request matches the one that created the session, so a leaked session ID
allows hijack by any other authenticated principal."

Entropy and an auth-context check are properties of an implementation. A 128-bit random name plus a
`(handle, auth_context)` lookup already stops cross-principal misuse when the association is
enforced. What the MAC buys over that combination is **cheap edge rejection of garbage without a
lookup**: fabricated or tampered tokens fail verification before the conversation record is touched.
Every _accepted_ request still consults conversation state for supersession, retention, and
association — the MAC is not a substitute for §2.3. Ordering remains unobtainable from the ACL
alone. The wire format otherwise provides no means for a server to confirm that it issued the handle
it received, or that the handle is the current one. Properties 1–4 close that gap.

Properties 2–4 are also, in substance, the remedy that security analysis of the stateless
specification prescribes for the narrower case of MRTR `requestState`. Gorgiev and Dalla Piazza (Equixly,
5 Aug 2026) observe that `requestState` "round-trips through the client. That makes it
attacker-controlled input," and prescribe:

> you must integrity-protect it, bind it to the principal and the originating request, and give it
> an expiry

That prescription generalises, with one divergence: the principal is not bound into the handle. The
server authenticates every request independently, so a principal in the payload is a second authority
for the same fact, and a durable user correlator in a string that persists in transcripts.
§"Rationale" sets out the reasons in full. Property 1 is additional: ordering is not recoverable by
a consumer on its own.

### 4. Consumers

The primitive is policy-free.

| Consumer                 | Uses the handle to                                                    | Might put in the state commitment |
| ------------------------ | --------------------------------------------------------------------- | --------------------------------- |
| Agent memory             | Scope reads and writes to one conversation                            | Memory-store version at last read |
| Personalization          | Retrieve durable preferences without a caller-asserted `user_id`      | Profile revision                  |
| Response caching         | Key a per-conversation cache                                          | A validator / etag                |
| Resumption               | Reattach to prior work after a client restart                         | Last-acknowledged checkpoint      |
| Metering and billing     | Attribute usage to a conversation                                     | Usage counter checkpoint          |
| Audit and provenance     | Correlate a durable trace across turns and processes                  | Trace chain head                  |
| Information-flow control | Bind accumulated security labels to something the model cannot choose | Label-journal head                |

The normative text defines no security labels, no lattice, and no enforcement model, and specifies
nothing about information flow. §"Worked example" is non-normative.

### 5. Relationship to transports-wg#36 and SEP-1655

[transports-wg#36](https://github.com/modelcontextprotocol/transports-wg/issues/36) asks for
conversation / thread identity lifecycle and whether a Thread ID may mutate `tools/list`. This SEP
answers lifecycle in §4 and forbids conversation-varying list results in §6.4. The working group has
named an experimental-extension path for exploration; this SEP remains **Standards Track**,
negotiated via the SEP-2133 extensions map. The two are adjacent, not competing.

[SEP-1655](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1655) (Client-Side
State Management, dormant) proposed server-set opaque state in `_meta` that the client echoes —
cookies. This SEP is not cookie-plus-MAC: it defines a conversation scope, a monotonic `seq`,
supersession, and exchange. The state commitment is not a mutable cookie jar.

Related strands that feed the same problem space:
[SEP-1685](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1685) (request-scoped
state),
[Discussion #2894](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2894),
and
[SEP-2822](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2822) (Client Generated
Session ID), which closed into #36.

### 6. What this SEP is not

It is **not** a proposal to restore sessions. SEP-1359 proposed protocol-level sessions and was not
adopted. The reasoning in SEP-2567 — undefined lifetime, inconsistent client semantics, fixed
cardinality of one, uncacheable list endpoints — stands, and nothing here requires it to be
revisited.

| Property                                              | Session (SEP-1359 / pre-2567) | Conversation handle (this SEP)           |
| ----------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| Bound to a connection or process                      | yes                           | **no**                                   |
| Lifetime defined by the transport                     | yes                           | **no** — explicit expiry                 |
| Cardinality                                           | exactly one per connection    | **unbounded**                            |
| Addressable from outside                              | no                            | **yes**                                  |
| Affects `tools/list` results                          | yes                           | **no** (normative — §6.4)                |
| Requires sticky routing or a shared store to validate | in practice, yes              | **no** — verifies from a server-held key |
| Forkable                                              | no                            | **yes**                                  |

A conversation handle is an _explicit handle in the SEP-2567 sense_. This SEP constrains how one is
constructed and where it is carried. It does not reintroduce implicit scope.

---

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in
[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119) and
[RFC 8174](https://datatracker.ietf.org/doc/html/rfc8174).

### 1. Extension identifier and negotiation

The extension identifier is:

```
io.modelcontextprotocol/conversation-handle
```

Clients supporting this extension MUST advertise it in
`_meta["io.modelcontextprotocol/clientCapabilities"].extensions` on every request on which they
carry a handle.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "recall_preferences",
    "arguments": { "topic": "deployment" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {
        "extensions": {
          "io.modelcontextprotocol/conversation-handle": {
            "maxHandleBytes": 1024
          }
        }
      },
      "io.modelcontextprotocol/conversation-handle": {
        "handle": "AQGWt3xK9pLmQ0aZeUu4oI6yPqXrEsN8kQ1wXvB6cRc"
      }
    }
  }
}
```

Servers supporting this extension MUST advertise it in the `server/discover` response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": {
      "tools": {},
      "extensions": {
        "io.modelcontextprotocol/conversation-handle": {
          "handleLifetimeSeconds": 3600,
          "conversationRetentionSeconds": 2592000,
          "typicalHandleBytes": 100,
          "onMissingHandle": "new-conversation"
        }
      }
    },
    "ttlMs": 3600000,
    "cacheScope": "public"
  }
}
```

Settings fields are defined in §7.

#### 1.1 Tool marking

Server-wide advertisement (§1) tells a client that the server supports conversation handles. It does
not tell the client which tools use conversation-scoped state. Without per-tool discoverability,
third-party clients cannot know when to attach a handle except by guessing from tool descriptions
or learning from errors.

Servers that advertise this extension MUST mark each tool that uses conversation-scoped state on the
corresponding `tools/list` entry under `_meta["io.modelcontextprotocol/conversation-handle"]`. The
mark is part of the tool definition: it MUST be identical for every caller and MUST NOT vary by
conversation (§6.4).

```json
{
  "name": "memory_append",
  "description": "Append text to conversation-scoped memory",
  "inputSchema": {
    "type": "object",
    "properties": { "text": { "type": "string" } },
    "required": ["text"]
  },
  "_meta": {
    "io.modelcontextprotocol/conversation-handle": {
      "requirement": "preferred",
      "mayMint": true
    }
  }
}
```

| Field         | Type                        | Required | Meaning                                                                                                                                                                                                                               |
| ------------- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requirement` | `"required" \| "preferred"` | MUST     | Whether a participating client MUST or SHOULD attach a handle on `tools/call`.                                                                                                                                                        |
| `mayMint`     | boolean                     | SHOULD   | Whether the server may include a replacement or establishment handle in the tool's response `_meta`. Default `true` when omitted on a marked tool. If present, the value MUST match the server's actual mint behaviour for that tool. |

Semantics:

- **`required`.** A client that advertises this extension MUST attach a handle when calling the tool,
  or expect the server to refuse the operation (§8). Tools that fail closed when no handle is present
  MUST advertise `requirement: "required"`.
- **`preferred`.** A participating client SHOULD attach a handle when it has one. The server MAY mint
  per `onMissingHandle` (§7) when none is presented.
- **Unmarked tools.** Clients MUST treat an unmarked tool as conversation-agnostic: they MUST NOT
  infer a handle requirement from the server's extension advertisement alone. Servers MAY still mint
  a handle on unmarked tools; clients that receive one MAY persist it (§4.2).

Clients supporting this extension SHOULD read tool `_meta` when deciding whether to attach a handle.
Unknown fields in the mark object MUST be ignored.

This mark declares consumption of conversation identity in request `_meta`. It is not a substitute
for SEP-2567 field marking of model-threaded handles in tool arguments or results.

### 2. The conversation handle

#### 2.1 Wire representation

A conversation handle MUST be represented on the wire as a single JSON string.

The handle is **opaque to the client**. Clients MUST treat it as an uninterpreted string and return
it verbatim.

Servers MUST NOT require clients to understand a handle's internal structure. §6 specifies a
RECOMMENDED encoding for convergence between independent implementations, not for client
consumption.

#### 2.2 Properties a server MUST guarantee

This specification constrains what a server establishes from a presented handle, not how it encodes
one. A conforming handle determines each of the following from the handle alone, together with
server-held key material and **without consulting a store**:

| Property                            | Requirement                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Authenticity**                    | Handles MUST be integrity-protected under key material held only by the issuing deployment. A server MUST reject a presented handle that it did not issue, or that has been modified.                                    |
| **Conversation identifier (`cid`)** | The handle MUST determine a stable conversation identifier, generated by the server from a cryptographically secure source with at least 128 bits of entropy, constant across every handle issued for that conversation. |
| **Expiry (`exp`)**                  | The handle MUST determine an absolute expiry. Absolute `exp` bounds the unexpired-bearer window; exchange (§4.4) may continue the conversation for associated principals until retention (§4.6).                         |
| **Sequence (`seq`)**                | The handle MUST determine a sequence number that strictly increases with each handle the server issues for a given `cid`.                                                                                                |
| **State commitment (`state`)**      | The handle MAY carry an opaque server-defined value (§3).                                                                                                                                                                |

A server MUST reject a presented handle that fails authenticity or whose `exp` has passed, except
for exchange under §4.4.

Handles may be read by the model, written to a transcript, or copied into a log. §5.3 states what a
server MUST NOT place in one.

#### 2.3 The handle carries no principal, and is not an authorization credential

A conversation handle MUST NOT carry a principal identifier, user identifier, tenant identifier, or
any other value derived from the identity of the caller.

A conversation handle is **not** an authorization credential and MUST NOT be treated as one. It
answers "which conversation", never "may this proceed". Servers MUST authorize every request on the
authenticated identity carried by the transport's authorization layer, exactly as they would if no
handle were present.

Association between a principal and a conversation is **server-side policy**, not token payload.
A server MUST NOT disclose or mutate conversation-scoped state on behalf of a principal other than
the one the conversation is associated with. Servers establish that association when a conversation
is minted. How a server represents and
enforces that association is out of scope, and servers SHOULD document it.

> **Note.** The obligation rests on the server rather than on the handle. §"Rationale" sets out the
> reasons; §"Security Implications" states the residual risk, which is that the check is implemented
> by the server rather than enforced by the credential.

#### 2.4 Audience

A handle MUST NOT be honoured by a server other than the one that issued it, or a replica sharing
its key material. Under the RECOMMENDED symmetric construction (§6.2) this holds automatically: no
other deployment can verify or forge one. Servers using the OPTIONAL asymmetric profile (§6.3) MUST
include and check an explicit audience value.

### 3. The state commitment

#### 3.1 Definition

The state commitment is an **opaque, server-defined value** that a server MAY embed in a handle and
that is returned to the server unmodified on the next request.

This specification assigns it no meaning, and defines no vocabulary, structure, or semantics for its
contents. It is meaningful only to the issuing server; clients return it verbatim as part of the
handle (§2.1).

Servers MUST treat the state commitment as advisory input to their own logic, and MUST NOT treat its
presence or its contents as authorization for anything.

#### 3.2 Non-normative examples

| Server kind        | Might place here                  | Might use it to                                                  |
| ------------------ | --------------------------------- | ---------------------------------------------------------------- |
| Memory store       | Memory-store version at last read | Detect writes by another agent since this conversation last read |
| Cache              | A validator / etag                | Decide whether to revalidate                                     |
| Workflow runtime   | Last-acknowledged checkpoint id   | Resume without replaying                                         |
| Metering           | Usage counter checkpoint          | Reconcile without double-counting                                |
| Provenance / audit | Hash-chain head                   | Detect a gap in the recorded trace                               |
| IFC runtime        | Label-journal head                | Detect that accumulated labels have advanced                     |

None of these are protocol concerns. They are listed only to show the field is general.

#### 3.3 Size

Servers SHOULD keep the state commitment small — a version number, a checkpoint identifier, or a
hash rather than serialized state. Servers MUST respect a client's advertised `maxHandleBytes` (§7)
and MUST return a clear error rather than issuing a handle that exceeds it.

Servers SHOULD NOT use the state commitment as a general-purpose state transport. State belongs on
the server; the commitment names a point in it. A server that outgrows this and stores the payload
server-side behind a pointer reintroduces a per-request lookup and forfeits the property in §2.2.

### 4. Lifecycle

#### 4.1 Establishment

Servers MUST NOT require a dedicated method or tool call to obtain a handle.

When a server that supports this extension receives a request from a client that advertises the
extension but carries no handle, the server MUST either mint a new conversation and return a handle,
or return no handle, according to its advertised `onMissingHandle` setting (§7). A server that does
not wish to participate simply does not advertise the extension.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "resultType": "complete",
    "content": [
      {
        "type": "text",
        "text": "No stored preferences for this conversation yet."
      }
    ],
    "_meta": {
      "io.modelcontextprotocol/serverInfo": {
        "name": "example-server",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/conversation-handle": {
        "handle": "AQGWt3xK9pLmQ0aZeUu4oI6yPqXrEsN8kQ1wXvB6cRc",
        "seq": 1,
        "expiresAt": 1787753600,
        "supersededHandlePresented": false
      }
    }
  }
}
```

Only `seq`, `expiresAt`, and `supersededHandlePresented` are advisory mirrors of values the handle
already carries. `seq` is for client merge ordering; `expiresAt` is for UX. Servers MUST NOT mirror
`conversationId` in response `_meta`: that would place a cleartext correlator in transcripts for the
retention window, while §5.3 forbids identifying material in the handle itself. Servers MUST NOT
accept mirrored fields as input.

Clients MUST use `seq` solely to order handles they have received (§4.2). Clients MUST NOT rely on
any mirrored field for a security decision, and MUST NOT attempt to reconstruct a handle from them.

Host applications that need a UI correlator SHOULD use their own session or thread key, not a
protocol cleartext `cid`.

#### 4.2 Rotation

A server MAY include a replacement handle in any response to a request that carried a valid handle.

A server MUST include a replacement handle when the state commitment it requires on subsequent
requests differs from the value carried by the presented handle. Issuing a replacement is the only
means of changing the value a client returns.

A server SHOULD include a replacement handle when the remaining lifetime of the presented handle is
less than half of `handleLifetimeSeconds`, so that clients are not driven into exchange (§4.4)
during normal operation.

Every replacement handle MUST carry a `seq` strictly greater than every `seq` the server has
previously issued for that `cid`.

Allocating the next `seq` for a `cid` requires deployment-wide monotonic coordination (an atomic
counter or equivalent). Handle _verification_ remains affinity-free (§2.2); supersession, retention,
and association already imply shared conversation state — mint-path `seq` allocation is in that set.
The reference implementation uses compare-and-bump.

Clients MUST send the handle with the highest `seq` they have received for that conversation.
Clients SHOULD discard a handle carrying a lower `seq` than one they have already received.

Under concurrent in-flight requests, N replacements may return; the client keeps the highest `seq`
only (this section). Opaque state commitments are last-writer-wins by `seq` and are not mergeable by
construction. Servers that need linearizable application state MUST NOT rely on the commitment alone
— they MUST use server-side CAS or a journal keyed by `cid`.

Rotation makes short expiry compatible with long conversations and bounds the lifetime of any single
handle. It is discretionary rather than per-response because rotating on every response would make
supersession (§4.3) the guaranteed outcome of any concurrent request, and therefore useless as a
signal. §"Rationale" states the resulting exposure tradeoff.

#### 4.3 Supersession is detectable; the response to it is the server's

Because `seq` strictly increases per `cid`, a server can determine whether a presented handle is the
most recent one it issued for that conversation.

A server MUST NOT treat a presented handle as current solely because it is authentic and unexpired.

**What a server does on detecting supersession is entirely server policy, and this specification
does not constrain it.** Servers SHOULD document their behaviour. Non-normative illustrations of
reasonable and mutually incompatible choices:

- A **memory store** may serve the version the handle names, treating it as a snapshot read.
- A **cache** may treat a superseded handle as a miss and revalidate.
- A **workflow runtime** may reject and require the client to resynchronize.
- An **IFC runtime** may deliberately ignore the commitment the handle carries and apply its current
  authoritative state instead, so that presenting an older handle yields no rollback.

These are legitimate and different; a snapshot read is correct for a memory store and wrong for an
IFC runtime. The protocol's contribution is that supersession is _detectable_ at all. Today it is
not, because there is nothing to compare.

A server SHOULD set `supersededHandlePresented` to `true` in the response when the presented handle
is not the most recent one it has issued for that `cid`, whether or not the server changed its
behaviour as a result.

Under the rotation policy in §4.2 supersession is uncommon: a client following §4.2 presents the
highest `seq` it holds, and a server that has not rotated has nothing newer to compare against. It
remains possible without client error, because a server that rotates while requests are in flight
supersedes every handle already dispatched. A server MUST NOT reject a request solely because the
handle it presented was superseded.

> **Note on statelessness.** Verifying a handle (§2.2) requires no lookup. Determining whether it is
> _superseded_ requires comparing against the conversation's recorded state, which is a lookup —
> but one the server performs anyway to serve conversation-scoped data. Handle _validity_ is
> establishable without a lookup; conversation state is not, and lives on the server.

#### 4.4 Expiry, exchange, and client restart

An expired handle remains authentic — its integrity protection still verifies, so `cid` and `seq`
are still trustworthy.

Servers MUST support **exchange** for associated principals (§2.3) presenting an expired but
otherwise authentic handle for a conversation that is still retained (§4.6): such a request MUST be
answered with a fresh handle for the same `cid`. Exchange MUST proceed only when §2.3 association
succeeds and the conversation is retained. An unauthenticated caller or a `principal_mismatch` MUST
fail as for other authorization failures; the server MUST NOT mint a fresh handle in those cases.

Servers MUST NOT treat an expired handle as satisfying §2.2 for the presenting request itself; it
identifies the conversation to resume and nothing more.

Client restart is therefore supported. Handles travel in `_meta` and clients persist conversations,
so the last handle is normally recoverable — the resumption property SEP-2567 describes for handles
generally, with the addition that the server can verify what it receives.

#### 4.5 Forking

A conversation that branches — the user edits an earlier message, the client regenerates, an
orchestrator spawns a sub-agent — may need a distinct conversation that does not clobber the
original.

A client requests a fork by setting `fork` in the request `_meta`:

```json
"io.modelcontextprotocol/conversation-handle": {
  "handle": "AQGWt3xK9pLmQ0aZeUu4oI6yPqXrEsN8kQ1wXvB6cRc",
  "fork": true
}
```

On fork the server MUST mint a fresh `cid` with at least 128 bits of entropy, and MUST record the
parent `cid`. What a forked conversation inherits from its parent is server policy; servers SHOULD
document it.

#### 4.6 Retention

Servers SHOULD advertise `conversationRetentionSeconds` (§7) and SHOULD retain conversation state at
least that long.

After retention expires, a handle for that `cid` is authentic but names nothing. Servers MUST NOT
silently treat this as a fresh conversation without indicating it; they MUST either mint a new `cid`
and report it, or return an error. Servers MUST NOT reuse a retired `cid`.

### 5. Carriage and disclosure

#### 5.1 The handle is carried by the client, not the model

The handle MUST be carried in `params._meta["io.modelcontextprotocol/conversation-handle"].handle`.

Servers MUST NOT read conversation identity from any position other than
`params._meta["io.modelcontextprotocol/conversation-handle"].handle`. Values appearing in tool
arguments, resource URIs, prompt arguments, or other model-authored positions MUST be ignored for
conversation binding (no shape detection required).

`_meta` is client-authored transport metadata; tool arguments are model output. Carrying conversation
identity in `_meta` means the model does not choose which conversation a request belongs to, which is
what makes a handle usable as a key for durable state. This realises the core requirement that the
identifier is one "the client passes on each request."

Clients SHOULD NOT render the handle into model context. A client with no reason to show it to the
model SHOULD NOT.

#### 5.2 Proof of possession

Servers MAY additionally bind a handle to a proof-of-possession key, and SHOULD do so where the MCP
authorization framework's DPoP work applies. This extension specifies no proof-of-possession
machinery of its own.

#### 5.3 Disclosure

Handles may reach model context, transcripts, logs, and support tickets, and may be retained
indefinitely.

Servers MUST NOT place directly or indirectly identifying information in a handle. In particular,
servers MUST NOT embed a principal, user, tenant, or account identifier, or any keyed derivation of
one (§2.3): a stable per-user value embedded in a durable string is a cross-conversation correlator
for anyone who collects transcripts, even when it is pseudonymous.

Servers SHOULD NOT place application state, policy details, or business data in the state
commitment. An opaque version or hash discloses nothing; serialized state discloses whatever it
contains to anyone who reads a transcript.

### 6. Handle construction

#### 6.1 Requirements are on properties, not encoding

Servers MAY use any encoding satisfying §2.2. The following is RECOMMENDED so independent
implementations converge and SDK support is straightforward.

#### 6.2 RECOMMENDED encoding: symmetric

The issuing deployment is both the only minter and the only verifier. A keyed MAC over a server-held
secret therefore satisfies every property in §2.2, is available in every language's standard library,
requires no key distribution, no JWKS endpoint, and no third-party trust configuration, and produces
a substantially smaller handle than a signed token.

RECOMMENDED construction:

```
body = version   (1 byte,  = 0x01)
     ‖ key_id    (1 byte,  selects the MAC key, for rotation)
     ‖ cid       (16 bytes, CSPRNG)
     ‖ exp       (4 bytes,  unsigned 32-bit big-endian Unix seconds; valid through 2106-02-07 UTC)
     ‖ seq       (4 bytes,  big-endian, strictly increasing per cid)
     ‖ state_len (1 byte)
     ‖ state     (state_len bytes, opaque, server-defined, MAY be empty)

tag    = HMAC-SHA256(handle_key, body) truncated to 16 bytes
handle = BASE64URL( body ‖ tag )       (unpadded)
```

A verifier MUST reject a handle whose tag does not verify, whatever the values of the other fields.
A verifier MUST reject a handle whose `exp` has passed, except for exchange (§4.4). Tag comparison
SHOULD be constant-time. Servers MUST support at least two concurrently valid `key_id` values so key rotation does
not invalidate live conversations.

Sizes: with an empty state commitment the handle is 58 characters; with a 32-byte state commitment,
100 characters. An equivalent JWS with registered claims and an Ed25519 signature is roughly 480–560
characters — five to eight times larger, for no benefit in this trust model.

#### 6.3 OPTIONAL profile: asymmetric

A server whose handles must be verifiable by a party that does not hold its secret — an independent
auditor, or a gateway enforcing policy without server cooperation — MAY use an asymmetric profile.

Such a server MUST include and check an explicit audience value (§2.4), MUST use a JWS Compact
Serialization with `typ` set to `mcp-ch+jwt` and an explicit `kid`, MUST NOT accept `alg: none` or
any algorithm it does not advertise, and SHOULD publish a JWKS. It MUST advertise the profile in its
settings object so clients can budget for the larger handle.

This is OPTIONAL because third-party verifiability is a real but uncommon requirement, and mandating
it would impose key-distribution costs on every implementer to serve a minority.

#### 6.4 Interaction with list caching

Conversation handles MUST NOT influence the results of `tools/list`, `resources/list`, or
`prompts/list`. Servers MUST NOT vary list results by conversation. This preserves the caching model
SEP-2567 and SEP-2549 establish. Static tool marks under §1.1 are part of the tool definition and
MUST likewise be conversation-invariant.

This deliberately declines use cases raised in
[transports-wg#36](https://github.com/modelcontextprotocol/transports-wg/issues/36) (for example
@javapro108 ERP dynamic tool activation) and Progressive Discovery of Tools in the sessions decision
doc. Those need a separate catalog-versioning or elicitation mechanism, not conversation-varying list
endpoints under this extension (caching / SEP-2549).

### 7. Extension settings

Server settings, advertised in `server/discover`:

| Field                          | Type                           | Required | Meaning                                                                                |
| ------------------------------ | ------------------------------ | -------- | -------------------------------------------------------------------------------------- |
| `handleLifetimeSeconds`        | integer                        | SHOULD   | Nominal handle lifetime.                                                               |
| `conversationRetentionSeconds` | integer                        | SHOULD   | Minimum conversation retention (§4.6).                                                 |
| `onMissingHandle`              | `"new-conversation" \| "none"` | SHOULD   | Whether a request without a handle mints a conversation. Default `"new-conversation"`. |
| `typicalHandleBytes`           | integer                        | MAY      | Advisory size hint for context and payload budgeting.                                  |
| `profile`                      | `"symmetric" \| "asymmetric"`  | MAY      | Construction profile (§6). Default `"symmetric"`.                                      |
| `jwksUri`                      | string (URI)                   | MAY      | REQUIRED when `profile` is `"asymmetric"`.                                             |

Client settings:

| Field            | Type    | Required | Meaning                                                                                |
| ---------------- | ------- | -------- | -------------------------------------------------------------------------------------- |
| `maxHandleBytes` | integer | MAY      | Largest handle the client will carry. Servers MUST respect it or error clearly (§3.3). |

### 8. Failure semantics

An unrecognised, unverifiable, or expired handle indicates that **the server does not know the
conversation**. It does not indicate that access is denied. Authorization is decided by the
authorization layer on the authenticated identity (§2.3), independently and on every request.

Servers MUST NOT resolve any of the following to an existing conversation's state:

1. no handle present;
2. a handle failing integrity verification;
3. an expired handle, other than for exchange under §4.4;
4. a handle whose `cid` is no longer retained (§4.6).

In each case the server MUST treat the request as not established to belong to any conversation.
Whether the server then mints a new conversation, proceeds without conversation-scoped state, or
refuses the operation is server policy, and SHOULD be documented.

The normative content is the prohibition, not the remedy. Servers whose correctness depends on
conversation scope SHOULD fail closed, and SHOULD return an actionable error rather than a generic
one so a well-behaved client can recover:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -30001,
    "message": "Conversation handle not recognised",
    "data": {
      "extension": "io.modelcontextprotocol/conversation-handle",
      "reason": "handle_expired",
      "remediation": "Re-send with the most recently received handle, or omit it to start a new conversation. Conversation-scoped preferences are not available without one."
    }
  }
}
```

Consistent with the core specification's error code policy, error codes for this extension SHOULD be
allocated outside the JSON-RPC reserved range `-32768` to `-32000` (the code above is illustrative
only; no code is claimed), and MUST NOT be drawn from the `-32020` to `-32099` sub-range
reserved to the MCP specification. Where the extension is mandatory for an operation and the client
did not advertise it, servers SHOULD return `MissingRequiredClientCapabilityError` (`-32021`).

---

## Worked example (non-normative): information-flow control

This section is non-normative. It describes how one consumer uses the primitive and which properties
that consumer depends on. No implementation is required to do any of it.

An information-flow-control runtime tracks security labels — "this conversation has seen untrusted
content", "this conversation has read credentials" — and refuses actions that would move labelled
data into a guarded sink. Its enforcement is sound only if labels are bound to something the
adversary cannot choose, and under indirect prompt injection the model is the adversary.

The literature names the failure. Cai et al., _Ghost in the Agent_ (arXiv:2604.23374, Apr 2026),
Definition 6, define **Asynchronous Provenance Reuse** as existing "when the source event `s_i` and
the sink event `s_j` belong to _different agent sessions_ or are separated by a persistent-memory
boundary," and observe that it "breaks execution-trace continuity across sessions, requiring a
persistent provenance graph across process boundaries for detection." Their system audits traces
**offline**, after execution has completed.

With this extension a runtime can do the equivalent check **preflight**:

- It keys its label journal on `cid`, which the model cannot choose, because the handle travels in
  `_meta` (§5.1) and only the server mints handles (§2.2). A compromised model cannot escape
  accumulated labels by presenting a fabricated handle: it fails the MAC check and §8 forbids
  resolving it to an existing conversation.
- It places its label-journal head in the state commitment (§3), and on detecting supersession
  (§4.3) applies its **current** authoritative labels rather than those the presented handle names.
  Replaying an old handle therefore yields no rollback. This is one of the supersession policies
  §4.3 leaves to the server.
- It treats an absent or unrecognised handle as maximum taint rather than zero, under its own policy
  per §8. An adversary who controls the model can always suppress the handle, so omission must be
  the safe case.

The protocol supplies unforgeable, ordered conversation identity. Labels, lattices, declassification,
and enforcement remain inside the runtime and can change without a protocol change. Concurrent
label-journal head races are resolved server-side; the opaque commitment is not a mergeable CRDT.

---

## Rationale

**Why `_meta` rather than a tool argument.** A tool argument is model output. For state that must be
durably and correctly associated with a conversation, the model choosing that association is the
defect. `_meta` is the only position in a post-SEP-2567 request that is unambiguously client-authored
and present on every request. It is also the narrowest possible surface: no method, no tool, no
schema type.

**Who carries the identifier.** The core specification and SEP-2567 describe the carriage of a handle
differently. The Statelessness section says state "MUST be referenced by an explicit identifier **the
client** passes on each request." SEP-2567 describes "server-minted state handles that **the model**
carries and threads through subsequent calls," and shows the model threading `basket_id` "as an
ordinary argument."

Both descriptions are accurate, of different things. The normative sentence states a requirement on
the client: something must accompany every request, because no connection state may be relied upon.
SEP-2567 describes a tool-design pattern that satisfies that requirement in the common case — a model
threading a string through arguments _is_ the client passing an identifier, since the client
transmits whatever the model produced.

The requirement currently has one sanctioned realisation, and that realisation routes the identifier
through the model. No client-side mechanism is defined, so a client that carries an identifier itself
— for conversation scope, where model selection is the defect — has nowhere to put it.

This extension supplies a second realisation of an existing requirement, for the cases where the
tool-argument realisation is unsuitable. A server can support both: baskets in arguments,
conversation scope in `_meta`.

**Why a MAC rather than a random string plus a server-side table.** A sufficiently long random
handle recorded in a server-side table is _equally unforgeable_. Guessing
a 128-bit random string is infeasible either way. But validating one requires a lookup: the server
cannot know whether a presented string is a handle it issued without asking storage. That
reintroduces precisely the shared, affinity-sensitive state SEP-2567 removed, and it would be
rejected on exactly the grounds SEP-2567 gives — the reference TypeScript SDK "provides no public API
for reconstructing a session on a different node, so multi-node deployments cannot honor resumption."
A random-handle design recreates that failure at a different layer.

A self-describing MAC'd handle inverts this. Any instance holding the deployment's key can establish
authenticity, `cid`, `exp`, `seq`, and the state commitment with a single HMAC computation and no
network call. Forged and expired handles are rejected at the edge, so garbage costs a hash rather
than a storage round-trip. There is no affinity requirement and no cross-node handshake, which is
what lets the primitive work in the deployment topology SEP-2567 was designed for.

**Where state remains required.** The MAC makes _handle validity_ stateless. It does not make
everything stateless. Three cases remain:

1. **Conversation state itself.** A conversation is only worth naming because the server holds
   something under that name. That storage is unavoidable and is the same amount SEP-2567's own
   `create_basket()` pattern requires — the basket lives on the server, and the handle is a name for
   it. SEP-2567 removed sessions, not databases.
2. **Supersession detection (§4.3).** Comparing a presented `seq` against the highest issued requires
   the conversation record. This is a lookup — but one the server performs anyway to serve
   conversation-scoped data, so it adds no round-trip in practice. Only the _validity_ claim is
   lookup-free.
3. **Revocation.** A self-describing handle cannot be invalidated before `exp` without a denylist,
   and a denylist must be consulted on _every_ request, including ones that would otherwise touch no
   storage. This is a regression relative to a lookup design. The mitigation is to avoid requiring
   revocation: keep lifetimes short (§7) and rely on rotation (§4.2), with `key_id` rotation
   invalidating everything issued under a key. A deployment requiring immediate per-handle revocation
   must accept the lookup. The property is not free.

**Why the handle carries no principal.** The handle carries no principal identifier, for four
reasons.

_Layering._ The server authenticates every request already. A principal claim inside the handle is a
second authority for the same fact, and two authorities can disagree — after an account merge, a
tenant migration, or a change in subject format, a handle minted under the old identity no longer
matches the new one, and a conversation that should still be reachable is not.

_Delegation._ A sub-agent legitimately acting within a user's conversation may authenticate as a
different workload identity. A hard principal match inside the handle breaks exactly the delegation
case the MCP roadmap's Workload Identity Federation and ID-JAG work exists to support. Server-side
association can express "these identities may act on this conversation"; a fixed payload claim
cannot.

_Privacy._ A stable per-user value embedded in a string that persists in transcripts indefinitely is
a cross-conversation correlator, even when pseudonymous. Anyone who collects transcripts can cluster
them by user. §5.3 forbids it for this reason.

_Simplicity._ It removes a claim, a key, a derivation step, and a rotation concern from every
implementation.

The cost is stated in §"Security Implications": the cross-principal check moves from something the
credential enforces structurally to something the server implements. §2.3 makes it a MUST; a MUST is
not a structural guarantee.

**Why rotation is discretionary rather than per-response, and what that costs.** Rotating on every
response would make supersession the guaranteed outcome of any concurrency. With `N` requests in
flight carrying the same handle, a server that rotates on the first response it issues supersedes
the `N-1` requests already dispatched. Parallel tool calls are the normal case in agent runtimes, so
supersession would be the steady state rather than a signal, and §4.3's flag would report a
condition that carries no information.

The cost is exposure. Under per-response rotation a leaked handle is superseded almost immediately,
and its useful lifetime is roughly one round-trip. Under §4.2 a handle stays current until the server
chooses to rotate, so a leaked handle is useful for as long as it remains unexpired — bounded by
`handleLifetimeSeconds` rather than by the next response. That is a real weakening, and the
mitigations are to keep `handleLifetimeSeconds` short and, where available, to bind the handle to a
proof-of-possession key (§5.2), which defeats replay regardless of lifetime.

The trade is deliberate: a diagnostic signal that works, against a shorter exposure window. A server
handling sensitive conversation state can recover most of the exposure margin by setting a short
lifetime, and can rotate more aggressively than §4.2 requires, since rotation is permitted on any
response.

**Why supersession detection is normative but supersession policy is not.** Ordering is the one
property a consumer cannot recover on its own — without a sequence there is nothing to compare, so a
replayed handle is indistinguishable from a current one for _every_ consumer. That makes it a
protocol concern. What to _do_ about supersession differs irreconcilably: a snapshot read is correct
for a memory store and wrong for an IFC runtime. Specifying one answer would make the extension wrong
for most of its constituency.

**Why the state commitment is opaque.** Two reasons. Adoption: the moment the protocol names what
goes in it, the protocol has adopted a data model, and every implementer must map onto it or opt out.
An opaque field lets a memory server, a cache, and an IFC runtime share one primitive without
agreeing on anything. Disclosure: an opaque version or hash reveals nothing to a model or a
transcript reader, whereas structured state reveals whatever it contains.

**Positioning against the roadmap.** The MCP roadmap (22 Aug 2026) lists DPoP and Workload Identity
Federation under "Agent Identity and Enterprise Security," motivated by "agents running as cloud
workloads with their own identity, acting on behalf of a user who isn't present, or delegating
narrower authority to sub-agents." That work answers **which principal is acting**. This extension
answers a question it does not reach: **which conversation this act belongs to**. One principal has
many concurrent conversations; principal identity alone cannot key durable conversation state. The
two compose cleanly precisely because this extension carries no identity of its own.

**Alternatives considered.**

| Alternative                                                | Why rejected                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Random handle plus a server-side table                     | Equally unforgeable, but validation requires a lookup — reintroduces the shared, affinity-sensitive state SEP-2567 removed.                           |
| Restore protocol sessions (SEP-1359)                       | Not adopted, for sound reasons; also insufficient — a session id has no ordering, so supersession stays undetectable.                                 |
| Do nothing; let each server define a handle tool           | The status quo of §1. Works per-vendor, does not compose, leaves the identifier as model output, and gives no ordering.                               |
| Standardize a `user_id` / `thread_id` parameter convention | A caller-asserted identifier is not verifiable and not ordered; this is the status quo with more ceremony.                                            |
| Reuse the OAuth access token as conversation identity      | Wrong granularity. One principal runs many concurrent conversations; keying on the access token merges them.                                          |
| Reuse MRTR `requestState`                                  | Correct shape, wrong scope — bounded to one in-flight request.                                                                                        |
| Reuse the Tasks extension's durable handles                | Names a unit of asynchronous work, not a conversation; many-to-many with conversations; model-threaded.                                               |
| Bind the principal into the handle                         | See above — layering conflict, breaks delegation, creates a durable user correlator in transcripts.                                                   |
| Put conversation state in the handle                       | Unbounded growth, discloses state to any transcript reader, cannot be made consistent under concurrency.                                              |
| Mandate JWS for all handles                                | Cost without benefit in this trust model; retained as an optional profile (§6.3).                                                                     |
| A new core capability                                      | Against maintainer guidance following SEP-2084: "Adding a capability to the protocol is effectively permanent... Build it as an MCP extension first." |

---

## Backward Compatibility

This extension introduces no backward incompatibility with the core protocol.

- **Servers without the extension.** Unaffected — they do not advertise it, and clients never
  receive a handle.
- **Clients without the extension.** Unaffected. A server receiving a request without the capability
  declared behaves exactly as it does today. Servers MUST NOT make participation a precondition for
  core functionality unless an operation is inherently conversation-scoped, in which case §8's
  `MissingRequiredClientCapabilityError` applies and the requirement is discoverable from
  `server/discover` before any request is made.
- **Unknown `_meta` keys.** A non-participating peer ignores the key entirely. No parsing changes
  are required of anyone.
- **List endpoints.** Unaffected, normatively (§6.4).
- **Extension versioning.** Per SEP-2133, breaking changes use a new identifier
  (`io.modelcontextprotocol/conversation-handle-v2`); additive changes use settings fields. The `version` byte in
  §6.2 additionally lets a server evolve its own encoding with no protocol change at all, because the
  handle is opaque to clients.

---

## Security Implications

**Scope.** This extension provides an identity, integrity, and ordering primitive. It defines no
authorization model. A conversation handle is not an authorization credential (§2.3). Servers
continue to authorize every request on the authenticated principal and their own policy; the handle
answers "which conversation", never "may this proceed".

**Threat model.** The trusted computing base is the issuing deployment, its MAC key, and the host
application's `_meta` construction path. The model is untrusted — assumed adversary-controlled via
indirect prompt injection at any turn. The transport is assumed authenticated, and the authorization
layer sound.

**What the extension defends against.**

| Attack                                                          | Defence                                                                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Caller or model fabricates a conversation identifier            | MAC verification fails; §8 forbids resolving it to an existing conversation.                                                                    |
| Model tampers with `cid`, `seq`, `exp`, or the state commitment | Integrity protection covers the whole body.                                                                                                     |
| Model omits the handle to escape conversation-scoped state      | §8 — MUST NOT resolve to an existing conversation.                                                                                              |
| Handle replayed after conversation state moved on               | §4.3 — supersession is detectable; the response is the server's policy.                                                                         |
| Handle replayed against a different deployment                  | §2.4 — implicit under the symmetric profile, explicit audience under the asymmetric one.                                                        |
| Handle recovered from an old transcript, used indefinitely      | `exp` bounds unexpired-bearer usefulness; exchange (§4.4) extends to retention for §2.3-associated principals; cross-principal stopped by §2.3. |

**Leaked handles.** Because the handle carries no principal (§2.3), an
attacker who obtains a valid, unexpired handle — from a transcript, a log, a screenshot, a shared
subagent prompt — presents something that passes MAC verification. The MAC alone therefore does not
distinguish them from the legitimate holder.

What stops them is the server: §2.3 requires the server to record the principal–conversation
association and forbids disclosing or mutating conversation-scoped state on behalf of a different
principal. An attacker must therefore both obtain the handle **and** authenticate as a principal
associated with that conversation. Against an unauthenticated attacker, or an authenticated attacker
who is a different principal, a correctly implemented server leaks nothing.

The residual risk is that this is now an obligation a server must implement rather than one the
credential enforces structurally, and this class of check is demonstrably missed in practice.
SEP-2567 documents the same failure in the reference Python SDK, citing
[modelcontextprotocol/python-sdk#2100](https://github.com/modelcontextprotocol/python-sdk/issues/2100):
the stateful session manager "routes by `Mcp-Session-Id` alone without verifying that the
authenticated identity on the request matches the one that created the session, so a leaked session ID
allows hijack by any other authenticated principal." A server that omits the §2.3 check reproduces exactly that vulnerability.

Three mitigations reduce but do not eliminate it: short lifetimes and rotation (§4.2, §7) bound the
window; optional proof-of-possession binding (§5.2) defeats pure bearer replay; and conformance
testing of §2.3 makes the omission detectable. Implementers should treat §2.3 as the single
highest-risk requirement in this specification, and SDKs implementing the extension SHOULD make the
association check difficult to skip rather than leaving it to each server author.

**What the extension does not defend against.**

- **A compromised host application.** `_meta` is constructed by the host; a compromised host can
  attach any handle it holds. The extension moves trust from the model to the host — a substantial
  improvement, since the model is compromised routinely by design whereas host compromise is a
  conventional supply-chain event — but it is a relocation, not an elimination.
- **MAC key compromise.** Allows forging handles for any `cid`. Mitigations: `key_id` rotation with
  overlap (§6.2), short lifetimes, and the §2.3 association check, which still requires the attacker
  to authenticate as an associated principal.
- **Same-principal cross-conversation confusion.** A model that has legitimately seen two of its
  principal's handles can present either. Only `cid` distinguishes them, which is precisely what the
  extension makes reliable; §2.3 does not help here because the principal is the same.
- **Resource exhaustion.** A caller can cause conversation minting on every request. Servers SHOULD
  rate-limit minting per principal and bound retained conversations.
- **Covert channels through the model.** Out of scope for any identity primitive.

**Privacy.** Handles carry no identity by construction (§2.3, §5.3). `cid` is unguessable and
therefore not a correlator for anyone not given it. Because handles may persist in transcripts
indefinitely, servers SHOULD keep lifetimes short. Servers SHOULD document conversation retention,
since conversation-scoped state is typically personal data.

**Handle accumulation in transcripts.** Each replacement handle issued under §4.2 is deposited
wherever the conversation is recorded, so a conversation accumulates one handle per rotation rather
than a single handle. Every one of them remains valid until its own `exp`, so the exposure at any
moment is a set of handles rather than one. Discretionary rotation (§4.2) bounds the size of that
set by the rotation frequency the server chooses rather than by the length of the conversation.
Servers SHOULD account for this when setting `handleLifetimeSeconds`: the relevant quantity is the
number of unexpired handles a conversation has produced, not the number in the most recent turn.

**Handle size.** The RECOMMENDED encoding yields 58–100 characters (§6.2). Where handles reach model
context this is a modest cost, and rotation means only the most recent needs retaining.

---

## Reference Implementation

**Repository:** [verifiable-conversation-handles](https://github.com/ryan-s-roberts/verifiable-conversation-handles)
(TypeScript, MIT). This is the reference implementation for this SEP.

It is built on `@modelcontextprotocol/client` and `@modelcontextprotocol/server` and exercises the
full wire surface end to end — including the client half (§4.2), which no existing MCP pattern
covers. Run `npm install && npm test` to execute the conformance-style e2e suite; `pnpm run
example:server` starts a streamable HTTP fixture.

| Component                                                                       | Scope                                                                                                                                           | Location                                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Handle construction and verification (§6.2)                                     | HMAC-SHA256 over a fixed-layout body, constant-time tag comparison, `key_id` selection. Node `crypto` only.                                     | `src/codec.ts`, `src/bytes.ts`                                         |
| Server: mint, rotate, attach to response `_meta`                                | Sequence allocation per `cid`, plus the advisory mirrors in §4.1 (`seq`, `expiresAt`, `supersededHandlePresented`; no `conversationId` mirror). | `src/handle-mint.ts`, `src/rotation.ts`, `src/store.ts`                |
| Server: verify, detect supersession, exchange                                   | §§4.3–4.4. In-memory conversation record.                                                                                                       | `src/presentation-resolver.ts`, `src/execution.ts`, `src/extension.ts` |
| Client: persist per conversation, attach to request `_meta`, discard superseded | §4.2. Seq-aware merge, session-key pinning, `clear()` generation bump.                                                                          | `src/client.ts`                                                        |
| Capability advertisement                                                        | §1, both directions.                                                                                                                            | `src/request-meta.ts`, `src/sdk-meta.ts`, `src/schema/draft/schema.ts` |
| Tool marking (§1.1)                                                             | `tools/list` `_meta` with `requirement` / `mayMint`.                                                                                            | `src/tool-meta.ts`, `src/integrate.ts`                                 |
| Worked examples                                                                 | Memory and information-flow fixtures demonstrating §3 state commitment.                                                                         | `src/fixtures/`, `conformance/ifc-e2e.test.ts`                         |
| Formal model                                                                    | Quint executable spec of §4 lifecycle and client merge rules.                                                                                   | `models/conversation-handle/`                                          |

**Prototype status.** This repository is a runnable prototype sufficient for SEP review under the
[prototype requirements](https://modelcontextprotocol.io/community/sep-guidelines#prototype-requirements):
codec, server mint/rotate/verify/exchange, opaque client persistence, §1.1 tool marks, conformance-style
e2e with `sep-0000.yaml` traceability, and a Quint model of §4. Landing an equivalent in an official
SDK remains desirable adoption work, not a blocker while this SEP is **Awaiting Sponsor**.

**Conformance.** As a Standards Track SEP with observable protocol behaviour, [SEP-2484](https://modelcontextprotocol.io/seps/2484-conformance-tests-required-for-final-seps)
requires a conformance scenario and an `sep-NNNN.yaml` traceability file mapping each MUST/MUST NOT
and SHOULD/SHOULD NOT in §Specification to a check ID or a documented exclusion before Final status.
Primary targets: §2.2 property verification, §2.3 rejection of cross-principal access, §4.2 rotation,
§4.3 supersession detectability, §4.4 exchange, §5.1 rejection of handles in tool arguments, §1.1 tool
marking, and §8's prohibition. A draft traceability file already lives in the reference repository;
writing the upstream scenario before Core Maintainer review is encouraged. §§4.3–4.4 carry the finest
normative distinction between detection and policy. MUSTs without wire manifestation — supporting at
least two concurrent `key_id` values (§6.2), and CSPRNG `cid` generation (§2.2) — are SEP-2484
traceability exclusions (server-internal / implementation obligations verified by review, not wire
scenarios).

**Associated groups.** This SEP is co-routed through the
[Transports Working Group](https://modelcontextprotocol.io/community/working-groups/transports),
the
[Security Interest Group](https://modelcontextprotocol.io/community/interest-groups/security)
(threat model, cross-principal isolation, integrity), and the
[Agents Working Group](https://modelcontextprotocol.io/community/working-groups/agents)
(conversation continuity, memory/orchestration, composition with Tasks). Status is **Awaiting
Sponsor**; a Core Maintainer sponsor is sought for formal review. Discord: `#transports-wg`,
`#security-ig`, `#agents-wg`.

## References

- SEP-2567, _Sessionless MCP via Explicit State Handles_ — [https://modelcontextprotocol.io/seps/2567-sessionless-mcp](https://modelcontextprotocol.io/seps/2567-sessionless-mcp)
- SEP-2575, _Per-request protocol fields_ (removal of `initialize`)
- SEP-2549, _List result caching_
- SEP-2133, _Extensions_ — [https://modelcontextprotocol.io/seps/2133-extensions](https://modelcontextprotocol.io/seps/2133-extensions)
- SEP-1359, _Protocol-Level Sessions for MCP_ — [https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1359](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1359)
- transports-wg#36, _Conversation / Thread IDs_ — [https://github.com/modelcontextprotocol/transports-wg/issues/36](https://github.com/modelcontextprotocol/transports-wg/issues/36)
- SEP-1655, _Client-Side State Management_ (dormant) — [https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1655](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1655)
- SEP-1685, _Request-scoped state_ — [https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1685](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1685)
- Discussion #2894 — [https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2894](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2894)
- SEP-2822, _Client Generated Session ID_ (closed into transports-wg#36) — [https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2822](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2822)
- MCP Core Maintainer Meeting, 4 Feb 2026 (SEP-2084 rejection) — [https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2204](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2204)
- MCP Roadmap, 22 Aug 2026 — [https://blog.modelcontextprotocol.io/posts/mcp-roadmap/](https://blog.modelcontextprotocol.io/posts/mcp-roadmap/)
- Microsoft Foundry Agent Service, _Create and use memory_ — [https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/memory-usage](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/memory-usage)
- Microsoft, _Defending your Memory in Microsoft Foundry Agent Service against memory poisoning_ — [https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/defending-your-memory-in-microsoft-foundry-agent-service-against-memory-poisonin/4529638](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/defending-your-memory-in-microsoft-foundry-agent-service-against-memory-poisonin/4529638)
- mem0, _State of AI Agent Memory 2026_ — [https://mem0.ai/blog/state-of-ai-agent-memory-2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- OpenAI Responses API, conversation state via `previous_response_id` — [https://community.openai.com/t/responses-api-question-about-managing-conversation-state-with-previous-response-id/1141633](https://community.openai.com/t/responses-api-question-about-managing-conversation-state-with-previous-response-id/1141633)
- LangChain / LangGraph, `use_previous_response_id` and thread checkpointing — [https://docs.langchain.com/oss/python/integrations/chat/openai](https://docs.langchain.com/oss/python/integrations/chat/openai)
- Gorgiev & Dalla Piazza, _Stateless MCP_, Equixly, 5 Aug 2026 — [https://equixly.com/blog/2026/08/05/stateless-mcp/](https://equixly.com/blog/2026/08/05/stateless-mcp/)
- Cai, Tang, Wen, Qin. _Ghost in the Agent: Redefining Information Flow Tracking for LLM Agents_, arXiv:2604.23374, 25 Apr 2026
- Debenedetti et al. _CaMeL: Defeating Prompt Injections by Design_, arXiv:2503.18813
- Wang et al. _From Agent Traces to Trust: A Survey of Evidence Tracing and Execution Provenance in LLM Agents_, arXiv:2606.04990
- RFC 2104 (HMAC), RFC 7515 (JWS), RFC 8725 (JWT BCP), RFC 9449 (DPoP)
