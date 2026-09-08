/**
 * Detached JWS (RFC 7515) with ES256, implemented directly on node:crypto.
 *
 * SEP-3140 signs the capability manifest with a detached JWS so the manifest body
 * travels as ordinary JSON and the signature covers its RFC 8785 canonical bytes.
 * Node's ECDSA support with `dsaEncoding: 'ieee-p1363'` produces the raw r||s form
 * that JOSE requires, so no JOSE library is needed for this prototype.
 */

import { createPublicKey, generateKeyPairSync, randomUUID, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { canonicalize } from './jcs.mjs';

export function b64u(input) {
    return Buffer.from(input).toString('base64url');
}

export function fromB64u(input) {
    return Buffer.from(input, 'base64url');
}

function fail(reason) {
    return { ok: false, reason };
}

/** Generate a P-256 signing key plus its public JWK, as a publisher would hold. */
export function generateSigningKey(kid = `key-${randomUUID().slice(0, 8)}`) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' };
    return { kid, privateKey, publicKey, jwk };
}

/** Assemble a JWKS document of the kind served from `mcp_signing_jwks_uri`. */
export function makeJwks(...keys) {
    return { keys: keys.map(key => key.jwk) };
}

/**
 * Produce a detached compact JWS over `payload` (a Buffer of canonical bytes).
 * The middle segment is empty, per RFC 7515 appendix F.
 */
export function signDetached(payload, { privateKey, kid }) {
    const protectedHeader = b64u(Buffer.from(canonicalize({ alg: 'ES256', kid }), 'utf8'));
    const signingInput = Buffer.from(`${protectedHeader}.${b64u(payload)}`, 'ascii');
    const signature = cryptoSign('sha256', signingInput, { key: privateKey, dsaEncoding: 'ieee-p1363' });
    return `${protectedHeader}..${b64u(signature)}`;
}

/**
 * Verify a detached compact JWS against `payload` and a JWKS.
 *
 * Rejects any `alg` other than ES256, so an attacker cannot downgrade to `none`
 * or to a symmetric algorithm by rewriting the protected header.
 */
export function verifyDetached(compact, payload, jwks) {
    if (typeof compact !== 'string' || compact.length === 0) return fail('signature is missing');

    const parts = compact.split('.');
    if (parts.length !== 3) return fail('signature is not a compact JWS');

    const [protectedHeader, detachedPayload, signature] = parts;
    if (detachedPayload !== '') return fail('expected a detached payload');

    let header;
    try {
        header = JSON.parse(fromB64u(protectedHeader).toString('utf8'));
    } catch {
        return fail('protected header is not valid JSON');
    }

    if (header.alg !== 'ES256') return fail(`unsupported "alg" value: ${String(header.alg)}`);
    if (typeof header.kid !== 'string' || header.kid.length === 0) return fail('protected header carries no "kid"');

    const jwk = (jwks?.keys ?? []).find(candidate => candidate.kid === header.kid);
    if (!jwk) return fail(`no key in the JWKS matches kid "${header.kid}"`);
    if (jwk.alg && jwk.alg !== 'ES256') return fail(`key "${header.kid}" is not an ES256 key`);

    let publicKey;
    try {
        publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    } catch {
        return fail(`key "${header.kid}" is not a usable P-256 public key`);
    }

    const signingInput = Buffer.from(`${protectedHeader}.${b64u(payload)}`, 'ascii');

    let verified = false;
    try {
        verified = cryptoVerify('sha256', signingInput, { key: publicKey, dsaEncoding: 'ieee-p1363' }, fromB64u(signature));
    } catch {
        return fail('signature is malformed');
    }

    return verified ? { ok: true, kid: header.kid } : fail('signature does not verify');
}
