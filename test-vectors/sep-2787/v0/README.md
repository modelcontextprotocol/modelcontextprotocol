# SEP-2787 Tool Call Attestation, test vectors v0 (v2 envelope)

These vectors target the v2 envelope shape: `plannerDeclared` /
`issuerAsserted` / `payloadDerived` trust-surface blocks with
`toolCalls` under `payloadDerived`, `args` carrying either an
`ArgsRef` (present `ref`, optionally `digest` + `canonicalization`)
or an `ArgsProjection` (present `projection` as a JCS-canonical
JSON string, plus `projectionDigest`), JCS canonicalisation of the
envelope, IEEE-754 float rejection at the canonicalisation boundary,
MCP camelCase field names.

The v2 envelope drops the previous `kind`-discriminated args union.
`ArgsRef` and `ArgsProjection` self-discriminate by present fields.
Hash-only identity is expressed as an `ArgsProjection` whose
projection content is `{"digest": "sha256:..."}`, which removes the
need for a separate `ArgsDigest` variant.

Apache-2.0. Derived from `tests/test_attestation_sep2787*.py` at
vaaraio/vaara@5ea7cd3 (tag `sep2787-ref-v2`, merged via
vaaraio/vaara#151). SEP maintainers own the final normative artifact
location.

## Layout

`normative/` cases bind the wire format. A conformant SEP-2787
implementation MUST reproduce or reject these as documented.

- `positive/`. Canonical bytes, signature input bytes, and signed
  envelopes across HS256, ES256, RS256, and across both
  args-commitment shapes. Six cases: three hash-only-identity
  `ArgsProjection` round-trips (one per alg), one `ArgsRef`
  round-trip, two `ArgsProjection` round-trips carrying real
  projection content.
- `negative/`. Tampering on the plannerDeclared and issuerAsserted
  blocks (signature verification fails on the recanonicalised body),
  and IEEE-754 float rejection at the canonicalisation boundary.
  Three cases.

`verifier-policy/` cases depend on validator policy that the SEP has
not yet specified. They are not pass/fail against the wire format
alone.

- TTL expiry past `iat + exp + skew`. Skew tolerance is policy.
- Unsupported alg (HS512) rejection. Alg whitelist is policy.
- Schema rejection of an `args` object that carries neither `ref` nor
  `projection`, so neither commitment branch can be reconstructed.
  Schema is policy.
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
  of the body the signature was actually computed over. For positive
  cases this equals the recanonicalisation of the body present in
  `signed_envelope.json`. For tampered cases (07, 08) it is the
  pre-tamper canonical, so the signature still verifies against these
  bytes; recanonicalising the present (tampered) body produces
  different bytes against which the signature does not verify, and
  that is how the walker detects tampering.
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
