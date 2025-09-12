We are creating a protocol compliance test harness.

This repository contains the MCP specs in @docs/specification/draft/index.mdx

We want to progressively test the following SDKs against the spec:

* <https://github.com/modelcontextprotocol/typescript-sdk>
* <https://github.com/modelcontextprotocol/python-sdk>
* <https://github.com/modelcontextprotocol/go-sdk>
* <https://github.com/modelcontextprotocol/java-sdk>
* <https://github.com/modelcontextprotocol/kotlin-sdk>
* <https://github.com/modelcontextprotocol/rust-sdk>
* <https://github.com/modelcontextprotocol/swift-sdk>
* <https://github.com/modelcontextprotocol/csharp-sdk>
* <https://github.com/modelcontextprotocol/ruby-sdk>

To that effect, we will first define a few human-reviewed & versioned scenarios under `compliance/scenarios/data.json`:

* Each scenario may involve 1 or more clients, and 1 server.
  * Definitions are common to all scenarios, e.g.:
    * CalcServer features:
      * tools:
        * add: takes a & b inputs
        * ambiguous_add: takes a input, elicits b input
        * cos: disabled by default
        * sin: disabled by default
        * set_trig_allowed: enables/disables cos & sin
        * write_special_number: updates the corresponding resource
        * eval_with_sampling: evaluates a string arithmetic expression using sampling
      * resources
        * resource://special-number
      * prompts
        * example-maths
  * Scenario is expressed in plain English, e.g.
    * client1 connects to CalcServer and calls add(a=10, b=20), gets result of 30.
    * client1 connects to CalcServer and calls ambiguous_add(a=10), receives elicitation for b, responds to it with 20, gets tool result of 30.
    * client1 & client2 connect to CalcServer; client1 calls set_trig_allowed(allowed=true) tool. client1 gets list of tools that includes cos & sin, and client2 gets list of tools that doesn't.
  * Plain english means we say "the CalcServer cancels" and not "the CalcServer sends notifications/cancelled"
* Definitions live in `compliance/scenarios/data.json` (see `Scenarios` type below)
* Each SDK implements client and a server executables (under `compliance/<sdk-name>/test-{client,server}`), with the following CLI interfaces:
  * Server: binary w/ all required flags:
    * `--server-name`: refers to one of the definitions in `compliance/scenarios/data.json`, e.g. `CalcServer`. The server must check the description of the corresponding definition matches what it was when it was built / vibe-coded.
    * `--transport`: `stdio` | `sse` | `streamable-http`
    * `--host` / `--port`: for http transport, where to listen
    * `--scenarios-data`: (optional) path to the scenarios data file. If provided, the server must validate that the server definition description matches what it was built for.
  * Client: binary w/ all required flags:
    * `--scenario-id`: id of one of the scenario in `compliance/scenarios/data.json`. Client must check the description of the corresponding scenario matches what it was when it was built / vibe-coded
    * `--id`: tells the client its name (e.g. client1), which needs to refer to the scenario. Used when there are more than 1 client involved in the scenario.
    * `--scenarios-data`: (optional) path to the scenarios data file. If provided, the client must validate that the scenario description matches what it was built for.
    * `<server-desc>` is one of:
      * `sse <server-url>`
      * `streamable-http <server-url>`
      * `stdio <path-to-test-server-binary>`
  * Both binaries will be assumed to be run w/ PWD at the root of this repo
* Based on these, we design a replay/log mechanism which captures the JSON-RPC messages (aggregated across any number of transport channels, e.g. multiple POSTs / SSE connections in parallel) involved in each scenario
  * Each JSON-RPC message is annotated w/ metadata:
    * sender: e.g. client1, client2, CalcServer...
    * recipient: same values as sender
    * streamable_http_metadata:
      * method: `POST` | `POST-SSE` | `GET-SSE`
      * headers: {'mcp-protocol-version', 'mcp-session-id', 'accept', ...}
* Our test harness (in `compliance/tests`, written in TypeScript) will orchestrate the client & server binaries of various SDKs and maintain / verify the replay logs:
  * Man-in-the-middle transport capturing binary (note: see examples of piping transports together in proxyTransports inside @./stdio-wrapper.mjs; would just need to also log)
    * has 3 sub-commands
      * `stdio`: followed by rest args `<command> <args...>`
      * `sse`: has required flags `--host` and `--port` to listen to, and followed by rest arg `<url>`
      * `streamable-http`: has required flags `--host` and `--port` to listen to, and followed by rest arg `<url>`
    * has flags across all commands
      * `--log`: path to a `JSONL` file where the annotated JSON-RPC messages received from the client and server will be dumped
        * NOTE: the first line of that file will be a `//` comment line (or multiline if needed, each starting w/ `//`) w/ the scenario's description.
  * Ensures that client & server binaries are built for each SDK (using subagents)
  * Records replay log goldens using the TypeScript SDK as reference to capture golden replay logs
    * e.g. for simple stdio recording (easy start):

      ```bash
      compliance/typescript-sdk/test-client \
          --scenario-id 1 \
          --client-id "client1" \
          stdio \
          compliance/harness/mitm stdio \
              --log compliance/goldens/1.jsonl \
              compliance/typescript-sdk/test-server \
                  --server-name CalcServer \
                  --transport stdio
      ```
  * Tests each client x server SDK combinations, pitting SDK1’s client binary against SDK2’s server binary for each of the scenarios
    * Records traffic again: at the end of the test, compare the log to the golden
    * Checks that neither the client nor the server errors out

The test harness has multiple layers, based on heavy use of Claude Code w/ slash commands and specific CLAUDE.md prompts:

- Core types in `compliance/src/types.ts`:

  ```typescript
  type NameMap<T> = {
      [name: string]: T
  }
  type HasDescription = {
      description: string
  }
  type Scenarios = {
      servers: NameMap<HasDescription & {
          tools: NameMap<HasDescription>,
          resources: NameMap<HasDescription>,
          resourceTemplates: NameMap<HasDescription & {params: NameMap<HasDescription>}>,
          prompts: NameMap<HasDescription>,
          promptTemplates: NameMap<HasDescription & {params: NameMap<HasDescription>}>,
      }>,
      scenarios: {
          id: number, // Starts at 1, must be unique
          description: string, // e.g. "client1 connects to CalcServer and calls add(a=10, b=20), gets result of 30."
          client_ids: string[], // e.g. ["client1"]
          server_name: string, // e.g. ["CalcServer"]
          http_only?: boolean,
      }[],
  }

  ```

- Infra code in `compliance/src`: validation of `compliance/scenarios/data.json`, `compliance/scenarios/goldens/*.json`, 

- Slash commands in `.claude/commands/`

    - `update_scenarios.md`: suggests improvements to `compliance/scenarios/data.json`: can be run from scratch to seed the scenarios, or after a spec update to make sure the scenarios cover the diffs. The slash command should link to each and every of the spec files.
        - Looks at the git history on specs inside @docs/specification/draft, and at diffs on @compliance/scenarios/data.json ; any diffs in the specs that are more recent than scenarios updates deserve particular attention / might warrant updating / creating scenarios (and updating SDKs, goldens, etc)
        - ensures the following guidelines when creating, updating or reviewing scenarios (uses one todo / subagent per scenario): 
            - descriptions in @compliance/scenarios/data.json must not be ambiguous / must be prescriptive enough so any SDKs looking to implement it would have no room for interpretation (the goal is to ensure we have predictible replay logs between clients and servers)
        - if goldens already exist in @compliance/scenarios/goldens/, first we'll need to update the TypeScript SDK with any changes to the scenarios, then update the goldens and iterate until all of the golden changes make sense in light of the scenario descriptions, disambiguating the descriptions if/when needed. The golden logs should match what one would expect after reading the specs for each scenario.

    - `update_sdk.md`: generates or updates a specific SDK's client and server binaries:
        - First, a `compliance/<sdk-name>/CLAUDE.md` must be assembled or updated with links to the SDK's docs, relevant official client/server examples, and directions for implementation.
        - Pay special attention to all the available features of the SDK. For instance, support to enable/disable registered tools (w/ automatic tool change events emission)
        - Then the client and server binaries can be generated in two independent claude code executions inside `compliance/<sdk-name>`, pointing them towards `../../compliance/scenarios/data.json` to source the scenarios
        - Tests for the client and the server binaries are generated or updated, run, and debugged (SDK / language-dependent)

    - `update_goldens.md`: captures the traffic between the TypeScript SDK's client and server binaries over all the scenarios

    - `cross_test_sdks.md` (takes list of sdks): runs the tests against each other.

    - `debug_sdk.md`: takes an sdk name, and inspects its behaviour (using the todo list and many subagents):

        - inspects the server testing binary's implementation of all server definitions (one todo / subagent per definition)
        
        - inspects each scenario (one todo / subagent per scenario): 
            - understand its description (in @compliance/scenarios/data.json ; does it need to be disambiguated? should be quite prescriptive so all SDKs will implement the scenario the same) and its output (in @compliance/scenarios/goldens/ ; does it match what one would expect after reading the specs?)
            - analyze its implementation (does it look correct, idiomatic, is it checking conditions appropriately / erroring on unexpected data?),
            - proceed to fixing any or all of the relevant bits (use subagents for the analysis, and for the fixes)

- `compliance/<sdk-name>/CLAUDE.md`: artefacts created by `.claude/commands/update_sdk.md` slash commands.

Let's implement this:
- Write the test infra (TS, use tsx to run binaries and tests)
    - Core TS types: scenarios, annotated log, tests to validate data
    - Testing libs that operate on any client and server binaries to test their contract (flags and general behaviour)
    - Write slash commands
    - Run /update_scenarios to stub simple `compliance/scenarios/data.json`
    - Transport interceptors / loggers
        - stdio interceptor + unit tests
        - sse interceptor + unit tests
        - streamable http interceptor + unit tests
        - CLI to wire the 3 together + e2e tests
- Run /update_sdk typescript
- Run /update_goldens

Don't forget to use subagents for any task you can delegate and/or parallelize.