/**
 * Reference host.
 *
 * Responsibilities, in the order the SEP requires them:
 *   1. track contributors for the turn, over-approximating;
 *   2. build the origin label itself, never trusting a server's claims about it;
 *   3. apply its own cross-principal ceiling;
 *   4. pre-evaluate the recipient's declared policy and refuse to dispatch a
 *      request it knows would violate it;
 *   5. fold every result back into the turn context.
 */

import { ContextPartition } from './src/context.mjs';
import { attachFlowOrigin, buildFlowOrigin } from './src/floworigin.mjs';
import { ALLOW, DENY, combine, evaluateFlow, redactForModel } from './src/policy.mjs';
import { ASSURANCE_RANK } from './src/principals.mjs';

export const OUTCOME = {
    ALLOWED: 'allowed',
    BLOCKED_BY_CEILING: 'blocked-by-host-ceiling',
    BLOCKED_BY_POLICY: 'blocked-by-host-precheck',
    REJECTED_BY_SERVER: 'rejected-by-server'
};

/**
 * Host-side information-flow ceiling.
 *
 * Data that originated from a verified server must not be handed to an unverified
 * one. This is the exfiltration half of the cross-server chain, and it is the
 * host's call because only the host knows what is currently in context.
 */
export function crossPrincipalViolation(contributors, recipientAssurance) {
    if (ASSURANCE_RANK[recipientAssurance] === undefined || recipientAssurance !== 'unverified') return null;
    return contributors.find(contributor => contributor.assurance === 'verified') ?? null;
}

export class ReferenceHost {
    constructor({ enforceFlow = true, includePrincipals = true, enforceCeiling = true } = {}) {
        this.enforceFlow = enforceFlow;
        this.includePrincipals = includePrincipals;
        this.enforceCeiling = enforceCeiling;
        this.connections = new Map();
        this.context = new ContextPartition();
        this.log = [];
    }

    connect(server, { assurance, publisher = server.publisher ?? null } = {}) {
        this.connections.set(server.uri, { server, assurance, publisher, capabilities: server.capabilities() });
        return this;
    }

    beginTurn(userInput) {
        this.context = new ContextPartition({ userInput });
        this.log = [];
        return this;
    }

    /**
     * Start a narrower context partition.
     *
     * Sound only when no content from outside the new partition remains in the
     * context used to build subsequent requests. Summarizing the old content into
     * the new partition would NOT satisfy that condition.
     */
    beginPartition(userInput = null) {
        this.context = new ContextPartition({ userInput });
        return this;
    }

    #record(entry) {
        this.log.push(entry);
        return entry;
    }

    #connection(serverUri) {
        const connection = this.connections.get(serverUri);
        if (!connection) throw new Error(`not connected to ${serverUri}`);
        return connection;
    }

    /** The host's own ceiling, then the recipient's declared policy. */
    #precheck(serverUri, connection, policy, flowOrigin, descriptor) {
        if (this.enforceCeiling) {
            const leak = crossPrincipalViolation(flowOrigin.contributors, connection.assurance);
            if (leak) {
                return this.#record({
                    ...descriptor,
                    sent: false,
                    outcome: OUTCOME.BLOCKED_BY_CEILING,
                    reason: `verified-origin data would flow to an unverified principal (${serverUri})`,
                    modelFacing: redactForModel()
                });
            }
        }

        const flowResult = evaluateFlow({ policy, flowOrigin, recipientUri: serverUri });

        if (this.enforceFlow && combine(ALLOW, flowResult) === DENY) {
            return this.#record({
                ...descriptor,
                sent: false,
                outcome: OUTCOME.BLOCKED_BY_POLICY,
                reason: flowResult.reason,
                flowResult,
                modelFacing: redactForModel()
            });
        }

        return null;
    }

    #finish(descriptor, connection, serverUri, response) {
        if (!response.ok) {
            return this.#record({
                ...descriptor,
                sent: true,
                outcome: OUTCOME.REJECTED_BY_SERVER,
                reason: response.error.message,
                error: response.error,
                modelFacing: redactForModel()
            });
        }

        // The result is now part of the partition, and contributes to later requests.
        this.context.addServerContent(serverUri, { assurance: connection.assurance, publisher: connection.publisher });

        return this.#record({ ...descriptor, sent: true, outcome: OUTCOME.ALLOWED, result: response.result });
    }

    callTool(serverUri, toolName, args = {}) {
        const connection = this.#connection(serverUri);
        const flowOrigin = buildFlowOrigin(this.context, { includePrincipals: this.includePrincipals });
        const params = attachFlowOrigin({ name: toolName, arguments: args }, flowOrigin);
        const descriptor = { server: serverUri, kind: 'tool', tool: toolName };

        const blocked = this.#precheck(serverUri, connection, connection.server.policyFor(toolName), flowOrigin, descriptor);
        if (blocked) return blocked;

        return this.#finish(descriptor, connection, serverUri, connection.server.callTool(params));
    }

    /** Reads carry a label too: the URI is a channel out of the trust boundary. */
    readResource(serverUri, uri) {
        const connection = this.#connection(serverUri);
        const flowOrigin = buildFlowOrigin(this.context, { includePrincipals: this.includePrincipals });
        const params = attachFlowOrigin({ uri }, flowOrigin);
        const descriptor = { server: serverUri, kind: 'resource', tool: uri };

        const blocked = this.#precheck(serverUri, connection, connection.server.resourcePolicyFor(uri), flowOrigin, descriptor);
        if (blocked) return blocked;

        return this.#finish(descriptor, connection, serverUri, connection.server.readResource(params));
    }
}
