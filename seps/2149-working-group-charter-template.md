# SEP-2149: MCP Working Group Charter Template

- **Status**: Draft
- **Type**: Process
- **Created**: 2025-01-15
- **Author(s)**: David Soria Parra (@dsp-ant), Sarah Novotny (@sarahnovotny)
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/specification/pull/2149

## Abstract

This SEP establishes a standardized charter template for MCP Working Groups. The template provides a consistent structure for defining working group scope, leadership, decision-making authority, membership, operations, and lifecycle. It addresses community feedback about unclear authority delegation and inconsistent decision-making processes across working groups.

## Motivation

Community interviews and feedback identified several challenges with the current working group structure:

1. **Unclear Authority**: It's not always clear what decisions a working group can make autonomously versus what requires Core Maintainer approval. This leads to hesitation and bottlenecks.

2. **Inconsistent Decision-Making**: Different working groups operate with different norms. Decisions made in one meeting may be contradicted in another, with no clear process for resolution.

3. **Participation Confusion**: Community members are uncertain about who should participate in working groups, what levels of involvement exist, and how to become more involved.

4. **Scope Creep**: Without explicit boundaries, working groups may gradually expand into areas owned by other groups or outside their mandate.

5. **Missing Escalation Paths**: When working groups get stuck, there's no clear path to resolution, leading to prolonged disagreements or abandoned initiatives.

A standardized charter template addresses these issues by requiring each working group to explicitly define its authority, processes, and boundaries.

## Specification

### Charter Template Structure

Every MCP Working Group must maintain a charter document following this template structure. Charters are stored as MDX files in `docs/community/workinggroups/` in the modelcontextprotocol repository.

Charters are stored as MDX files in `docs/community/workinggroups/` in the modelcontextprotocol repository and added to the `docs.json` to be displayed on modelcontextprotocol.io website.

### Required Sections

#### 1. Mission Statement

A 2-3 sentence summary of the working group's purpose, articulating:

- The problem space being addressed
- Why cross-cutting collaboration is needed

_Example: "The Transport Working Group exists to evolve MCP's transport mechanisms to support diverse deployment scenarios—from local subprocess communication to horizontally-scaled cloud deployments—while maintaining protocol coherence and backward compatibility."_

#### 2. Scope

**In Scope**: Enumerated responsibilities including:

- Specification Work: Specific spec sections or SEPs owned
- Reference Implementations: SDK components or reference implementations
- Cross-Cutting Concerns: Areas requiring coordination with other groups
- Documentation: Documentation responsibilities

**Out of Scope**: Explicit statements of what is NOT within the WG's purview to prevent mission creep.

**Stakeholder Working Groups**: List of other WGs with intersecting work and nature of overlap.

#### 3. Leadership

**Working Group Leads** table with:

- Role, Name, Organization, GitHub handle, Term

**Lead Requirements:**

- Demonstrated sustained contribution to scope area
- Ability to facilitate across organizational boundaries
- Commitment to 2-3 hours/week for WG activities
- Sponsored by at least two Core Maintainers or one Lead Core Maintainer

**Lead Responsibilities:**

- Schedule and facilitate regular working group meetings
- Set agendas in collaboration with participants
- Ensure meeting notes are published within 48 hours
- Drive proposals through the [SEP](https://modelcontextprotocol.io/community/sep-guidelines) (Specification Enhancement Proposal) process to resolution
- Escalate blocked decisions to Core Maintainers with clear context
- Provide quarterly status updates to the Community and Core Maintainer Group
- Maintain the working group's documentation, roadmap and member list

#### 4. Authority & Decision Rights

_This section addresses the "unclear authority" issue identified in community interviews. Each WG should explicitly define what decisions it can make autonomously._

Each WG must explicitly define its decision authority:

| Decision Type                       | Authority Level                                         | Process                                           |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| Meeting logistics & scheduling      | WG Leads (autonomous)                                   | Leads decide                                      |
| Proposal prioritization within WG   | WG Leads (autonomous)                                   | Lazy consensus among leads                        |
| Technical design within scope       | WG consensus                                            | Discussion → lazy consensus → escalate if blocked |
| Spec changes (additive)             | WG recommends → Core Maintainer approval                | SEP process                                       |
| Spec changes (breaking/fundamental) | WG recommends → Core Maintainer approval + wider review | SEP process with extended comment period          |
| Scope expansion                     | Core Maintainer approval required                       | Charter amendment process                         |

**Escalation Path:**

1. WG Lead documents decision, options, and points of disagreement
2. WG Lead presents to Core Maintainer with clear ask
3. Core Maintainer either: (a) provides binding guidance, (b) requests more information, or (c) brings to full Core Maintainer group
4. Timeline: Escalations should receive initial response within 5 business days

#### 5. Membership

_Addressing the interview feedback that it's "not clear who should be participating in these groups"_

**Participation Levels:**

| Level           | Description                                       | Privileges                                                         |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| **Observer**    | Anyone interested in following the WG's work      | Read access, may attend meetings, limited discussion participation |
| **Participant** | Active contributor to WG discussions              | Can propose agenda items, participate in async votes               |
| **Member**      | Sustained contributor with demonstrated expertise | Can champion SEPs, counted for quorum                              |
| **Lead**        | Operational leadership of the WG                  | Sets agenda, facilitates, escalates                                |

**Becoming a Member:**

- Sustained participation over 3 months
- Meaningful contributions (code, spec text, reviews, or documentation)
- Nomination by existing Member or Lead
- No objections from Leads, Core Maintainers, or Lead Core Maintainers within 7 days

**Responsibilities:**

- Continue contributing in good faith
- Maintain name, organization and Discord name in the respective working group member list

**Active vs. Emeritus:** Members who do not participate for 3 consecutive months are moved to emeritus status and may return by demonstrating renewed participation.

#### 6. Operations

**Meetings:**

| Meeting         | Frequency       | Duration | Purpose                               |
| --------------- | --------------- | -------- | ------------------------------------- |
| Working Session | Weekly/Biweekly | 60 min   | Technical discussion, proposal review |
| Office Hours    | Monthly         | 30 min   | Open Q&A for newcomers and observers  |

**Meeting Norms:**

- Meeting published on [meet.modelcontextprotocol.io](https://meet.modelcontextprotocol.io) 7 days in advance
- Agendas published 24 hours in advance to an [issue created for the meeting](https://github.com/modelcontextprotocol/modelcontextprotocol/issues)
- Notes published within 48 hours to the same issue
- Recordings available to all participants
- Use of hand-raising protocol
- Time-boxed discussions with explicit next steps

**Communication Channels:**

| Channel            | Purpose                        | Response Expectation |
| ------------------ | ------------------------------ | -------------------- |
| Discord #name-wg   | Quick questions, coordination  | Best effort          |
| GitHub Discussions | Long-form technical discussion | Weekly triage        |

**Decision-Making:**

_Addressing interview feedback about "one maintainer says this thing, then two weeks later another maintainer says this other thing"_

**Default: Lazy Consensus**

- Proposals announced with clear deadline (3 days minimum for minor items, 7 days for significant items)
- Silence is consent
- Any Member may block with documented objection
- Blocks must propose alternatives or clear criteria for resolution

**When Voting Required:**

- Lazy consensus fails to achieve resolution
- Lead or three or more Members request formal vote
- Decision has broad impact beyond WG scope

**Voting Rules:**

- Quorum: 50% of active Members
- Passage: Simple majority for routine matters; 2/3 majority for scope changes
- Core Maintainer feedback is advisory unless explicitly stated as binding
- All votes documented with rationale

#### 7. Deliverables & Success Metrics

**Active Work Items Table:**

| Item          | Status                | Target Date | Champion |
| ------------- | --------------------- | ----------- | -------- |
| SEP-XXX: Name | Draft/Review/Approved | Date        | Name     |

**Success Criteria:** Measurable outcomes for WG success.

**Quarterly Reporting:** Working groups provide quarterly updates (end of January, April, July, October) including:

- Progress against deliverables
- Blocked items and escalations
- Membership changes
- Upcoming priorities
- Resource needs

#### 8. Lifecycle

**Formation Requirements:**

- Cross-cutting concern requiring coordination
- At least two Core Maintainers or one Lead Core Maintainer sponsor
- Initial charter approved by Core Maintainers or Lead Core Maintainers
- Initial member list approved

**Initial Membership:** Sponsoring Core Maintainers may directly appoint initial WG Leads and Members, bypassing normal nomination. Subsequent members follow standard process.

**Retirement Criteria:**

- Mission accomplished
- Unable to maintain quorum for 3+ months
- Scope absorbed into core governance or another WG

**Retirement Process:**

1. WG Lead or Core Maintainer proposes retirement with rationale
2. Core Maintainer or Lead Core Maintainer approval
3. Documentation archived, channels marked inactive

#### 9. Charter Amendments

Changes to a WG charter require:

- Proposal by WG Lead or Core Maintainer
- Approval by Core Maintainers

#### 10. Changelog

Track charter versions with date and changes.

## Rationale

### Why a Standardized Template?

Standardization:

- Ensures all WGs address critical governance questions
- Makes it easier for community members to understand any WG's operations
- Reduces overhead for forming new WGs
- Creates accountability through explicit documentation

### Why Explicit Authority Tables?

The authority table directly addresses the "unclear authority" feedback. By enumerating decision types and required approvals, WGs and community members know exactly what can be decided autonomously versus what needs escalation.

### Why Tiered Participation?

Different engagement levels serve different community needs:

- **Observers** can learn without commitment
- **Participants** can contribute without full Member responsibilities
- **Members** take on accountability and get decision rights
- **Leads** provide operational continuity

### Why Lazy Consensus as Default?

Lazy consensus:

- Enables efficient decision-making for routine matters
- Reduces meeting burden
- Documents decisions through announcement/deadline structure
- Preserves blocking rights for substantive concerns

Voting is reserved for contested or high-impact decisions.

### Model Inspiration

This template is adapted from Kubernetes governance structures and tailored for MCP's specific needs identified through community interviews.

## Backward Compatibility

This SEP establishes a template for new and existing working groups. Existing WGs should update their documentation to conform to this template within 90 days of SEP acceptance.

## Security Implications

No direct security implications. However, clear authority delegation and decision processes indirectly support security by ensuring decisions are made at appropriate levels with proper accountability.

## Reference Implementation

Upon acceptance, this SEP will be implemented by:

1. Publishing the charter template at `docs/community/workinggroups/charter-template.mdx`
2. Adding template guidance to the Working Groups section of modelcontextprotocol.io
3. Existing working groups updating their charters to conform within 90 days
4. Adding WG charter to `docs.json` for website display
