# SEP-1309: Specification Version Management

- **Status**: Accepted
- **Type**: </b> Standards Track<br>
- **Created**: 2025-08-06
- **Author(s)**: </b> Anurag Pant, Surbhi Bansal<br>
- **Issue**: #1309

<h2>Preamble</h2>
<b>Title:</b> Specification Version Management<br>
<b>Authors:</b> Anurag Pant, Surbhi Bansal<br>
<b>Status:</b> Accepted with Changes<br>
<b>Type:</b> Standards Track<br>
<b>Created:</b> 08/06/2025<br>
<h2>Abstract</h2>
This SEP provides clear guidelines that enable SDK maintainers to independently manage their releases while maintaining transparent specification compliance. The recommended framework aims to improve SDK discoverability for end users, ensure reliable official SDK interoperability and allow SDK maintainers to evolve their implementations at their own pace while clearly communicating specification support levels.<br>
<h2>Motivation</h2>
The existing protocol specification is inadequate because it lacks guidance around SDK version management that can help standardize the process around official SDK releases and help improve SDK interoperability. As MCP moves towards supporting remotely hosted MCP servers, there need to be some guidelines around how SDK owners can announce specification version compliance to the end users. The guidelines should also leave room to allow an SDK to release patches or to make breaking changes that may or may not be related to the features in the specification version.<br>
<ul>
   <li>Guidelines will standardize how end users discover different specification version compliant SDK versions</li>
   <li>Discovery will allow for end-users to reliably establish connection with a remote client/server written in another MCP SDK which  is compliant with the same specification version</li>
   <li>MCP SDK maintainers will be able to make breaking changes, when necessary to fix the SDK implementation and/or improve developer experience, while versioning the SDK at their own pace</li>
</ul>
<h2>Specification</h2>
<h3><b>Specification Version Semantics</b></h3>
MCP specification maintainers will be responsible for releasing new versions.<br>
<ul>
   <li>All versions MUST be accompanied by detailed release notes to alert the SDK maintainers about the changes required to be compliant with a specification version.</li>
</ul>
<h3><b>SDK Versioning</b></h3>
SDK maintainers should have the freedom to do SDK version releases at their own pace. Each SDK version release would contain, as part of its code, the specification versions that are supported by the SDK version release.<br>
<ul>
   <li>SDK maintainers MUST use version release tags to mark compliance with different specification versions.</li>
   <li>SDK maintainers MUST publish release notes that call out with which specification versions the release is compliant.</li>
   <li>An SDK version release SHOULD implement all features specified in a specification version if it claims compliance with that version, and SHOULD NOT implement features introduced in versions beyond its declared compliance range.</li>
   <li>An SDK version MAY implement partial compliance with a specification version under the following conditions:</li>
   <ul>
      <li>SDK release notes MUST explicitly document which features from the partially supported specification version are implemented.</li>
      <li>The SDK MUST use its latest fully-supported version as the default specification version setting.</li>
      <li>The SDK MUST provide configuration options allowing users to set the maximum specification version used during version negotiation.</li>
      <li>All features from the partially supported specification version MUST be implemented with version-aware behavior that respects the user-configured maximum specification version.</li>
   </ul>
</ul>
<h3><b>Specification-SDK Version Mapping Strategy</b></h3>
Specification documentation will be used to keep a track of the status of specification releases across all official MCP SDKs. The documentation will contain an implementation tracking matrix. This will aid in SDK version discovery for end-users as well as tracking how far along specification compliance is across the official SDKs.<br>
<ul>
   <li>SDK maintainers MUST update the table whenever they put out a version release that meets the specification compliance</li>
   <li>SDK maintainers MUST update the table whenever they put out a version release that drops support for a prior specification version</li>
   <li>The update to the table MUST only have the minimum and maximum (if support dropped in previous release) SDK version that supports the corresponding specification version.</li>
</ul>
The intention of allowing SDK releases to offer partial support for a specification version is that the SDK consumers will have the choice to opt in to the available partial features, even if they are still unstable. By default, the SDK should maintain stability guarantees for a specification version.
<h4><b>Implementation Tracking Matrix</b></h4>

Specification Version | Status | Python SDK | TypeScript SDK | Java SDK
-- | -- | -- | -- | --
2024-11-05 | ✅ Stable | ✅ 2.0.5 - 2.1.4 | ✅ 1.0.3 - 1.5.0 | ✅ 0.0.3
2025-03-26 | ✅ Stable | ✅ 2.2.0 | ✅ 1.1.4 - 2.1.0 | ✅ 0.11.0
2025-06-18 | 🚧 In Progress | 🚧 2.3.0-beta.1 | ✅ 2.2.0 | 🚧 main
2025-09-29 | 📋 Planned | ❌ Not Started | ❌ Not Started | ❌ Not Started

<h2>Rationale</h2>
<h3><b>Independent SDK Versioning with Protocol Support Declaration</b></h3>
The decision to allow SDKs to version independently while declaring supported specification versions provides maximum flexibility while maintaining clear compatibility relationships. This approach:<br>
<ul>
   <li><b>Maximizes SDK maintainer flexibility:</b> Each SDK can release at their own pace without coordination overhead</li>
   <li><b>Reduces coordination complexity:</b> No need to synchronize releases across multiple repositories</li>
   <li><b>Enables gradual adoption:</b> SDKs can add support for new specification versions when ready</li>
   <li><b>Maintains backward compatibility:</b> SDKs can support multiple specification versions simultaneously</li>
</ul>
<h2>Backward Compatibility</h2>
This change is completely backwards compatible.
<h2>Alternatives Considered</h2>
Listed below are some alternative approaches that were considered for implementing versioning in MCP SDKs.<br>
<h3>Specification Version Dictates SDK Release Tags</h3>
In this approach, release tags will be tightly coupled with MCP specification versions. Release tags will be used to mark different commits with specification versions. These release tags will signify that at that commit, the SDK code is compliant with the marked specification version. Branches would be tied to SDK implementations. SDKs would be able to use semantically versioned (if the SDK uses semantic versioning) branches to signify minor or breaking SDK changes.<br><br>Any official SDK would implement specification versions using aligned version tags in the repository:<br>
<ul>
   <li>Specification version <code>2025-03-26</code> → SDK version tag <code>2025-03-26</code> on branch <code>2.4</code></li>
   <li>Specification version <code>2025-06-18</code> → SDK version tag <code>2025-06-18</code> on branch <code>3.1</code></li>
</ul>
<h4>Drawbacks</h4>
<ul>
   <li><b>Overly Prescriptive</b> Limits flexibility while complicating release cycles and development process for SDK maintainers</li>
   <li><b>Package Manager Integration Issues</b> Creates significant problems with external package managers (Cargo, PyPI, NPM) where published releases would either need to correspond to specification or SDK versions. Would allow for breaking changes (either specification or SDK) within the same major version on package managers.</li>
</ul>
<h3>Specification Dictates SDK Implementation Details</h3>
This approach dictates the implementation details across the official SDKs. This can be done in a few ways:<br>
<ul>
   <li><b>Single Repository - Different Folders/Namespaces: </b>All specification versions are maintained within the same repository but in separate folders/namespaces.</li>
   <li><b>Same Repository - Base Class with Subclasses + Conditional Statements:</b> All specification versions share a common codebase with version-specific behavior implemented through inheritance and polymorphism.</li>
   <li><b>Different Repositories for Different Versions:</b> Each specification version is maintained in a completely separate repository to create clear boundaries and allow for independent development.</li>
</ul>
<h4>Drawbacks</h4>
<ul>
   <li>Prescribes implementation details that might not be viable across different SDKs</li>
   <li>Introduces significant complexity due to either folder structure, polymorphic behavior, build system management or dependency management</li>
   <li>Leads to code duplication and inability to reuse common code. Increases maintenance overhead.</li>
   <li>Leads to increased storage and infrastructure requirements when trying to support multiple versions</li>
</ul>