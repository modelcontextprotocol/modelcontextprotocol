/**
 * Principals and assurance states for the cross-server flow SEP.
 *
 * A principal is an identifiable source of content: an MCP server (named by its
 * RFC 8707 canonical server URI), the end user, or the host application.
 *
 * Assurance describes how well the host knows *who a principal is*. It is
 * deliberately not called "trust", because SEP-1913 uses that word for the risk of
 * a tool and SEP-3140 for the integrity of a declaration. Three overlapping trust
 * vocabularies would be a hazard for implementers and reviewers alike.
 *
 * The enumeration is closed. Anything a peer does not recognize is treated as the
 * least assured member, so an unknown value can never widen access.
 */

export const USER = 'urn:mcp:user';
export const HOST = 'urn:mcp:host';

export const ASSURANCE_STATES = ['user', 'host', 'verified', 'tofu', 'unverified'];
export const LEAST_ASSURED = 'unverified';

/** Lower is better assured. Used only for the host-side cross-principal ceiling. */
export const ASSURANCE_RANK = { user: 0, host: 0, verified: 1, tofu: 2, unverified: 3 };

const PUBLISHER_PREFIX = 'publisher:';

export function normalizeAssurance(value) {
    return ASSURANCE_STATES.includes(value) ? value : LEAST_ASSURED;
}

/** Coerce a wire contributor into the closed vocabulary, dropping anything unusable. */
export function normalizeContributor(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { assurance: LEAST_ASSURED };
    }

    const contributor = { assurance: normalizeAssurance(raw.assurance) };
    if (typeof raw.principal === 'string' && raw.principal.length > 0) contributor.principal = raw.principal;
    if (typeof raw.publisher === 'string' && raw.publisher.length > 0) contributor.publisher = raw.publisher;
    return contributor;
}

/**
 * Test one `acceptFrom` token against one contributor.
 *
 * An unrecognized token never matches. That is what makes the identifier space
 * safely extensible: a vendor token such as `com.example.tier:gold` simply fails to
 * match on a host that does not understand it, which makes an older evaluator more
 * restrictive than the policy author intended rather than less.
 */
export function tokenMatches(token, contributor, recipientUri) {
    if (typeof token !== 'string' || token.length === 0) return false;

    if (token === 'self') {
        return contributor.principal !== undefined && contributor.principal === recipientUri;
    }

    if (ASSURANCE_STATES.includes(token)) {
        return contributor.assurance === token;
    }

    if (token.startsWith(PUBLISHER_PREFIX)) {
        const publisher = token.slice(PUBLISHER_PREFIX.length);
        return contributor.publisher !== undefined && contributor.publisher === publisher;
    }

    if (token.startsWith('https://') || token.startsWith('http://') || token.startsWith('urn:')) {
        return contributor.principal !== undefined && contributor.principal === token;
    }

    return false;
}

export function describeContributor(contributor) {
    const label = contributor.principal ?? '<undisclosed>';
    return `${label} (${contributor.assurance})`;
}
