/**
 * Standardized trust labels and the host policy evaluated against them (SEP-3140).
 *
 * The vocabulary is closed: any value a host does not recognize is treated as the
 * most restrictive member of its enum. That is what makes the label usable for a
 * deterministic gating decision instead of a heuristic.
 */

export const EFFECTS = ['read-only', 'writes-data', 'destructive'];
export const EGRESS = ['none', 'internal', 'external'];
export const SENSITIVITY = ['public', 'internal', 'confidential', 'secret'];

export const DECISIONS = {
    ALLOW: 'allow',
    APPROVE: 'approve',
    ELEVATE: 'elevate',
    DENY: 'deny'
};

const SEVERITY = { allow: 0, approve: 1, elevate: 2, deny: 3 };

const MOST_RESTRICTIVE = {
    effect: 'destructive',
    egress: 'external',
    dataSensitivity: 'secret',
    reversible: false,
    idempotent: false
};

function escalate(current, candidate) {
    return SEVERITY[candidate] > SEVERITY[current] ? candidate : current;
}

/** Coerce a server-supplied `trust` block into the closed vocabulary. */
export function normalizeTrust(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ...MOST_RESTRICTIVE, unlabelled: true };
    }

    const pick = (allowed, value, fallback) => (allowed.includes(value) ? value : fallback);

    return {
        effect: pick(EFFECTS, raw.effect, MOST_RESTRICTIVE.effect),
        egress: pick(EGRESS, raw.egress, MOST_RESTRICTIVE.egress),
        dataSensitivity: pick(SENSITIVITY, raw.dataSensitivity, MOST_RESTRICTIVE.dataSensitivity),
        // Anything that is not literally `true` is treated as false.
        reversible: raw.reversible === true,
        idempotent: raw.idempotent === true,
        unlabelled: false
    };
}

/**
 * Decide how a host should gate one declaration.
 *
 * `provenance.verified`      the manifest signature and contentHash both checked out
 * `provenance.publisherTrust` one of 'pinned' | 'allowlisted' | 'tofu' | 'unknown'
 * `hostMode`                 'interactive' (a human can be prompted) or 'autonomous'
 */
export function evaluate({ trust, provenance = {}, hostMode = 'interactive' }) {
    const label = normalizeTrust(trust);
    const reasons = [];

    const verified = provenance.verified === true;
    const publisherTrust = provenance.publisherTrust ?? 'unknown';
    const publisherTrusted = publisherTrust === 'pinned' || publisherTrust === 'allowlisted';
    const sensitive = label.effect !== 'read-only' || label.egress === 'external';

    if (label.unlabelled) reasons.push('no trust block was declared, so the most restrictive label is assumed');

    if (!verified) {
        reasons.push('declarations are unsigned or failed verification');

        if (!sensitive) {
            reasons.push('read-only with no external egress, so it is allowed without provenance');
            return { decision: DECISIONS.ALLOW, label, reasons };
        }

        // A downgrade to unsigned must yield less privilege, never more.
        if (hostMode === 'autonomous') {
            reasons.push('autonomous host default-denies write, destructive or egressing tools without provenance');
            return { decision: DECISIONS.DENY, label, reasons };
        }

        reasons.push('interactive host requires explicit elevation with a missing-provenance warning');
        return { decision: DECISIONS.ELEVATE, label, reasons };
    }

    let decision = DECISIONS.ALLOW;

    if (label.effect === 'writes-data') {
        decision = escalate(decision, DECISIONS.APPROVE);
        reasons.push('tool writes data');
    }

    if (label.effect === 'destructive') {
        decision = escalate(decision, DECISIONS.ELEVATE);
        reasons.push('tool is destructive');
        if (!label.reversible) reasons.push('effect is declared irreversible, so dual control is recommended');
    }

    if (label.egress === 'external') {
        decision = escalate(decision, DECISIONS.APPROVE);
        reasons.push('tool egresses data outside the trust boundary');
    }

    if (label.dataSensitivity === 'secret') {
        decision = escalate(decision, DECISIONS.APPROVE);
        reasons.push('tool handles secret material');
    }

    if (!publisherTrusted) {
        reasons.push(`publisher is ${publisherTrust === 'tofu' ? 'trusted on first use only' : 'not on the trust list'}`);
        if (sensitive) decision = escalate(decision, DECISIONS.APPROVE);
    }

    if (decision === DECISIONS.ALLOW) reasons.push('verified, read-only and non-egressing, so it may run unattended');

    return { decision, label, reasons };
}
