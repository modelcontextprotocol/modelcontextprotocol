# SEP-3246: Provenance-Carrying Authority Confinement for Delegated Tool Calls

- **Status**: draft
- **Type**: Extensions Track
- **Created**: 2026-08-12
- **Author(s)**: Alina Shah (@alinashah_67727)
- **Sponsor**: TBD
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3246
- **Extension namespace**: `io.noescalation`

## Abstract

This extension adds a provenance record to tools/call, carried in _meta under io.noescalation/provenance. The record is the delegation chain: one entry per hop, each naming the delegating component and the bound it conferred. A guard on the call path admits the call only if it falls within the intersection of every bound along the chain — so a narrowing at any hop binds every hop after it, and no component can confer authority it does not hold.

The extension specifies the provenance object, a constraint language for bounds closed under intersection, the meet operation, and the processing rules a conforming guard follows.

It is additive and opt-in: participants that do not implement it ignore the key and are unaffected.

## Motivation

A tools/call arrives at a server carrying no record of the authority path that produced it. The server sees a well-formed request from a caller with valid credentials, and executes it.

Delegation is now the common case: a host agent decomposes a task and dispatches subtasks to sub-agents, which call tools. At each step the delegator may intend to confer less than it holds. A host with access to acme/app and acme/docs dispatches a subtask to a worker, narrowing it to acme/app alone. The worker — through prompt injection, a malicious tool result, or an ordinary bug — requests acme/docs. The request is well-formed, the credential is valid, and the server executes it. The narrowing existed only in the planner's intent; the protocol carried nothing about it.

This is the confused deputy, and three properties make it a protocol-level concern:

**It is invisible locally.** Every participant behaves correctly given what it knows. The server cannot detect the violation because the information needed to detect it never reached the server.

**It does not survive chaining.** A constraint imposed at hop one must bind at hop four. Without a carried record, a narrowing is lost as soon as the narrowing component leaves the request path.

**Point-of-use authorization does not address it.** OAuth scopes and RAR payloads answer "does this caller hold an adequate credential?" Here the answer is yes, and the call is still outside what was conferred.

## Specification

### 1 Terminology

**Effect.** A tool invocation with its arguments — the unit at which authority is granted and checked. Traffic below this granularity (pagination, token refresh, cache reads) is implementation of an effect, not a separate effect.

**Component.** A participant on the call path that MAY delegate: a host, an agent, a sub-agent, or a deputy (an MCP server holding ambient credentials).

**Bound (β).** A set of effects a component is permitted to cause. Encoded on the wire as a union of rules (§4).

**Provenance chain (π).** An ordered, append-only sequence of hops, oldest first. Each hop records a component and the bound it attached when delegating. π is the wire form of the delegation history.

**effbound.** The effects a call is permitted, given π: the intersection (`meet`) of every attached bound along the chain. A guard admits a call if and only if it lies within effbound.

**Guard.** A component that constructs or extends π and enforces effbound. The reference implementation is a proxy on the stdio path between host and server.

**Conferral.** The act of a component attaching a bound when delegating. Conferral only narrows: a component MUST NOT confer authority it does not itself hold.

### 2 The Provenance Object

#### 2.1 Location

A provenance chain MUST be carried in the request's `_meta` object under the key `io.noescalation/provenance`. This key follows the reverse-DNS convention for `_meta` keys (SEP-2133); it is distinct from, and sits beside, the W3C Trace Context keys (`traceparent`, `tracestate`, `baggage`) reserved by SEP-414.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "create_issue",
    "arguments": { "repo": "acme/app", "title": "..." },
    "_meta": {
      "io.noescalation/provenance": {
        "v": 1,
        "chain": [
          { "component": "host", "bound": [/* rules */] },
          { "component": "planner", "bound": [/* rules */] }
        ]
      }
    }
  }
}
```

Because MCP `2026-07-28` is stateless — every request self-contained, no session state (SEP-2567) — the chain MUST be carried in full on every request. A guard MUST NOT rely on chain state retained from a prior request.

#### 2.2 Structure

The provenance object has:

- `v` (integer, REQUIRED): schema version. This document defines `v: 1`. A guard receiving an unrecognized `v` MUST fail closed (§4.4.3). `v` applies to the provenance object as a whole, not per hop: a guard extending a chain MUST NOT alter `v`, and MUST fail closed rather than extend a chain whose `v` it does not implement.
- `chain` (array, REQUIRED): the hops, oldest first. Each hop is an object with:
  - `component` (string, REQUIRED): an identifier for the delegating component. Opaque to the meet; used for audit.
  - `bound` (array of rules, REQUIRED): the bound attached at this hop (§4).
- `sig` (string, RESERVED): reserved for a future revision specifying an integrity binding. Under this version, implementations MUST NOT populate this field, and a guard MUST ignore it if present (§4.4.5).

The chain is append-only. A component extending π MUST append a hop and MUST NOT modify, remove, or reorder existing hops.

### 3 Bounds

#### 3.1 Rules

A bound is a JSON array of rules. A call is within the bound if and only if it matches at least one rule (rules are alternatives — union within a bound).

An empty bound (`[]`) admits nothing: no rule matches, so every call is
outside it. A hop attaching an empty bound confers no authority, and any chain
containing such a hop has an empty effbound. This is the correct reading of
full revocation and MUST NOT be treated as "unconstrained."

An empty chain (`"chain": []`) likewise confers no authority and MUST be
treated as admitting nothing. A guard MUST NOT interpret an empty chain as an
absent chain; absent provenance is handled by §4.4.5.1.

A rule is an object:

```json
{ "tool": "create_issue", "args": { "repo": { "in": ["acme/app"] } } }
```

- `tool` (string, REQUIRED): the tool name this rule permits.
- `args` (object, OPTIONAL): a map from argument name to constraint (§4.3.3.2). An argument not named is unconstrained.

A call `(name, arguments)` matches a rule if and only if: `name` equals the rule's `tool`, and for every constrained argument, the argument is present and its value satisfies the constraint. Unconstrained arguments place no restriction.

#### 3.2 Constraints

A constraint restricts one argument's value. The constraint operators are exactly:

```
constraint ::= { "eq":     value }        // equals value
             | { "in":     [ value, ... ] } // member of the set
             | { "prefix": string }        // string starts with prefix
             | { "glob":   string }        // matches shell-glob pattern
             | { "and":    [ constraint, ... ] } // satisfies all (see §4.3.3)
```

A guard MUST support all five. A guard MUST NOT admit an operator outside this set; in particular, arbitrary regular expressions and numeric ranges are excluded — see §4.3.4 for why this set and no other.

##### 3.2.1 Type compatibility

Each operator is defined over a value type. `eq` and `in` compare JSON values
for equality (§4.3.3.2.3). `prefix` and `glob` are defined over JSON strings only.

If a constraint is applied to an argument whose JSON type is incompatible with
the operator — `prefix` or `glob` against a number, boolean, null, array, or
object — the constraint MUST evaluate to no match. A guard MUST NOT coerce
the value to a string, and MUST NOT treat a type mismatch as an error that
bypasses the check. The rule simply fails to match, and the call is rejected
unless some other rule in the bound admits it.

##### 3.2.2 Canonicalization (normative)

Argument values MUST be canonicalized before any constraint is evaluated
against them. Without this, `prefix` and `glob` are trivially bypassable: the
string `/repo/../../etc/passwd` has the prefix `/repo/` while denoting a
location outside it.

A guard MUST apply the following, in order, to every string argument value
before matching, and MUST apply the identical transformation to the string
operand of a `prefix`, `glob`, `eq`, or `in` constraint:

1. **Unicode normalization** to NFC.
2. **Percent-decoding**, repeated until the value no longer changes, for
   arguments whose tool schema declares them to be URIs, paths, or otherwise
   percent-encoded. A guard MUST bound this to a small fixed number of
   iterations and MUST reject the call if the value has not stabilized (this
   prevents decoding-bomb inputs).
3. **Path normalization**, for arguments denoting hierarchical paths or
   resource identifiers: resolve `.` and `..` segments, collapse repeated
   separators, and remove a trailing separator. A value that resolves above
   its own root (a leading `..` that cannot be resolved) MUST be rejected as
   malformed rather than normalized to something else.

Comparison is case-sensitive by default. A deployment whose underlying
resources are case-insensitive (for example, a case-insensitive filesystem or
a hosting provider that treats repository names case-insensitively) MUST
case-fold both operands before comparison, and MUST document that it does so.
Applying case-sensitive comparison over case-insensitive resources admits a
bypass by case variation; applying case-folding over case-sensitive resources
over-restricts but does not escalate.

A guard MUST reject a call whose argument cannot be canonicalized (malformed
encoding, unresolvable path) rather than matching against the raw value.

Rationale: canonicalization is the boundary at which most authorization
bypasses in comparable systems occur. Making it normative and explicit — and
requiring the _same_ transformation on both operands — is what makes `prefix`
and `glob` mean what a reader expects them to mean.

##### 3.2.3 `eq` and `in` comparison

`eq` and `in` compare canonicalized values. Two values are equal if they have
the same JSON type and: for strings, are equal after §4.3.3.2.2; for numbers, are
numerically equal; for booleans and null, are identical. Arrays and objects
compare by deep structural equality with object keys unordered.

##### 3.2.4 `glob` dialect (normative)

`glob` patterns are interpreted under exactly the following rules. No other
metacharacters are recognized; any other character matches itself literally.

| Pattern             | Matches                                                  |
| ------------------- | -------------------------------------------------------- |
| `?`                 | exactly one character, **except** the separator `/`      |
| `*`                 | zero or more characters, **except** the separator `/`    |
| `**`                | zero or more characters, **including** the separator `/` |
| `[abc]`, `[a-z]`    | one character from the set or range                      |
| `[!abc]`, `[^abc]`  | one character not in the set                             |
| `\` + metacharacter | the metacharacter, literally                             |

The `/`-exclusion for `*` and `?` is the authority-relevant choice: a bound of
`acme/*` admits `acme/app` and MUST NOT admit `acme/app/sub`. A deployment
that intends to admit arbitrary depth MUST write `acme/**` explicitly. A guard
MUST NOT implement `*` as crossing separators, because doing so silently
widens every bound written by a deployment that assumed otherwise.

Patterns MUST be matched against the whole canonicalized value, not a
substring: an implicit anchor at both ends.

A guard MUST reject a bound containing a syntactically invalid pattern
(unterminated `[`, trailing `\`) as malformed (§4.4.3) rather than attempting
recovery.

#### 3.3 The `meet`

`meet` is the operation that accumulates conferral down the chain. It has two levels, which MUST NOT be conflated:

- **Within a bound:** the rules are a **union** (a call is in the bound if it matches some rule).
- **Across hops:** the bounds are **intersected** (a call is in effbound if it is admitted by _every_ hop's bound).

`effbound(π)` is therefore the meet of all hops' bounds: `meet(β₁, β₂, …, βₙ)`, where `meet` of two bounds is the rule set `{ meet(r₁, r₂) : r₁ ∈ B₁, r₂ ∈ B₂ }` with empty results dropped, and `meet` of two rules conjoins their argument constraints (dropping the rule if any argument's constraint intersection is empty).

The intersection of two constraints on the same argument MUST be exact: it MUST NOT admit a value outside either input. Where two constraints have no single-operator intersection, their meet is expressed as an `{ "and": [...] }` constraint — satisfy both — which is exact. (This is why the operator set is closed: the meet of any two constraints is always expressible, as a conjunction if not more simply.)

This `meet` corresponds to pointwise conjunction of attached bounds along the chain, the operation proved in the formal model (`Kernel.lean`, `meet_sub_hop`).

#### 3.4 Why this operator set (normative rationale)

The operator set is `{eq, in, prefix, glob, and}` and no other, for one reason: **`meet` must stay in the language.** A guard computes effbound by intersecting bounds; if the intersection of two admissible constraints could not be expressed as an admissible constraint, the guard could not compute conferral, and the no-escalation guarantee would not hold at the wire level.

- `eq`, `in`, `prefix`, `glob` are each closed under intersection (with `and` capturing irreducible cases). Admitted.
- **Regular expressions are excluded**: the intersection of two regular expressions is not, in general, a regular expression, so `meet` would escape the language.
- **Numeric ranges are excluded**: no authority-bearing numeric argument has been observed in surveyed tools — numeric arguments are pagination (a resource concern, not authority) or object identifiers (authorized by their containing resource, a string, never by numeric range). A future extension version MAY add a `range` operator (it is closed under intersection) if an authority-bearing numeric argument arises.

Every admitted operator except `range` (were it added) is a string operator, reflecting that authority in this domain is denoted by strings: repository names, paths, owners, tool names.

### 4 Processing Rules

A guard is a component that constructs or extends π and enforces effbound. This section specifies what a conforming guard MUST do. The reference implementation (`proxy/guard.py`) follows these rules.

#### 4.1 Constructing and extending π

On a `tools/call` it processes, a guard MUST determine the outbound provenance chain as follows:

1. **Read** any inbound chain from `_meta["io.noescalation/provenance"]` (§3).
2. **Extend** it by appending exactly one hop whose `component` is the guard's own component identifier and whose `bound` is the bound this component confers (its policy).
   - If no inbound chain is present, the guard MUST start a new chain (`v: 1`, empty) and append its single hop.
   - The guard MUST NOT modify, remove, or reorder existing hops (§4.3.3.2.2, append-only).
3. **Attach** the resulting chain to the outbound message's `_meta` under the reserved key before forwarding.

A component MUST NOT confer, in the bound it attaches, authority it does not itself hold. (This is the conferral-only-narrows discipline; a guard that attaches a bound wider than its own inbound effbound violates the extension.)

#### 4.2 Checking effbound

Before forwarding a `tools/call`, the guard MUST compute `effbound` as the `meet` of every hop's bound in the extended chain (§4.3.3) and determine whether the call `(name, arguments)` lies within it (§4.3.3.1).

- If the call is within effbound, the guard MUST forward it (with the extended π attached).
- If the call is not within effbound, the guard MUST NOT forward it; it MUST respond per §4.4.3.

Messages that are not `tools/call` (initialization, `tools/list`, notifications, results) are outside the scope of effbound checking in this version and MUST be relayed unchanged. (Result-side mediation — the Membrane property — is reserved for a future version; see Security Implications.)

#### 4.3 Fail-closed behavior

A guard MUST fail closed. Specifically:

- A `tools/call` outside effbound MUST NOT reach the server. The guard MUST return a JSON-RPC error to the caller with code `-32001` and a `message` naming the extension and the rejected tool. The error `data` SHOULD include the tool name and arguments for audit.
- A provenance object with an unrecognized `v` or a malformed chain MUST be treated as a violation and rejected as above. A guard MUST NOT fall back to forwarding a call whose provenance it cannot parse. (Absent provenance is not malformed provenance; see §4.4.5.1.)
- A guard MUST NOT silently drop a message it cannot parse as JSON-RPC in a way that suppresses either the call or an error response; unparseable traffic is relayed unchanged (it is not a `tools/call` the guard can act on) rather than dropped.

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32001,
    "message": "io.noescalation: 'delete_repo' with these arguments is outside the conferred bound",
    "data": { "tool": "delete_repo", "arguments": { "repo": "acme/app" } }
  }
}
```

#### 4.4 Modes

A guard MUST support enforce mode (the default), in which violations are rejected per §4.4.3. A guard MAY support audit mode, in which a violation is logged and the call is nonetheless forwarded. Audit mode exists for safe rollout — a deployment can observe what enforce mode would reject before enabling it. A guard in audit mode MUST record each would-be rejection. A guard's mode MUST default to enforce; audit MUST be explicit opt-in.

#### 4.5 Chain integrity

This version does not specify a cryptographic binding for π. No signature
algorithm, serialization, or canonicalization is defined here, and this
specification therefore provides no mechanism by which a receiving guard can
detect modification of π by an intermediate component.

The consequence is explicit: a component in the request path can drop a hop,
or widen a bound it previously attached, and no conforming implementation is
required to detect it.

Deployments claiming conformance MUST therefore satisfy at least one of:

- **(a) Trusted path.** Every component that reads or extends π is trusted not
  to modify it — for example, a single guard is the sole constructor and
  consumer of π, with no untrusted component handling the chain in between.
  A deployment relying on (a) MUST document the trust boundary within which
  it holds.
- **(b) Out-of-band integrity.** An integrity binding applied outside this
  specification renders modification of π by an intermediate component
  detectable. A deployment relying on (b) MUST document the mechanism.

A deployment satisfying neither MUST NOT claim conformance, and MUST NOT rely
on this extension for confinement across mutually distrusting intermediaries.

The `sig` field in §4.3.3.2.2 is reserved for a future revision that specifies a
binding directly. Implementations MUST NOT populate it under this version, and
a guard MUST ignore it if present. Prior work on signed capability tokens with
per-hop attenuation demonstrates that a chained construction is achievable;
the omission here is scope, not feasibility.

#### 4.5.1 Absent provenance

A guard MAY receive a `tools/call` carrying no `io.noescalation/provenance`
key — from a non-participating client, or as the first hop in a chain. This is
distinct from a malformed chain (§4.4.3) and MUST NOT be treated as a violation
on that basis alone.

A guard MUST be configured with one of two dispositions for absent provenance,
and the disposition MUST be explicit rather than defaulted silently:

- **originate** — the guard treats itself as the origin of the chain,
  constructs a new chain per §4.4.1, and checks against its own conferred bound
  alone. Appropriate where the guard sits at the trust boundary of the
  deployment and callers upstream of it are not expected to participate.
- **reject** — the guard treats absent provenance as a violation and responds
  per §4.4.3. Appropriate where every legitimate caller is expected to
  participate, so an absent chain indicates a bypass.

A guard MUST NOT infer unrestricted authority from an absent or incomplete
chain under either disposition. Where a chain is present but records fewer
hops than the actual delegation path (partial deployment), the computed
effbound reflects the bounds actually recorded; the guarantee degrades
accordingly and the deployment MUST account for the unrecorded hops in its
declared unmediated set (§4.4.7).

#### 4.5.2 Capability negotiation

This extension does not require capability negotiation under SEP-2133.

The provenance object is additive metadata under a reverse-DNS `_meta` key.
A participant that does not implement the extension ignores the key and
behaves exactly as it does today (§6, Backward Compatibility); a participant
that does implement it derives no benefit from knowing whether its peer does,
because the check is performed by the guard against the chain as recorded, not
negotiated between endpoints. There is consequently no interoperability
failure that negotiation would prevent.

Deployments that require assurance their peers participate SHOULD establish
that out of band, and MUST reflect any non-participating path in their
declared unmediated set (§4.4.7).

#### 4.6 Declaring the unmediated set

The guarantee in this specification holds over effects that traverse the
mediated path. Effects reachable by other means — in-process tool invocation,
direct system access from a code-execution tool, or any channel that does not
pass a conforming guard — are outside it.

Deployments claiming conformance MUST publish the set of authority-bearing
effects reachable outside the mediated path (the _unmediated set_, U).
Deployments MUST NOT claim conformance while treating U as empty by
assumption; U MUST be established by inspection of the deployment, not
asserted.

Where U is nonempty, the guarantee is that no-escalation holds over the
complement of U. This is a weaker but well-defined claim, and it is the claim
a deployment with a nonempty U is entitled to make. It corresponds to the
graceful-degradation result in the formal model (`Degradation.lean`, T2u).

Rationale: every mechanism in this family depends on the mediated path being
the only path. Requiring U to be declared converts an unstated assumption into
a checkable deployment property. An audit method for establishing U
empirically, rather than by self-report, is demonstrated in the reference
repository under `instantiation/`.

#### 4.7 Conformance requirements

A deployment conforms to this extension if and only if it satisfies:

- **R1 (no ambient authority).** Components act only on conferred capabilities; a component cannot reach authority absent from its inbound effbound.
- **R2 (framework-owned provenance).** π is constructed by the framework/guard and is not modifiable by the components whose calls it describes. Under this version, R2 is satisfied by a documented trusted path or an out-of-band integrity binding (§4.4.5), not by a mechanism this specification defines. A deployment that cannot establish R2 does not conform.
- **R3 (deputy contracts).** A component holding ambient authority the guard cannot mediate enforces its own effbound check before acting.
- **R4 (bounds only narrow).** No component confers a bound wider than its inbound effbound; no operation widens an established bound.
- **R5 (mediation, or declared exception).** Every effect an untrusted component can cause is either guard-mediated or enumerated in a declared unmediated set U. The guarantee holds on all effects outside U. (A deployment MUST enumerate U rather than leave it implicit.)
- **R6 (tool-call granularity).** Enforcement is at the tool-call boundary; sub-call traffic is not separately checked.

A deployment meeting R1–R6 inherits the no-escalation guarantee proved for the formal model (`CLAIMS.md`, T1–T4): no component causes an effect outside effbound, preserved under delegation, chaining, and narrowing, with revocation effective under the stated conditions.

## Rationale

### Related work

Three recent proposals have independently converged on chain attenuation. Each
is summarized here with the property that distinguishes it from this proposal;
a longer comparison is in the repository under `docs/related-work.md`.

- **AIP** (arXiv 2603.24775) — an agent identity protocol. Invocation-Bound
  Capability Tokens fuse identity, attenuated authorization, and provenance
  into an append-only chain (signed JWT for single-hop, Biscuit with Datalog
  for multi-hop), with subset enforcement verified cryptographically at each
  block. AIP authenticates the chain; this proposal specifies what the chain
  confers. AIP's threat model records the complement explicitly: under
  "dishonest verifier" it states that verifier compliance is "an operational
  concern addressed through conformance testing and reference implementations,
  not a property the protocol can enforce cryptographically."

- **ACP** (arXiv 2603.18829) — temporal admission control. Its contribution
  is that properties depending on execution history cannot be enforced by
  stateless per-request evaluation. Orthogonal to this proposal along the axis
  each addresses: this extension asks whether one call is inside what was
  conferred; ACP asks whether a sequence of conferred calls is an attack. ACP
  is precise about its formal scope, stating that "the phrase 'formally
  verified' is deliberately avoided; the correct claim is: model checking of
  selected safety and liveness properties under a bounded state model."

- **Five-Plane reference architecture** (arXiv 2606.12320) — closest prior art
  to the construction here. It defines the effective capability set as the
  intersection of the capability sets along the delegation chain and treats
  attenuation as a structural primitive. This proposal does not claim the
  construction as novel; independent derivation is the standardization
  argument. Five-Plane states that its invariants are "argued structurally, not
  formally proved," that formal verification of attenuation correctness at
  scale "is unsolved," that its evidence is "property-based testing, not formal
  verification" which "does not discharge the verification obligation," and
  that its capability lattice "is what gives the formal-methods community a
  hook into the architecture."

**Within MCP:** SEP-2643 (structured denial envelope) is complementary along a
clean line — it concerns calls that produce a denial; this extension concerns
calls that produce none, because the server has no basis to deny them. RAR
metadata and multi-token client work address credential selection at the point
of use, a different question from what a chain confers.

### Why an extension rather than adopting an existing proposal

MCP's design principles favor convergence over choice, so a fifth mechanism
needs justification. Three reasons:

1. **Scope.** AIP is an identity protocol requiring identity resolution, key
   distribution, and a policy runtime. ACP carries a risk engine, a ledger, and
   an institutional trust anchor. Five-Plane spans five planes of enterprise
   infrastructure. This extension assumes identity is already handled and
   specifies one thing: the chain of conferred bounds and the check against
   their intersection.

2. **Weight.** A reverse-DNS `_meta` key and a subset check. No token format,
   no signature scheme, no policy runtime, no shared state. A participant that
   cannot run a Biscuit verifier can still implement this; a participant that
   implements nothing is unaffected.

3. **Semantics.** Each proposal above asserts that attenuation composes; none
   specifies what that guarantees. A deployment cannot currently determine
   whether two conforming implementations admit the same calls. A specified
   semantics plus a conformance suite makes that determinable.

### Formal grounding

The property is mechanized in Lean 4 (Mathlib-free, pinned toolchain;
`lake build` reproduces). Proved over unbounded chains and traces: soundness;
chain conferral (extending a chain can only shrink what is permitted);
composition across conforming and non-conforming components; revocation
effectiveness with issuance fixed at invocation, plus a weak form that drops
quiescence and names the residual window in its conclusion; graceful
degradation over the complement of the unmediated set (the formal backing for
§4.4.6); and composition under concurrency over a shared store.

The concurrency result is two-sided and reported as such: spatial confinement
survives genuine overlap, but the temporal (revocation-timing) half does not
transfer without an explicit happens-before order the model does not provide.

The development proves properties of the model, not that any implementation
refines it. That gap is why the conformance vectors exist as a separate
artifact.

### Design decisions

- **`_meta`, not a header or new method** — the transport-independent extension
  point the base protocol already defines, with unrecognized keys ignored,
  giving backward compatibility without negotiation. A header binding would be
  HTTP-specific; a new method would not be an extension.
- **Chain self-contained per request** — the core protocol is stateless; there
  is no session in which to accumulate one.
- **Operator set `{eq, in, prefix, glob, and}`** — chosen for closure under
  intersection: the meet of any two constraints must be expressible in the same
  language, or a guard cannot carry forward the intersection of bounds attached
  at different hops. Regular expressions fail this (two regexes do not
  intersect to a regex). Numeric ranges were excluded on separate empirical
  grounds: an audit of a production MCP server's tool schemas found every
  authority-bearing argument to be a string, with numerics appearing only as
  pagination and identity parameters.
- **The meet, not the performer's own bound** — checking only the performer's
  bound admits re-amplification; checking only the requester's chain admits the
  confused deputy. Both are in Appendix A (C4, C5) and both are rejected by the
  reference implementation.
- **Chain integrity out of scope this version** — specifying an integrity
  binding without a reviewed cryptographic design would be worse than stating
  the gap. AIP demonstrates a signed chained construction is achievable; the
  omission is scope, not feasibility. §4.4.5 states the consequence and
  requires deployments to establish a trusted path or out-of-band binding.
- **U-declaration normative** — every mechanism in this family depends on the
  mediated path being the only path, and none requires that assumption to be
  checked. Declaring the unmediated set makes it auditable, and the
  graceful-degradation result gives the guarantee that survives when it is
  nonempty.

### Alternatives considered

- **Adopt AIP and specify nothing** — requires identity infrastructure a
  deployment may not want in order to obtain confinement, and does not specify
  the semantics of the attenuation it enforces.
- **Put the bound in OAuth scopes or RAR** — both are point-of-use constructs
  describing what the caller holds, not what each hop conferred. A downstream
  agent holding a valid credential is precisely the case addressed here.
- **Server-side policy only** — inverts the direction of information: a server
  cannot know what a delegator upstream of its caller intended to confer. This
  also preserves the position that MCP defines authorization _communication_
  rather than policy — the bound is a caller's declaration of what it hands
  downstream, and the server remains authoritative and free to deny anything.
- **Wait for convergence** — the mechanisms have converged; their meaning has
  not. Further implementation without a specified semantics increases
  divergence rather than resolving it.

## Backward Compatibility

This extension introduces no backward incompatibilities. It adds no methods, no message types, and no changes to existing schemas — only additive `_meta` metadata and processing rules for participants that opt in.

**Non-participating servers** ignore the key, per the base specification's handling of unrecognized `_meta`, and behave exactly as they do today. Verified against the official `@modelcontextprotocol/server-filesystem`, which accepted a `tools/call` carrying `io.noescalation/provenance` and completed a `read_file` normally.

**Non-participating clients** emit no key. A conforming guard encountering a request without provenance applies the dispositions in §4.6 rather than failing outright, so such a client is not broken by a conforming guard elsewhere in the path. Capability negotiation is not required; the rationale is in §4.6.

**Partial deployment.** Where some hops participate and some do not, the chain records only the participating ones, and the guarantee degrades correspondingly: effbound reflects the bounds actually recorded. A non-participating hop appears as an absent link, not an unbounded one. Deployments MUST NOT read an incomplete chain as conferring unrestricted authority, and MUST account for unrecorded hops in the declared unmediated set (§4.7).

## Security Implications

If its assumptions hold, this extension makes effect escalation impossible regardless of what a model intends or is induced to intend, including by prompt injection. The guarantee is bounded precisely by those assumptions and by its scope, both stated here.

### Assumptions

- **R1, unforgeable capabilities.** Components cannot construct or name authority they were not conferred. If a component can synthesize a capability, effbound is meaningless.
- **R2, framework-owned provenance.** The chain is constructed by the guard and not modifiable by the components it describes. This specification defines no mechanism preventing modification; R2 rests entirely on a documented trusted path or an out-of-band binding (§4.5). This is the largest assumption in the trust surface and the most likely to be violated silently in a real deployment.
- **R3, deputy contract discharge.** A component holding ambient credentials the guard cannot mediate must enforce its own effbound check. A deputy holding broad authority and not self-checking is not covered.
- **R5, mediation.** Effects reach the world only through mediated calls, except for a declared set U. An unmediated actuator — a shell, an interpreter, raw network access — is outside the guarantee, and a deployment that has not enumerated U has not established the precondition for the effects that escape.

These are enumerable and checkable — that is why they are stated as R1–R6 — but they are not zero. An adversary capable of attacking the trust surface attacks there: forging provenance, subverting a deputy, reaching an unmediated actuator. The effbound check itself holds.

### Out of scope

- **Influence.** This bounds authority — what a component may cause — not influence, what it may induce through effects it is permitted to cause. A confined component can still be steered into misusing authority it legitimately holds, and covert channels through permitted effects (timing, content, ordering) are not addressed. Bounding influence is a distinct property with known non-composability obstacles, deliberately not attempted here.
- **Bound selection.** The extension enforces that effects stay within the conferred bound; it says nothing about whether that bound is the right one. A perfectly enforced but wrongly chosen bound is a hazard it does not detect.
- **Result-side mediation.** This version checks outbound calls, not inbound results. A server returning a capability handle or sensitive content is not currently constrained (reserved for a future version).
- **Model-internal modification.** The extension governs effects caused through tool calls, not a component's modification of its own reasoning or substrate by other means.

### What conformance buys

A conforming deployment converts one class of agent harm — effect escalation beyond conferred authority — from something that depends on model behavior into something that depends on architecture. Within the assumptions and scope above, that class is structurally prevented rather than behaviorally discouraged. This is a meaningful reduction in blast radius. It is not a claim that a conforming agent is safe.

## Reference Implementation

**Repository:** https://github.com/alinamiretai/no-escalation
**Guard + tests:** `proxy/` — **Formal development:** `lean/` — **Models:** `models/`

Runnable in under a minute (Python 3, no dependencies):

```
git clone https://github.com/alinamiretai/no-escalation
cd no-escalation/proxy
python3 test_attacks.py       # four benchmark attacks, rejected fail-closed
python3 test_multihop.py      # multi-hop delegation composition
python3 test_vectors.py       # the conformance vector suite
python3 test_meta_realhost.py # _meta accepted by a real MCP server (needs Node)
```

**Implemented:** chain construction and extension across hops; `meet` over the
operator set, exact and sound for all operator pairs; canonicalization and the
glob dialect (§3.2.2, §3.2.4); effbound checking with fail-closed rejection
(`-32001`); enforce and audit modes; the full conformance vector suite.

**Not yet implemented:** revocation (proved in the formal development; the guard
does not yet expose a narrow operation); chain integrity binding (§4.5 — the
guard is the sole constructor and consumer, so integrity holds by construction
in that deployment and is not exercised); result-side mediation (out of scope
this version).

**Formal development:** Lean 4, Mathlib-free, pinned toolchain; `cd lean && lake
build` reproduces. Proves the theorems listed under Rationale → Formal
grounding, over unbounded chains and traces. It proves properties of the model,
not that the Python refines the model.

**`_meta` compatibility:** verified against the official
`@modelcontextprotocol/server-filesystem`, which accepted a `tools/call`
carrying `io.noescalation/provenance` and completed a `read_file` normally
(`test_meta_realhost.py`).

## Appendix A — Worked Example and Conformance Test Vectors

### A.1 A worked delegation

A host is granted access to two repositories, dispatches planning to a planner, which dispatches a subtask to a worker. Each hop narrows.

#### Stage 1 — host originates

No inbound provenance; the host's guard disposition is `originate` (§4.6), so it constructs a chain and appends its own hop:

```json
{
  "v": 1,
  "chain": [
    {
      "component": "host",
      "bound": [
        {
          "tool": "create_issue",
          "args": { "repo": { "in": ["acme/app", "acme/docs"] } }
        },
        { "tool": "read_file", "args": { "path": { "prefix": "/srv/acme/" } } }
      ]
    }
  ]
}
```

One hop, nothing to intersect, so **effbound** is the host's bound: `create_issue` on `acme/app` or `acme/docs`, `read_file` under `/srv/acme/`.

#### Stage 2 — planner narrows

The subtask needs one repository. The planner's guard appends a hop (§4.1) and MUST NOT modify the existing one:

```json
{
  "component": "planner",
  "bound": [
    { "tool": "create_issue", "args": { "repo": { "eq": "acme/app" } } }
  ]
}
```

**effbound** is now the meet of both hops (§3.3):

- The planner's bound contains no `read_file` rule, so `read_file` drops out entirely.
- For `create_issue`, the argument constraints conjoin: `{"in": ["acme/app","acme/docs"]} ⊓ {"eq": "acme/app"}` = `{"eq": "acme/app"}`.

Result: **`create_issue` on `acme/app` only.** `acme/docs` and `read_file` are unreachable downstream of this hop, even though the host conferred them.

#### Stage 3 — worker calls

**Accepted.** `create_issue` with `{"repo": "acme/app", "title": "Fix login"}` — within effbound. `title` is unconstrained by the rule and places no restriction (§3.1). Forwarded with the chain attached.

**Rejected — confused deputy.** `create_issue` with `{"repo": "acme/docs"}`. Inside the _host's_ bound, outside the _planner's_; the meet excludes it. This is precisely what a point-of-use check cannot catch: the worker holds a valid credential, and the server would execute the call. Rejected per §4.3:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32001,
    "message": "io.noescalation: 'create_issue' with these arguments is outside the conferred bound",
    "data": { "tool": "create_issue", "arguments": { "repo": "acme/docs" } }
  }
}
```

**Rejected — re-amplification.** Suppose the worker's guard appends a hop conferring `{"repo": {"in": ["acme/app", "evil/pwn"]}}`, wider than it received. Appending it violates §4.1, but even if it occurs the meet is unaffected: `evil/pwn` appears in no earlier hop, so intersection excludes it. Widening downstream cannot restore authority (`Kernel.lean`, `meet_hop_sub`).

### A.2 Conformance test vectors

The full suite — composition, degenerate cases, constraint operators, meet soundness, and rule/argument handling — is in the repository at `proxy/VECTORS.md`, executable via `python3 proxy/test_vectors.py`. It is intended as the basis for the conformance scenario required before this SEP could reach `final`.

A guard passing the suite satisfies the mechanical requirements of §3 and §4.6. It does not thereby satisfy §4.5 (chain integrity) or §4.7 (declared unmediated set), which are deployment properties and cannot be established by testing a guard in isolation.

## Acknowledgments

This proposal's positioning benefited from the published work of the AIP, ACP,
and Five-Plane authors, whose independent convergence on chain attenuation
motivated the case for specifying its semantics, and whose explicit statements
about the bounds of their own formal treatments identified the gap this proposal
addresses.
