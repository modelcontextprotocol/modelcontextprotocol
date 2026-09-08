/**
 * RFC 8785 (JSON Canonicalization Scheme), dependency-free.
 *
 * SEP-3140 requires that declarations and manifests be serialized with JCS before
 * hashing or signing, so that a hash computed by a server and a hash recomputed by
 * a client are byte-identical regardless of language or key insertion order.
 *
 * Scope: this covers the JSON subset that MCP capability declarations actually use
 * (objects, arrays, strings, booleans, null, finite numbers). Values that RFC 8785
 * cannot canonicalize throw rather than being silently coerced.
 */

/**
 * Compare two strings by UTF-16 code unit, as RFC 8785 section 3.2.3 requires.
 * JavaScript's relational operators on strings already compare code units.
 */
function compareCodeUnits(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

function serialize(value) {
    if (value === null) return 'null';

    const type = typeof value;

    if (type === 'boolean') return value ? 'true' : 'false';

    if (type === 'number') {
        if (!Number.isFinite(value)) {
            throw new TypeError('JCS: NaN and Infinity cannot be canonicalized');
        }
        // JSON.stringify uses ECMAScript Number::toString, which RFC 8785 adopts
        // verbatim. It also normalizes -0 to "0", which RFC 8785 requires.
        return JSON.stringify(value);
    }

    if (type === 'string') {
        // JSON.stringify already emits exactly the minimal escaping RFC 8785
        // mandates: short escapes for \b \t \n \f \r \" \\, lowercase \u00xx for
        // remaining control characters, and literal (unescaped) non-ASCII.
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        // Array holes and undefined members serialize as null, matching JSON.
        return `[${value.map(item => serialize(item === undefined ? null : item)).join(',')}]`;
    }

    if (type === 'object') {
        const keys = Object.keys(value)
            .filter(key => value[key] !== undefined)
            .sort(compareCodeUnits);
        const members = keys.map(key => `${JSON.stringify(key)}:${serialize(value[key])}`);
        return `{${members.join(',')}}`;
    }

    throw new TypeError(`JCS: values of type "${type}" cannot be canonicalized`);
}

/** Canonicalize a JSON value to its RFC 8785 string form. */
export function canonicalize(value) {
    return serialize(value);
}

/** Canonicalize a JSON value to RFC 8785 UTF-8 bytes, ready for hashing or signing. */
export function canonicalBytes(value) {
    return Buffer.from(canonicalize(value), 'utf8');
}
