# Security Policy

Thank you for helping us keep the SDKs and systems they interact with secure.

## Reporting Security Issues

This SDK is maintained by [Anthropic](https://www.anthropic.com/) as part of the Model
Context Protocol project.

The security of our systems and user data is Anthropic's top priority. We appreciate the
work of security researchers acting in good faith in identifying and reporting potential
vulnerabilities.

Our security program is managed on HackerOne and we ask that any validated vulnerability
in this functionality be reported through their
[submission form](https://hackerone.com/anthropic-vdp/reports/new?type=team&report_type=vulnerability).

## Vulnerability Disclosure Program

Our Vulnerability Program Guidelines are defined on our
[HackerOne program page](https://hackerone.com/anthropic-vdp).

## Intended Behaviors and Trust Model

This section documents behaviors that are intentional design choices in MCP and are
**not** considered security vulnerabilities. Understanding these behaviors helps
developers build accurate threat models, enables security researchers to focus on
genuine vulnerabilities, and clarifies the trust boundaries within MCP for all
implementers.

### Trust Model

MCP is designed to enable AI applications to interact with external tools, data
sources, and services. The protocol operates under the following trust assumptions:

**MCP clients trust MCP servers they connect to.** When a user or application
configures an MCP client to connect to a server, the client trusts that server to
provide tools, resources, and prompts. The security of this trust relationship
depends on proper server selection and configuration by the user or administrator.

**Local MCP servers are trusted like any other software you install.** When you run a
local MCP server, you are trusting it with the same level of access as any other
application or package on your system. Just as you would evaluate the trustworthiness
of a library or tool before installing it, you should evaluate MCP servers before
running them.

**MCP servers trust the execution environment they run in.** Servers have access to
the resources available in their execution context. This is by design, as servers need
access to local files, databases, APIs, or other resources to provide their intended
functionality.

**Users and administrators are responsible for server selection.** MCP clients should
provide clear information about server capabilities, but the decision to connect to
and use a server rests with the user or administrator. Some clients may auto-connect
to certain servers based on configuration; users should review these settings.

### Behaviors That Are Not Vulnerabilities

The following behaviors are intentional features of MCP and are **not** eligible for
security vulnerability reports or bug bounty rewards:

#### Command Execution for STDIO Transport

MCP clients using the STDIO transport launch MCP servers by executing commands. This
command execution is an intended feature, not a vulnerability:

- Clients execute the configured command to start the server process
- The server process runs with the same privileges as the client
- Command arguments specified in configuration are passed to the server

**This is expected behavior.** Users configure which servers to run, and the client
executes those configurations. Reports about "arbitrary command execution" via STDIO
transport configuration, whether in MCP client applications or SDKs, are not
vulnerabilities. Process spawning is a core feature of the STDIO transport mechanism.

#### Server Capabilities and Side Effects

MCP servers provide capabilities that may have significant effects on the system or
external services. These capabilities are features, not vulnerabilities:

**File system access:** Servers like the reference filesystem server intentionally
read, write, and list files within their configured scope. A filesystem server's
purpose is to provide file access to AI applications.

**Git and version control:** Servers providing git functionality can execute git
commands, which may include operations like resetting commits or force pushing. If you
grant an AI agent unrestricted access to git commands, it can perform any git
operation—this is not a vulnerability in the server.

**Database operations:** Servers may execute queries, modify data, or manage database
schemas based on their intended purpose.

**Network and API access:** Servers may make HTTP requests, call external APIs, or
interact with remote services.

**System commands:** Some servers are designed to execute system commands or scripts.

**This is expected behavior.** Servers that perform their documented functions are
working as intended. Reports about "server X can perform action Y" are not
vulnerabilities when Y is the server's intended purpose. The appropriate safeguards
and permissions for these capabilities are the responsibility of the user or
administrator deploying the server.

#### Resource Access Patterns

MCP resources expose data to clients. Servers may provide resources containing file
contents, database query results, API responses, or system information.

**This is expected behavior.** Resources are designed to provide context and data to
AI applications. The scope of accessible data is determined by server implementation
and configuration.

#### LLM-Driven Tool Invocation

When AI applications use MCP, the language model determines which tools to invoke
based on user requests and available tool descriptions. This means:

- The LLM may invoke tools in ways the user did not explicitly request
- Tool invocations depend on how the LLM interprets the user's intent
- Multiple tools may be invoked in sequence

**This is expected behavior.** LLM-driven tool selection is fundamental to how AI
applications use MCP. Reports about "LLM invoked unexpected tool" are not MCP
vulnerabilities, as they relate to LLM behavior and application-level controls.

### Developer and Operator Responsibilities

MCP's security model places certain responsibilities on developers and operators:

**Server developers are responsible for:**

- Implementing appropriate access controls within their servers
- Documenting the capabilities and permissions their servers require
- Validating inputs from clients before performing sensitive operations
- Following the principle of least privilege in server design

**Client developers are responsible for:**

- Providing clear information to users about server capabilities
- Implementing appropriate consent mechanisms before connecting to servers
- Displaying tool invocations and resource access to users when appropriate
- Sandboxing server execution where feasible

**Operators and users are responsible for:**

- Connecting only to trusted MCP servers
- Reviewing server configurations before deployment
- Understanding the capabilities of servers they enable
- Configuring appropriate access restrictions for their environment

For additional guidance on building and deploying secure MCP implementations, see the
[Security Best Practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices)
documentation.

### What Remains In Scope

The following categories **are** considered security vulnerabilities when they arise
from flaws in the MCP specification or official SDK implementations:

- **Protocol-level vulnerabilities**: Flaws in the MCP specification that enable
  attacks regardless of implementation
- **Authentication/authorization bypasses**: Ways to access resources or invoke tools
  without proper authorization
- **Implementation vulnerabilities**: Bugs in specific SDK implementations (buffer
  overflows, injection flaws, etc.)
- **Sandbox escapes**: Breaking out of intended isolation boundaries explicitly
  defined in the protocol or SDKs
- **Session hijacking**: Unauthorized access to another user's session
- **Token theft or leakage**: Vulnerabilities that expose access tokens
- **Cross-tenant access**: Accessing resources belonging to other users in
  multi-tenant deployments

This list is not exhaustive.

### Reporting Guidelines

When evaluating whether to report a potential security issue:

1. **Check this document first.** If the behavior is listed as intended, it is not
   a vulnerability.
2. **Consider the trust model.** If the issue requires the attacker to already have
   access that the trust model assumes they have, it may not be a vulnerability.
3. **Focus on unexpected access.** Vulnerabilities typically involve accessing
   resources or performing actions that should not be possible given the established
   trust boundaries.
4. **Provide context.** If you believe you have found a genuine vulnerability,
   explain how it violates the intended security boundaries.
