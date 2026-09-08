/**
 * Per-declaration integrity and the signed capability manifest (SEP-3140).
 *
 * A declaration carries `version` and `contentHash`; the manifest lists every
 * declaration's name, version and contentHash and is signed as a whole. Verifying
 * the manifest signature therefore transitively authenticates every declaration
 * and its `trust` block, while keeping the signed object small.
 */

import { createHash, randomUUID } from 'node:crypto';
import { canonicalBytes } from './jcs.mjs';
import { signDetached, verifyDetached } from './jws.mjs';

export const HASH_PREFIX = 'sha256-';

function sha256(bytes) {
    return HASH_PREFIX + createHash('sha256').update(bytes).digest('base64url');
}

/** SHA-256 over the JCS form of a declaration, excluding `contentHash` itself. */
export function contentHash(declaration) {
    const { contentHash: _excluded, ...rest } = declaration;
    return sha256(canonicalBytes(rest));
}

/** Attach `version` and a freshly computed `contentHash` to a declaration. */
export function stamp(declaration, version) {
    const versioned = { ...declaration, version: String(version ?? declaration.version ?? '1') };
    return { ...versioned, contentHash: contentHash(versioned) };
}

function summarize(list) {
    return list.map(entry => ({ name: entry.name, version: entry.version, contentHash: entry.contentHash }));
}

export function buildManifest({
    server,
    publisher,
    specVersion,
    tools = [],
    prompts = [],
    resources = [],
    ttlSeconds = 3600,
    now = Date.now()
}) {
    return {
        server,
        publisher,
        specVersion,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
        nonce: randomUUID(),
        tools: summarize(tools),
        prompts: summarize(prompts),
        resources: summarize(resources)
    };
}

export function signManifest(manifest, key) {
    return { manifest, signature: signDetached(canonicalBytes(manifest), key) };
}

/**
 * Client verification steps 1 to 3 of SEP-3140:
 * verify the signature, verify the audience binding, verify the validity window.
 */
export function verifyManifest(signed, { canonicalServerUri, jwks, now = Date.now(), maxSkewMs = 60_000 }) {
    if (!signed || typeof signed !== 'object' || !signed.manifest) {
        return { ok: false, reason: 'no signed manifest was offered' };
    }

    const { manifest, signature } = signed;

    const signatureResult = verifyDetached(signature, canonicalBytes(manifest), jwks);
    if (!signatureResult.ok) {
        return { ok: false, reason: `manifest signature rejected: ${signatureResult.reason}` };
    }

    // Binding to the RFC 8707 canonical server URI prevents replay of an otherwise
    // valid manifest against a different server.
    if (manifest.server !== canonicalServerUri) {
        return {
            ok: false,
            reason: `manifest is bound to "${manifest.server}" but was served by "${canonicalServerUri}" (cross-server replay)`
        };
    }

    const issuedAt = Date.parse(manifest.issuedAt);
    const expiresAt = Date.parse(manifest.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
        return { ok: false, reason: 'manifest has an unparseable validity window' };
    }
    if (now + maxSkewMs < issuedAt) return { ok: false, reason: 'manifest is not yet valid' };
    if (now - maxSkewMs > expiresAt) return { ok: false, reason: 'manifest has expired' };
    if (typeof manifest.nonce !== 'string' || manifest.nonce.length === 0) {
        return { ok: false, reason: 'manifest carries no nonce' };
    }

    return { ok: true, manifest, kid: signatureResult.kid };
}

/**
 * Client verification step 3 applied per declaration: recompute each contentHash
 * and confirm it matches the signed manifest entry.
 */
export function verifyDeclarations(manifest, declarations, kind = 'tools') {
    const entries = new Map((manifest[kind] ?? []).map(entry => [entry.name, entry]));
    const results = [];

    for (const declaration of declarations) {
        const entry = entries.get(declaration.name);

        if (!entry) {
            results.push({ name: declaration.name, ok: false, reason: 'declaration is absent from the signed manifest' });
            continue;
        }

        const recomputed = contentHash(declaration);
        if (recomputed !== entry.contentHash) {
            results.push({
                name: declaration.name,
                ok: false,
                reason: `contentHash mismatch: manifest says ${entry.contentHash}, declaration hashes to ${recomputed}`
            });
            continue;
        }

        if (entry.version !== declaration.version) {
            results.push({ name: declaration.name, ok: false, reason: 'version does not match the signed manifest' });
            continue;
        }

        results.push({ name: declaration.name, ok: true });
        entries.delete(declaration.name);
    }

    for (const orphan of entries.keys()) {
        results.push({ name: orphan, ok: false, reason: 'manifest lists a declaration the server did not serve' });
    }

    return results;
}
