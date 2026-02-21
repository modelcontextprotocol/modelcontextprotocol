# SEP-2148: MCP Contributor Ladder

- **Status**: Draft
- **Type**: Process
- **Created**: 2025-01-15
- **Author(s)**: David Soria Parra (@dsp-ant), Sarah Novotny (@sarahnovotny)
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/specification/pull/2148

## Abstract

This SEP establishes a formal contributor ladder for the Model Context Protocol project, defining clear roles, responsibilities, and advancement criteria from first-time contributor through Core Maintainer. The ladder provides transparent pathways for community members to understand how they can grow their involvement and influence within the project.

## Motivation

As MCP adoption grows, the project needs a clear framework for:

1. **Contributor Development**: Community members lack visibility into how to grow their involvement and influence within the MCP project. A defined ladder shows the path from first contribution to project leadership.

2. **Trust Building**: Merge rights and other high-privilege responsibilities are earned through demonstrated commitment and good judgment over time. A graduated system ensures contributors are set up for success and are trusted by existing maintainers and broader community before taking on greater ownership of the project.

3. **Organizational Diversity**: With multiple organizations contributing to MCP, the project needs mechanisms to prevent organizational capture while welcoming participation from outside Anthropic.

4. **Scalability**: Core Maintainer bandwidth is limited. Delegating authority to Maintainers and Working/Interest Group Leads through clear scope definitions enables the project to scale.

5. **Recognition**: Contributors invest significant effort in MCP. Formal recognition through defined roles acknowledges their contributions and encourages sustained engagement.

Without a contributor ladder, advancement decisions become ad-hoc, potentially inconsistent, and opaque to the community.

## Specification

### Guiding Principles

The contributor ladder operates under these principles:

- **Earned Trust**: Advancement based on demonstrated meaningful contributions that align with the project goals, good judgment, and sustained engagement, not tenure alone
- **Multiple Growth Pathways**: Code, specification work, documentation, and community building all lead to advancement
- **Transparency**: Criteria for advancement are explicit and consistently applied
- **Alignment With MCP Goals**: Individual contributors must demonstrate commitment to advance and evolve MCP project components beyond one's employer's interests

### Role Definitions

| Role                     | Summary                                    | Key Privileges                                                            | Typical Timeline                                      |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Contributor**          | Anyone who contributes to MCP              | Submit issues, PRs, participate in discussions                            | Immediate                                             |
| **Member**               | Established, active contributor            | GitHub Org Membership, triage rights, WG Leadership                       | 2-3 months of meaningful contributions                |
| **Reviewer**             | Recognized for technical judgment          | Review and approve PRs in scope area                                      | 3 months as Member                                    |
| **Maintainer**           | Area owner with operational responsibility | Merge rights, release participation                                       | 6+ months as Member                                   |
| **Core Maintainer**      | Project-wide technical leadership          | Final decision authority, governance participation                        | By invitation after sustained Maintainer contribution |
| **Lead Core Maintainer** | Ultimate project authority (founders)      | All Core Maintainer privileges, veto authority, appoints Core Maintainers | Reserved for project founders, no defined timeline    |

### Contributor

Anyone who has contributed to MCP in any form is a contributor. This includes:

- Opening issues or discussions
- Submitting pull requests
- Participating in working group discussions
- Improving documentation
- Helping other community members

**No formal requirements**, we welcome all contributions.

**How to get started:**

- Review the [Contributing Guide](https://modelcontextprotocol.io/community/contributing)
- Join community channels (Discord, GitHub Discussions)
- Look for issues tagged `good-first-issue` or `help-wanted`
- Attend working group meetings

### Member

Members are established contributors who have demonstrated ongoing commitment to the success and growth of MCP.

**Requirements:**

- Multiple contributions to MCP (code, documentation, and/or community)
- At least one merged PR or accepted contribution
- Ongoing engagement with the MCP community and not just one-off contributions
- Enabled two-factor authentication on GitHub
- No objections from existing Members within 7 days

**Sponsorship:**

- Sponsored by two existing Members, Reviewers, or Maintainers from different organizations
- or sponsored by one Core Maintainer or Lead Core Maintainer

**Minimum timeline:** Typically 2-3 months of active participation

**Responsibilities:**

- Continue contributing in good faith
- Be responsive to assigned issues and PRs
- Follow community guidelines and code of conduct
- Help onboard new contributors when possible

**Privileges:**

- Can be assigned to issues and PRs
- Can use shortcut approval or review commands on PRs, such as `/lgtm`
- Listed in community membership roster
- Can participate in lazy consensus decisions

**Inactivity:** Members with no contributions for 3 months may be moved to emeritus status. Re-engagement follows a simplified re-familiarization process.

### Reviewer

Reviewers have demonstrated technical competence and good judgment in a specific scope area.

**Requirements:**

- Member for at least 3 months
- Primary reviewer for at least 5 substantial PRs in scope area
- Reviewed at least 15 PRs total in scope area
- Demonstrates knowledge of code quality, testing standards, and design patterns
- Demonstrated good judgment and constructive feedback in reviews

**Sponsorship:**

- Sponsored by an existing Maintainer in the scope area
- or sponsored by a Core Maintainer or Lead Core Maintainer

**Responsibilities:**

- Provide timely, constructive reviews when requested
- Focus on code quality, correctness, testing, and style
- Help contributors improve their submissions
- Escalate concerns about design or architecture to Maintainers
- Be responsive within community SLO (typically 48-72 hours for initial response)

**Privileges:**

- Listed in `REVIEWERS.md` for scope area
- Officially requested for reviews via automation
- Input weighted more heavily in discussions
- Can block PRs with substantive concerns

**Inactivity:** Reviewers with no contributions for 3 months may be moved to emeritus status. Re-engagement follows a simplified re-familiarization process.

All pathways can lead to Reviewer, though the specific scope will align with the contribution type.

### Maintainer

Maintainers are trusted stewards who take operational responsibility for specific areas.

**Requirements:**

- Member for at least 6 months with sustained, high-quality contributions
- Demonstrated leadership in working groups or significant initiatives
- Shown ability to represent MCP's interests above an individual employer's or organization's interests
- Deep understanding of the MCP vision, roadmap, and design principles
- Completed security and governance onboarding

**Sponsorship & Approval:**

- Sponsored by an existing Maintainer or Core Maintainer
- Approved by Core Maintainers

**Responsibilities:**

- Operational ownership of area health (test stability, documentation currency)
- Responsible for the release processes and milestone planning of their respective scope
- Provide timely review of escalated decisions
- Active participation in governance discussions
- Mentor Reviewers and develop future Maintainers
- Represent MCP in external contexts when appropriate
- Active participation in discussions on communication channels (GitHub issues, Discord)

**Privileges:**

- Merge privileges for owned areas
- Can sponsor Reviewers and Maintainers
- Participate in roadmap and prioritization discussions
- Listed in `MAINTAINERS.md`

All pathways can lead to Maintainer, though the specific scope will align with the contribution type.

### Core Maintainer

Core Maintainers hold final decision-making authority for the MCP technical direction. This is the highest level of trust in the community.

_Note: The Core Maintainer role is intentionally limited to ensure coherent technical vision while the project scales. Core Maintainer bandwidth concerns are addressed through clearer delegation to Maintainers and Working Group Leads, not expansion of Core Maintainer numbers._

**Requirements:**

- Sustained contribution as Maintainer or similar roles over at least 6 months
- Demonstrated judgment on complex, project-wide decisions
- Trust and respect across organizational boundaries
- Deep commitment to MCP's long-term success

**Appointment:**

- Nominated by majority of Core Maintainers, approved by Lead Core Maintainers
- Or direct appointment by Lead Core Maintainers

When evaluating candidates, Core Maintainers should consider whether the current composition adequately represents the breadth of the MCP ecosystem, including enterprise adopters deploying MCP in production domains.

**Responsibilities:**

- Final technical decision authority for contested or cross-cutting issues
- Stewardship of project vision and design principles
- Governance and policy decisions
- External representation of MCP
- Succession planning and community health
- Participation in Core Maintainer meetings and Core Maintainer meetups

**Privileges:**

- Final approval on breaking changes and major spec revisions
- Voting rights on [SEPs](https://modelcontextprotocol.io/community/sep-guidelines) (Specification Enhancement Proposals)
- Approval of Maintainers
- Governance voting rights / expectation of governance participation
- Administrative rights to all MCP GitHub repositories
- Listed in MAINTAINERS.md as Core Maintainer

### Lead Core Maintainer

Lead Core Maintainers hold ultimate authority over MCP's direction and governance. This is a lifetime appointment reserved for project founders. There is no defined advancement path to this role; it is only assumed through succession when necessary (see [Succession](#succession)).

**Current Lead Core Maintainer:** David Soria Parra

**Responsibilities:**

- All Core Maintainer responsibilities
- Appointment and removal of Core Maintainers
- Final authority on contested governance decisions
- Project-wide strategic direction

**Privileges:**

- Can act alone where Core Maintainers require multiple approvals
- Veto authority over any decision
- Appointment of successor

### Succession

If a Lead Maintainer leaves their role for any reason, the succession process begins upon their written notice or, if unable to provide notice, upon a determination by the remaining Lead Maintainer(s) or Core Maintainers that the Lead Maintainer is unable to continue serving.

If one or more Lead Maintainer(s) remain, they shall appoint a successor (by majority vote if multiple), and the remaining Lead Maintainer(s) will continue to govern until a successor is appointed.

If no Lead Maintainers remain, the Core Maintainers shall appoint a successor by majority vote within 30 days, and the project operates by two-thirds vote of Core Maintainers until a new Lead Maintainer is appointed.

### Advancement Process

#### Self-Nomination vs. Recognition

Contributors may either:

1. **Self-nominate** when they believe they meet the requirements
2. **Be nominated** by a sponsor who has observed their contributions

Both paths are equally valid. Self-nomination is encouraged and preferred, as it demonstrates initiative and self-awareness of the contribution scope.

#### Process Steps

1. **Nomination**: Nominee or sponsor opens an issue using the nomination template, including links to contributions demonstrating requirements and sponsor confirmations
2. **Community Review**: 7-day period for community input
3. **Decision**: Approving authority reviews and decides
4. **Onboarding**: New role-holder receives appropriate access and onboarding

| Advancement To  | Approved By                                             |
| --------------- | ------------------------------------------------------- |
| Member          | 2 existing Members+ from different organizations        |
| Reviewer        | 1 Maintainer in scope area                              |
| Maintainer      | 1 Maintainer or Core Maintainer sponsor + Core approval |
| Core Maintainer | Lead Core Maintainers                                   |

Self-nomination is encouraged, but nominees must still secure the required sponsorship. Sponsors confirm support in the nomination issue.

### Decision-Making & Escalation

#### Delegation as Default

MCP operates on a principle of delegation: decisions should be made at the lowest appropriate level. This enables the project to move quickly while preserving Core Maintainer bandwidth for cross-cutting concerns.

- **Maintainers and WG Leads** handle day-to-day decisions within scope
- **Core Maintainers** intervene on escalation, cross-cutting issues, or when required (spec changes, Maintainer approval)
- **Lead Core Maintainer** intervenes only on contested governance decisions or when Core Maintainers cannot reach consensus

When in doubt, make the decision at your level and document it. Escalate only when blocked, when the decision has project-wide implications, or when explicitly required by process.

#### Escalation Matrix

| Issue Type                            | First Escalation     | Second Escalation    | Timeline         |
| ------------------------------------- | -------------------- | -------------------- | ---------------- |
| Technical disagreement in PR          | Maintainer in scope  | Core Maintainer      | 5 business days  |
| Technical disagreement in WG          | WG Lead              | Core Maintainer      | 5 business days  |
| Disagreement with WG Lead decision    | Core Maintainer      | Lead Core Maintainer | 7 business days  |
| Disagreement with Maintainer decision | Core Maintainer      | Lead Core Maintainer | 7 business days  |
| Core Maintainer disagreement          | Lead Core Maintainer | N/A                  | 10 business days |
| Code of Conduct violation             | Core Maintainer      | Lead Core Maintainer | Immediate        |
| Security issue                        | Core Maintainer      | Lead Core Maintainer | Immediate        |

**Escalation process:**

1. Document the decision, options considered, and points of disagreement
2. Present to the escalation authority with a clear ask
3. Escalation authority either: (a) provides binding guidance, (b) requests more information, or (c) escalates further if needed

### Contribution Pathways

MCP values diverse contributions. Here are recognized pathways to advancement:

#### Code Contributions

- SDK development (TypeScript, Python, etc.)
- Testing infrastructure
- Tooling and developer experience

#### Specification Work

- Drafting or refining spec text
- [SEP](https://modelcontextprotocol.io/community/sep-guidelines) authorship or co-authorship
- Protocol design participation
- Compatibility analysis

#### Documentation

- User guides and tutorials
- API documentation
- Architecture documentation
- Maintaining content currency

#### Community Building

- Onboarding new contributors
- Working group facilitation
- Community support (Discord, GitHub discussions)
- Event organization or representation

#### Quality & Security

- Bug triage and reproduction
- Security review and analysis
- Test coverage improvement
- Release validation

### Working Group and Interest Group Leadership

Working Group (WG) and Interest Group (IG) Leads are a special form of community leadership that doesn't require Maintainer status. WG/IG Leadership focuses on facilitation and coordination rather than merge authority.

**Requirements:**

- Member status minimum (Reviewer preferred)
- Demonstrated sustained engagement with the WG/IG's scope
- Good facilitation and communication skills
- Ability to represent multiple perspectives fairly
- Working Group/Interest Group and its Lead are sponsored by at least two Core Maintainers or one Lead Core Maintainer

**Relationship to Contributor Ladder:**

- WG Lead experience is valuable for advancement to Maintainer
- WG Leads without Maintainer status work with Maintainers for merge decisions
- WG Leads have authority over WG operations but not spec approval

### Recognition and Visibility

The community recognizes contributors through:

- **Contributor lists** such as `REVIEWERS.md` and `MAINTAINERS.md`
- **GitHub teams** for appropriate access
- **Public acknowledgment** in release notes
- **Speaking opportunities** at community events
- **Badges** (if implemented) on community platforms

### Stepping Down and Emeritus Status

Contributors may step down from roles for any reason. This is normal and healthy.

**Process:**

1. Notify relevant leadership (WG Lead, Maintainer, or Core Maintainer)
2. Help transition any ongoing work
3. Move to emeritus status

**Emeritus:**

- Recognized for past contributions
- May return to active status with abbreviated re-onboarding
- No ongoing responsibilities or privileges

**Involuntary Removal:** In cases of code of conduct violations or sustained non-participation, roles may be revoked following appropriate review processes.

## Rationale

### Why a Formal Ladder?

Informal advancement creates inconsistency and opacity. A formal ladder:

- Sets clear expectations for all parties
- Provides a common vocabulary for discussing advancement
- Creates accountability in advancement decisions
- Enables self-nomination, reducing gatekeeping

### Why Timeline Guidelines?

Timelines exist for security and trust-building:

- Trust is built through demonstrated behavior over time
- Security risks increase with rapid privilege escalation
- Deep project understanding requires sustained engagement
- Behavior patterns only become visible over longer periods

Exceptions require explicit Core Maintainer approval with documented rationale.

### Why Two-Organization Sponsorship?

Requiring sponsors from different organizations:

- Prevents organizational capture of the contributor base
- Ensures contributors are recognized beyond their employer
- Maintains diverse perspectives in advancement decisions

### Model Inspiration

This ladder is modeled on Kubernetes community membership structures and adapted for MCP's needs and stage of development.

## Backward Compatibility

This SEP establishes new processes without modifying existing structures. Current contributors retain their existing access and standing.

## Security Implications

This SEP directly addresses security through:

- Graduated privilege escalation with timeline requirements
- Two-factor authentication requirement for Members
- Multi-organization sponsorship to prevent capture
- Security onboarding requirement for Maintainers

## Reference Implementation

Upon acceptance, this SEP will be implemented by:

1. Adding the contributor ladder to `docs/community/contributor-ladder.mdx`
2. Creating nomination issue templates in `.github/ISSUE_TEMPLATE/` (see Appendix for checklist templates)
3. Creating `REVIEWERS.md` template for scope areas
4. Updating `MAINTAINERS.md` format to reflect role distinctions

## Appendix: Checklist Templates

### Member Nomination Checklist

```
**Nominee:** [GitHub handle]
**Sponsors:** [GitHub handles]
  - **Organizations represented:** [Must be 2+ different orgs among sponsors]

**Contributions:**
- [ ] Link to merged PR(s)
- [ ] Link to issues filed/triaged
- [ ] Link to discussions participated in
- [ ] Duration of participation: [X months]

**Sponsor Attestations:**
Sponsors confirm
- [ ] Sponsors confirm nominee demonstrates community values
- [ ] Sponsors confirm nominee demonstrates sustained engagement
```

### Reviewer Nomination Checklist

```
**Nominee:** [GitHub handle]
**Scope:** [Specific area]
**Sponsor:** [GitHub handle, must be Maintainer in scope]

**Requirements:**
- [ ] Member for 3+ months
- [ ] Links to 5+ PRs reviewed as primary reviewer
- [ ] Links to 15+ total PR reviews in scope
- [ ] Evidence of constructive feedback
```
