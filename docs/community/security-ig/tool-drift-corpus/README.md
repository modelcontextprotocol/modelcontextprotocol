# Tool-definition drift corpus (rug-pull) — MCP

A shared, labeled, expected-verdict test corpus for post-approval tool-definition
drift: the "rug-pull" case where a server passes admission, then changes a tool on
a later session. Point a detector at it and check it catches the malicious change
without firing on benign evolution.

Two complementary drift signals, each in its own file, each labeled with verdicts
from a real engine (not asserted):

- `content-injection-cases.json` — the declared surface (schema, annotations) stays
  identical; the attack is smuggled into the description text (post-approval,
  version-bump, marker-gated). Verified against the open ATR detection engine
  (deterministic rules). Contributed by Adam Lin / ATR.
- `capability-surface-cases.json` — the tool's declared surface escalates after
  approval: schema, annotations (readOnly -> destructive), declared effects,
  data-access, external-reach, auth-scope. Verified against the Interlock
  drift-detection engine. Contributed by Maaz / Interlock.

A real rug-pull defense wants both signals; neither half catches the other. The
seam is explicit: the capability-surface "undeclared" tier — escalation hinted only
in prose with nothing declared in metadata — is exactly where structural
surface-diff hands off to content-injection detection.

## Format
Each case: `baseline` (approved tool) -> `twin` (post-approval tool) + `intent` +
`verified_verdict` (the real engine's actual output: severity + action). Grouped
into:
- `malicious` — must fire (escalate / block / quarantine).
- `benign` — must stay quiet (allow / monitor, never block). The controls are the
  point: a detector that fires on benign evolution is untrustworthy.
- `undeclared` (capability-surface only) — escalation hinted only in prose, nothing
  declared. Surfaced for review, not auto-blocked: a change visible only in prose is
  low-confidence, and auto-blocking would false-positive on tools that merely mention
  "delete" or "external". The honest boundary of structural surface-diff.

## Verification summary (2026-06-16)
- content-injection: malicious 4/4 fire (block), benign 3/3 quiet. Engine: ATR (MIT).
- capability-surface: malicious 6/6 fire (block/quarantine), benign 5/5 quiet,
  undeclared 3/3 surfaced for review. Engine: Interlock.

Labels are verified engine output, not assertions. Contributed jointly by
Adam Lin (ATR, github.com/Agent-Threat-Rule/agent-threat-rules) and Maaz (Interlock).
