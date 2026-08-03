/**
 * Reference MCP server for SEP-3140.
 *
 * Transport is deliberately omitted: the SEP changes what is declared and how it is
 * signed, not how bytes move. This server exposes the shapes a real server would
 * return from `initialize`, `tools/list` and `declarations/manifest`, plus hooks to
 * stage the adversarial cases the prototype has to demonstrate.
 */

import { buildManifest, signManifest, stamp } from './src/declarations.mjs';
import { generateSigningKey, makeJwks } from './src/jws.mjs';

export class ReferenceServer {
    constructor({ uri, publisher, specVersion = '2025-11-25', signed = true, labels = true, key = generateSigningKey() }) {
        this.uri = uri;
        this.publisher = publisher;
        this.specVersion = specVersion;
        this.signed = signed;
        this.labels = labels;
        this.key = key;
        this.tools = new Map();
        this.notifications = [];
    }

    /** The JWKS a client would fetch from `mcp_signing_jwks_uri`. */
    jwks() {
        return makeJwks(this.key);
    }

    /** The Protected Resource Metadata additions SEP-3140 defines. */
    protectedResourceMetadata() {
        return {
            resource: this.uri,
            mcp_publisher: this.publisher,
            mcp_signing_jwks_uri: `${this.publisher.replace(/\/[^/]*$/, '')}/.well-known/jwks.json`
        };
    }

    /** Capability negotiation as returned from `initialize`. */
    capabilities() {
        return this.signed || this.labels ? { declarations: { signed: this.signed, labels: this.labels } } : {};
    }

    addTool(tool) {
        this.tools.set(tool.name, stamp(tool, '1'));
        return this;
    }

    listTools() {
        return [...this.tools.values()].map(tool => (this.labels ? tool : stripTrust(tool)));
    }

    manifest() {
        if (!this.signed) return null;
        const manifest = buildManifest({
            server: this.uri,
            publisher: this.publisher,
            specVersion: this.specVersion,
            tools: this.listTools()
        });
        return signManifest(manifest, this.key);
    }

    /**
     * Mutate a tool after it has been approved.
     * `notify` false stages the silent variant, where no list_changed is emitted.
     */
    mutateTool(name, patch, { notify = true, bumpVersion = true } = {}) {
        const current = this.tools.get(name);
        if (!current) throw new Error(`no such tool: ${name}`);

        const nextVersion = bumpVersion ? String(Number(current.version) + 1) : current.version;
        const updated = stamp({ ...current, ...patch }, nextVersion);
        this.tools.set(name, updated);

        if (notify) {
            this.notifications.push({
                method: 'notifications/tools/list_changed',
                params: {
                    changed: [
                        {
                            name,
                            fromHash: current.contentHash,
                            toHash: updated.contentHash,
                            material: true
                        }
                    ],
                    manifest: 'declarations/manifest'
                }
            });
        }

        return updated;
    }

    /** Rename a tool, which is how a rug pull escapes a name-keyed allowlist. */
    renameTool(from, to, { notify = false } = {}) {
        const current = this.tools.get(from);
        if (!current) throw new Error(`no such tool: ${from}`);
        this.tools.delete(from);
        this.tools.set(to, stamp({ ...current, name: to }, '1'));
        if (notify) this.notifications.push({ method: 'notifications/tools/list_changed', params: {} });
    }

    /** Strip the `declarations` capability, simulating a downgrade attack or an unsigned server. */
    setSigned(signed) {
        this.signed = signed;
        return this;
    }

    takeNotifications() {
        const pending = this.notifications;
        this.notifications = [];
        return pending;
    }
}

function stripTrust(tool) {
    // Re-stamp after removing the label, otherwise the served declaration would no
    // longer hash to the contentHash recorded in the manifest.
    const { trust: _dropped, contentHash: _stale, ...rest } = tool;
    return stamp(rest, rest.version);
}

/** A small catalogue used by the demo and the conformance tests. */
export function seedCatalogue(server) {
    return server
        .addTool({
            name: 'search_incidents',
            title: 'Search incidents',
            description: 'Search the incident database and return matching records.',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
            trust: { effect: 'read-only', egress: 'none', dataSensitivity: 'internal', reversible: true, idempotent: true }
        })
        .addTool({
            name: 'annotate_incident',
            title: 'Annotate an incident',
            description: 'Append a note to an existing incident record.',
            inputSchema: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'note'] },
            trust: { effect: 'writes-data', egress: 'internal', dataSensitivity: 'internal', reversible: true, idempotent: false }
        })
        .addTool({
            name: 'delete_resource',
            title: 'Delete a resource',
            description: 'Permanently deletes the named resource.',
            inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
            trust: { effect: 'destructive', egress: 'external', dataSensitivity: 'confidential', reversible: false, idempotent: false }
        });
}
