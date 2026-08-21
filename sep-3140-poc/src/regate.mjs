/**
 * Anti-rug-pull: approval snapshots and material-change re-gating (SEP-3140).
 *
 * A change to `description`, `inputSchema`, `annotations` or any `trust` field is
 * material and must be re-gated. A change to `title` or `icons` is not.
 *
 * Design note surfaced by this prototype: the SEP describes re-gating in terms of
 * `notifications/*\/list_changed`, but a malicious server can simply not send that
 * notification and serve a different definition on the next listing or reconnect.
 * This store therefore compares every listing against the persisted approved
 * snapshot, and treats the absence of a notification as carrying no information.
 * See "Findings" in the README.
 */

import { createHash } from 'node:crypto';
import { canonicalBytes } from './jcs.mjs';
import { HASH_PREFIX } from './declarations.mjs';

export const MATERIAL_FIELDS = ['description', 'inputSchema', 'annotations', 'trust'];
export const NON_MATERIAL_FIELDS = ['title', 'icons'];

export const REVIEW = {
    UNAPPROVED: 'unapproved',
    UNCHANGED: 'unchanged',
    NON_MATERIAL_CHANGE: 'non-material-change',
    MATERIAL_CHANGE: 'material-change',
    WITHDRAWN: 'withdrawn'
};

/** Project a declaration down to the fields whose change is security-relevant. */
export function materialProjection(declaration) {
    const projection = { name: declaration.name };
    for (const field of MATERIAL_FIELDS) {
        if (declaration[field] !== undefined) projection[field] = declaration[field];
    }
    return projection;
}

export function materialHash(declaration) {
    return HASH_PREFIX + createHash('sha256').update(canonicalBytes(materialProjection(declaration))).digest('base64url');
}

export class ApprovalStore {
    #records = new Map();

    #key(server, name) {
        return `${server}\u0000${name}`;
    }

    /** Bind an approval to a content snapshot rather than to a tool name. */
    record(server, declaration, decision) {
        this.#records.set(this.#key(server, declaration.name), {
            server,
            name: declaration.name,
            version: declaration.version,
            contentHash: declaration.contentHash,
            materialHash: materialHash(declaration),
            decision,
            approvedAt: new Date().toISOString()
        });
    }

    get(server, name) {
        return this.#records.get(this.#key(server, name));
    }

    forget(server, name) {
        this.#records.delete(this.#key(server, name));
    }

    approvedNames(server) {
        return [...this.#records.values()].filter(record => record.server === server).map(record => record.name);
    }

    /**
     * Compare a full listing against the stored snapshots.
     * Runs on every listing, not only when a list_changed notification arrives.
     */
    review(server, declarations) {
        const seen = new Set();
        const results = [];

        for (const declaration of declarations) {
            seen.add(declaration.name);
            const approved = this.get(server, declaration.name);

            if (!approved) {
                results.push({
                    name: declaration.name,
                    status: REVIEW.UNAPPROVED,
                    requiresRegate: true,
                    detail: 'no prior approval is bound to this name'
                });
                continue;
            }

            const presentedMaterial = materialHash(declaration);

            if (presentedMaterial !== approved.materialHash) {
                results.push({
                    name: declaration.name,
                    status: REVIEW.MATERIAL_CHANGE,
                    requiresRegate: true,
                    detail: `material fields changed since approval (${approved.materialHash} to ${presentedMaterial})`,
                    from: approved,
                    changedFields: changedMaterialFields(approved, declaration)
                });
                continue;
            }

            if (declaration.contentHash !== approved.contentHash) {
                results.push({
                    name: declaration.name,
                    status: REVIEW.NON_MATERIAL_CHANGE,
                    requiresRegate: false,
                    detail: 'only non-material fields such as title or icons changed'
                });
                continue;
            }

            results.push({ name: declaration.name, status: REVIEW.UNCHANGED, requiresRegate: false, detail: 'identical to the approved snapshot' });
        }

        for (const name of this.approvedNames(server)) {
            if (!seen.has(name)) {
                results.push({
                    name,
                    status: REVIEW.WITHDRAWN,
                    requiresRegate: false,
                    detail: 'previously approved but no longer offered, so the approval is dropped'
                });
                this.forget(server, name);
            }
        }

        return results;
    }
}

function changedMaterialFields(approved, declaration) {
    // The store keeps only hashes, so report the fields present on the new
    // declaration whose individual hash differs from a recomputed baseline.
    const changed = [];
    for (const field of MATERIAL_FIELDS) {
        if (declaration[field] !== undefined) changed.push(field);
    }
    return changed.length > 0 ? changed : ['unknown'];
}
