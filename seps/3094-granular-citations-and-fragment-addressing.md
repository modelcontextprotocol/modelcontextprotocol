# SEP-3094: Granular citations format

- **Status**: Draft
- **Type**: Standards Track
- **Created**: 2026-07-15
- **Author(s)**: Karthik Palaniappan (karthik.palaniappan@thomsonreuters.com) (@karth295)
- **Sponsor**: None
- **PR**: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3094

## 2. Abstract

Many popular MCP clients (e.g. ChatGPT, Copilot) have **bespoke** formats for MCP servers to return rich citations.
Other popular MCP clients (e.g. Claude) **only** render citation chips from first-party features such as public web
search, making responses from MCP servers appear less trustworthy. Citations are an important mechanism for
professionals and academic researchers to verify the accuracy of LLM-generated responses.

This SEP proposes **standardizing** a mechanism for MCP servers and clients to exchange **granular, verifiable
citations** to resources or portions of resources — sentences, HTML elements, image regions, table rows. It reuses
existing MCP and web standards for selectors and fragments, such as [MCP resource
URIs](https://modelcontextprotocol.io/specification/2025-06-18/server/resources#resource), a subset of the [W3C Web
Annotation Data Model](https://www.w3.org/TR/annotation-model/), and [schema.org
citations](https://schema.org/citation). It explicitly tries to avoid creating bespoke formats that have not gone
through rigorous review and real world usage.

## 3. Motivation

### Building trust through verifiable responses

Professionals such as lawyers, auditors, and academic researchers are legally and ethically bound to produce work
grounded in hard evidence. As AI models have become more capable and MCP servers/tools have become more agentic,
professional work has been moving towards steering and reviewing AI outputs.

However, when professionals do not catch hallucinations, the consequences can be severe. The US court of appeals for the
sixth circuit fined lawyers $30,000 for
[misrepresentations](https://www.reuters.com/legal/litigation/us-appeals-court-fines-lawyers-30000-latest-ai-related-sanction-2026-03-16/).
Damien Charlotin's [database](https://www.damiencharlotin.com/hallucinations/) underscores the depth of the problem with
nearly 1200 hallucinated cases cited before July 2026.

Citations have been an integral part of the end-user experience of using LLM-based systems even as early as
[2022](https://arxiv.org/pdf/2203.11147). **However, how citations are exchanged and presented is bespoke to tools and
clients.**

This proposal does not discuss methods to reduce hallucinations; it instead proposes **formalizing commonly used
patterns for servers and clients to present avenues for professionals to verify AI outputs for accuracy and
completeness.**

### Varied MCP client support for exchanging citations

Here is a quick summary of support for citations among a few popular MCP clients in July 2026. Even among clients that
support citations, the expected format varies.

| MCP host              | Primary product(s)                                                                                                                                                                                          | Citation chips | Clickable links | Notes                                                                                                                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic Claude**  | [Claude Desktop](https://code.claude.com/docs/en/desktop), [claude.ai](https://claude.ai)                                                                                                                   | No             | No              | Only plain markdown links are supported. MCP embedded resources are [not shown to the user](https://github.com/anthropics/claude-ai-mcp/issues/287). First party [web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) chips cannot be driven by MCP servers. |
| **OpenAI ChatGPT**    | [ChatGPT Connectors / Apps](https://developers.openai.com/api/docs/mcp), [Responses API remote MCP](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)                                     | Yes            | Yes             | Specifically `[search` and `fetch](https://developers.openai.com/api/docs/mcp)` tools that return a non-empty `url` field get [inline citation chips](https://developers.openai.com/api/docs/mcp) linking to that URL.                                                                              |
| **Microsoft Copilot** | [Microsoft 365 Copilot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview) (declarative agents), [Copilot Studio](https://learn.microsoft.com/en-us/microsoft-copilot-studio/) | Yes            | Yes             | Firm-admin approved [Plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-citations) can return [citations](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-citations) via a JSON format                                              |

Some MCP clients do not have any mechanisms for servers to push down citations to be rendered as citation chips. This
makes MCP-based tools appear less trustworthy than first party tools, even though their responses may be more grounded
in authoritative data.

Note that [MCP apps](https://modelcontextprotocol.io/extensions/apps/overview) can be used to render citations. However,
this is unnecessarily heavyweight for MCP servers to implement for documents that are already addressible via URI.

### Examples of bespoke citation formats returned by popular RAG and Agent APIs

Server-returned citations also vary widely, even within the same server provider.

| Provider       | Tool                                        | Example response                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anthropic      | `web_search`                                | `json { "text": "Claude Shannon was born on April 30, 1916, in Petoskey, Michigan", "type": "text", "citations": [ { "type": "web_search_result_location", "url": "https://en.wikipedia.org/wiki/Claude_Shannon", "title": "Claude Shannon - Wikipedia", "encrypted_index": "Eo8BCioIAhgBIiQyYjQ0OWJmZi1lNm..", "cited_text": "Claude Elwood Shannon (April 30, 1916 – February 24, 2001)..." } ] }`                                                                                                                                                               |
| Anthropic      | `web_fetch`                                 | `json { "text": "the main argument presented is that artificial intelligence will transform healthcare", "type": "text", "citations": [ { "type": "char_location", "document_index": 0, "document_title": "Article Title", "start_char_index": 1234, "end_char_index": 1456, "cited_text": "Artificial intelligence is poised to revolutionize healthcare delivery..." } ] }`                                                                                                                                                                                      |
| OpenAI         | `web_search` (`url_citation`)               | `json { "type": "output_text", "text": "On March 6, 2025, several news outlets reported...", "annotations": [ { "type": "url_citation", "start_index": 2606, "end_index": 2758, "url": "https://example.com/article", "title": "Example Article" } ] }`                                                                                                                                                                                                                                                                                                            |
| OpenAI         | `file_citation` / `container_file_citation` | `json { "type": "output_text", "text": "Per the uploaded report, revenue increased 12% year-over-year.", "annotations": [ { "type": "file_citation", "file_id": "file-abc123", "filename": "q3-earnings.pdf", "index": 0 } ] }`                                                                                                                                                                                                                                                                                                                                    |
| Perplexity     | Sonar                                       | `json { "choices": [ { "message": { "role": "assistant", "content": "Apple reported Q2 revenue of $95.4 billion [1], driven by Services growth [2]." } } ], "citations": [ "https://www.apple.com/newsroom/pdfs/fy2025-q2/FY25_Q2_Consolidated_Financial_Statements.pdf" ], "search_results": [ { "title": "[PDF] Consolidated Financial Statements - Apple", "url": "https://www.apple.com/newsroom/pdfs/fy2025-q2/FY25_Q2_Consolidated_Financial_Statements.pdf", "date": "2025-05-01", "snippet": "Net sales by reportable segment: Americas $40,315..." } ] }` |
| Perplexity     | Agent API                                   | `json { "type": "output_text", "text": "Spain won Euro 2024, defeating England 2-1 in the final [1].", "annotations": [ { "type": "url_citation", "start_index": 0, "end_index": 52, "url": "https://en.wikipedia.org/wiki/UEFA_Euro_2024_final", "title": "UEFA Euro 2024 final" } ] }`                                                                                                                                                                                                                                                                           |
| Amazon Bedrock | `InvokeAgent`                               | `json { "completion": "The refund policy allows returns within 30 days of purchase.", "citations": [ { "generatedResponsePart": { "textResponsePart": { "text": "returns within 30 days of purchase", "span": { "start": 32, "end": 66 } } }, "retrievedReferences": [ { "content": { "type": "TEXT", "text": "Customers may return items within 30 days..." }, "location": { "s3Location": { "uri": "s3://my-bucket/policies/refund.pdf" } } } ] } ] }`                                                                                                           |
| Amazon Bedrock | `RetrieveAndGenerate` / Knowledge Bases     | `json { "output": { "text": "The refund policy allows returns within 30 days of purchase." }, "citations": [ { "generatedResponsePart": { "textResponsePart": { "text": "returns within 30 days of purchase", "span": { "start": 32, "end": 66 } } }, "retrievedReferences": [ { "content": { "type": "TEXT", "text": "Customers may return items within 30 days..." }, "location": { "s3Location": { "uri": "s3://my-bucket/policies/refund.pdf" } }, "metadata": { "x-amz-bedrock-kb-chunk-id": "abc123" } } ] } ] }`                                            |
| Azure          | Responses API + Bing (`url_citation`)       | `json { "type": "output_text", "text": "If you're searching for uplifting news from November 2025...", "annotations": [ { "type": "url_citation", "start_index": 333, "end_index": 564, "url": "https://example.com/article", "title": "Example Article" } ] }`                                                                                                                                                                                                                                                                                                    |
| Azure          | On Your Data (Azure AI Search)              | `json { "role": "assistant", "content": "Contoso's Q3 revenue grew 12% year-over-year [doc1].", "context": { "citations": [ { "content": "Q3 revenue was $4.2B, up 12% YoY...", "title": "Q3 Earnings Summary", "filepath": "reports/q3-2025.pdf", "url": "https://contoso.sharepoint.com/...", "chunk_id": "chunk-42" } ] } }`                                                                                                                                                                                                                                    |

### Other examples of proposals to formalize citations

Agent Stack (formerly BeeAI) has an [extension](https://github.com/a2aproject/A2A/issues/981) to the A2A protocol for
citations, further highlighting the desire for standardization.

It uses this simple format:

```
    start_index: int | None = None
    end_index: int | None = None
    url: str | None = None
    title: str | None = None
    description: str | None = None
```

## 4. Specification

Tool results MAY include a `citations` field at the top level of the tool result, with references in the `content`
field. Citation objects MUST conform to the MCP citation JSON-LD schema (or a derivative schema). If `@context` is not
specified and the response includes `citations` clients MUST assume the format is `citations.jsonld`.

```json
{
  "content": [ ... ],
  "citations": [
    {
      "id": "c1",
      "@context": "https://modelcontextprotocol.io/ns/citations.jsonld",
      ...
    }
  ]
}
```

Note that structuredContent MAY contain citations in this format, but this spec does not explicitly mandate that clients
understand or respect the citations returned.

### Binding citations to content

Any `Content` block MAY contain a list of strings `citationRefs`, which references entries in the top-level `citations`
array by `id`.

```typescript
interface Content {
  type: string;
  citationRefs?: Array<string>;
}
```

Every entry in `citationsRef` MUST match the `id` of an entry in the result-level `citations[]` array. References MAY be
many-to-many: a block can list several citations, and a citation can be referenced by several blocks.

```json
{
  "content": [
    { "type": "text", "text": "Photosynthesis converts light energy into chemical energy.", "citationRefs": ["c1"] },
    { "type": "text", "text": "It is responsible for most of the oxygen in Earth's atmosphere.", "citationRefs": ["c2"] }
  ],
  "citations": [
    {
      "id": "c1",
      ...
    },
    {
      "id": "c2",
      ...
    }
  ]
}
```

Servers MAY return a list of `citations` without explicit entries in `citationRefs`. The citations are understood to
apply to the returned content block(s) as a whole.

```json
{
  "content": [
    {
      "type": "text",
      "text": "Photosynthesis converts light energy into chemical energy."
    }
  ],
  "citations": [
    {
      "id": "c1",
      ...
    }
  ]
}
```

### Client rendering

When tool results contain citations, clients SHOULD attempt to surface citations to the user. This SEP does not mandate
a format for rendering citations, but a common method for graphical clients is to show citation chips with rich
hovercards (title, thumbnail from `target.schema:citation`), with clickable links to the cited work. Clients SHOULD
prefer `target.schema:citation.schema:url` when present (the cited work as a whole); otherwise they MAY fall back to
`target.source`. Clients MAY use `target.source` instead when opening a deep link to the specific span (URL fragment or
selector) the citation supports.

Clients MAY synthesize content returned in tool calls, but SHOULD still preserve citations in their synthesis as
relevant.

Note: clients may organically create citations that better reflect their synthesis. This SEP does not discuss a format
by which servers and clients can exchange capabilities on selectors. That will be a separate SEP.

#### Citation open behavior (embedded vs external)

Servers MAY return a hint in the `display` field suggesting the client display citations in a sandboxed in-app webview
or to open an external browser.

Clients with the appropriate capabilities MAY honor this hint, but are not required to do so.

Opening citations within a web view allows supporting richer rendering of authoritative documents (e.g. spreadsheets),
without needing to implement an MCP app.

### MCP Citation JSON-LD schema (extension of Web Annotations)

MCP citations are JSON-LD objects that extend the [W3C Web Annotation Data
Model](https://www.w3.org/TR/annotation-model/). The WADM vocabulary already models what MCP needs: citations are an
Annotation which links a **body** (a portion of a tool result) to a granular **target** (e.g. a sentence in a document).
See the Rationale section for alternatives considered.

The MCP citation schema layers a few extensions on top of the base W3C Web Annotation Data Model:

1. The target also contains a `schema:citation` node (schema.org) carrying descriptive metadata for rich hovercards
   (url, title, thumbnail, author, publisher). 2. A copy of MCP resources' `mcp:annotations` field to hint to clients
   whether to render a citation or simply use it as context for further investigation. Note that this field should not
   be confused with WADM's Annotation type. 3. A `display` hint for whether to open a citation in an embedded webview or
   an external browser.

The JSON-LD context is canonically published at `https://modelcontextprotocol.io/ns/citations.jsonld` and referenced by
the `@context` in examples. It is reproduced here so this SEP remains self-contained:

```json
{
  "@context": [
    "http://www.w3.org/ns/anno.jsonld",
    {
      "@version": 1.1,

      "mcp": "https://modelcontextprotocol.io/ns#",
      "schema": "http://schema.org/",
      "dcterms": "http://purl.org/dc/terms/",
      "xsd": "http://www.w3.org/2001/XMLSchema#",

      "Citation": { "@id": "mcp:Citation" },

      "display": { "@id": "mcp:display" },

      "target": {
        "@context": {
          "schema:citation": { "@id": "schema:citation" }
        }
      },

      "mcp:annotations": {
        "@id": "mcp:annotations",
        "@context": {
          "audience": { "@id": "mcp:audience", "@container": "@set" },
          "priority": { "@id": "mcp:priority", "@type": "xsd:decimal" },
          "lastModified": { "@id": "dcterms:modified", "@type": "xsd:dateTime" }
        }
      }
    }
  ]
}
```

Here is a clearer Typescript schema, with examples and discussion below. Note that not all required Web Annotation Data
Model fields are required in MCP citations. Notably, `type: Annotation` and `motivation: describing` are typically
implied and can be omitted in MCP citations.

```typescript
// Note that
interface TextPositionSelector {
  type?: "TextPositionSelector";
  start: number;
  end: number;
}

interface Citation {
  id: string;  // stable IRI

  // What is the exact text or element that supports the claim, for textual tool results?
  // If omitted, implies that the citation applies to the entire tool result (including non-textual content).
  body?: TextPositionSelector;

  // Where can the user verify this information — the cited resource and the span(s) within it (pure Web Annotation)
  target: {
    type?: "SpecificResource";
    source: string;                    // version-pinned URI (MAY carry the span as a fragment, e.g. #:~:text=)
    selector?: Selector | Selector[];  // structured alternative when the span isn't a URL fragment

    // Descriptive metadata for the cited work. Instance of schema.org CreativeWork.
    "schema:citation"?: {
      "@type"?: string;               // e.g. "schema:ScholarlyArticle", "schema:WebPage"
      "schema:url"?: string;          // URL of the cited work as a whole (without span fragments)
      "schema:name"?: string;         // hovercard title
      "schema:thumbnailUrl"?: string; // hovercard image
      "schema:datePublished"?: string;
      "schema:author"?: SchemaAgent | SchemaAgent[];
      "schema:publisher"?: SchemaAgent;
      "schema:sha256"?: string;       // content hash of the cited work (see Security)
      ...
    };
  };

  // Open-behavior hint; advisory (default "auto")
  display?: "embedded" | "external" | "auto";

  // MCP client context hints (mcp:annotations)
  "mcp:annotations"?: {
    audience?: ("user" | "assistant")[];
    priority?: number;
    lastModified?: string;
  };
}

interface SchemaAgent {
  "@type"?: "schema:Person" | "schema:Organization";
  "schema:name"?: string;
}

// Selectors reuse the W3C Web Annotation Data Model:
// https://www.w3.org/TR/annotation-model/#selectors
type Selector =
  | TextQuoteSelector
  | FragmentSelector   // Text Fragments, Media Fragments, PDF fragments (via conformsTo)
  | CssSelector
  | XPathSelector;
```

While the Typescript interface only includes portions of the WADM spec that will likely be used in early MCP citations,
this proposal does not limit servers or clients from using more WADM features such as audience or multiple bodies or
targets. See the open questions section for more discussion.

#### Target source (granular, verifiable information)

Only source URL is required for a citation.

| Field           | Requirement                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| `target.source` | URI of the cited resource. **SHOULD** pin version for mutable sources (see below). |

Here is a minimalist citation to a source URL. The citation is implied to apply to the entire tool result.

```json
{
  "content": [
    {
      "type": "text",
      "text": "Photosynthesis converts light energy into chemical energy."
    }
  ],
  "citations": [
    {
      "id": "c1",
      "target": {
        "source": "https://en.wikipedia.org/wiki/Photosynthesis?oldid=1234567890#:~:text=converts%20light%20energy%20into%20chemical%20energy"
      }
    }
  ]
}
```

#### The body references a portion of the tool result

| Field  | Requirement                                                                                |
| ------ | ------------------------------------------------------------------------------------------ |
| `body` | Optional `TextPositionSelector` span within the tool result content the citation supports. |

When including a body, servers MUST use `citationRefs` to disambiguate which text block the `start`/`end` markers are
referring to.

```json
{
  "content": [
    {
      "type": "text",
      "text": "Photosynthesis "
    },
    {
      "type": "image",
      ...
    },
    {
      "type": "text",
      "text": "converts light energy into chemical energy.",
      "citationRefs": ["c1"]
    }
  ],
  "citations": [
    {
      "id": "c1",
      "body": {
        "type": "TextPositionSelector",
        "start": 0,
        "end": 43
      },
      "target": {
        "source": "https://en.wikipedia.org/wiki/Photosynthesis?oldid=1234567890#:~:text=converts%20light%20energy%20into%20chemical%20energy"
      }
    }
  ]
}
```

#### Schema.org citation (description of target resource as a whole)

| Field                    | Requirement                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `target.schema:citation` | Optional descriptive metadata for the cited work (url, title, thumbnail, author, publisher, hash). |

While `target.selector` references the granular information in the citation, servers MAY include a `schema.org` citation
to provide information about the wider context of the target. This is often used to render a hovercard to the user, as
well as provide a mechanism for the client to verify integrity of the target (`schema:sha256`).

`target.source` and `target.schema:citation.schema:url` serve different roles:

- **`target.source`** identifies the cited resource and MAY include span-specific fragments or accompany a
  `target.selector`. Clients use it to resolve, re-verify, or deep-link to the exact passage. -
  **`target.schema:citation.schema:url`** identifies the cited **work as a whole**, without span fragments. When
  present, it SHOULD refer to the same revision as the non-fragment portion of `target.source`. Clients SHOULD use it
  for click-through to the work, hovercard links, and whole-work integrity checks (`schema:sha256`).

When both are present, servers SHOULD keep them consistent: `schema:url` is the canonical base URL of the cited work;
`target.source` is that URL plus optional span addressing.

### Examples

Here is a complete example of a single citation:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Data center site selection increasingly optimizes for regional grid carbon intensity.",
      "citationRefs": ["c1"]
    }
  ],
  "citations": [
    {
      "id": "c1",
      "body": {
        "type": "TextPositionSelector",
        "start": 54,
        "end": 84
      },
      "target": {
        "type": "SpecificResource",
        "source": "https://example.org/papers/dc-spatial-analytics?v=2#:~:text=regional%20grid%20carbon%20intensity",
        "selector": {
          "type": "TextQuoteSelector",
          "exact": "regional grid carbon intensity",
          "prefix": "Operators now weight ",
          "suffix": " alongside latency"
        },
        "schema:citation": {
          "@type": "schema:ScholarlyArticle",
          "schema:url": "https://example.org/papers/dc-spatial-analytics?v=2",
          "schema:name": "Data Center Spatial Analytics",
          "schema:datePublished": "2024-11-12",
          "schema:thumbnailUrl": "https://example.org/papers/dc-spatial-analytics/thumb.png",
          "schema:author": {
            "@type": "schema:Person",
            "schema:name": "Dr. Helena Vance"
          },
          "schema:publisher": {
            "@type": "schema:Organization",
            "schema:name": "Architecture Corp Publishing"
          },
          "schema:sha256": "198cc3464c539b17dc57163f8bbc780cb192acd72630a2aeb6e07380d103e6eb"
        }
      },
      "display": "embedded",
      "mcp:annotations": { "audience": ["user"], "priority": 0.9 }
    }
  ]
}
```

The `schema:sha256` value in this example is illustrative only; it is not the hash of the example URL or document.

#### Multiple citations

```json
{
  "content": [
    {
      "type": "text",
      "text": "Photosynthesis converts light energy into chemical energy and is responsible for most of the oxygen in Earth's atmosphere.",
      "citationRefs": ["c1", "c2"]
    }
  ],
  "citations": [
    {
      "id": "c1",
      "body": {
        "type": "TextPositionSelector",
        "start": 15,
        "end": 57
      },
      "target": {
        "source": "https://en.wikipedia.org/wiki/Photosynthesis?oldid=1234567890#:~:text=converts%20light%20energy%20into%20chemical%20energy",
        "schema:citation": {
          "@type": "schema:WebPage",
          "schema:url": "https://en.wikipedia.org/wiki/Photosynthesis?oldid=1234567890",
          "schema:name": "Photosynthesis - Wikipedia"
        }
      }
    },
    {
      "id": "c2",
      "body": {
        "type": "TextPositionSelector",
        "start": 81,
        "end": 121
      },
      "target": {
        "source": "https://en.wikipedia.org/wiki/Photosynthesis?oldid=1234567890#:~:text=most%20of%20the%20oxygen%20in%20Earth's%20atmosphere",
        "schema:citation": {
          "@type": "schema:WebPage",
          "schema:url": "https://en.wikipedia.org/wiki/Photosynthesis?oldid=1234567890",
          "schema:name": "Photosynthesis - Wikipedia"
        }
      }
    }
  ]
}
```

#### Citing sub-regions of images and PDFs

Image and PDF regions use a `FragmentSelector` carrying a [Media Fragment](https://www.w3.org/TR/media-frags/)
(`#xywh=`) for images or a [PDF fragment](https://www.rfc-editor.org/rfc/rfc8118) (`#page=`, `viewrect`) for PDFs — the
same fragment syntax browsers and PDF viewers already understand.

A rectangular region of a Wikipedia image (percent units are resolution-independent):

```json
{
  "content": [
    {
      "type": "text",
      "text": "The overview diagram shows the light-dependent reactions.",
      "citationRefs": ["c1"]
    }
  ],
  "citations": [
    {
      "id": "c1",
      "target": {
        "source": "https://upload.wikimedia.org/wikipedia/commons/2/28/Photosynthesis_en.svg#xywh=percent:0,0,50,40",
        "selector": {
          "type": "FragmentSelector",
          "value": "xywh=percent:0,0,50,40",
          "conformsTo": "http://www.w3.org/TR/media-frags/"
        },
        "schema:citation": {
          "@type": "schema:ImageObject",
          "schema:url": "https://upload.wikimedia.org/wikipedia/commons/2/28/Photosynthesis_en.svg",
          "schema:name": "Photosynthesis (diagram) — Wikimedia Commons",
          "schema:thumbnailUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Photosynthesis_en.svg/320px-Photosynthesis_en.svg.png"
        }
      }
    }
  ]
}
```

A region on page 5 of a PDF (`viewrect` is x,y,width,height in default user-space units):

```json
{
  "content": [
    {
      "type": "text",
      "text": "Table 2 summarizes reported oxygen yields by wavelength.",
      "citationRefs": ["c1"]
    }
  ],
  "citations": [
    {
      "id": "c1",
      "target": {
        "source": "https://upload.wikimedia.org/wikipedia/commons/4/4a/Photosynthesis_review.pdf#page=5&viewrect=100,200,300,150",
        "selector": {
          "type": "FragmentSelector",
          "value": "page=5&viewrect=100,200,300,150",
          "conformsTo": "http://www.rfc-editor.org/rfc/rfc8118"
        },
        "schema:citation": {
          "@type": "schema:ScholarlyArticle",
          "schema:url": "https://upload.wikimedia.org/wikipedia/commons/4/4a/Photosynthesis_review.pdf",
          "schema:name": "Photosynthesis: A Review — Wikimedia Commons",
          "schema:thumbnailUrl": "https://upload.wikimedia.org/wikipedia/commons/4/4a/Photosynthesis_review.pdf/page5-thumb.png"
        }
      }
    }
  ]
}
```

## 5. Rationale

### Standard vs extension

Citations are core to verifying AI outputs in professional work. However, if the maintainers believe that citations
should be an extension, we can make that change.

### Clients SHOULD vs MUST vs MAY render citations

While citations are an important part of professional work, some clients will not need to provide citations. For
example:

1. MCP clients that do not show output to end users (e.g. M2M usage of MCP). 2. Narrow-purpose MCP clients, e.g. ones
   that primarily consume structured output 3. Coding-specific MCP clients, such as Claude Code or Cursor. They
   typically use diffs in place of citations.

However, general purpose clients should still be encouraged to show citations. MAY is not strong enough language.

### schema.org citations vs Web Annotation Data Model

The SEP proposes primarily adopting the `Web Annotation Data Model`, but also adopts schema.org `citation` metadata on
the cited **target** for richer source descriptions.

schema.org's citations are very widely used for SEO purposes. However, it is primarily designed to provide context to
search engines. It has a relatively verbose and nested structure for citations.

The Web Annotation Data Model is primarily used in academic settings, but it is a much better fit as the base of MCP
citations. It has richer support for **granular** selectors — such as a polygon on an image — that a URL fragment cannot
express, and it keeps that structure in typed JSON rather than requiring clients to parse every convention out of a URL.
It also separates the concept of `Body` (annotating a portion of a tool result) and `Target`.

## 6. Backward Compatibility

Clients that do not understand citations at all or have not implemented certain citation fields can safely ignore
citation metadata. All fields in this proposal are additive only, and clients are not required to render any or all
citations.

While clients may generate their own citations, this SEP does not provide a mechanism for them to directly pass them to
servers. So older servers will not be affected.

## 7. Reference Implementation

I plan to open a PR to [OpenWebUI](https://openwebui.com/) as a reference implementation. That can happen in parallel
with discussion on this SEP.

As discussed above, there are many bespoke implementations of rich citations, so there is evidence that the pattern is
useful.

## 8. Security Implications

### Access control for non-public resources

Servers should implement access controls for non-public resources.

### Citation hallucination

Text Fragments and other selectors make it trivially possible for a malicious or buggy server to emit citations whose
`exact` or `text=` value does not actually appear in the source — fabricating quotations or attributing real text to the
wrong section.

Clients displaying citations as authoritative MAY re-resolve selectors against the live resource before rendering, and
surface a visible indicator when resolution fails. This is MAY rather than SHOULD because it adds network roundtrips.
Additionally, not all clients will have the capability or credentials to resolve citations on behalf of the user.

### Prompt injection via cited content

Cited content displayed inline could itself contain prompt injection payloads if a user later quotes the citation back
to the model. This is the same risk surface as any other tool result.

### Dereferencing citation URIs (XSRF)

Clients dereference server-chosen URIs when rendering citations — not only `target.source` (on hover, on click, or when
re-resolving a selector), but also `target.schema:citation.schema:url` and `target.schema:citation.schema:thumbnailUrl`
when loading hovercard links or images. Every such fetch is an outbound request to a URI the server chose. A malicious
server can therefore point these fields at internal or local endpoints (`file://`, `http://localhost`, link-local
addresses, cloud-metadata IPs such as `169.254.169.254`), turning the client into an SSRF vector. Clients SHOULD
restrict automatic dereferencing to an allow-list of schemes (typically `https://` and MCP-resolved custom schemes via
`resources/read`) and MUST NOT fetch private, loopback, or link-local addresses without explicit user action.

Clients MUST NOT attach ambient credentials (cookies, cached auth, or MCP access tokens) when fetching a citation target
cross-origin; as noted above, MCP tokens are bound to their server and MUST NOT be replayed to arbitrary targets.
Clients dereferencing `https://` targets MUST validate TLS and refuse downgraded or mixed-content fetches, so a network
attacker cannot forge the "verified source" a citation appears to confirm.

### Rendering untrusted preview content

A hovercard renders server-supplied `target.schema:citation` metadata (and possibly fetched remote content), both of
which are untrusted. Loading `schema:thumbnailUrl` or following `schema:url` is subject to the same SSRF constraints as
`target.source`. If the client fetches a preview from `target.source`, it is injecting attacker-influenced markup into
its own surface. Clients SHOULD render previews in a sandboxed context with scripting disabled, no inline event
handlers, and no automatic sub-resource or remote-content loading, and SHOULD honor the declared media type rather than
sniffing it. To avoid leaking the user's query or conversation context to the cited origin, clients SHOULD suppress the
referrer when dereferencing (equivalent to `Referrer-Policy: no-referrer`) and open click-through links without granting
the opener handle (equivalent to `noopener`/`noreferrer`).

The `display: "embedded"` hint asks the client to open a citation in its in-app webview rather than an external browser.
Because an embedded surface shares more of the client's context, an `embedded` hint MUST raise the sandboxing bar, not
lower it: the same script-disabling, credential-omission, and no-referrer rules apply, and clients SHOULD isolate the
webview from the host session. The hint is advisory — clients MUST fall back to an external window when the cited origin
forbids framing (`X-Frame-Options` / CSP `frame-ancestors`) or the scheme is not web-fetchable.

Conversely, a cited origin may not wish its content re-surfaced as a preview inside arbitrary clients. MCP has no
embedding-consent signal today (the web analog is CSP `frame-ancestors`), and providing one would require a
server-declared field rather than client-side policy.

### Content integrity

Version pinning (see §Specification) addresses _which_ revision is cited, but not whether the fetched bytes still match
what the server asserted. For stronger integrity, servers MAY pin a hash of the cited **work** via
`target.schema:citation`'s `schema:sha256` (schema.org, analogous to Subresource Integrity). A client that verifies the
hash SHOULD fetch the bytes from `target.schema:citation.schema:url` when present, or from `target.source` with span
fragments and selectors removed; the hash covers the whole cited work, not an individual span. Span-level integrity is
handled separately: a client that re-resolves MAY confirm the `TextQuoteSelector.exact` value still appears in the
source, surfacing a warning on mismatch. Together these close the gap where a source is mutated after citation, a fetch
is tampered with in transit, or a server fabricates an excerpt that no longer corresponds to the live resource.

### Thundering herd of link resolution

Because clients MAY re-verify selectors against the live source or fetch `schema:url`, `schema:thumbnailUrl`, and
`target.source`, a response containing many citations can generate a burst of outbound requests to attacker-chosen URLs
— a denial-of-service-by-proxy and tracking-beacon vector against third-party origins. Clients SHOULD rate-limit
automatic dereferencing and MAY defer it until a user gesture (e.g. hovering a specific citation).

## 9. Open questions

### Should server and clients advertise whether they support citations? And which formats?

For MCP tool results including citations, this proposal increases the number of bytes on the wire and computational
complexity on the server. That may be unnecessary if the client cannot or will not render some or all citation formats.

Clients could advertise their citation support in the `initialize` handshake.

Similarly, servers could advertise supported `citation` formats in the `initialize` response. That would provide a
helpful hint for clients who actively generate citations.

This proposal defers this to a separate SEP for now, as this SEP is already complex.

### Should we explicitly constrain to a subset of Web Annotation Data Model features?

The current Typescript interface in the specification implies that only a subset of WADM is allowed, largely to start
small and reduce the barrier to entry of clients adding support for citations.

The full WADM spec is more complex and includes potentially useful concepts such as audience:

```
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "http://example.org/anno13",
  "type": "Annotation",
  "audience": {
    "id": "http://example.edu/roles/teacher",
    "type": "schema:EducationalAudience",
    "schema:educationalRole": "teacher"
  },
  "body": "http://example.net/classnotes1",
  "target": "http://example.com/textbook1"
}
```

And choices between bodies:

```
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "http://example.org/anno10",
  "type": "Annotation",
  "body": {
    "type": "Choice",
    "items": [
      {
        "id": "http://example.org/note1",
        "language": "en"
      },
      {
        "id": "http://example.org/note2",
        "language": "fr"
      }
    ]
  },
  "target": "http://example.org/website1"
}
```

### Further security analysis

HTTP and web browsers have put decades of thought into sandboxing, iframes, CORS, and XSRF. We should do a more detailed
audit of security implications.

## 10. Acknowledgements

Appreciate the feedback from Robert Sanderson, one of the original authors of the Web Annotation Data Model.

Will add more reviewers and collaborators in here throughout the process!
