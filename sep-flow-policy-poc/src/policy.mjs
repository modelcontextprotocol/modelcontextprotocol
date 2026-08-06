/**
 * Flow policy evaluation and the restriction-only invariant.
 *
 * `acceptFrom` is an allowlist, so the default position is deny. A denylist was
 * considered and rejected: it silently admits every origin the policy author did
 * not anticipate.
 */

import { LEAST_ASSURED, describeContributor, tokenMatches } from './principals.mjs';

export const DEFAULT_POLICY = { acceptFrom: ['self', 'user', 'host', 'verified'] };

export const ALLOW = 'allow';
export const DENY = 'deny';

export const FLOW_POLICY_VIOLATION_KEY = 'io.modelcontextprotocol/flowPolicyViolation';

/**
 * The SEP deliberately mints no error code, because several in-flight proposals
 * allocating numbers out of the same reserved range is how collisions arise, and
 * the number carries nothing the payload does not. Recipients discriminate on the
 * namespaced key above. This value only lets the prototype emit a well-formed
 * JSON-RPC error, and should follow SEP-2145 once that lands.
 */
export const PROVISIONAL_ERROR_CODE = -32000;

/** All a refusal is permitted to say once it reaches model context. */
export const MODEL_SAFE_MESSAGE = 'The call was not permitted.';

/**
 * Evaluate a label against a policy.
 *
 * An incomplete label contributes a synthetic unverified entry, so a host that
 * admits it could not enumerate its contributors is treated as if an untrusted one
 * were present.
 */
export function evaluateFlow({ policy = DEFAULT_POLICY, flowOrigin, recipientUri }) {
    const acceptFrom = Array.isArray(policy?.acceptFrom) ? policy.acceptFrom : DEFAULT_POLICY.acceptFrom;

    const contributors = [...flowOrigin.contributors];
    if (!flowOrigin.complete) contributors.push({ assurance: LEAST_ASSURED, synthetic: true });

    const rejected = contributors.filter(
        contributor => !acceptFrom.some(token => tokenMatches(token, contributor, recipientUri))
    );

    return {
        allowed: rejected.length === 0,
        rejected,
        acceptFrom,
        reason: rejected.length === 0 ? null : `origin not accepted: ${rejected.map(describeContributor).join(', ')}`
    };
}

/**
 * The restriction-only invariant, enforced structurally rather than documented.
 *
 * The base decision is computed without reference to the label. Flow evaluation is
 * consulted only afterwards, and can move the result in one direction. A caller
 * cannot use this function to turn a denial into an approval, which is what makes
 * an unsigned, forgeable label safe to act on.
 */
export function combine(baseDecision, flowResult) {
    if (baseDecision !== ALLOW) return DENY;
    return flowResult.allowed ? ALLOW : DENY;
}

/** The host-facing refusal, carrying the detail an operator and an audit log need. */
export function flowPolicyError(flowResult) {
    return {
        code: PROVISIONAL_ERROR_CODE,
        message: 'Request rejected by flow policy',
        data: {
            [FLOW_POLICY_VIOLATION_KEY]: {
                // Safe toward the recipient: it discloses nothing it was not already sent.
                rejected: flowResult.rejected.map(({ assurance, principal }) => (principal ? { assurance, principal } : { assurance })),
                acceptFrom: flowResult.acceptFrom
            }
        }
    };
}

/**
 * The model-facing refusal.
 *
 * The violation set and the acceptFrom list tell the model which contributor caused
 * the block and what would have been accepted. Fed back into context, that is a
 * bypass oracle: an injected instruction can iterate against it until it finds an
 * ungated route. The host keeps the detail; the model gets only the verdict.
 */
export function redactForModel() {
    return { message: MODEL_SAFE_MESSAGE };
}
