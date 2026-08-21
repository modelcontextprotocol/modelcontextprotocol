/**
 * Conformance tests for the cross-server flow-policy prototype.
 *
 * Run with:  node --test sep-flow-policy-poc/test/conformance.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OUTCOME, ReferenceHost, crossPrincipalViolation } from '../host.mjs';
import { RECORDS_URI, RECORDS_PUBLISHER, WEBFETCH_URI, createRecordsServer, createWebFetchServer } from '../servers.mjs';
import { ContextPartition } from '../src/context.mjs';
import { FLOW_ORIGIN_KEY, attachFlowOrigin, buildFlowOrigin, readFlowOrigin } from '../src/floworigin.mjs';
import {
    ALLOW,
    DENY,
    DEFAULT_POLICY,
    FLOW_POLICY_VIOLATION_KEY,
    MODEL_SAFE_MESSAGE,
    combine,
    evaluateFlow,
    redactForModel
} from '../src/policy.mjs';
import { LEAST_ASSURED, USER, normalizeAssurance, normalizeContributor, tokenMatches } from '../src/principals.mjs';

function buildHost(options = {}) {
    const settings = { enforceFlow: true, enforceCeiling: true, ...options };
    return new ReferenceHost(settings)
        .connect(createRecordsServer({ enforce: settings.enforceFlow }), { assurance: 'verified' })
        .connect(createWebFetchServer({ enforce: settings.enforceFlow }), { assurance: 'unverified' });
}

// --- contributor tracking ---------------------------------------------------

test('contributors are over-approximated across the whole partition', () => {
    const context = new ContextPartition({ userInput: 'hello' });
    context.addServerContent(WEBFETCH_URI, { assurance: 'unverified' });
    context.addServerContent(RECORDS_URI, { assurance: 'verified', publisher: RECORDS_PUBLISHER });

    const label = buildFlowOrigin(context);
    assert.equal(label.complete, true);
    assert.deepEqual(
        label.contributors.map(entry => entry.assurance).sort(),
        ['unverified', 'user', 'verified']
    );
});

test('a principal seen at two assurance levels keeps the lower one', () => {
    const context = new ContextPartition();
    context.addServerContent(RECORDS_URI, { assurance: 'verified' });
    context.addServerContent(RECORDS_URI, { assurance: 'unverified' });

    const [contributor] = buildFlowOrigin(context).contributors;
    assert.equal(contributor.assurance, 'unverified');
});

test('summarizing content does not clear its contributor', () => {
    const context = new ContextPartition({ userInput: 'hello' });
    context.addServerContent(WEBFETCH_URI, { assurance: 'unverified' });
    // The model condenses the fetched page; the summary is still derived from it.
    context.addDerivedContent(WEBFETCH_URI, { assurance: 'unverified' });

    assert.ok(buildFlowOrigin(context).contributors.some(entry => entry.principal === WEBFETCH_URI));
});

test('a host that cannot enumerate its contributors marks the label incomplete', () => {
    const context = new ContextPartition({ userInput: 'hello' }).markIncomplete();
    assert.equal(buildFlowOrigin(context).complete, false);
});

// --- defensive parsing ------------------------------------------------------

test('an absent label is read as unverified and incomplete', () => {
    const label = readFlowOrigin({ name: 'export_records' });
    assert.deepEqual(label.contributors, [{ assurance: LEAST_ASSURED }]);
    assert.equal(label.complete, false);
    assert.equal(label.synthesized, true);
});

test('a malformed or empty label is read as unverified and incomplete', () => {
    for (const raw of [null, 42, 'nope', [], { contributors: [] }, { contributors: 'no' }]) {
        const label = readFlowOrigin({ _meta: { [FLOW_ORIGIN_KEY]: raw } });
        assert.equal(label.complete, false, JSON.stringify(raw));
        assert.deepEqual(label.contributors, [{ assurance: LEAST_ASSURED }]);
    }
});

test('complete is honoured only when it is literally true', () => {
    const label = readFlowOrigin({
        _meta: { [FLOW_ORIGIN_KEY]: { contributors: [{ assurance: 'user' }], complete: 'yes' } }
    });
    assert.equal(label.complete, false);
});

test('an unknown assurance value normalizes to the least assured state', () => {
    assert.equal(normalizeAssurance('extremely-trustworthy'), LEAST_ASSURED);
    assert.equal(normalizeContributor({ assurance: 'platinum' }).assurance, LEAST_ASSURED);
    assert.equal(normalizeContributor('not-an-object').assurance, LEAST_ASSURED);
});

// --- token matching ---------------------------------------------------------

test('an unrecognized acceptFrom token never matches anything', () => {
    const contributor = { principal: RECORDS_URI, assurance: 'verified' };
    assert.equal(tokenMatches('mostly-fine', contributor, RECORDS_URI), false);
    assert.equal(tokenMatches('', contributor, RECORDS_URI), false);
    assert.equal(tokenMatches(undefined, contributor, RECORDS_URI), false);
});

test('a vendor-prefixed token is inert on a host that does not understand it', () => {
    // Extension is safe by construction: the unknown token simply fails to match,
    // making the older evaluator more restrictive rather than less.
    const contributor = { principal: RECORDS_URI, assurance: 'verified' };
    assert.equal(tokenMatches('com.example.tier:gold', contributor, RECORDS_URI), false);

    const result = evaluateFlow({
        policy: { acceptFrom: ['com.example.tier:gold'] },
        flowOrigin: { contributors: [contributor], complete: true },
        recipientUri: WEBFETCH_URI
    });
    assert.equal(result.allowed, false);
});

test('self matches only the recipient own canonical URI', () => {
    const own = { principal: RECORDS_URI, assurance: 'verified' };
    const other = { principal: WEBFETCH_URI, assurance: 'unverified' };
    assert.equal(tokenMatches('self', own, RECORDS_URI), true);
    assert.equal(tokenMatches('self', other, RECORDS_URI), false);
    assert.equal(tokenMatches('self', { assurance: 'verified' }, RECORDS_URI), false);
});

test('publisher and explicit-URI tokens match as specified', () => {
    const contributor = { principal: RECORDS_URI, assurance: 'verified', publisher: RECORDS_PUBLISHER };
    assert.equal(tokenMatches(`publisher:${RECORDS_PUBLISHER}`, contributor, WEBFETCH_URI), true);
    assert.equal(tokenMatches(RECORDS_URI, contributor, WEBFETCH_URI), true);
    assert.equal(tokenMatches(`publisher:${RECORDS_PUBLISHER}`, { assurance: 'verified' }, WEBFETCH_URI), false);
});

// --- policy evaluation ------------------------------------------------------

test('an incomplete label contributes a synthetic unverified entry', () => {
    const result = evaluateFlow({
        policy: { acceptFrom: ['user'] },
        flowOrigin: { contributors: [{ principal: USER, assurance: 'user' }], complete: false },
        recipientUri: RECORDS_URI
    });
    assert.equal(result.allowed, false);
    assert.equal(result.rejected[0].synthetic, true);
});

test('a policy accepts a partition in which only the user contributed', () => {
    const result = evaluateFlow({
        policy: { acceptFrom: ['self', 'user'] },
        flowOrigin: { contributors: [{ principal: USER, assurance: 'user' }], complete: true },
        recipientUri: RECORDS_URI
    });
    assert.equal(result.allowed, true);
});

test('a policy rejects a partition an unverified server contributed to', () => {
    const result = evaluateFlow({
        policy: { acceptFrom: ['self', 'user'] },
        flowOrigin: {
            contributors: [
                { principal: USER, assurance: 'user' },
                { principal: WEBFETCH_URI, assurance: 'unverified' }
            ],
            complete: true
        },
        recipientUri: RECORDS_URI
    });
    assert.equal(result.allowed, false);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].principal, WEBFETCH_URI);
});

test('a missing or malformed acceptFrom falls back to the default policy', () => {
    const flowOrigin = { contributors: [{ principal: USER, assurance: 'user' }], complete: true };
    assert.equal(evaluateFlow({ policy: {}, flowOrigin, recipientUri: RECORDS_URI }).acceptFrom, DEFAULT_POLICY.acceptFrom);
    assert.equal(evaluateFlow({ policy: { acceptFrom: 'user' }, flowOrigin, recipientUri: RECORDS_URI }).allowed, true);
});

test('privacy-mode labels still evaluate against assurance states, and fail closed on URI policies', () => {
    const context = new ContextPartition({ userInput: 'hi' });
    context.addServerContent(WEBFETCH_URI, { assurance: 'unverified' });
    const label = buildFlowOrigin(context, { includePrincipals: false });

    assert.ok(label.contributors.every(entry => entry.principal === undefined));
    assert.equal(evaluateFlow({ policy: { acceptFrom: ['user', 'unverified'] }, flowOrigin: label, recipientUri: RECORDS_URI }).allowed, true);
    // A policy keyed on an explicit principal cannot match a withheld one.
    assert.equal(evaluateFlow({ policy: { acceptFrom: ['user', WEBFETCH_URI] }, flowOrigin: label, recipientUri: RECORDS_URI }).allowed, false);
});

// --- the restriction-only invariant -----------------------------------------

test('no flow result can turn a denial into an approval', () => {
    for (let index = 0; index < 200; index += 1) {
        const flowResult = { allowed: index % 2 === 0, rejected: [], acceptFrom: [] };
        assert.equal(combine(DENY, flowResult), DENY);
        assert.equal(combine('anything-not-allow', flowResult), DENY);
    }
});

test('flow evaluation can only move an approval to a denial', () => {
    assert.equal(combine(ALLOW, { allowed: true }), ALLOW);
    assert.equal(combine(ALLOW, { allowed: false }), DENY);
});

// --- host behaviour ---------------------------------------------------------

test('the host refuses to dispatch a request it knows violates the declared policy', () => {
    const host = buildHost();
    host.beginTurn('summarize this page');
    host.callTool(WEBFETCH_URI, 'fetch_page', { url: 'https://notes.example/x' });

    const entry = host.callTool(RECORDS_URI, 'export_records', { table: 'customers' });
    assert.equal(entry.sent, false);
    assert.equal(entry.outcome, OUTCOME.BLOCKED_BY_POLICY);
});

test('the same privileged call succeeds when no low-assurance server has contributed', () => {
    const host = buildHost();
    host.beginTurn('export the customer table');

    const entry = host.callTool(RECORDS_URI, 'export_records', { table: 'customers' });
    assert.equal(entry.outcome, OUTCOME.ALLOWED);
    assert.match(entry.result, /BEGIN customers/);
});

test('a resource read carries a label and is gated like a call', () => {
    const host = buildHost();
    host.beginTurn('summarize this page');
    host.callTool(WEBFETCH_URI, 'fetch_page', { url: 'https://notes.example/x' });

    const entry = host.readResource(RECORDS_URI, 'records://customers');
    assert.equal(entry.kind, 'resource');
    assert.equal(entry.sent, false);
    assert.equal(entry.outcome, OUTCOME.BLOCKED_BY_POLICY);
});

test('a read whose URI carries data outward is subject to the host ceiling', () => {
    const host = buildHost();
    host.beginTurn('archive the account');
    host.callTool(RECORDS_URI, 'search_records', { query: 'Contoso' });

    const entry = host.readResource(WEBFETCH_URI, 'notes://export?data=ada@contoso.example');
    assert.equal(entry.sent, false);
    assert.equal(entry.outcome, OUTCOME.BLOCKED_BY_CEILING);
});

test('refusal detail is withheld from the model, because a specific refusal is an oracle', () => {
    const host = buildHost();
    host.beginTurn('summarize this page');
    host.callTool(WEBFETCH_URI, 'fetch_page', { url: 'https://notes.example/x' });

    const entry = host.callTool(RECORDS_URI, 'export_records', { table: 'customers' });
    assert.equal(entry.modelFacing.message, MODEL_SAFE_MESSAGE);

    // The host keeps the detail; none of it survives into what the model may see.
    assert.ok(entry.reason.includes(WEBFETCH_URI));
    const modelFacing = JSON.stringify(entry.modelFacing);
    assert.ok(!modelFacing.includes(WEBFETCH_URI));
    assert.ok(!modelFacing.includes('acceptFrom'));
    assert.deepEqual(redactForModel(), { message: MODEL_SAFE_MESSAGE });
});

test('the host ceiling blocks verified-origin data flowing to an unverified server', () => {
    const host = buildHost();
    host.beginTurn('archive the account');
    host.callTool(RECORDS_URI, 'search_records', { query: 'Contoso' });

    const entry = host.callTool(WEBFETCH_URI, 'upload_blob', { content: 'anything' });
    assert.equal(entry.sent, false);
    assert.equal(entry.outcome, OUTCOME.BLOCKED_BY_CEILING);
});

test('crossPrincipalViolation only fires toward unverified recipients', () => {
    const contributors = [{ assurance: 'verified', principal: RECORDS_URI }];
    assert.ok(crossPrincipalViolation(contributors, 'unverified'));
    assert.equal(crossPrincipalViolation(contributors, 'verified'), null);
    assert.equal(crossPrincipalViolation([{ assurance: 'user' }], 'unverified'), null);
});

// --- server-side defence in depth -------------------------------------------

test('the server rejects independently when the host skips its pre-check', () => {
    const host = buildHost({ enforceFlow: false, enforceCeiling: false });
    host.beginTurn('summarize this page');
    host.callTool(WEBFETCH_URI, 'fetch_page', { url: 'https://notes.example/x' });

    // The host no longer pre-checks, but the server still enforces its own policy.
    const records = createRecordsServer({ enforce: true });
    host.connections.get(RECORDS_URI).server = records;

    const entry = host.callTool(RECORDS_URI, 'export_records', { table: 'customers' });
    assert.equal(entry.sent, true);
    assert.equal(entry.outcome, OUTCOME.REJECTED_BY_SERVER);
});

test('a flow-policy refusal is discriminated by its namespaced data key, not a code', () => {
    const records = createRecordsServer({ enforce: true });
    const response = records.callTool({ name: 'export_records', arguments: { table: 'customers' } });

    assert.equal(response.ok, false);
    assert.ok(FLOW_POLICY_VIOLATION_KEY in response.error.data);
    assert.deepEqual(response.error.data[FLOW_POLICY_VIOLATION_KEY].acceptFrom, ['self', 'user']);
});

test('a server receiving no label at all refuses the privileged tool', () => {
    const records = createRecordsServer({ enforce: true });
    const response = records.callTool({ name: 'export_records', arguments: { table: 'customers' } });
    assert.equal(response.ok, false);
});

test('a per-tool policy overrides the server default', () => {
    const records = createRecordsServer();
    assert.deepEqual(records.policyFor('export_records').acceptFrom, ['self', 'user']);
    assert.deepEqual(records.policyFor('search_records'), DEFAULT_POLICY);
});

test('a resource policy is matched ignoring the query string', () => {
    const webfetch = createWebFetchServer();
    assert.deepEqual(webfetch.resourcePolicyFor('notes://export?data=secret'), DEFAULT_POLICY);
    assert.deepEqual(createRecordsServer().resourcePolicyFor('records://customers').acceptFrom, ['self', 'user']);
});

test('policies are carried in the tool and resource declarations', () => {
    const records = createRecordsServer();
    assert.deepEqual(records.listTools().find(tool => tool.name === 'export_records').flowPolicy, { acceptFrom: ['self', 'user'] });
    assert.deepEqual(records.listResources().find(resource => resource.uri === 'records://customers').flowPolicy, {
        acceptFrom: ['self', 'user']
    });
});

// --- end to end -------------------------------------------------------------

test('the cross-server chain succeeds today and is refused with flow policy', () => {
    const permissive = buildHost({ enforceFlow: false, enforceCeiling: false });
    permissive.beginTurn('summarize this page');
    permissive.callTool(WEBFETCH_URI, 'fetch_page', { url: 'https://notes.example/x' });
    const exported = permissive.callTool(RECORDS_URI, 'export_records', { table: 'customers' });
    const uploaded = permissive.callTool(WEBFETCH_URI, 'upload_blob', { content: exported.result });

    assert.equal(exported.outcome, OUTCOME.ALLOWED, 'the current protocol permits the whole chain');
    assert.equal(uploaded.outcome, OUTCOME.ALLOWED);

    const guarded = buildHost();
    guarded.beginTurn('summarize this page');
    guarded.callTool(WEBFETCH_URI, 'fetch_page', { url: 'https://notes.example/x' });

    assert.equal(guarded.callTool(RECORDS_URI, 'export_records', { table: 'customers' }).outcome, OUTCOME.BLOCKED_BY_POLICY);
});

test('the label the host attaches is the one the server reads back', () => {
    const context = new ContextPartition({ userInput: 'hi' });
    const label = buildFlowOrigin(context);
    const params = attachFlowOrigin({ name: 'search_records', arguments: {} }, label);

    assert.deepEqual(readFlowOrigin(params).contributors, [{ principal: USER, assurance: 'user' }]);
    assert.equal(readFlowOrigin(params).complete, true);
});
