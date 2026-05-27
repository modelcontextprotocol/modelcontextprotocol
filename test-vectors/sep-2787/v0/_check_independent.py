"""Independent walker for the SEP-2787 v0 test vectors.

Reads fixtures from disk with no reference to any implementation.
Imports stdlib plus `cryptography` and `rfc8785` only.

Usage:
    pip install cryptography rfc8785
    python _check_independent.py

NORMATIVE cases gate the exit code. POLICY cases are reported but do
not affect it, because they depend on validator policy the SEP has not
yet specified. Apache-2.0.
"""
from __future__ import annotations
import hashlib, hmac, json, sys
from datetime import datetime
from pathlib import Path

import rfc8785
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

HERE = Path(__file__).resolve().parent
KEYS = HERE / "keys"
DEFAULT_ALG_WHITELIST = {"HS256", "ES256", "RS256"}
DEFAULT_ALLOWED_KINDS = {"digest", "ref", "projection"}
DEFAULT_SKEW_SECONDS = 30


def load_hs(): return (KEYS / "hs256_secret.bin").read_bytes()
def load_es(): return serialization.load_pem_public_key((KEYS / "es256_public.pem").read_bytes())
def load_rs(): return serialization.load_pem_public_key((KEYS / "rs256_public.pem").read_bytes())


def verify_hs256(payload, sig_hex, secret):
    expected = hmac.new(secret, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig_hex)


def verify_es256(payload, sig_hex, pub):
    if len(sig_hex) != 128:
        return False
    try:
        raw = bytes.fromhex(sig_hex)
    except ValueError:
        return False
    der = encode_dss_signature(int.from_bytes(raw[:32], "big"),
                               int.from_bytes(raw[32:], "big"))
    try:
        pub.verify(der, payload, ec.ECDSA(hashes.SHA256()))
        return True
    except InvalidSignature:
        return False


def verify_rs256(payload, sig_hex, pub):
    try:
        sig = bytes.fromhex(sig_hex)
    except ValueError:
        return False
    try:
        pub.verify(sig, payload, padding.PKCS1v15(), hashes.SHA256())
        return True
    except InvalidSignature:
        return False


def body_of(signed):
    return {k: v for k, v in signed.items() if k != "signature"}


def report(cid, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {cid}{('  ' + detail) if detail else ''}")
    return ok


def has_float(v):
    if isinstance(v, float):
        return True
    if isinstance(v, dict):
        return any(has_float(x) for x in v.values())
    if isinstance(v, list):
        return any(has_float(x) for x in v)
    return False


def walk_norm_positive():
    print("\n== NORMATIVE / positive ==")
    out = []
    for cd in sorted((HERE / "normative" / "positive").iterdir()):
        if not cd.is_dir():
            continue
        expected = json.loads((cd / "expected.json").read_text())
        signed = json.loads((cd / "signed_envelope.json").read_text())
        stored = (cd / "canonical_signing_input.bin").read_bytes()
        recomputed = rfc8785.dumps(body_of(signed))
        if recomputed != stored:
            out.append(report(cd.name, False, "canonical bytes mismatch"))
            continue
        alg = expected["alg"]
        sig = signed["signature"]
        if alg == "HS256":
            ok = verify_hs256(stored, sig, load_hs())
        elif alg == "ES256":
            ok = verify_es256(stored, sig, load_es())
        elif alg == "RS256":
            ok = verify_rs256(stored, sig, load_rs())
        else:
            ok = False
        out.append(report(cd.name, ok, f"{alg} verification"))
    return out


def walk_norm_negative():
    print("\n== NORMATIVE / negative ==")
    out = []
    for cd in sorted((HERE / "normative" / "negative").iterdir()):
        if not cd.is_dir():
            continue
        cid = cd.name
        if cid == "09-ieee754-float-in-canonical-input":
            body = json.loads((cd / "unsigned_envelope.json").read_text())
            out.append(report(cid, has_float(body), "IEEE-754 float at boundary"))
            continue
        signed = json.loads((cd / "signed_envelope.json").read_text())
        stored = (cd / "canonical_signing_input.bin").read_bytes()
        recomputed = rfc8785.dumps(body_of(signed))
        canon_ok = recomputed == stored
        sig_ok = verify_hs256(stored, signed["signature"], load_hs())
        out.append(report(cid, canon_ok and not sig_ok,
                          "tampered body, signature rejected"))
    return out


def walk_policy():
    print("\n== VERIFIER-POLICY / negative ==")
    out = []
    for cd in sorted((HERE / "verifier-policy" / "negative").iterdir()):
        if not cd.is_dir():
            continue
        cid = cd.name
        expected = json.loads((cd / "expected.json").read_text())
        signed = json.loads((cd / "signed_envelope.json").read_text())
        if cid == "10-ttl-expired-past-skew":
            iat = signed["issuerAsserted"]["iat"]
            iat_e = datetime.fromisoformat(iat.replace("Z", "+00:00")).timestamp()
            deadline = iat_e + signed["issuerAsserted"]["expSeconds"] + DEFAULT_SKEW_SECONDS
            rejected = float(expected["verify_at_epoch"]) > deadline
            reason = f"verify_at > iat+exp+skew (default skew={DEFAULT_SKEW_SECONDS}s)"
        elif cid == "11-unsupported-alg-hs512":
            rejected = signed["alg"] not in DEFAULT_ALG_WHITELIST
            reason = f"alg {signed['alg']!r} not in default whitelist"
        elif cid == "12-invalid-args-commitment-kind":
            kinds = {a["kind"] for a in signed["payloadDerived"]}
            rejected = bool(kinds - DEFAULT_ALLOWED_KINDS)
            reason = f"args kinds {kinds} include disallowed under default schema"
        elif cid == "13-hs256-envelope-against-es256-verifier":
            rejected = signed["alg"] != "ES256"
            reason = f"envelope alg {signed['alg']!r} != verifier policy ES256_only"
        else:
            rejected = False
            reason = "unknown policy case"
        out.append(report(cid, rejected, reason))
    return out


def main():
    p, n, pol = walk_norm_positive(), walk_norm_negative(), walk_policy()
    print("\n== Summary ==")
    print(f"  NORMATIVE positive: {sum(p)}/{len(p)} pass")
    print(f"  NORMATIVE negative: {sum(n)}/{len(n)} pass")
    print(f"  POLICY negative:    {sum(pol)}/{len(pol)} match default policy")
    if all(p + n):
        print("\nNORMATIVE: ALL PASS")
        sys.exit(0)
    print("\nNORMATIVE: FAILURES PRESENT")
    sys.exit(1)


if __name__ == "__main__":
    main()
