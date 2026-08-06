/**
 * Construction and defensive parsing of the `flowOrigin` request metadata.
 *
 * The label is host-asserted. A recipient must never treat an absent, malformed or
 * incomplete label as permissive, so `readFlowOrigin` synthesizes the least
 * trustworthy interpretation rather than returning something empty.
 */

import { LEAST_ASSURED, normalizeContributor } from './principals.mjs';

export const FLOW_ORIGIN_KEY = 'io.modelcontextprotocol/flowOrigin';

export function buildFlowOrigin(context, { includePrincipals = true } = {}) {
    return {
        contributors: context.snapshot({ includePrincipals }),
        complete: context.complete
    };
}

/** Attach the label to request params without mutating the caller's object. */
export function attachFlowOrigin(params, flowOrigin) {
    return {
        ...params,
        _meta: { ...(params._meta ?? {}), [FLOW_ORIGIN_KEY]: flowOrigin }
    };
}

/**
 * Read the label from request params, failing closed.
 *
 * Absent, non-object, or empty labels become a single unverified contributor with
 * `complete: false`, which is the most restrictive reading available.
 */
export function readFlowOrigin(params) {
    const raw = params?._meta?.[FLOW_ORIGIN_KEY];

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { contributors: [{ assurance: LEAST_ASSURED }], complete: false, synthesized: true };
    }

    const contributors = Array.isArray(raw.contributors) ? raw.contributors.map(normalizeContributor) : [];

    if (contributors.length === 0) {
        return { contributors: [{ assurance: LEAST_ASSURED }], complete: false, synthesized: true };
    }

    // `complete` is only honoured when it is literally true.
    return { contributors, complete: raw.complete === true, synthesized: false };
}
