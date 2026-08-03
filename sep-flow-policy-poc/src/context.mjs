/**
 * Host-side contributor tracking over a context partition.
 *
 * The SEP requires a conservative over-approximation: any principal whose content
 * entered the partition is a contributor to every request built from it. Precise
 * taint tracking through model reasoning is not achievable, and under-reporting is
 * a silent security failure, so this tracker deliberately errs toward too much.
 *
 * A whole turn is the default partition. A host MAY use a narrower one, but only if
 * no content from outside it is present in the context used to build the request.
 * Summarizing out-of-partition content does NOT clear its contributor: a summary is
 * still derived from the principal that produced it, and injected instructions
 * survive summarization comfortably.
 */

import { ASSURANCE_RANK, HOST, LEAST_ASSURED, USER, normalizeAssurance } from './principals.mjs';

export class ContextPartition {
    #contributors = new Map();

    constructor({ userInput = null } = {}) {
        this.complete = true;
        if (userInput !== null) this.addUserInput(userInput);
    }

    #add(principal, assurance, publisher) {
        const normalized = normalizeAssurance(assurance);
        const existing = this.#contributors.get(principal);

        // If the same principal is seen at two assurance levels, keep the lower one.
        if (existing && ASSURANCE_RANK[existing.assurance] >= ASSURANCE_RANK[normalized]) return this;

        const contributor = { principal, assurance: normalized };
        if (publisher) contributor.publisher = publisher;
        this.#contributors.set(principal, contributor);
        return this;
    }

    addUserInput() {
        return this.#add(USER, 'user');
    }

    addHostContent() {
        return this.#add(HOST, 'host');
    }

    /** Record that a server's output entered this partition. */
    addServerContent(serverUri, { assurance, publisher } = {}) {
        return this.#add(serverUri, assurance ?? LEAST_ASSURED, publisher);
    }

    /**
     * Derived content keeps the contributor of whatever it was derived from.
     * Summarization, paraphrase, translation and compression are all derivation.
     */
    addDerivedContent(sourcePrincipal, { assurance, publisher } = {}) {
        return this.#add(sourcePrincipal, assurance ?? LEAST_ASSURED, publisher);
    }

    /** Called when the host cannot enumerate its own contributors. */
    markIncomplete() {
        this.complete = false;
        return this;
    }

    has(principal) {
        return this.#contributors.has(principal);
    }

    snapshot({ includePrincipals = true } = {}) {
        return [...this.#contributors.values()].map(contributor => {
            if (includePrincipals) return { ...contributor };
            // Privacy mode: disclose the assurance state but not the topology.
            return { assurance: contributor.assurance };
        });
    }
}
