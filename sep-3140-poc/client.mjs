/**
 * Reference MCP client for SEP-3140.
 *
 * Implements the four verification steps and the trust policy from
 * "Client verification and trust policy", then folds in the anti-rug-pull review
 * so that a previously granted approval does not survive a material change.
 */

import { verifyDeclarations, verifyManifest } from './src/declarations.mjs';
import { ApprovalStore, REVIEW } from './src/regate.mjs';
import { DECISIONS, evaluate } from './src/trust.mjs';

const USER_ACTION_REQUIRED = new Set([DECISIONS.APPROVE, DECISIONS.ELEVATE]);

export class ReferenceClient {
    constructor({
        hostMode = 'interactive',
        pinnedPublishers = [],
        allowlistedPublishers = [],
        store = new ApprovalStore(),
        approver = () => true
    } = {}) {
        this.hostMode = hostMode;
        this.pinned = new Set(pinnedPublishers);
        this.allowlisted = new Set(allowlistedPublishers);
        this.store = store;
        this.approver = approver;
        this.knownPublisherKeys = new Map();
    }

    #publisherTrust(publisher, kid) {
        if (typeof publisher !== 'string' || publisher.length === 0) return 'unknown';
        if (this.pinned.has(publisher)) return 'pinned';
        if (this.allowlisted.has(publisher)) return 'allowlisted';

        const previousKid = this.knownPublisherKeys.get(publisher);
        if (previousKid !== undefined && previousKid !== kid) {
            // Trust on first use, with an alert when the signing key changes.
            return 'unknown';
        }
        this.knownPublisherKeys.set(publisher, kid);
        return 'tofu';
    }

    /**
     * Fetch, verify and gate a server's declarations.
     * Called on connect, on every refresh, and on every list_changed notification.
     */
    refresh(server, { now = Date.now(), trigger = 'listing' } = {}) {
        const capabilities = server.capabilities();
        const declarations = server.listTools();
        const notifications = server.takeNotifications();

        const offersSigned = capabilities?.declarations?.signed === true;

        let manifestOk = false;
        let manifestError = offersSigned ? null : 'server does not advertise signed declarations';
        let publisherTrust = 'unknown';
        let integrity = new Map();

        if (offersSigned) {
            const signedManifest = server.manifest();
            const result = verifyManifest(signedManifest, {
                canonicalServerUri: server.uri,
                jwks: server.jwks(),
                now
            });

            if (!result.ok) {
                manifestError = result.reason;
            } else {
                manifestOk = true;
                publisherTrust = this.#publisherTrust(result.manifest.publisher, result.kid);
                integrity = new Map(verifyDeclarations(result.manifest, declarations).map(entry => [entry.name, entry]));
            }
        }

        // The approval review runs against every listing, whether or not a
        // list_changed notification arrived.
        const reviews = this.store.review(server.uri, declarations);
        const reviewByName = new Map(reviews.map(entry => [entry.name, entry]));

        const tools = declarations.map(declaration => {
            // An unsigned server is not the same failure as a tampered one. Missing
            // provenance reduces privilege through the trust policy; a broken
            // signature or a contentHash mismatch is a hard deny.
            const declarationIntegrity = !offersSigned
                ? { ok: false, unsigned: true, reason: manifestError }
                : manifestOk
                  ? (integrity.get(declaration.name) ?? { ok: false, reason: 'declaration was not covered by the manifest' })
                  : { ok: false, reason: manifestError };

            const tampered = offersSigned && !declarationIntegrity.ok;

            const review = reviewByName.get(declaration.name) ?? {
                status: REVIEW.UNAPPROVED,
                requiresRegate: true,
                detail: 'no prior approval'
            };

            const policy = evaluate({
                trust: declaration.trust,
                provenance: { verified: declarationIntegrity.ok, publisherTrust },
                hostMode: this.hostMode
            });

            let decision = tampered ? DECISIONS.DENY : policy.decision;
            const reasons = tampered ? [declarationIntegrity.reason, ...policy.reasons] : [...policy.reasons];

            if (review.requiresRegate) reasons.push(`re-gated: ${review.detail}`);

            let granted = false;
            if (decision !== DECISIONS.DENY) {
                if (USER_ACTION_REQUIRED.has(decision)) {
                    granted = this.approver({ declaration, decision, review, reasons }) === true;
                    if (!granted) {
                        decision = DECISIONS.DENY;
                        reasons.push('the approver declined');
                    }
                } else {
                    granted = true;
                }
            }

            // Bind the approval to the snapshot that was actually reviewed.
            if (granted) this.store.record(server.uri, declaration, decision);

            return {
                name: declaration.name,
                integrity: declarationIntegrity,
                review,
                label: policy.label,
                decision,
                granted,
                requiresUserAction: USER_ACTION_REQUIRED.has(policy.decision),
                reasons
            };
        });

        return {
            server: server.uri,
            trigger,
            hostMode: this.hostMode,
            capabilities,
            manifestOk,
            manifestError,
            publisherTrust,
            notifications,
            withdrawn: reviews.filter(entry => entry.status === REVIEW.WITHDRAWN).map(entry => entry.name),
            tools
        };
    }
}

/** Convenience predicate used by the demo and the tests. */
export function decisionFor(report, name) {
    return report.tools.find(tool => tool.name === name)?.decision;
}
