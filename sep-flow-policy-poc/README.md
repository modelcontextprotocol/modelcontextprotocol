# Cross-server flow policy reference prototype

A runnable prototype for [SEP-0000: Cross-Server Data-Origin Labels and Flow Policy](../seps/0000-cross-server-data-origin-labels-and-flow-policy.md).

It implements the whole mechanism end to end: host-side contributor tracking, the `flowOrigin` request label, server-declared `flowPolicy`, evaluation on both peers, a host-side cross-principal ceiling, redaction of refusals before they could reach the model, and the restriction-only invariant enforced as a code path rather than a documented promise.

## Running it

```bash
node sep-flow-policy-poc/demo.mjs
node --test sep-flow-policy-poc/test/conformance.test.mjs
```

No dependencies and no install step. It runs on a stock Node install.

## What the demo shows

The demo runs the same two-server attack twice. A low-assurance web-fetch server returns a page carrying a hidden instruction, and that instruction steers the model into calling a high-assurance records server's export tool and then handing the result back to the low-assurance server.

Under today's protocol the whole chain succeeds and the customer table leaves the trust boundary. Neither server is compromised and neither misbehaves by its own contract, which is precisely why no single server can prevent it.

With flow policy enabled, the export call is never dispatched, because the web-fetch server has already contributed to the partition and `export_records` declares `acceptFrom: ["self", "user"]`. The remaining scenarios show that the same privileged call still succeeds when no low-assurance server has contributed, that the exfiltration leg is independently blocked by the host ceiling, that an ordinary `resources/read` is gated too because its URI is an egress channel, that a refusal reaches the model as a bare verdict rather than an explanation, and that a server refuses a request carrying no label at all.

## Layout

```text
sep-flow-policy-poc/
  src/principals.mjs   principal identifiers, closed assurance vocabulary, token matching
  src/context.mjs      host-side contributor tracking over a context partition
  src/floworigin.mjs   building the label, and reading it back defensively
  src/policy.mjs       policy evaluation, the restriction-only invariant, redaction
  servers.mjs          two reference servers that declare and enforce a policy
  host.mjs             reference host: tracking, ceiling, pre-dispatch check, routing
  demo.mjs             the cross-server attack, with and without the control
  test/conformance.test.mjs
```

## The invariant, in code

The security of an unsigned label rests entirely on one property: it may only ever restrict. That is enforced structurally in `src/policy.mjs`:

```text
combine(baseDecision, flowResult):
    if baseDecision is not ALLOW -> DENY
    otherwise -> ALLOW only if the flow result allows
```

The base authorization decision is computed first and without reference to the label. Flow evaluation is consulted afterwards and can move the result in one direction only. A property test asserts that no label, of any shape, can convert a denial into an approval. That is why forging a label is pointless: inflating assurance grants nothing, and deflating it only denies the forger's own request.

## Design notes worth reviewing

- The vocabulary is called assurance, not trust. SEP-1913 already uses "trust" for the risk of a tool and SEP-3140 for the integrity of a declaration; this labels how well the host knows who a principal is. Three overlapping trust vocabularies would be a hazard for implementers and reviewers alike.
- Contributors are deliberately over-approximated. Any principal whose content entered the partition is listed, whether or not it can be shown to have influenced the specific arguments. Precise taint tracking through model reasoning is not achievable, and under-reporting is a silent security failure, so the prototype chooses the loud failure mode. The cost is false rejections, which is an availability trade rather than a security one.
- Summarizing content does not clear its contributor. This is the most likely implementation mistake, since a summary looks like new host-authored text, and taking that shortcut would silently disable the whole mechanism. A test pins the behaviour.
- Everything fails closed. An absent label, a malformed label, an empty contributor list, a `complete` value that is not literally `true`, an unknown assurance state, and an unrecognized `acceptFrom` token all resolve to the most restrictive interpretation available.
- The assurance states are closed, but the identifier space is open. A vendor token such as `com.example.tier:gold` is inert on a host that does not understand it, because unknown tokens never match. Extension therefore makes an older evaluator more restrictive rather than less, which is why it needs no registry to stay safe.
- Both peers evaluate. The host pre-checks and refuses to dispatch, which is where containment actually happens because the request is never made. The server evaluates independently on receipt, which covers a host that is buggy, outdated, or itself compromised. A test drives the second path by disabling the host check.
- Reads are gated too. `notes://export?data=<secret>` exfiltrates on an ordinary `resources/read`, so a design that only labels `tools/call` closes nothing. The prototype applies the same evaluation to reads and matches resource policies ignoring the query string.
- Refusals are redacted before they could reach the model. The violation set and the `acceptFrom` list say which contributor caused the block and what would have been accepted, which is a bypass oracle an injected instruction can iterate against. The host keeps the detail for its audit log; the model gets only the verdict.
- The refusal carries no minted error code. Recipients discriminate on the namespaced `data` key, so the SEP does not need to claim a number from a range several in-flight proposals are also drawing from.
- Privacy mode is supported. A host may send assurance states without principal URIs, so a server learns the risk without learning which other servers the user has connected. A policy keyed on an explicit URI then fails closed against a withheld principal.
- A per-tool `flowPolicy` lives inside the tool declaration. Under SEP-3140 that puts it under the declaration's `contentHash`, so a server cannot quietly widen its own policy after approval without triggering re-gating.

## Limitations

- Transport is omitted. This SEP changes what accompanies a request, not how bytes move.
- Assurance states are assigned by the host in the prototype rather than derived from verified provenance. A host implementing SEP-3140 would map a verified signed manifest to `verified`; without it, every server degrades to `tofu` or `unverified`.
- Context partitions are modelled but not policed. The prototype offers a narrower partition and documents the condition under which one is sound, but nothing here verifies that a host has actually met it.
- The model is simulated. The demo hard-codes the tool sequence an injected page would induce, because the point under test is the flow control, not the model's susceptibility.
- This is the runnable prototype, not the conformance artifact. SEP-2484 additionally requires a scenario in the conformance repository with a traceability file mapping each MUST and SHOULD to a check ID.
