/**
 * Cross-server attack reproduction for the flow-policy SEP.
 *
 * Run with:  node sep-flow-policy-poc/demo.mjs
 *
 * The same sequence is run first under today's protocol, where it succeeds, and
 * then with flow policy enabled, where it is refused. Neither server is
 * compromised in either run, and neither misbehaves by its own contract.
 */

import { OUTCOME, ReferenceHost } from './host.mjs';
import { RECORDS_URI, WEBFETCH_URI, createRecordsServer, createWebFetchServer } from './servers.mjs';
import { readFlowOrigin } from './src/floworigin.mjs';

function heading(title) {
    console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
}

function show(entry) {
    const verdict = entry.outcome === OUTCOME.ALLOWED ? 'OK' : 'BLOCKED';
    console.log(`  ${verdict.padEnd(8)} ${entry.server.replace('https://', '').padEnd(34)} ${entry.tool}`);

    if (entry.outcome !== OUTCOME.ALLOWED) {
        console.log(`           ${entry.outcome}`);
        if (entry.reason) console.log(`           reason: ${entry.reason}`);
        return;
    }

    if (entry.tool === 'export_records') {
        console.log(`           returned: ${entry.result.split('\n')[1]}`);
    }
}

function buildHost(options) {
    return new ReferenceHost(options)
        .connect(createRecordsServer({ enforce: options.enforceFlow }), { assurance: 'verified' })
        .connect(createWebFetchServer({ enforce: options.enforceFlow }), { assurance: 'unverified' });
}

/** The sequence the model is steered into after reading the poisoned page. */
function runAttack(host) {
    host.beginTurn('Summarize the Contoso notes page and file a report.');

    show(host.callTool(WEBFETCH_URI, 'fetch_page', { url: 'https://notes.example/contoso' }));

    const exported = host.callTool(RECORDS_URI, 'export_records', { table: 'customers' });
    show(exported);

    const stolen = exported.outcome === OUTCOME.ALLOWED ? exported.result : '(nothing to send)';
    show(host.callTool(WEBFETCH_URI, 'upload_blob', { content: stolen }));

    return stolen;
}

// ---------------------------------------------------------------------------
heading('1. Today: no origin labels, no flow policy');
console.log('  The fetched page carries a hidden instruction. Both servers behave correctly.\n');

const stolen = runAttack(buildHost({ enforceFlow: false, enforceCeiling: false }));
console.log(`\n  Result: the customer table left the trust boundary.\n  Exfiltrated: ${stolen.split('\n')[1]}`);

// ---------------------------------------------------------------------------
heading('2. With flow policy: the chain breaks at the first privileged step');
console.log('  export_records declares acceptFrom ["self", "user"].');
console.log('  The web-fetch server has already contributed to this turn, so the call is');
console.log('  never dispatched. The upload still runs, but there is nothing to carry.\n');

runAttack(buildHost({ enforceFlow: true, enforceCeiling: true }));

// ---------------------------------------------------------------------------
heading('3. Legitimate use is unaffected, and the exfiltration leg is covered separately');

const clean = buildHost({ enforceFlow: true, enforceCeiling: true });
clean.beginTurn('Look up the Contoso account and archive a copy.');

console.log('  No low-assurance server has contributed yet, so the privileged call proceeds:\n');
show(clean.callTool(RECORDS_URI, 'export_records', { table: 'customers' }));

console.log('\n  Now the same data is offered to an unverified server:\n');
show(clean.callTool(WEBFETCH_URI, 'upload_blob', { content: 'BEGIN customers ...' }));

// ---------------------------------------------------------------------------
heading('4. The same gate applies to reads, because a URI is an egress channel');
console.log('  Nothing is "called" here. The data leaves inside the URI of an ordinary read,');
console.log('  which is why the label cannot be scoped to tools/call alone.\n');

const reader = buildHost({ enforceFlow: true, enforceCeiling: true });
reader.beginTurn('Archive my notes.');

show(reader.callTool(RECORDS_URI, 'search_records', { query: 'Contoso' }));
show(reader.readResource(WEBFETCH_URI, 'notes://export?data=ada@contoso.example'));

// ---------------------------------------------------------------------------
heading('5. Refusals stay out of the model context');
console.log('  The host keeps the violation set for its audit log. The model is told only');
console.log('  that the call was not permitted, because a specific refusal is an oracle:');
console.log('  an injected instruction can iterate against it until it finds a route.\n');

const blocked = reader.log.find(entry => entry.outcome !== OUTCOME.ALLOWED);
console.log(`  host sees : ${blocked.reason}`);
console.log(`  model sees: ${blocked.modelFacing.message}`);

// ---------------------------------------------------------------------------
heading('6. Fail closed: a host that sends no label at all');

const records = createRecordsServer({ enforce: true });
const unlabelled = records.callTool({ name: 'export_records', arguments: { table: 'customers' } });

console.log('  A server receiving no flowOrigin treats it as unverified and incomplete.\n');
console.log(`  accepted   : ${unlabelled.ok}`);
console.log(`  error      : ${unlabelled.error.message}`);
console.log(`  synthesized: ${JSON.stringify(readFlowOrigin({ name: 'export_records' }))}`);

console.log('\nSee test/conformance.test.mjs for the assertions behind these scenarios.\n');
