# SEP-0000: Cross-Server Data-Origin Labels and Flow Policy

- **Status**: Proposal
- **Type**: Standards Track
- **Created**: 2026-08-03
- **Author(s)**: Omkar Parkhe <omkarparth@gmail.com> (@omkarparth)
- **Sponsor**: None (seeking sponsor)
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/0000

## Abstract

A host typically connects several MCP servers at once, and content returned by one server enters the same model context that decides which tools to call on the others. The protocol carries no indication of where any piece of context came from, so a server receiving a `tools/call` cannot tell whether the arguments derive from the user, from its own earlier results, or from an untrusted third-party server that injected them.

This SEP adds two additive primitives. First, an **origin label** that the host attaches to outbound requests under a reserved `_meta` key, naming the principals whose content contributed to the request. Second, a **flow policy** that a server declares, server-wide or per tool, stating which origins it is willing to accept.

The labels are host-asserted and unsigned, which is made safe by one normative invariant: origin labels **may only restrict, never authorize**. A recipient may refuse a request because of them but must never grant anything on their strength, so forging a label can only cause the forger's own request to be denied.

This closes the cross-server confused-deputy and cross-server exfiltration classes, which no host can close alone because "which origins do I accept" is a statement only the receiving server can make.

## Motivation

### The gap

MCP hosts are multi-server by design. A single agent session routinely has a first-party database server, a vendor SaaS server, and a low-trust web-fetch or marketplace server connected simultaneously. Every one of those servers' outputs lands in the same context window, and that context window is what selects the next tool call.

Nothing in the protocol marks which server produced which bytes. Consequently:

- A tool result from a low-trust server can steer the model into invoking a high-trust server's privileged tool. The high-trust server sees a well-formed, authorized call and has no way to know the request originated in content it would never have trusted. This is a confused deputy that spans two servers, and each server individually behaves correctly.
- Data read from a high-trust server can be passed as an argument to a low-trust server's tool. The low-trust server receives it through an ordinary, authorized call.

Composed, the two directions form a single chain: a low-trust server returns content that steers the model into a higher-trust server's privileged tool, and the result is then handed straight back out through the low-trust server. Neither server is compromised. Neither is misbehaving by its own contract, and every call in the sequence is individually well-formed and authorized. The prototype accompanying this SEP reproduces the chain end to end, first demonstrating that it succeeds under the protocol as it stands today.

### Why the host cannot close this alone

The obvious objection is that the host should just track this itself. The host can, and it must, but that does not produce a solution:

- **Only the receiving server knows its own risk appetite.** A ticketing server may be perfectly happy to accept arguments derived from scraped web pages; a payments server is not. That is a policy statement about the server's own operations, and the host cannot infer it. Without a declaration, every host must guess, and guessing wrong is either an outage or a breach.
- **Per-host heuristics do not compose.** MCP's value is that independently authored servers can be combined by any host. If each host invents its own cross-server rules, a server has no portable way to state a constraint and no expectation that any host will honour it.
- **Defence in depth requires the server to be able to check.** A host that is buggy, misconfigured, or itself the target of an injection will send the call anyway. A server that can inspect the origin label can refuse.

This is the same argument the web made for `Origin` and CORS. The browser computes the origin, but the *server* declares what it accepts, and neither half is useful without the other.

### Why this is not SEP-2817 in different clothing

[SEP-2817](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2817) proposes AI invocation audit context in request `_meta`. Its discussion converged firmly, and correctly, on the boundary that `invocationReason`, `userIntent` and `model` are client-asserted, belong on the audit path, and are explicitly **not authorization evidence**. Implementers in that thread enforce the boundary structurally, keeping those fields out of the policy evaluator entirely.

This SEP deliberately stays on the other side of that line, and the distinction is load-bearing:

| | SEP-2817 `aiInvocation` | This SEP `flowOrigin` |
| --- | --- | --- |
| Claim | Why the model made this call | Which principals' content contributed to this request |
| Asserted by | The client, about the model's reasoning | The host, about its own context assembly |
| Verifiable | No, it is a statement about intent | Yes in principle, the host performed the assembly |
| Permitted use | Audit only | Refusal only, never grant |
| Forgery impact | Misleading audit trail | The forger's own request is refused |

An origin label is not a claim about *why*. It is the host describing an operation it performed itself, and the host is already the component the MCP architecture designates as the enforcement point. Crucially, because the label may only ever be used to say no, a recipient that trusts a forged label cannot be induced to do anything it would not otherwise do. That property is what makes an unsigned label safe, and it is why this can ship without depending on any attestation mechanism.

## Specification

### Terminology

- **Principal** — an identifiable source of content: an MCP server, the end user, or the host application.
- **Contributor** — a principal whose content materially entered the context from which a request was constructed.
- **Assurance state** — the host's assessment of how well it knows a principal's identity. Distinct from the risk of a tool and from the integrity of a declaration.
- **Origin label** — the `flowOrigin` object a host attaches to an outbound request.
- **Flow policy** — the `flowPolicy` object a server declares to state which origins it accepts.
- **Recipient** — the server receiving a request carrying an origin label.

### Capability negotiation

Clients that emit origin labels declare, during initialization:

```json
{
    "capabilities": {
        "flow": {
            "origin": true
        }
    }
}
```

Servers that declare and enforce flow policies declare:

```json
{
    "capabilities": {
        "flow": {
            "policy": true,
            "default": {
                "acceptFrom": ["self", "user", "host", "verified"]
            }
        }
    }
}
```

Peers that do not understand `flow` ignore it, which is current behaviour. A server that advertises `policy` without a `default` is treated as declaring the default policy given above.

### Which requests carry a label

The label attaches to **any request whose parameters can carry content derived from the model context**. The rule is stated as a property rather than a list of methods, because a list goes stale. At the time of writing it covers:

- `tools/call` — the arguments.
- `resources/read` — the URI itself. A read of `notes://export?data=<secret>` is an ordinary-looking request that carries data outward, and is a complete exfiltration channel.
- `prompts/get` — the arguments.
- `completion/complete` — the argument value being completed.

Requests that carry no context-derived parameters, notably the `*/list` methods, do not need a label and **SHOULD NOT** carry one.

Covering `resources/read` is not optional for a complete deployment. A server that gates every tool strictly but leaves its resource URIs unconstrained has left the exfiltration path wide open, and the gap is easy to miss precisely because reads feel inbound.

### Principal identifiers

A principal is identified by one of:

- the canonical server URI of an MCP server, as defined by [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707) and already used by the authorization specification;
- `urn:mcp:user` for content supplied directly by the end user;
- `urn:mcp:host` for content generated by the host application itself, such as a system prompt.

### Assurance states

Each contributor carries a host-assigned `assurance` value from a closed enumeration. Assurance describes how well the host knows **who a principal is**.

It is deliberately not called "trust". MCP already has two other proposals using that word for different objects, and three overlapping vocabularies would be a hazard for implementers and reviewers alike. The axes are genuinely distinct:

| Axis | Object it describes | Owner |
| --- | --- | --- |
| Assurance | A **principal** — do I know who this party is? | This SEP |
| Risk and sensitivity | A **tool** — what happens if I call it? | SEP-1913 |
| Declaration integrity | A **declaration** — is this description authentic and unchanged? | SEP-3140 |

None of the three is derivable from the others, and a host will commonly gate on all three at once.

| Value | Meaning |
| --- | --- |
| `user` | Content the end user supplied directly |
| `host` | Content the host application generated |
| `verified` | An MCP server whose identity and declarations the host has cryptographically verified |
| `tofu` | An MCP server accepted on first use, without verified provenance |
| `unverified` | An MCP server with no established provenance |

A recipient encountering a value outside this enumeration **MUST** treat it as `unverified`.

Assurance is an output of whatever verification the host already performs, not an independent judgement it is asked to invent. A host implementing [SEP-3140](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3140) **SHOULD** map a server whose signed capability manifest verifies against a pinned or allow-listed publisher to `verified`, and one accepted on first use to `tofu`. A host that performs no verification at all reports `unverified` for every server, which degrades safely: strict policies refuse, permissive ones behave exactly as they do today.

### The origin label

The host attaches the label to the request's `_meta` under the reserved key `io.modelcontextprotocol/flowOrigin`:

```json
{
    "method": "tools/call",
    "params": {
        "name": "export_records",
        "arguments": { "table": "customers" },
        "_meta": {
            "io.modelcontextprotocol/flowOrigin": {
                "contributors": [
                    { "principal": "urn:mcp:user", "assurance": "user" },
                    { "principal": "https://mcp.records.example/mcp", "assurance": "verified" },
                    { "principal": "https://mcp.webfetch.example/mcp", "assurance": "unverified" }
                ],
                "complete": true
            }
        }
    }
}
```

- `contributors` — the principals whose content contributed to this request. Each entry **MUST** carry `assurance`. The `principal` field is **OPTIONAL**, see *Privacy-preserving labels*.
- `complete` — `false` indicates the host could not fully enumerate the contributors. Recipients **MUST** evaluate a label with `complete: false` as though an additional contributor with `assurance: "unverified"` were present.

### Host obligations

- The host **MUST** compute `contributors` itself. It **MUST NOT** accept, copy, or merge contributor claims supplied by a server.
- The host **MUST** apply a conservative over-approximation: any principal whose content entered the context partition from which the request was built **MUST** be listed, whether or not the host can show that it influenced the specific arguments. Precise information-flow tracking through model reasoning is not achievable, so this specification requires soundness over precision. See *Rationale*.
- If the host cannot enumerate contributors for any reason, it **MUST** set `complete: false` rather than omitting the label or emitting a partial list as though it were complete.
- A host that has negotiated `flow.origin` **MUST** attach the label to every request it sends to a server that advertises `flow.policy`.

#### Context partitions

Scoping contributors to an entire session would make every contributor set maximal within a few turns, and every strict policy would refuse everything. Operators would switch the feature off, which is worse than not shipping it. Hosts therefore need a way to narrow the scope, and it needs a condition that keeps it sound.

> A host **MAY** compute contributors over a partition of its context rather than over the whole session, if and only if no content originating outside that partition is present in the model context used to construct the request.

The condition is structural and checkable rather than a matter of judgement. Sub-agents with freshly initialized contexts satisfy it. So does explicit compaction that discards the out-of-partition material outright.

One trap must be stated plainly, because missing it defeats the entire mechanism:

> Summarization does **not** clear a contributor. If a model reads content from a principal and then summarizes, paraphrases, translates, or compresses it, the result is still derived from that principal and the contributor **MUST** be retained.

An implementation that treats a summary as clean has built a laundering step. Injected instructions survive summarization comfortably, and the summary is often the only thing that reaches the next turn.

### The flow policy

A server declares a policy at server scope in its capabilities, and **MAY** override it per tool in the tool declaration:

```json
{
    "name": "export_records",
    "description": "Export a table of customer records.",
    "inputSchema": { "type": "object", "properties": { "table": { "type": "string" } } },
    "flowPolicy": {
        "acceptFrom": ["self", "user"]
    }
}
```

`acceptFrom` is an allowlist. Each entry is one of:

- `self` — matches a contributor whose `principal` equals the recipient's own canonical server URI;
- one of the assurance states `user`, `host`, `verified`, `tofu`, `unverified` — matches a contributor with that assurance value;
- `publisher:<url>` — matches a contributor whose publisher identity equals `<url>`;
- an explicit canonical server URI — matches that principal exactly;
- a reverse-DNS prefixed token such as `com.example.tier:gold`, reserved for vendor extensions.

The assurance states are a **closed** set and **MUST NOT** be extended, so that a third overlapping trust vocabulary does not emerge in the ecosystem. The identifier space, by contrast, is deliberately open.

Extension there is safe by construction. Because an unrecognized token never matches, a token introduced later makes an older evaluator *more* restrictive than the policy author intended, never less. The failure mode of extension is a tool becoming uncallable from older hosts, which is loud and quickly diagnosed, rather than a policy silently widening, which is neither.

A per-tool `flowPolicy` replaces the server default for that tool; the two are not merged.

### Evaluation

Given a policy and a label, evaluation proceeds as:

1. If the label is absent, synthesize `{ contributors: [{ assurance: "unverified" }], complete: false }`.
2. If `complete` is `false`, append a synthetic contributor with `assurance: "unverified"`.
3. For each contributor, test it against every entry in `acceptFrom`. An entry the evaluator does not recognize **MUST NOT** match anything.
4. If every contributor matches at least one entry, the flow is **accepted**. Otherwise it is **rejected**, and the unmatched contributors are the violation set.

Both peers evaluate, at different moments:

- The host **SHOULD** evaluate before dispatch, and **MUST NOT** send a request it has determined violates the recipient's declared policy. This is where containment actually happens, because the request is never made.
- The recipient **SHOULD** evaluate on receipt, as defence in depth against a host that is buggy, outdated, or itself compromised.

### The restriction-only invariant

This is the central normative requirement of this SEP.

> A recipient **MUST NOT** use `flowOrigin` to grant, widen, or unlock any capability, scope, authorization, or data access that it would otherwise withhold. A recipient **MAY** use `flowOrigin` only to refuse a request, to narrow a response, or to require additional authorization.

Equivalently: the presence or content of an origin label may move a decision only in the restrictive direction. An implementation can enforce this structurally by computing its authorization decision first, without reference to the label, and then allowing flow evaluation only to downgrade the result.

### Rejection

A recipient that rejects a request on flow-policy grounds responds with a **JSON-RPC error**, not a tool-result error. The tool did not run and no side effect occurred, so reporting it as an execution failure would misdescribe what happened.

This SEP deliberately does **not** mint a numeric error code. Parallel proposals each allocating codes out of the same reserved range is how collisions arise, and the number carries no information the payload does not already carry. Recipients **MUST** discriminate on the presence of the namespaced `data` key, and the numeric code **SHOULD** follow whatever general "not permitted" code emerges from [SEP-2145](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2145).

The error payload:

```json
{
    "message": "Request rejected by flow policy",
    "data": {
        "io.modelcontextprotocol/flowPolicyViolation": {
            "rejected": [{ "assurance": "unverified" }],
            "acceptFrom": ["self", "user"]
        }
    }
}
```

Returning the violation set to the **host** is safe. The recipient discloses nothing it was not already sent, and the host needs the detail to explain the refusal to an operator and to record it.

Returning it to the **model** is not safe:

> A host **MUST NOT** place the violation set, the `acceptFrom` list, or any equivalent explanation of why a flow was refused into model context. It **MAY** report only that the call was not permitted.

A refusal that explains itself is an oracle. A model carrying an injected instruction, told which contributor triggered the block and which origins would have been accepted, can iterate against that feedback until it finds an ungated path. It is the same failure as a login form that distinguishes "no such user" from "wrong password", against an attacker that retries far faster than a human.

### Privacy-preserving labels

Listing principal URIs tells a server which other servers a user has connected, which is a topology disclosure the user may not intend. Hosts **MAY** therefore omit `principal` and send only `assurance`:

```json
{
    "contributors": [{ "assurance": "user" }, { "assurance": "unverified" }],
    "complete": true
}
```

Recipients **MUST** be able to evaluate a policy against assurance states alone. A policy using `self`, `publisher:` or explicit-URI entries will not match a contributor whose principal was withheld, which fails closed rather than open.

## Rationale

### Why restriction-only, rather than signing the label

The alternative is to make labels authoritative through attestation, binding them to a signed request record along the lines of [SEP-2787](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2787) or [SEP-2828](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2828). That is a real and useful design, and it is complementary, but it is not what this SEP needs.

If a label can only ever cause a refusal, forging it is pointless: an attacker who inflates trust achieves nothing, because a recipient is forbidden from granting anything on that basis, and an attacker who deflates trust only gets their own request denied. The security of the mechanism therefore does not rest on the integrity of the label at all. That is what lets this ship as a small additive change with no cryptographic dependency, and it is what keeps it compatible with the boundary the SEP-2817 discussion settled on.

Where a recipient wants to *rely* on origin rather than merely restrict on it, for example to reduce friction for trusted flows or to write an authoritative audit record, it needs a signed assertion, and that belongs with the attestation work rather than here.

### Why over-approximate contributors

Tracking which specific bytes of a model's context influenced which specific token of a tool call is not solvable in general. Any attempt to be precise will under-report, and under-reporting is a silent security failure: the one contributor that gets dropped is exactly the injected one.

Over-approximating, by listing everything that entered the partition, is sound but imprecise. The cost is false rejections, where a call is refused because an unrelated low-trust server happened to be read earlier. That is an availability cost, not a security one, and hosts reduce it by partitioning context rather than by guessing at influence. Choosing the failure mode that is loud rather than silent is deliberate.

### Alternatives considered

- **Host-only enforcement, no protocol change.** Rejected because the receiving server's risk appetite is not knowable by the host, and per-host rules do not compose across an open ecosystem.
- **A `rejectFrom` denylist alongside `acceptFrom`.** Rejected as a footgun. An allowlist is default-deny; a denylist silently admits anything the author did not think of.
- **Per-argument rather than per-request labels.** Rejected as premature. It multiplies wire size and implementation complexity for a precision the host cannot actually deliver, given the over-approximation above.
- **Carrying origin in a transport header rather than `_meta`.** Rejected because it would not survive stdio and would diverge from the established `_meta` extension pattern.
- **Minting a dedicated JSON-RPC error code.** Rejected. The namespaced `data` key is already an unambiguous discriminator, and several in-flight proposals allocating numbers from the same reserved range is a collision waiting to happen.
- **Reusing SEP-2817's `aiInvocation` block.** Rejected because that block is deliberately audit-only and client-asserted. Overloading it would erode a boundary its participants deliberately established.

### Relationship to existing work

- **[SEP-2817](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2817), AI Invocation Audit Context.** Complementary and deliberately disjoint, per the table in *Motivation*. Neither block is authorization evidence. A host implementing both sends `aiInvocation` for audit and `flowOrigin` for restriction.
- **[SEP-3140](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3140), Signed Capability Declarations.** Supplies the verification whose result becomes the `verified` assurance state, along with the publisher identity that makes `publisher:` entries discriminating. This SEP degrades safely without it, reporting `unverified` for every server. Note also that a per-tool `flowPolicy` sits inside the tool declaration, so under SEP-3140 it is covered by the declaration's `contentHash` and a server cannot quietly widen its own policy after approval without triggering re-gating.
- **[SEP-1913](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913), Trust and Sensitivity Annotations.** A different axis, per the table in *Assurance states*. SEP-1913 labels what a **tool** will do; this labels who **data** came from. Neither is derivable from the other, and a host will commonly gate on both: a destructive tool called with data of unknown origin is a different proposition from the same tool called on the user's own input.
- **[SEP-2787](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2787) / [SEP-2828](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2828) / [SEP-3004](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3004).** The attestation and audit family. `flowOrigin` is a natural field to carry into a signed decision or audit record, and SEP-3004's registered-extension mechanism is the right vehicle.
- **[SEP-2624](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2624) and the Interceptors WG.** Interceptors are the natural host-side enforcement point for the pre-dispatch check described above.
- **Security IG.** This addresses the discussion-agenda item "Tool identity across servers", which has been open without a champion since the group's charter.

## Backward Compatibility

Fully additive and capability-negotiated.

- A client that does not send `flowOrigin` behaves exactly as today. Servers evaluating a policy treat the absent label as `unverified` and `complete: false`, so a server that adopts a strict policy before its clients adopt labelling will reject calls. Servers **SHOULD** therefore adopt a permissive default until labelling is widespread.
- A server that declares no `flowPolicy` behaves exactly as today, and hosts perform no pre-dispatch check for it.
- `flowPolicy` on a tool declaration and `flowOrigin` in `_meta` are both optional fields that older peers ignore.
- No existing method signature changes.

## Security Implications

- **Forged labels.** Neutralized by the restriction-only invariant. Inflating trust grants nothing; deflating it denies the forger's own call. This is the property that permits an unsigned label.
- **A compromised or malicious host.** Out of scope, and unsolvable at this layer. A host that lies about contributors is a host that could simply call the tool directly. Servers needing assurance against a hostile host require attestation, not labelling.
- **Under-reporting.** The genuine failure mode. If a host reports fewer contributors than really influenced a request, a policy check passes when it should not. The `complete` flag and the mandated over-approximation exist to make under-reporting an explicit, detectable choice rather than an accident.
- **Topology disclosure.** Principal URIs reveal which servers a user has connected. Mitigated by permitting assurance-only labels, which fail closed against URI-specific policy entries.
- **Refusal as an oracle.** A refusal that explains which contributor caused it, and what would have been accepted, is a bypass oracle. An injected instruction can iterate against that feedback until it finds an ungated route. This is why the violation set is host-facing only and **MUST NOT** reach model context: the structured data exists for policy engines, operators and audit records, not for the context window.
- **Laundering through summarization.** The most likely implementation mistake is treating a summary of low-assurance content as clean. The normative rule in *Context partitions* exists because this single shortcut would silently disable the whole mechanism.
- **False sense of coverage.** A flow policy constrains what a server accepts. It does not prevent the model from being manipulated, and it does not replace prompt-injection defences, approval gating, or per-tool authorization. It bounds the blast radius of a successful injection across a principal boundary, which is a narrower claim.
- **Denial of service through label inflation.** A low-assurance server that gets itself read early in a partition can cause later privileged calls to be refused. This is an availability consequence of over-approximation and is the intended trade.

## Reference Implementation

A runnable, dependency-free prototype accompanies this proposal at [`sep-flow-policy-poc/`](../sep-flow-policy-poc/README.md).

```bash
node sep-flow-policy-poc/demo.mjs
node --test sep-flow-policy-poc/test/conformance.test.mjs
```

The prototype implements host-side contributor tracking, label construction, policy evaluation on both peers, and the restriction-only invariant as an enforced code path rather than a documented promise. The demo reproduces the two-server attack in full: a low-trust server returns content that steers the model into a high-trust server's export tool, and then attempts to exfiltrate the result back through the low-trust server. It runs the same scenario twice, once with flow policy disabled to show the current protocol's behaviour, and once with it enabled to show both legs refused.

The conformance suite covers label normalization, fail-closed handling of absent and incomplete labels, unknown-value handling, `self` and `publisher:` matching, vendor-prefixed tokens on a host that does not understand them, host pre-dispatch blocking, server-side re-evaluation, `resources/read` gating, assurance-only privacy mode, the redaction of refusal detail before it could reach model context, and a property test asserting that no label can convert a denial into an approval.

## Open Questions

1. Should the assurance states be maintained by this SEP, or migrate into a shared vocabulary if the Security IG consolidates the three axes described under *Assurance states*?
2. Should vendor-prefixed `acceptFrom` tokens be registered anywhere, or left entirely to bilateral agreement between a server and the hosts that understand it?
3. Should a server be able to declare a flow policy per resource or per URI template, or only server-wide, for `resources/read`?

