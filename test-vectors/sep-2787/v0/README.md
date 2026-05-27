# SEP-2787 Tool Call Attestation, proposed-shape test vectors v0

**Status: proposed-shape, not conformance for current SEP-2787 draft.**

These vectors target the revised envelope shape proposed in [vaaraio's
four-proposal comment](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2787#issuecomment-4544033186)
on #2787: `plannerDeclared` / `issuerAsserted` / `payloadDerived`
trust-surface blocks, explicit args-commitment kinds (digest, ref,
projection), JCS canonicalisation, IEEE-754 float rejection at the
canonicalisation boundary. Field names follow MCP camelCase convention
(soup-oss/modelcontextprotocol@48c739b1).

The SEP-2787 text as currently written describes a flatter v1 shape
(top-level `iss` / `sub` / `intent`, `toolCalls[*].argsRef` /
`argsProjection` as named optional fields). A second implementer
reading the SEP as-is would correctly implement v1 and fail these
fixtures.

Treat as **provisional** until the SEP text adopts matching schema and
canonicalisation rules. A sibling `v1-current` vector set against the
SEP text as written is on offer if useful.

Apache-2.0. Derived from `tests/test_attestation_sep2787.py` at
vaaraio/vaara@3d7af54 (tag `sep2787-ref-v0`, merged via
vaaraio/vaara#139). SEP maintainers own the final normative artifact
location.

## Layout

`normative/` cases bind the wire format. A conformant SEP-2787
implementation MUST reproduce or reject these as documented.

- `positive/`. Canonical bytes, signature input bytes, and signed
  envelopes across HS256, ES256, RS256, and across the digest, ref,
  projection args-commitment shapes. Six cases.
- `negative/`. Tampering on the plannerDeclared and issuerAsserted
  blocks (signature verification fails), and IEEE-754 float rejection
  at the canonicalisation boundary. Three cases.

`verifier-policy/` cases depend on validator policy that the SEP has
not yet specified. They are not pass/fail against the wire format
alone.

- TTL expiry past `iat + exp + skew`. Skew tolerance is policy.
- Unsupported alg (HS512) rejection. Alg whitelist is policy.
- Schema rejection of unknown args-commitment kinds. Schema is policy.
- HS256 envelope against an ES256-only verifier. Alg-acceptance is
  policy.

Once the SEP names skew tolerance, the alg whitelist, the canonical
schema, and the verifier alg-acceptance rule, these cases become
normative.

## Per-case files

Each case directory contains up to five files.

- `unsigned_envelope.json`. The envelope body before signing, with the
  three trust-surface blocks `plannerDeclared`, `issuerAsserted`,
  `payloadDerived`, plus `version` and `alg`.
- `canonical_signing_input.bin`. The RFC 8785 (JCS) canonical encoding
  of the unsigned envelope. This is the exact byte sequence the signer
  signs over and the verifier hashes.
- `canonical_signing_input.hex`. Same bytes as `canonical_signing_input.bin`,
  hex-encoded for human inspection and diff-friendly review.
- `signed_envelope.json`. The signed envelope including the `signature`
  field. Omitted for the float-rejection case where canonicalisation
  itself is the rejection point.
- `expected.json`. Machine-readable expected outcome: verification
  result, verifying material, rejection dimension (for negative cases),
  policy dependency (for verifier-policy cases), determinism flag.

## Determinism

HS256 and RS256 (PKCS1v15) are deterministic. A second implementation
re-signing `canonical_signing_input.bin` with the corresponding key
reproduces `signed_envelope.signature` exactly.

ES256 signing is randomised. The ES256 case stores one valid signature.
A second implementation verifies it against `keys/es256_public.pem`
rather than reproducing the hex bit-for-bit.

## Keys

`keys/hs256_secret.bin` is 32 raw bytes. `keys/es256_private.pem` and
`keys/es256_public.pem` are PKCS8 and SPKI PEM. `keys/rs256_private.pem`
and `keys/rs256_public.pem` are PKCS8 and SPKI PEM. ES256 signatures
are raw r||s (64 bytes), not ASN.1 DER.

## Independent walker

`_check_independent.py` reads the fixtures from disk and walks the
conformance dimensions with no reference to any implementation. Imports
stdlib plus `cryptography` and `rfc8785` only. Output is tagged
NORMATIVE or POLICY per bucket.

Run it with:

```
pip install cryptography rfc8785
python _check_independent.py
```

## Acceptance gate

One independent implementation reads these fixtures and produces the
same canonical bytes and signature verification results for every
NORMATIVE case. POLICY cases come online once the SEP specifies the
relevant validator-policy paragraphs.
