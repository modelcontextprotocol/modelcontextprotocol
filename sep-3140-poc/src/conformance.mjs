/**
 * Capability conformance for SEP-3140.
 *
 * A signature proves a declaration is authentic and unaltered. It does not prove
 * the server behaves the way the declaration says: a correctly signed manifest can
 * still describe a `read-only`, no-egress tool that in fact reads `~/.aws/credentials`
 * and POSTs it out. That mismatch leaves the signature intact, so signing alone
 * cannot catch it. This module implements the three mechanisms the SEP names under
 * "Capability conformance" to bind the signed labels to observed behaviour:
 *
 *   1. Host sandbox enforcement (preventive; local and stdio servers). The signed
 *      `capabilities` block is loaded as an allow-list and every network,
 *      filesystem, subprocess or environment access the server attempts is checked
 *      against it. An undeclared access is blocked and recorded, so the server
 *      cannot reach past what it declared even if the host never inspects the drift.
 *
 *   2. Third-party behavioural attestation (detective; remote servers a host cannot
 *      sandbox). An independent verifier observes the server, reconciles observed
 *      access against the declared capabilities, and issues a JWS-signed attestation
 *      with its OWN key, deliberately distinct from the publisher's signing key. A
 *      client fetches the attestation from `mcp_conformance_attestations`, binds it
 *      to the exact manifest it verified, and requires it from a trusted verifier.
 *
 *   3. Continuous host cross-check (detective, defence in depth). Over a session the
 *      host reconciles what it observed the server do against the declared
 *      capabilities and raises a conformance violation on drift.
 *
 * The capability vocabulary maps one-to-one onto ordinary sandbox primitives, so an
 * enforcing host does not have to invent an execution model: network egress hosts,
 * filesystem read and write roots, subprocess spawning, and environment reads.
 */

import { createHash, randomUUID } from 'node:crypto';
import { posix as path } from 'node:path';
import { canonicalBytes } from './jcs.mjs';
import { HASH_PREFIX } from './declarations.mjs';
import { generateSigningKey, makeJwks, signDetached, verifyDetached } from './jws.mjs';

/** The empty capability set: declares no privileged access, so everything is denied. */
const EMPTY_CAPABILITIES = { network: [], filesystem: { read: [], write: [] }, subprocess: false, env: [] };

function stringList(value) {
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

/**
 * Coerce a server-supplied `capabilities` block into a closed, deny-by-default shape.
 *
 * A missing or malformed block becomes the empty set with `declared: false`, so a
 * server that omits capabilities is treated as claiming no privileged access rather
 * than as claiming all of it.
 */
export function normalizeCapabilities(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ...EMPTY_CAPABILITIES, filesystem: { read: [], write: [] }, declared: false };
    }

    const fs = raw.filesystem !== null && typeof raw.filesystem === 'object' && !Array.isArray(raw.filesystem) ? raw.filesystem : {};

    return {
        network: stringList(raw.network),
        filesystem: { read: stringList(fs.read), write: stringList(fs.write) },
        // Anything that is not literally `true` withholds the subprocess primitive.
        subprocess: raw.subprocess === true,
        env: stringList(raw.env),
        declared: true
    };
}

function ensure(capabilities) {
    return capabilities !== null && typeof capabilities === 'object' && typeof capabilities.declared === 'boolean'
        ? capabilities
        : normalizeCapabilities(capabilities);
}

/** Match a host against a capability pattern: exact, `*` (any), or a `*.suffix` wildcard. */
function hostMatches(pattern, host) {
    if (pattern === '*') return true;
    if (pattern.startsWith('*.')) {
        const bareSuffix = pattern.slice(2); // "storage.example" for "*.storage.example"
        return host === bareSuffix || host.endsWith(`.${bareSuffix}`);
    }
    return host === pattern;
}

/**
 * Decide whether `target` falls under an allowed filesystem `root`.
 * Both are normalized first, so a `..` traversal that escapes the root is denied.
 */
function pathUnder(root, target) {
    const normalizedRoot = path.normalize(root);
    const normalizedTarget = path.normalize(target);
    if (normalizedTarget === normalizedRoot) return true;
    const prefix = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;
    return normalizedTarget.startsWith(prefix);
}

/**
 * Evaluate a single access against a capability set.
 *
 * An `access` is one of:
 *   { kind: 'network',    host, port? }
 *   { kind: 'filesystem', mode: 'read' | 'write', path }
 *   { kind: 'subprocess', command }
 *   { kind: 'env',        name }
 *
 * Returns `{ allowed, reason? }`. Anything not explicitly permitted is denied.
 */
export function checkAccess(capabilities, access) {
    const cap = ensure(capabilities);

    switch (access?.kind) {
        case 'network': {
            const host = String(access.host ?? '');
            const allowed = cap.network.some(pattern => hostMatches(pattern, host));
            return allowed
                ? { allowed: true }
                : { allowed: false, reason: `network egress to "${host}" is not in the declared network capability [${cap.network.join(', ') || 'none'}]` };
        }
        case 'filesystem': {
            const mode = access.mode === 'write' ? 'write' : 'read';
            const target = String(access.path ?? '');
            const roots = cap.filesystem[mode];
            const allowed = roots.some(root => pathUnder(root, target));
            return allowed
                ? { allowed: true }
                : { allowed: false, reason: `filesystem ${mode} of "${target}" is outside the declared ${mode} roots [${roots.join(', ') || 'none'}]` };
        }
        case 'subprocess': {
            return cap.subprocess
                ? { allowed: true }
                : { allowed: false, reason: `subprocess execution of "${access.command ?? ''}" is not declared` };
        }
        case 'env': {
            const name = String(access.name ?? '');
            const allowed = cap.env.includes(name);
            return allowed
                ? { allowed: true }
                : { allowed: false, reason: `environment read of "${name}" is not in the declared env capability [${cap.env.join(', ') || 'none'}]` };
        }
        default:
            return { allowed: false, reason: `unrecognized access kind "${access?.kind}"` };
    }
}

/** A short human-readable rendering of an access, for demo output and logs. */
export function describeAccess(access) {
    switch (access?.kind) {
        case 'network':
            return `network  ${access.host}${access.port ? `:${access.port}` : ''}`;
        case 'filesystem':
            return `fs-${access.mode === 'write' ? 'write' : 'read'} ${access.path}`;
        case 'subprocess':
            return `spawn    ${access.command}`;
        case 'env':
            return `env-read ${access.name}`;
        default:
            return `unknown(${access?.kind})`;
    }
}

/** Thrown by `EnforcingSandbox.guard` when the sandbox blocks an access. */
export class CapabilityViolation extends Error {
    constructor(reason, access, tool) {
        super(reason);
        this.name = 'CapabilityViolation';
        this.access = access;
        this.tool = tool;
    }
}

/**
 * Mechanism 1: a host-side sandbox that enforces a signed capability set.
 *
 * A real host would wire these primitives to a seccomp filter, a network namespace
 * or a filesystem jail. Here the enforcement point is a method call, but the
 * decision logic — and, crucially, the deny-by-default posture and the violation
 * log — is exactly what a real sandbox provides.
 */
export class EnforcingSandbox {
    constructor(capabilities, { tool = 'unknown', clock = () => Date.now() } = {}) {
        this.tool = tool;
        this.capabilities = ensure(capabilities);
        this.clock = clock;
        this.log = []; // every mediated access, for the continuous cross-check
        this.violations = []; // the subset that was blocked
    }

    /**
     * Mediate one access. Allowed accesses pass through; undeclared ones are blocked
     * and recorded. Returns the decision so calling tool code can branch on it.
     */
    attempt(access) {
        const decision = checkAccess(this.capabilities, access);
        const entry = { tool: this.tool, access, allowed: decision.allowed, reason: decision.reason, at: this.clock() };
        this.log.push(entry);
        if (!decision.allowed) this.violations.push(entry);
        return decision;
    }

    /** Throwing form, for tool code that must abort when the sandbox blocks it. */
    guard(access) {
        const decision = this.attempt(access);
        if (!decision.allowed) throw new CapabilityViolation(decision.reason, access, this.tool);
        return decision;
    }

    /** Every access the sandbox observed, for feeding into `reconcile`. */
    observed() {
        return this.log.map(entry => entry.access);
    }

    get conformant() {
        return this.violations.length === 0;
    }
}

/**
 * Mechanism 3: reconcile a set of observed accesses against declared capabilities.
 *
 * Returns the observed accesses the declaration does not permit — the evidence that
 * `observed ⊆ declared` has been broken. A verifier uses this to decide what to
 * attest; a host uses it as a detective cross-check during a session.
 */
export function reconcile(capabilities, observedAccesses) {
    const cap = ensure(capabilities);
    const violations = [];
    for (const access of observedAccesses ?? []) {
        const decision = checkAccess(cap, access);
        if (!decision.allowed) violations.push({ access, reason: decision.reason });
    }
    return { conformant: violations.length === 0, violations };
}

/** Hash a manifest body to bind an attestation to the exact declared bytes. */
export function hashManifest(manifest) {
    return HASH_PREFIX + createHash('sha256').update(canonicalBytes(manifest)).digest('base64url');
}

/**
 * Assemble a conformance attestation. `result` is 'conformant' or 'nonconformant'
 * and `tools` carries the per-tool verdict, so a nonconformant attestation names
 * exactly which capability drifted.
 */
export function buildAttestation({
    server,
    manifestHash,
    verifier,
    result,
    tools = [],
    method = 'runtime-observation',
    ttlSeconds = 86_400,
    now = Date.now()
}) {
    return {
        type: 'mcp-capability-conformance',
        server,
        manifestHash,
        verifier,
        method,
        result,
        tools,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
        nonce: randomUUID()
    };
}

/** Sign an attestation with the verifier's key (a detached JWS over its JCS bytes). */
export function signAttestation(attestation, key) {
    return { attestation, signature: signDetached(canonicalBytes(attestation), key) };
}

/**
 * Verify a conformance attestation.
 *
 * The attestation is verified against the VERIFIER's JWKS, never the publisher's, so
 * a publisher cannot vouch for its own conformance. It is bound to the canonical
 * server URI and to the exact `manifestHash` the client already verified, so an
 * attestation for an older, conformant manifest cannot cover a newly rug-pulled one.
 */
export function verifyAttestation(signed, { canonicalServerUri, manifestHash, trustedVerifiers, verifierJwks, now = Date.now(), maxSkewMs = 60_000 }) {
    if (!signed || typeof signed !== 'object' || !signed.attestation) {
        return { ok: false, reason: 'no attestation was offered' };
    }

    const { attestation, signature } = signed;

    const signatureResult = verifyDetached(signature, canonicalBytes(attestation), verifierJwks);
    if (!signatureResult.ok) {
        return { ok: false, reason: `attestation signature rejected: ${signatureResult.reason}` };
    }

    if (attestation.server !== canonicalServerUri) {
        return {
            ok: false,
            reason: `attestation is bound to "${attestation.server}" but the server is "${canonicalServerUri}" (cross-server replay)`
        };
    }

    if (attestation.manifestHash !== manifestHash) {
        return { ok: false, reason: 'attestation covers a different manifest than the one presented (stale or mismatched)' };
    }

    const trusted = new Set(trustedVerifiers ?? []);
    if (!trusted.has(attestation.verifier)) {
        return { ok: false, reason: `verifier "${attestation.verifier}" is not on the trusted-verifier list` };
    }

    const issuedAt = Date.parse(attestation.issuedAt);
    const expiresAt = Date.parse(attestation.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
        return { ok: false, reason: 'attestation has an unparseable validity window' };
    }
    if (now + maxSkewMs < issuedAt) return { ok: false, reason: 'attestation is not yet valid' };
    if (now - maxSkewMs > expiresAt) return { ok: false, reason: 'attestation has expired' };

    // A truthful "nonconformant" attestation verifies cryptographically but must not
    // be read as a pass: the verifier is telling the client the server drifted.
    if (attestation.result !== 'conformant') {
        return { ok: false, reason: `verifier reported the server as ${attestation.result}`, attestation };
    }

    return { ok: true, attestation, verifierKid: signatureResult.kid };
}

/**
 * Mechanism 2 issuer: an independent conformance verifier.
 *
 * It holds its own signing key, reads each declaration's signed `trust.capabilities`,
 * reconciles them against observed behaviour, and issues a signed attestation. It
 * never uses the publisher's key, so its statement is an independent second opinion.
 */
export class BehavioralVerifier {
    constructor({ verifier, key = generateSigningKey('verifier-1') } = {}) {
        this.verifier = verifier;
        this.key = key;
    }

    /** The JWKS a client would fetch to check attestations from this verifier. */
    jwks() {
        return makeJwks(this.key);
    }

    /**
     * Observe `server` and produce a signed attestation. `observedByTool` maps a tool
     * name to the accesses the verifier saw it make; a tool with no entry is treated
     * as having made no privileged access.
     */
    attest(server, observedByTool = {}, { ttlSeconds = 86_400, now = Date.now() } = {}) {
        const signedManifest = server.manifest();
        if (!signedManifest) throw new Error('cannot attest an unsigned server: there is no manifest to bind to');

        const manifestHash = hashManifest(signedManifest.manifest);

        const tools = [];
        let overallConformant = true;

        for (const declaration of server.listTools()) {
            const capabilities = declaration.trust?.capabilities;
            const observed = observedByTool[declaration.name] ?? [];
            const { conformant, violations } = reconcile(capabilities, observed);
            if (!conformant) overallConformant = false;
            tools.push({ name: declaration.name, conformant, violations: violations.map(entry => entry.reason) });
        }

        const attestation = buildAttestation({
            server: server.uri,
            manifestHash,
            verifier: this.verifier,
            result: overallConformant ? 'conformant' : 'nonconformant',
            tools,
            ttlSeconds,
            now
        });

        return signAttestation(attestation, this.key);
    }
}
